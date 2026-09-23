import { NextResponse } from "next/server";
import { createServiceRoleClient, hasServiceRoleKey, supabase } from "@/lib/supabase";
import { writeAuditLog, type AuditAction } from "@/lib/audit";

export const dynamic = "force-dynamic";

/** Tables the admin console is allowed to touch via this route. */
const ALLOWED_TABLES = new Set([
  "collections",
  "documents",
  "reminders",
  "custom_document_types",
  "finance_transactions",
  "category_budgets",
  "savings_envelopes",
  "recurring_transactions",
  "support_requests",
  "ai_quota_usage",
  "app_versions",
]);

function getClient() {
  if (hasServiceRoleKey()) return createServiceRoleClient();
  return supabase;
}

interface DbAction {
  action: "select" | "insert" | "update" | "delete";
  table: string;
  id?: string;
  payload?: Record<string, unknown>;
  order?: string;
  ascending?: boolean;
  limit?: number;
}

/** Audit action per DbAction, when the console caller opts in. */
const ROW_ACTION_MAP: Record<string, AuditAction> = {
  insert: "row.insert",
  update: "row.update",
  delete: "row.delete",
};

export async function POST(req: Request) {
  let body: DbAction;
  try {
    body = (await req.json()) as DbAction;
  } catch {
    return NextResponse.json({ error: "Invalid JSON body" }, { status: 400 });
  }

  const { action, table, id, payload } = body;
  if (!ALLOWED_TABLES.has(table)) {
    return NextResponse.json({ error: `Table "${table}" is not allowed` }, { status: 403 });
  }

  const client = getClient();
  const auditAction = ROW_ACTION_MAP[action];
  const auditClient = hasServiceRoleKey() ? client : null;
  const logAudit = async (extra?: Record<string, unknown>) => {
    if (!auditAction || !auditClient) return;
    await writeAuditLog(auditClient, {
      action: auditAction,
      targetTable: table,
      targetId: id ?? null,
      details: { ...(extra ?? {}), payload: summarizePayload(payload) },
    });
  };

  try {
    if (action === "select") {
      let query = client.from(table).select("*");
      if (body.order) query = query.order(body.order, { ascending: body.ascending ?? false });
      if (body.limit) query = query.limit(Math.min(body.limit, 200));
      const { data, error } = await query;
      if (error) return NextResponse.json({ error: error.message }, { status: 400 });
      return NextResponse.json({ data });
    }

    if (action === "insert") {
      if (!payload) return NextResponse.json({ error: "payload is required" }, { status: 400 });
      const { data, error } = await client.from(table).insert(payload).select();
      if (error) return NextResponse.json({ error: error.message }, { status: 400 });
      await logAudit({ insertedId: (data as { id?: string }[] | null)?.[0]?.id ?? null });
      return NextResponse.json({ data });
    }

    if (action === "update") {
      if (!id) return NextResponse.json({ error: "id is required" }, { status: 400 });
      if (!payload) return NextResponse.json({ error: "payload is required" }, { status: 400 });
      const { data, error } = await client.from(table).update(payload).eq("id", id).select();
      if (error) return NextResponse.json({ error: error.message }, { status: 400 });
      await logAudit();
      return NextResponse.json({ data });
    }

    if (action === "delete") {
      if (!id) return NextResponse.json({ error: "id is required" }, { status: 400 });
      const { error } = await client.from(table).delete().eq("id", id);
      if (error) return NextResponse.json({ error: error.message }, { status: 400 });
      await logAudit();
      return NextResponse.json({ ok: true });
    }

    return NextResponse.json({ error: `Unknown action "${action}"` }, { status: 400 });
  } catch (err) {
    return NextResponse.json(
      { error: err instanceof Error ? err.message : "Database request failed" },
      { status: 500 },
    );
  }
}

/**
 * Keeps audit entries small: logs only which fields changed, never full row
 * content (descriptions, notes and file metadata can be large and sensitive).
 */
function summarizePayload(payload: Record<string, unknown> | undefined): Record<string, unknown> | null {
  if (!payload) return null;
  return { fields: Object.keys(payload) };
}
