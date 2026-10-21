import { NextResponse } from "next/server";
import { createServiceRoleClient, hasServiceRoleKey, SUPABASE_URL, supabaseProjectRef } from "@/lib/supabase";
import { APP_DATA_TABLES } from "@/lib/purge";
import { writeAuditLog } from "@/lib/audit";
import { verifyAdminRequest } from "@/lib/server-auth";

export const dynamic = "force-dynamic";

const NO_STORE = { "Cache-Control": "no-store" } as const;

/** Buckets that can hold user-uploaded document files. */
const STORAGE_BUCKETS = ["documents", "document-files"] as const;

interface SelectivePurgeRequest {
  /** Exact set of table names to wipe. Empty = no-op. */
  tables?: string[];
  /** When true, admin users and their owned data are excluded from the wipe. */
  excludeAdmins?: boolean;
  /** When true, support requests authored by the targeted owners are also deleted. */
  wipeSupportRequests?: boolean;
  /** When true, non-admin accounts in auth.users are also deleted. */
  wipeAuthUsers?: boolean;
  /** When provided, only wipe the listed owner ids across the selected tables. */
  ownerIds?: string[];
  /** Matches the active project ref — prevents a stray wipe. */
  confirm?: unknown;
}

interface SelectivePurgeResponse {
  ok: boolean;
  error?: string;
  projectRef?: string | null;
  purged?: Record<string, number>;
  storageRemoved?: number;
}

/** GET /api/admin-data/selective-purge — informs the UI which tables are wipeable. */
export async function GET() {
  return NextResponse.json<SelectivePurgeStatus>(
    {
      configured: hasServiceRoleKey(),
      projectRef: supabaseProjectRef(SUPABASE_URL),
      tables: APP_DATA_TABLES.map((t) => t.table),
    },
    { headers: NO_STORE }
  );
}

interface SelectivePurgeStatus {
  configured: boolean;
  projectRef: string | null;
  tables: string[];
}

