import { NextResponse } from "next/server";
import { createServiceRoleClient, hasServiceRoleKey, supabase } from "@/lib/supabase";
import { writeAuditLog, type AuditAction } from "@/lib/audit";
import { directDbConfigured, withDirectDb } from "@/lib/db-read";

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
  action: "select" | "insert" | "update" | "delete" | "query";
  table?: string;
  id?: string;
  payload?: Record<string, unknown>;
  order?: string;
  ascending?: boolean;
  limit?: number;
  sql?: string;
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

  const { action, table, id, payload, sql } = body;

  if (action === "query") {
    const rawSql = (sql ?? "").trim();
    if (!rawSql) {
      return NextResponse.json({ error: "SQL query string is required" }, { status: 400 });
    }

    // Ensure statement is read-only
    const cleanSql = rawSql.replace(/;\s*$/, "");
    if (cleanSql.includes(";")) {
      return NextResponse.json({ error: "Multiple SQL statements are not permitted" }, { status: 400 });
    }

    const normalized = cleanSql.replace(/\s+/g, " ");
    if (!/^(SELECT|WITH)\b/i.test(normalized)) {
      return NextResponse.json({ error: "Only read-only SELECT or WITH statements are allowed" }, { status: 400 });
    }

    // Prohibit write or schema-altering commands
    if (/\b(INSERT|UPDATE|DELETE|DROP|ALTER|TRUNCATE|CREATE|GRANT|REVOKE|EXECUTE|VACUUM|REINDEX|CALL|DO)\b/i.test(normalized)) {
      return NextResponse.json({ error: "Write or schema-altering SQL statements are prohibited in SQL Runner" }, { status: 403 });
    }

    try {
      if (directDbConfigured()) {
        const rows = await withDirectDb(async (client) => {
          await client.query("SET statement_timeout = 15000");
          const res = await client.query(cleanSql);
          return res.rows;
        });
        return NextResponse.json({ data: rows });
      }

      return NextResponse.json(
        { error: "Direct database connection is not configured to execute arbitrary SQL on this environment." },
        { status: 501 }
      );
    } catch (err) {
      return NextResponse.json(
        { error: err instanceof Error ? err.message : "Query execution failed" },
        { status: 400 }
      );
    }
  }

  if (!table || !ALLOWED_TABLES.has(table)) {
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
