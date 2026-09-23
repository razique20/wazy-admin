"use client";

import { useCallback, useEffect, useState } from "react";
import { supabase } from "@/lib/supabase";
import type {
  AiQuotaUsage,
  AppVersion,
  CategoryBudget,
  Collection,
  CustomDocumentType,
  Document,
  FinanceTransaction,
  RecurringTransaction,
  Reminder,
  SavingsEnvelope,
  SupportRequest,
  WazyDataBundle,
} from "@/lib/types";

export interface WazyDataState {
  data: WazyDataBundle;
  loading: boolean;
  error: string | null;
  /** Per-table errors, e.g. when RLS blocks the anon key on a specific table. */
  tableErrors: Record<string, string>;
  /** Where the data came from: server route with service role, or browser anon client. */
  source: "service_role" | "anon" | "unknown";
  refresh: () => Promise<void>;
  lastUpdated: Date | null;
}

const EMPTY_BUNDLE: WazyDataBundle = {
  collections: [],
  documents: [],
  reminders: [],
  customDocumentTypes: [],
  transactions: [],
  budgets: [],
  envelopes: [],
  recurring: [],
  supportRequests: [],
  aiQuotaUsage: [],
  appVersions: [],
};

const FETCH_SPEC: { key: keyof WazyDataBundle; table: string; order: string; asc: boolean }[] = [
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

/**
 * Loads every admin-managed table. Primary path is the server API route
 * (/api/admin-data) which uses the service role key and bypasses RLS; if that
 * route is unavailable it falls back to direct browser reads with the anon key.
 */
export function useWazyData(): WazyDataState {
  const [data, setData] = useState<WazyDataBundle>(EMPTY_BUNDLE);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [tableErrors, setTableErrors] = useState<Record<string, string>>({});
  const [source, setSource] = useState<WazyDataState["source"]>("unknown");
  const [lastUpdated, setLastUpdated] = useState<Date | null>(null);

  const refresh = useCallback(async () => {
    setLoading(true);
    setError(null);

    // 1) Try the server route first (service role, bypasses RLS).
    try {
      const res = await fetch("/api/admin-data", { cache: "no-store" });
      if (res.ok) {
        const json = (await res.json()) as {
          data: Record<string, unknown[]>;
          errors: Record<string, string>;
          ok: boolean;
          source: "service_role" | "anon";
        };
        setData({
          collections: (json.data.collections ?? []) as Collection[],
          documents: (json.data.documents ?? []) as Document[],
          reminders: (json.data.reminders ?? []) as Reminder[],
          customDocumentTypes: (json.data.customDocumentTypes ?? []) as CustomDocumentType[],
          transactions: (json.data.transactions ?? []) as FinanceTransaction[],
          budgets: (json.data.budgets ?? []) as CategoryBudget[],
          envelopes: (json.data.envelopes ?? []) as SavingsEnvelope[],
          recurring: (json.data.recurring ?? []) as RecurringTransaction[],
          supportRequests: (json.data.supportRequests ?? []) as SupportRequest[],
          aiQuotaUsage: (json.data.aiQuotaUsage ?? []) as AiQuotaUsage[],
          appVersions: (json.data.appVersions ?? []) as AppVersion[],
        });
        setTableErrors(json.errors ?? {});
        setSource(json.source);
        setLastUpdated(new Date());
        setLoading(false);
        return;
      }
    } catch {
      // fall through to direct client fetch
    }

    // 2) Fallback: direct browser reads with the anon key (RLS applies).
    try {
      const results = await Promise.all(
        FETCH_SPEC.map(async ({ key, table, order, asc }) => {
          const { data: rows, error } = await supabase
            .from(table)
            .select("*")
            .order(order, { ascending: asc });
          return { key, rows, error: error?.message ?? null };
        }),
      );
      const next: WazyDataBundle = { ...EMPTY_BUNDLE };
      const errors: Record<string, string> = {};
      for (const r of results) {
        if (r.error) errors[r.key as string] = r.error;
        else next[r.key] = (r.rows ?? []) as never;
      }
      setData(next);
      setTableErrors(errors);
      setSource("anon");
      setLastUpdated(new Date());
      if (Object.keys(errors).length > 0) {
        setError(
          `${Object.keys(errors).length} table(s) could not be read with the anon key (RLS). Configure SUPABASE_SERVICE_ROLE_KEY for full access.`,
        );
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to load data from Supabase");
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void refresh();
  }, [refresh]);

  return { data, loading, error, tableErrors, source, refresh, lastUpdated };
}

/** Shared mutation helper: goes through the server route with anon-client fallback. */
export async function updateRow(
  table: string,
  id: string,
  patch: Record<string, unknown>,
): Promise<{ error: string | null }> {
  try {
    const res = await fetch("/api/admin-db", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ action: "update", table, id, payload: patch }),
    });
    const json = await res.json().catch(() => ({}));
    if (!res.ok) return { error: json.error ?? `Request failed (${res.status})` };
    return { error: null };
  } catch {
    const { error } = await supabase.from(table).update(patch).eq("id", id);
    return { error: error ? error.message : null };
  }
}

export async function insertRow(
  table: string,
  payload: Record<string, unknown>,
): Promise<{ error: string | null; id: string | null }> {
  try {
    const res = await fetch("/api/admin-db", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ action: "insert", table, payload }),
    });
    const json = await res.json().catch(() => ({}));
    if (!res.ok) return { error: json.error ?? `Request failed (${res.status})`, id: null };
    const id = Array.isArray(json.data) && json.data[0]?.id ? (json.data[0].id as string) : null;
    return { error: null, id };
  } catch {
    const { data, error } = await supabase.from(table).insert(payload).select("id").single();
    return { error: error ? error.message : null, id: data?.id ?? null };
  }
}

export async function deleteRow(table: string, id: string): Promise<{ error: string | null }> {
  try {
    const res = await fetch("/api/admin-db", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ action: "delete", table, id }),
    });
    const json = await res.json().catch(() => ({}));
    if (!res.ok) return { error: json.error ?? `Request failed (${res.status})` };
    return { error: null };
  } catch {
    const { error } = await supabase.from(table).delete().eq("id", id);
    return { error: error ? error.message : null };
  }
}
