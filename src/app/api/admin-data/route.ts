import { NextResponse } from "next/server";
import { createServiceRoleClient, hasServiceRoleKey, supabase } from "@/lib/supabase";
import { directDbConfigured, withDirectDb } from "@/lib/db-read";

/**
 * Direct-Postgres table reads: bypasses the PostgREST HTTP edge, which can
 * serve stale responses to specific regions during a Supabase incident.
 * Keyed identically to FETCH_SPEC so the response shape is unchanged.
 */
const DIRECT_PG_TABLES: Record<string, string> = {
  collections: "collections",
  documents: "documents",
  reminders: "reminders",
  customDocumentTypes: "custom_document_types",
  transactions: "finance_transactions",
  budgets: "category_budgets",
  envelopes: "savings_envelopes",
  recurring: "recurring_transactions",
  supportRequests: "support_requests",
  aiQuotaUsage: "ai_quota_usage",
  appVersions: "app_versions",
};

async function fetchAllDirectPg(): Promise<{
  data: Record<string, unknown[]>;
  errors: Record<string, string>;
  allOk: boolean;
} | null> {
  if (!directDbConfigured()) return null;
  try {
    return await withDirectDb(async (client) => {
      const data: Record<string, unknown[]> = {};
      const errors: Record<string, string> = {};
      let allOk = true;
      await Promise.all(
        Object.entries(DIRECT_PG_TABLES).map(async ([key, table]) => {
          const spec = FETCH_SPEC.find((s) => s.key === key);
          const order = spec?.order ?? "created_at";
          const asc = spec?.asc ?? false;
          try {
            const { rows } = await client.query(
              `select * from public."${table}" order by "${order}" ${asc ? "asc" : "desc"} limit 5000`,
            );
            data[key] = rows;
          } catch (err) {
            errors[table] = err instanceof Error ? err.message : "direct PG read failed";
            data[key] = [];
            allOk = false;
          }
        }),
      );
      return { data, errors, allOk };
    });
  } catch (err) {
    console.warn("[admin-data] direct PG read failed, falling back to PostgREST:", err instanceof Error ? err.message : err);
    return null;
  }
}

export const dynamic = "force-dynamic";

const FETCH_SPEC: {
  key: string;
  table: string;
  order: string;
  asc: boolean;
}[] = [
  { key: "collections", table: "collections", order: "created_at", asc: false },
  { key: "documents", table: "documents", order: "expires_at", asc: true },
  { key: "reminders", table: "reminders", order: "remind_at", asc: false },
  { key: "customDocumentTypes", table: "custom_document_types", order: "name", asc: true },
  { key: "transactions", table: "finance_transactions", order: "occurred_at", asc: false },
  { key: "budgets", table: "category_budgets", order: "category", asc: true },
  { key: "envelopes", table: "savings_envelopes", order: "name", asc: true },
  { key: "recurring", table: "recurring_transactions", order: "start_date", asc: false },
  { key: "supportRequests", table: "support_requests", order: "created_at", asc: false },
  { key: "aiQuotaUsage", table: "ai_quota_usage", order: "updated_at", asc: false },
  { key: "appVersions", table: "app_versions", order: "platform", asc: true },
];

function getClient() {
  // Prefer service role (bypasses RLS); fall back to the anon client.
  if (hasServiceRoleKey()) return createServiceRoleClient();
  return supabase;
}

export async function GET() {
  // Preferred path: direct Postgres (bypasses the PostgREST edge entirely).
  const direct = await fetchAllDirectPg();
  if (direct) {
    return NextResponse.json(
      {
        data: direct.data,
        errors: direct.errors,
        ok: direct.allOk,
        source: "direct_pg",
        fetchedAt: new Date().toISOString(),
      },
      { headers: { "Cache-Control": "no-store" } },
    );
  }

  const client = getClient();
  const data: Record<string, unknown[]> = {};
  const errors: Record<string, string> = {};
  let ok = true;

  await Promise.all(
    FETCH_SPEC.map(async ({ key, table, order, asc }) => {
      const { data: rows, error } = await client.from(table).select("*").order(order, { ascending: asc });
      if (error) {
        errors[table] = error.message;
        data[key] = [];
        ok = false;
      } else {
        data[key] = rows ?? [];
      }
    }),
  );

  return NextResponse.json(
    {
      data,
      errors,
      ok,
      source: directDbConfigured() ? "direct_pg" : hasServiceRoleKey() ? "service_role" : "anon",
      fetchedAt: new Date().toISOString(),
    },
    { headers: { "Cache-Control": "no-store" } },
  );
}