export async function POST(request: Request) {
  const auth = await verifyAdminRequest(request, "super_admin");
  if (!auth.authorized) {
    return auth.response;
  }

  if (!hasServiceRoleKey()) {
    return NextResponse.json<SelectivePurgeResponse>(
      { ok: false, error: "SUPABASE_SERVICE_ROLE_KEY is not configured — selective purge is disabled." },
      { status: 503, headers: NO_STORE }
    );
  }

  let body: SelectivePurgeRequest;
  try {
    body = (await request.json()) as SelectivePurgeRequest;
  } catch {
    return NextResponse.json<SelectivePurgeResponse>({ ok: false, error: "Invalid JSON body" }, { status: 400, headers: NO_STORE });
  }

  const projectRef = supabaseProjectRef(SUPABASE_URL);
  if (body.confirm !== projectRef) {
    return NextResponse.json<SelectivePurgeResponse>(
      {
        ok: false,
        error: "Confirmation does not match the active project ref. Re-check the ref shown on this page and type it exactly.",
      },
      { status: 403, headers: NO_STORE }
    );
  }

  const admin = createServiceRoleClient();

  const requestedTables = (body.tables ?? []).map((t) => t.toLowerCase());
  if (requestedTables.length === 0) {
    return NextResponse.json<SelectivePurgeResponse>(
      { ok: false, error: "No tables selected — nothing to wipe." },
      { status: 400, headers: NO_STORE }
    );
  }

  const knownTables = new Set(APP_DATA_TABLES.map((t) => t.table));
  const unknown = requestedTables.filter((t) => !knownTables.has(t));
  if (unknown.length > 0) {
    return NextResponse.json<SelectivePurgeResponse>(
      { ok: false, error: `Unknown table(s) in selection: ${unknown.join(", ")}` },
      { status: 400, headers: NO_STORE }
    );
  }

  const ownerIds = body.ownerIds?.map((id) => id.trim().toLowerCase()).filter(Boolean) ?? [];
  const excludeAdmins = body.excludeAdmins ?? false;

  // Owner IDs are optional for selective purge.
  // If ownerIds are provided, we scope the deletion to those owners.
  // If ownerIds are empty/absent, we wipe ALL rows in the selected tables.
  // This allows the UI to select any tables (even empty ones) and still succeed.
  const isOwnerScoped = ownerIds.length > 0;

  let adminIdsToExclude: string[] = [];
  if (excludeAdmins) {
    const { data: adminRows } = await admin
      .from("admin_roles")
      .select("user_id")
      .eq("is_active", true)
      .order("user_id", { ascending: true });
    adminIdsToExclude = (adminRows && adminRows.length > 0
      ? adminRows.map((r) => r.user_id).filter(Boolean) as string[]
      : []) as string[];
  }

  const purged: Record<string, number> = {};
  const errors: Record<string, string> = {};

  try {
    for (const { table, pk, column } of APP_DATA_TABLES) {
      if (!requestedTables.includes(table)) continue;

      try {
        const ownerColumn = column ?? "owner_id";

        // Build the effective owner IDs list (excluding admins if requested).
        let effectiveOwnerIds: string[] = [];
        if (isOwnerScoped) {
          effectiveOwnerIds = [...ownerIds];
          if (adminIdsToExclude.length > 0) {
            const adminSet = new Set(adminIdsToExclude);
            effectiveOwnerIds = effectiveOwnerIds.filter((id) => !adminSet.has(id));
          }
          if (effectiveOwnerIds.length === 0) {
            // All requested owners are admins — skip this table.
            continue;
          }
        }

        // Build SELECT query to count rows that will be deleted.
        let query = admin.from(table).select(pk);
        if (isOwnerScoped) {
          // Owner-scoped: only rows belonging to the effective owners.
          query = query.in(ownerColumn, effectiveOwnerIds);
        } else if (excludeAdmins && adminIdsToExclude.length > 0) {
          // Not owner-scoped but excluding admins: select all rows EXCEPT admin-owned ones.
          // Supabase JS doesn't have a .notIn() that chains well for all cases,
          // so we fetch all rows and filter in memory, then delete by PK.
        }
        // else: not owner-scoped, no admin exclusion — select all rows.

        const { data: pkData, error: selectError } = await query;
        if (selectError) throw new Error(selectError.message);
        let rowsToDelete = (pkData ?? []) as unknown as Record<string, unknown>[];

        // When not owner-scoped and excluding admins, filter out admin-owned rows.
        if (!isOwnerScoped && excludeAdmins && adminIdsToExclude.length > 0) {
          const adminSet = new Set(adminIdsToExclude);
          // Re-fetch with owner column to filter
          const selectCols = pk === ownerColumn ? pk : `${pk},${ownerColumn}`;
          const { data: fullData, error: fullError } = await admin
            .from(table)
            .select(selectCols);
          if (fullError) throw new Error(fullError.message);
          rowsToDelete = ((fullData ?? []) as unknown as Record<string, unknown>[]).filter(
            (row) => !adminSet.has(String(row[ownerColumn] ?? ""))
          );
        }

        if (rowsToDelete.length === 0) continue;

        // Extract actual PK values from the fetched rows.
        const pkValues = rowsToDelete
          .map((row) => row[pk])
          .filter((v) => v !== null && v !== undefined) as string[];

        if (pkValues.length === 0) continue;

        // Delete rows by their PK values in batches (Supabase .in() has a practical
        // limit, so chunk into groups of 500).
        const BATCH_SIZE = 500;
        for (let i = 0; i < pkValues.length; i += BATCH_SIZE) {
          const batch = pkValues.slice(i, i + BATCH_SIZE);
          const { error: delError } = await admin.from(table).delete().in(pk, batch);
          if (delError) throw new Error(delError.message);
        }

        purged[table] = (purged[table] ?? 0) + pkValues.length;
      } catch (err) {
        const message = err instanceof Error ? err.message : "unknown error";
        errors[table] = message;
        console.warn(`[selective-purge] ${table}: ${message}`);
      }
    }

    // Optional: wipe matching auth.users accounts from Supabase Auth
    if (body.wipeAuthUsers) {
      try {
        const { data: usersData, error: usersErr } = await admin.auth.admin.listUsers({ page: 1, perPage: 1000 });
        if (usersErr) throw new Error(usersErr.message);

        const adminSet = new Set(adminIdsToExclude);
        const targetAuthUsers = (usersData.users ?? []).filter((u) => {
          if (excludeAdmins && adminSet.has(u.id)) return false;
          if (isOwnerScoped && !ownerIds.includes(u.id.toLowerCase())) return false;
          return true;
        });

        let authPurgedCount = 0;
        for (const u of targetAuthUsers) {
          const { error: delErr } = await admin.auth.admin.deleteUser(u.id);
          if (!delErr) authPurgedCount += 1;
          else console.warn(`[selective-purge] failed to delete auth user ${u.id}: ${delErr.message}`);
        }
        if (authPurgedCount > 0) {
          purged["auth_users"] = authPurgedCount;
        }
      } catch (authErr) {
        const msg = authErr instanceof Error ? authErr.message : "failed to wipe auth users";
        errors["auth_users"] = msg;
        console.warn(`[selective-purge] auth_users: ${msg}`);
      }
    }

    // Storage files: best-effort. Only clean up document file paths when
    // documents or collections were part of the wipe.
    let storageRemoved = 0;
    if (requestedTables.includes("documents") || requestedTables.includes("collections")) {
      for (const bucket of STORAGE_BUCKETS) {
        try {
          const { data: listing, error: listError } = await admin.storage.from(bucket).list("/", { limit: 1000, sortBy: { column: "name" } });
          if (listError) continue;
          const paths = (listing ?? []).map((o) => o.name).filter(Boolean);
          if (paths.length === 0) continue;
          const { error: rmError } = await admin.storage.from(bucket).remove(paths);
          if (!rmError) {
            storageRemoved += paths.length;
            purged[`storage:${bucket}`] = paths.length;
          }
        } catch {
          // bucket missing in this project — move on
        }
      }
    }

    // Audit entry — user_id stays null because this wipe spans multiple tables
    // and possibly multiple owners; there is no single affected account.
    const action = isOwnerScoped ? "data.selective_purge" : "data.wipe_selected";
    await writeAuditLog(admin, {
      action,
      userId: null,
      targetTable: "multiple",
      targetId: null,
      details: {
        selectedTables: requestedTables,
        excludeAdmins,
        wipeSupportRequests: body.wipeSupportRequests,
        wipeAuthUsers: Boolean(body.wipeAuthUsers),
        ownerScoped: isOwnerScoped,
        ownerCount: ownerIds.length,
        adminExcludedCount: adminIdsToExclude.length,
        purgedRows: purged,
        tableErrors: errors,
        storageRemoved,
      },
    });

    const ok = Object.keys(errors).length === 0;
    const payload: SelectivePurgeResponse = { ok, projectRef, purged, storageRemoved };
    if (!ok) {
      payload.error = `Completed with per-table errors: ${Object.entries(errors).map(([t, e]) => `${t}: ${e}`).join("; ")}`;
    }
    return NextResponse.json(payload, { status: ok ? 200 : 207, headers: NO_STORE });
  } catch (err) {
    return NextResponse.json<SelectivePurgeResponse>(
      { ok: false, error: err instanceof Error ? err.message : "Selective purge failed" },
      { status: 500, headers: NO_STORE }
    );
  }
}