import { NextResponse } from "next/server";
import { createServiceRoleClient, hasServiceRoleKey, supabase } from "@/lib/supabase";

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
      source: hasServiceRoleKey() ? "service_role" : "anon",
      fetchedAt: new Date().toISOString(),
    },
    { headers: { "Cache-Control": "no-store" } },
  );
}
