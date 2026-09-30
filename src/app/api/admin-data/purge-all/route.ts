import { NextResponse } from "next/server";
import { createServiceRoleClient, hasServiceRoleKey, SUPABASE_URL, supabaseProjectRef } from "@/lib/supabase";
import { APP_DATA_TABLES } from "@/lib/purge";
import { writeAuditLog } from "@/lib/audit";

export const dynamic = "force-dynamic";

const NO_STORE = { "Cache-Control": "no-store" } as const;

/** Buckets that can hold user-uploaded document files. */
const STORAGE_BUCKETS = ["documents", "document-files"] as const;

interface PurgeAllRequest {
  /** Must equal the active project ref — proves the operator knows which DB they are wiping. */
  confirm?: unknown;
}

interface PurgeAllResponse {
  ok: boolean;
  error?: string;
  projectRef?: string | null;
  purged?: Record<string, number>;
  storageRemoved?: number;
}

/**
 * POST /api/admin-data/purge-all
 *
 * ⚠️ Deletes EVERY application data row for ALL users (collections,
 * documents, transactions, budgets, envelopes, recurring, custom types,
 * tiers, AI quota records). auth.users accounts are NOT touched — users
 * keep their logins but lose all their data.
 *
 * Requires body { confirm: <project ref> } matching the active Supabase
 * project, so a wipe can never fire without the operator proving they know
 * which database they are pointing at. Recorded in admin_audit_log as
 * `data.wipe_all`.
 */
/**
 * GET /api/admin-data/purge-all
 * Tells the Danger Zone UI whether the wipe endpoint is usable and which
 * project ref must be typed. Client components cannot read server-only env
 * vars, so they must ask the server (checking process.env in the browser
 * always yields "not configured").
 */
export async function GET() {
  return NextResponse.json<PurgeAllStatus>(
    { configured: hasServiceRoleKey(), projectRef: supabaseProjectRef(SUPABASE_URL) },
    { headers: NO_STORE },
  );
}

interface PurgeAllStatus {
  configured: boolean;
  projectRef: string | null;
}

export async function POST(request: Request) {
  if (!hasServiceRoleKey()) {
    return NextResponse.json<PurgeAllResponse>(
      { ok: false, error: "SUPABASE_SERVICE_ROLE_KEY is not configured — data wipe is disabled." },
      { status: 503, headers: NO_STORE },
    );
  }

  let body: PurgeAllRequest;
  try {
    body = (await request.json()) as PurgeAllRequest;
  } catch {
    return NextResponse.json<PurgeAllResponse>({ ok: false, error: "Invalid JSON body" }, { status: 400, headers: NO_STORE });
  }

  const projectRef = supabaseProjectRef(SUPABASE_URL);
  if (body.confirm !== projectRef) {
    return NextResponse.json<PurgeAllResponse>(
      {
        ok: false,
        error:
          "Confirmation does not match the active project ref. Re-check the sidebar (or the ref shown on this page) and type it exactly.",
      },
      { status: 403, headers: NO_STORE },
    );
  }

  const admin = createServiceRoleClient();
  const purged: Record<string, number> = {};
  const errors: Record<string, string> = {};

  try {
    // 1) Children first — reminders hang off documents; transactions may
    //    reference documents too. The APP_DATA_TABLES order encodes this.
    //    `pk IS NOT NULL` matches every row without casting a literal to the
    //    pk's type (a `pk <> '...'` sentinel breaks on uuid columns).
    for (const { table, pk } of APP_DATA_TABLES) {
      try {
        const { data, error } = await admin.from(table).delete().not(pk, "is", null).select(pk);
        if (error) {
          errors[table] = error.message;
          console.warn(`[purge-all] ${table}: ${error.message}`);
          continue;
        }
        purged[table] = data?.length ?? 0;
      } catch (err) {
        errors[table] = err instanceof Error ? err.message : "unknown error";
        console.warn(`[purge-all] ${table}: ${errors[table]}`);
      }
    }

    // 2) Uploaded files in storage — best-effort, table rows are the
    //    source of truth for the console UI.
    let storageRemoved = 0;
    for (const bucket of STORAGE_BUCKETS) {
      try {
        const { data, error } = await admin.storage.from(bucket).list("", { limit: 1000, sortBy: { column: "name" } });
        if (error) continue;
        const paths = (data ?? []).map((o) => o.name).filter(Boolean);
        if (paths.length === 0) break;
        const { error: rmError } = await admin.storage.from(bucket).remove(paths);
        if (!rmError) {
          storageRemoved += paths.length;
          purged[`storage:${bucket}`] = paths.length;
          break; // files lived in this bucket — done
        }
      } catch {
        // bucket missing in this project — try the next candidate
      }
    }

    // 3) Audit entry — user_id stays null: no single affected account.
    await writeAuditLog(admin, {
      action: "data.wipe_all",
      userId: null,
      targetTable: "all",
      targetId: null,
      details: { purgedRows: purged, tableErrors: errors, storageRemoved },
    });

    const ok = Object.keys(errors).length === 0;
    const payload: PurgeAllResponse = { ok, projectRef, purged, storageRemoved };
    if (!ok) payload.error = `Completed with per-table errors: ${Object.entries(errors).map(([t, e]) => `${t}: ${e}`).join("; ")}`;
    return NextResponse.json(payload, { status: ok ? 200 : 207, headers: NO_STORE });
  } catch (err) {
    return NextResponse.json<PurgeAllResponse>(
      { ok: false, error: err instanceof Error ? err.message : "Purge failed" },
      { status: 500, headers: NO_STORE },
    );
  }
}
