"use client";

import { useCallback, useEffect, useState } from "react";
import { AlertTriangle, BellRing, Check, CheckCircle, ChevronLeft, ChevronRight, Copy, Database, Download, FileJson, FileSpreadsheet, History, Loader2, Plus, RefreshCw, RotateCcw, Rocket, Search, Send, ShieldAlert, Trash2, TriangleAlert, XCircle } from "lucide-react";
import { useWazy } from "@/components/providers/data-provider";
import { deleteRow, insertRow } from "@/lib/hooks";
import { downloadFile, timestampSlug, toCSV } from "@/lib/export";
import {
  APP_PLATFORMS,
  APP_PLATFORM_LABELS,
  isValidVersion,
} from "@/lib/app-version";
import { formatDate } from "@/lib/format";
import { cn } from "@/lib/cn";
import {
  Badge,
  Button,
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
  EmptyState,
  Input,
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/primitives";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import type { CustomDocumentType } from "@/lib/types";
import { formatNumber, titleize } from "@/lib/format";
import { APP_DATA_TABLES } from "@/lib/purge";
import { SUPABASE_URL, supabaseProjectRef } from "@/lib/supabase";
import { useAdminAuth } from "@/components/providers/admin-auth-provider";
import { authenticatedFetch } from "@/lib/auth-client";

import { useMemo } from "react";

type ExportKind = "documents" | "transactions";

export interface QuickQuery {
  label: string;
  category: "Overview" | "Users" | "Documents" | "Finances" | "Operations";
  description: string;
  sql: string;
}

const QUICK_QUERIES: QuickQuery[] = [
  // --- Overview & Counts ---
  {
    category: "Overview",
    label: "All Tables Row Counts",
    description: "Accurate real-time record count across all core application tables",
    sql: `SELECT 'documents' AS table_name, COUNT(*) AS row_count FROM documents
UNION ALL SELECT 'finance_transactions', COUNT(*) FROM finance_transactions
UNION ALL SELECT 'collections', COUNT(*) FROM collections
UNION ALL SELECT 'reminders', COUNT(*) FROM reminders
UNION ALL SELECT 'user_tiers', COUNT(*) FROM user_tiers
UNION ALL SELECT 'admin_audit_log', COUNT(*) FROM admin_audit_log
UNION ALL SELECT 'support_requests', COUNT(*) FROM support_requests
UNION ALL SELECT 'error_reports', COUNT(*) FROM error_reports
UNION ALL SELECT 'ai_quota_usage', COUNT(*) FROM ai_quota_usage;`,
  },
  {
    category: "Overview",
    label: "Database Live Rows (pg_stat)",
    description: "Postgres engine statistics on active rows for all public and auth tables",
    sql: `SELECT schemaname, relname AS table_name, n_live_tup AS estimated_rows
FROM pg_stat_user_tables
WHERE schemaname IN ('public', 'auth')
ORDER BY n_live_tup DESC;`,
  },

  // --- Users & Accounts ---
  {
    category: "Users",
    label: "Recent Users & Subscription Tiers",
    description: "Registered users with their current tier, plan duration, and last sign-in timestamp",
    sql: `SELECT 
  u.id, 
  u.email, 
  u.created_at, 
  u.last_sign_in_at, 
  COALESCE(t.tier, 'free') AS tier, 
  t.plan_duration,
  t.plan_ends_at
FROM auth.users u
LEFT JOIN public.user_tiers t ON t.user_id = u.id
ORDER BY u.created_at DESC
LIMIT 50;`,
  },
  {
    category: "Users",
    label: "User Storage & Activity Summary",
    description: "Aggregated documents, total storage size, transactions, and collections per user",
    sql: `SELECT 
  u.id, 
  u.email, 
  COUNT(DISTINCT c.id) AS collections_count, 
  COUNT(DISTINCT d.id) AS documents_count, 
  ROUND(COALESCE(SUM(d.file_size), 0) / (1024.0 * 1024.0), 2) AS total_storage_mb, 
  COUNT(DISTINCT t.id) AS transactions_count
FROM auth.users u
LEFT JOIN collections c ON c.owner_id = u.id
LEFT JOIN documents d ON d.owner_id = u.id
LEFT JOIN finance_transactions t ON t.owner_id = u.id
GROUP BY u.id, u.email
ORDER BY documents_count DESC
LIMIT 50;`,
  },
  {
    category: "Users",
    label: "Inactive Accounts (30+ Days)",
    description: "Accounts that have never signed in or have been dormant for over a month",
    sql: `SELECT 
  id, 
  email, 
  created_at, 
  last_sign_in_at
FROM auth.users
WHERE last_sign_in_at < NOW() - INTERVAL '30 days' OR last_sign_in_at IS NULL
ORDER BY last_sign_in_at ASC NULLS FIRST
LIMIT 50;`,
  },

  // --- Documents & Reminders ---
  {
    category: "Documents",
    label: "Expiring Within 30 Days",
    description: "Urgent documents coming up for renewal or expiry within the next month",
    sql: `SELECT 
  id, 
  display_name, 
  doc_type, 
  expires_at, 
  status, 
  renewal_fee,
  owner_id
FROM documents
WHERE expires_at BETWEEN CURRENT_DATE AND (CURRENT_DATE + INTERVAL '30 days')
ORDER BY expires_at ASC
LIMIT 50;`,
  },
  {
    category: "Documents",
    label: "Already Expired Documents",
    description: "Documents past their expiration date sorted by most recently expired",
    sql: `SELECT 
  id, 
  display_name, 
  doc_type, 
  expires_at, 
  status, 
  owner_id
FROM documents
WHERE expires_at < CURRENT_DATE
ORDER BY expires_at DESC
LIMIT 50;`,
  },
  {
    category: "Documents",
    label: "Storage & Volume by Document Type",
    description: "Breakdown of document counts, average file size, and total storage per doc type",
    sql: `SELECT 
  doc_type, 
  COUNT(*) AS doc_count, 
  ROUND(AVG(COALESCE(file_size, 0)) / 1024.0, 2) AS avg_kb, 
  ROUND(SUM(COALESCE(file_size, 0)) / (1024.0 * 1024.0), 2) AS total_mb
FROM documents
GROUP BY doc_type
ORDER BY doc_count DESC;`,
  },
  {
    category: "Documents",
    label: "Pending Unsent Reminders",
    description: "Upcoming automated notification alerts scheduled for documents",
    sql: `SELECT 
  r.id, 
  d.display_name, 
  r.remind_at, 
  r.channel, 
  r.created_at, 
  d.expires_at
FROM reminders r
JOIN documents d ON d.id = r.document_id
WHERE r.sent_at IS NULL
ORDER BY r.remind_at ASC
LIMIT 50;`,
  },

  // --- Finances & Budgets ---
  {
    category: "Finances",
    label: "Current Month Cash Flow by Currency",
    description: "Net cash flow, total income, and total expenses grouped by currency for current month",
    sql: `SELECT 
  currency, 
  kind, 
  COUNT(*) AS transaction_count, 
  ROUND(SUM(amount), 2) AS total_amount
FROM finance_transactions
WHERE date_trunc('month', occurred_at) = date_trunc('month', CURRENT_DATE)
GROUP BY currency, kind
ORDER BY currency, total_amount DESC;`,
  },
  {
    category: "Finances",
    label: "Top Spending Categories Across Platform",
    description: "Highest expenditure categories and total amount spent across all users",
    sql: `SELECT 
  category, 
  currency, 
  COUNT(*) AS transaction_count, 
  ROUND(SUM(amount), 2) AS total_spent
FROM finance_transactions
WHERE kind = 'expense'
GROUP BY category, currency
ORDER BY total_spent DESC
LIMIT 25;`,
  },
  {
    category: "Finances",
    label: "Highest Value Transactions (Last 90 Days)",
    description: "Largest individual financial entries recorded over the past 90 days",
    sql: `SELECT 
  id, 
  title, 
  kind, 
  category, 
  amount, 
  currency, 
  occurred_at, 
  owner_id
FROM finance_transactions
WHERE occurred_at >= CURRENT_DATE - INTERVAL '90 days'
ORDER BY amount DESC
LIMIT 25;`,
  },
  {
    category: "Finances",
    label: "Active Category Budgets",
    description: "Configured monthly category budget limits across users",
    sql: `SELECT 
  id, 
  owner_id, 
  collection_id, 
  category, 
  monthly_limit, 
  created_at
FROM category_budgets
ORDER BY monthly_limit DESC
LIMIT 25;`,
  },
  {
    category: "Finances",
    label: "Recurring Subscriptions & Commitments",
    description: "Scheduled recurring debits and subscription commitments",
    sql: `SELECT 
  id, 
  owner_id, 
  title, 
  category, 
  frequency, 
  amount, 
  currency, 
  day_of_month, 
  is_active
FROM recurring_transactions
ORDER BY amount DESC
LIMIT 25;`,
  },
  {
    category: "Finances",
    label: "Savings Envelopes & Target Progress",
    description: "Track savings goals, accumulated funds, and percentage toward completion",
    sql: `SELECT 
  id, 
  owner_id, 
  name, 
  target_amount, 
  saved_amount, 
  monthly_contribution, 
  ROUND((saved_amount / NULLIF(target_amount, 0)) * 100, 1) AS progress_pct
FROM savings_envelopes
ORDER BY saved_amount DESC
LIMIT 25;`,
  },

  // --- Operations & Logs ---
  {
    category: "Operations",
    label: "AI Quota Top Consumers (This Month)",
    description: "Users with the highest AI OCR and automated parsing usage this month",
    sql: `SELECT 
  user_id, 
  feature_name, 
  usage_month, 
  used_count, 
  updated_at
FROM ai_quota_usage
ORDER BY used_count DESC
LIMIT 25;`,
  },
  {
    category: "Operations",
    label: "Open / Unresolved Support Requests",
    description: "Pending user tickets requiring administrator attention or reply",
    sql: `SELECT 
  id, 
  user_email, 
  request_type, 
  title, 
  status, 
  created_at
FROM support_requests
WHERE status NOT IN ('resolved', 'closed')
ORDER BY created_at DESC
LIMIT 50;`,
  },
  {
    category: "Operations",
    label: "Recent Admin Audit Actions",
    description: "Latest 30 administrator audit logs showing mutations and affected records",
    sql: `SELECT 
  id, 
  action, 
  performed_by, 
  target_table, 
  target_id, 
  performed_at
FROM admin_audit_log
ORDER BY performed_at DESC
LIMIT 30;`,
  },
  {
    category: "Operations",
    label: "Recent Application Error Reports",
    description: "Client application errors, crashes, and unhandled exceptions",
    sql: `SELECT 
  id, 
  severity, 
  error_type, 
  platform, 
  app_version, 
  error_message, 
  created_at
FROM error_reports
ORDER BY created_at DESC
LIMIT 25;`,
  },
  {
    category: "Operations",
    label: "App Usage & Platform Statistics",
    description: "Active user sessions aggregated by device platform (iOS/Android/Web) and app version",
    sql: `SELECT 
  platform, 
  app_version, 
  COUNT(*) AS user_count, 
  SUM(total_sessions) AS total_sessions
FROM app_usage_stats
GROUP BY platform, app_version
ORDER BY total_sessions DESC;`,
  },
  {
    category: "Operations",
    label: "Active App Version Enforcement",
    description: "Minimum and latest enforced client versions per operating system",
    sql: `SELECT 
  platform, 
  min_version, 
  latest_version, 
  force_update, 
  release_notes, 
  released_at
FROM app_versions
ORDER BY platform;`,
  },
];

export default function SystemPage() {
  const { data, refresh, error } = useWazy();

  return (
    <div className="space-y-4">
      <div className="grid grid-cols-1 gap-4 lg:grid-cols-3">
        <StatCard label="Documents" value={data.documents.length} />
        <StatCard label="Transactions" value={data.transactions.length} />
        <StatCard label="Custom doc types" value={data.customDocumentTypes.length} />
      </div>

      {error ? (
        <Card className="border-red-500/30">
          <CardContent className="pt-5">
            <p className="text-sm font-medium text-red-400">Supabase error</p>
            <p className="mt-1 text-xs text-zinc-400">{error}</p>
          </CardContent>
        </Card>
      ) : null}

      <Tabs defaultValue="error-reports">
        <TabsList>
          <TabsTrigger value="export">Data Exporter</TabsTrigger>
          <TabsTrigger value="sql">SQL Runner</TabsTrigger>
          <TabsTrigger value="types">Custom Doc Types</TabsTrigger>
          <TabsTrigger value="reminders">Reminders</TabsTrigger>
          <TabsTrigger value="versions">App Version</TabsTrigger>
          <TabsTrigger value="app-health">App Health</TabsTrigger>
          <TabsTrigger value="error-reports">Error Reports</TabsTrigger>
          <TabsTrigger value="audit">Audit Log</TabsTrigger>
          <TabsTrigger value="danger" className="text-red-400 data-[state=active]:text-red-300">Danger Zone</TabsTrigger>
        </TabsList>

        <TabsContent value="export">
          <DataExporter />
        </TabsContent>

        <TabsContent value="sql">
          <SqlRunner />
        </TabsContent>

        <TabsContent value="types">
          <CustomTypesManager
            types={data.customDocumentTypes}
            onChanged={() => void refresh()}
          />
        </TabsContent>

        <TabsContent value="reminders">
          <RemindersManager onChanged={() => void refresh()} />
        </TabsContent>

        <TabsContent value="versions">
          <AppVersionManager />
        </TabsContent>

        <TabsContent value="app-health">
          <AppHealthDashboard />
        </TabsContent>

        <TabsContent value="error-reports">
          <ErrorReportsTab />
        </TabsContent>

        <TabsContent value="audit">
          <AdminAuditViewer />
        </TabsContent>

        <TabsContent value="danger">
          <DangerZone />
        </TabsContent>
      </Tabs>
    </div>
  );
}

function StatCard({ label, value }: { label: string; value: number }) {
  return (
    <Card>
      <CardContent className="pt-5">
        <p className="text-[11px] font-semibold uppercase tracking-wider text-slate-700 dark:text-zinc-500">{label}</p>
        <p className="mt-1 text-2xl font-semibold text-slate-900 dark:text-white">{formatNumber(value)}</p>
      </CardContent>
    </Card>
  );
}

/* ------------------------------ Data exporter ----------------------------- */

function DataExporter() {
  const { data } = useWazy();

  const exportData = (kind: ExportKind, format: "csv" | "json") => {
    const rows =
      kind === "documents"
        ? (data.documents as unknown as Record<string, unknown>[])
        : (data.transactions as unknown as Record<string, unknown>[]);
    if (format === "csv") {
      downloadFile(toCSV(rows), `wazy-${kind}-${timestampSlug()}.csv`, "text/csv");
    } else {
      downloadFile(JSON.stringify(rows, null, 2), `wazy-${kind}-${timestampSlug()}.json`, "application/json");
    }
  };

  return (
    <Card>
      <CardHeader>
        <CardTitle>One-click Data Exporter</CardTitle>
        <CardDescription>Download Documents or Finance Transactions as CSV or JSON</CardDescription>
      </CardHeader>
      <CardContent className="grid grid-cols-1 gap-3 sm:grid-cols-2">
        <ExportTile
          title="Documents"
          count={data.documents.length}
          icon={<FileSpreadsheet className="h-5 w-5 text-blue-400" />}
          onExport={(fmt) => exportData("documents", fmt)}
        />
        <ExportTile
          title="Finance Transactions"
          count={data.transactions.length}
          icon={<FileJson className="h-5 w-5 text-zinc-300" />}
          onExport={(fmt) => exportData("transactions", fmt)}
        />
      </CardContent>
    </Card>
  );
}

function ExportTile({
  title,
  count,
  icon,
  onExport,
}: {
  title: string;
  count: number;
  icon: React.ReactNode;
  onExport: (fmt: "csv" | "json") => void;
}) {
  return (
    <div className="rounded-xl border border-zinc-800 bg-black/40 p-4">
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-3">
          {icon}
          <div>
            <p className="text-sm font-semibold text-zinc-100">{title}</p>
            <p className="text-[11px] text-zinc-500">{formatNumber(count)} rows</p>
          </div>
        </div>
        <div className="flex gap-2">
          <Button variant="outline" size="sm" onClick={() => onExport("csv")} disabled={count === 0}>
            <Download className="h-3.5 w-3.5" />
            CSV
          </Button>
          <Button variant="outline" size="sm" onClick={() => onExport("json")} disabled={count === 0}>
            <Download className="h-3.5 w-3.5" />
            JSON
          </Button>
        </div>
      </div>
    </div>
  );
}

/* -------------------------------- SQL runner ------------------------------ */

interface SqlResult {
  columns: string[];
  rows: Record<string, unknown>[];
  error: string | null;
  ms: number;
}

function SqlRunner() {
  const [sql, setSql] = useState(QUICK_QUERIES[0].sql);
  const [selectedPresetLabel, setSelectedPresetLabel] = useState<string>(QUICK_QUERIES[0].label);
  const [activeCategory, setActiveCategory] = useState<string>("Overview");
  const [searchFilter, setSearchFilter] = useState<string>("");
  const [result, setResult] = useState<SqlResult | null>(null);
  const [running, setRunning] = useState(false);
  const [copied, setCopied] = useState(false);

  const categories = useMemo(() => {
    return ["Overview", "Users", "Documents", "Finances", "Operations"];
  }, []);

  const filteredQueries = useMemo(() => {
    return QUICK_QUERIES.filter((q) => {
      const matchCat = searchFilter.trim() ? true : q.category === activeCategory;
      const matchSearch =
        !searchFilter.trim() ||
        q.label.toLowerCase().includes(searchFilter.toLowerCase()) ||
        q.description.toLowerCase().includes(searchFilter.toLowerCase());
      return matchCat && matchSearch;
    });
  }, [activeCategory, searchFilter]);

  const activePreset = useMemo(() => {
    return QUICK_QUERIES.find((q) => q.label === selectedPresetLabel) ?? null;
  }, [selectedPresetLabel]);

  const run = async () => {
    setRunning(true);
    setResult(null);
    const started = performance.now();
    try {
      const clean = sql.trim().replace(/;\s*$/, "");
      if (!clean) throw new Error("Please enter a SQL query.");
      const res = await fetch("/api/admin-db", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          action: "query",
          sql: clean,
        }),
      });
      const json = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(json.error ?? `Request failed (${res.status})`);
      const data = (json.data ?? []) as Record<string, unknown>[];
      setResult({
        columns: data.length > 0 ? Object.keys(data[0]) : [],
        rows: data,
        error: null,
        ms: Math.round(performance.now() - started),
      });
    } catch (err) {
      setResult({
        columns: [],
        rows: [],
        error: err instanceof Error ? err.message : "Query failed",
        ms: Math.round(performance.now() - started),
      });
    } finally {
      setRunning(false);
    }
  };

  const copySql = async () => {
    try {
      await navigator.clipboard.writeText(sql);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    } catch {
      /* ignore */
    }
  };

  const exportJSON = () => {
    if (!result || result.rows.length === 0) return;
    downloadFile(JSON.stringify(result.rows, null, 2), `finavig-query-${timestampSlug()}.json`, "application/json");
  };

  const exportCSV = () => {
    if (!result || result.rows.length === 0) return;
    downloadFile(toCSV(result.rows), `finavig-query-${timestampSlug()}.csv`, "text/csv");
  };

  const CATEGORY_DOT: Record<string, string> = {
    Overview: "bg-blue-500",
    Users: "bg-purple-500",
    Documents: "bg-amber-500",
    Finances: "bg-emerald-500",
    Operations: "bg-rose-500",
  };

  return (
    <Card>
      <CardHeader>
        <div className="flex flex-col gap-1 sm:flex-row sm:items-center sm:justify-between">
          <div>
            <CardTitle>SQL Runner & Database Explorer</CardTitle>
            <CardDescription>
              Execute real-time, read-only SQL queries directly against your primary Supabase Postgres database.
            </CardDescription>
          </div>
          <Badge variant="neutral" className="w-fit text-[11px] font-mono border-zinc-200 bg-white text-zinc-600 dark:border-zinc-800 dark:bg-zinc-900 dark:text-zinc-400">
            Postgres Direct Read
          </Badge>
        </div>
      </CardHeader>
      <CardContent className="space-y-4">
        {/* Preset Queries Explorer */}
        <div className="rounded-xl border border-zinc-200 bg-zinc-50/70 p-3 space-y-2.5 dark:border-zinc-800 dark:bg-zinc-950/60">
          <div className="flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
            <span className="text-[11px] font-semibold uppercase tracking-wider text-slate-700 dark:text-zinc-400">
              Admin Query Presets ({QUICK_QUERIES.length})
            </span>
            <div className="relative w-full sm:w-64">
              <Search className="absolute left-2.5 top-2.5 h-3.5 w-3.5 text-zinc-400 dark:text-zinc-500" />
              <Input
                placeholder="Search presets..."
                value={searchFilter}
                onChange={(e) => setSearchFilter(e.target.value)}
                className="h-8 pl-8 text-xs bg-white border-zinc-200 text-zinc-900 placeholder:text-zinc-400 focus:border-blue-500 dark:bg-zinc-900 dark:border-zinc-800 dark:text-zinc-100 dark:placeholder:text-zinc-500"
              />
            </div>
          </div>

          {/* Category Filter Pills */}
          <div className="flex flex-wrap gap-1.5 border-b border-zinc-200/80 pb-2 dark:border-zinc-800/80">
            {categories.map((cat) => {
              const count = QUICK_QUERIES.filter((q) => q.category === cat).length;
              const isActive = activeCategory === cat && !searchFilter.trim();
              return (
                <button
                  key={cat}
                  type="button"
                  onClick={() => {
                    setActiveCategory(cat);
                    setSearchFilter("");
                  }}
                  className={cn(
                    "flex items-center gap-1.5 rounded-lg px-2.5 py-1 text-xs font-medium transition-all shadow-2xs",
                    isActive
                      ? "bg-[#0078D4] text-white shadow-xs font-semibold"
                      : "border border-zinc-200 bg-white text-zinc-700 hover:bg-zinc-100 hover:text-zinc-900 dark:border-zinc-800 dark:bg-zinc-900 dark:text-zinc-300 dark:hover:bg-zinc-800 dark:hover:text-zinc-100"
                  )}
                >
                  <span>{cat}</span>
                  <span
                    className={cn(
                      "text-[10px] rounded-full px-1.5 py-0.2",
                      isActive
                        ? "bg-white/20 text-white"
                        : "bg-zinc-100 text-zinc-600 dark:bg-zinc-800 dark:text-zinc-400"
                    )}
                  >
                    {count}
                  </span>
                </button>
              );
            })}
          </div>

          {/* Presets Grid - Small, Compact, UI-Friendly Cards */}
          <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 lg:grid-cols-4 xl:grid-cols-4 2xl:grid-cols-5 gap-1.5 max-h-52 overflow-y-auto pr-1">
            {filteredQueries.map((q) => {
              const isSelected = selectedPresetLabel === q.label;
              return (
                <button
                  key={q.label}
                  type="button"
                  onClick={() => {
                    setSql(q.sql);
                    setSelectedPresetLabel(q.label);
                  }}
                  title={`${q.label}\n${q.description}`}
                  className={cn(
                    "group relative flex flex-col justify-center rounded-lg border px-2.5 py-1.5 text-left transition-all shadow-2xs",
                    isSelected
                      ? "border-blue-500 bg-blue-50/90 text-blue-900 shadow-xs ring-1 ring-blue-500/40 dark:border-blue-500 dark:bg-blue-950/40 dark:text-blue-200"
                      : "border-zinc-200 bg-white text-zinc-800 hover:border-blue-300 hover:bg-blue-50/20 hover:text-blue-900 dark:border-zinc-800 dark:bg-zinc-900/50 dark:text-zinc-300 dark:hover:border-zinc-700 dark:hover:bg-zinc-900"
                  )}
                >
                  <div className="flex items-center gap-1.5 w-full">
                    <span className={cn("h-1.5 w-1.5 rounded-full shrink-0", CATEGORY_DOT[q.category] ?? "bg-blue-500")} />
                    <span className={cn("text-xs font-medium truncate flex-1", isSelected ? "text-blue-700 dark:text-blue-300 font-semibold" : "text-zinc-800 dark:text-zinc-200 group-hover:text-blue-600 dark:group-hover:text-blue-400")}>
                      {q.label}
                    </span>
                  </div>
                  <p className="mt-0.5 pl-3 text-[10.5px] text-zinc-500 dark:text-zinc-400 truncate">
                    {q.description}
                  </p>
                </button>
              );
            })}
            {filteredQueries.length === 0 && (
              <p className="col-span-full py-4 text-center text-xs text-zinc-500">
                No presets found matching “{searchFilter}”.
              </p>
            )}
          </div>

          {activePreset && (
            <div className="rounded-lg border border-blue-200 bg-blue-50/70 px-3 py-1.5 text-xs flex items-center justify-between gap-2 dark:border-zinc-800 dark:bg-zinc-900/60">
              <div className="flex items-center gap-2 text-zinc-700 dark:text-zinc-300 min-w-0">
                <span className="font-semibold text-blue-600 dark:text-blue-400 shrink-0">Selected:</span>
                <span className="font-medium text-zinc-900 dark:text-zinc-100 truncate">{activePreset.label}</span>
                <span className="text-zinc-400 hidden sm:inline">—</span>
                <span className="text-zinc-600 dark:text-zinc-400 hidden sm:inline truncate">{activePreset.description}</span>
              </div>
              <Badge variant="neutral" className="text-[10px] shrink-0 border-zinc-200 bg-white text-zinc-700 dark:border-zinc-700 dark:bg-zinc-800 dark:text-zinc-300">
                {activePreset.category}
              </Badge>
            </div>
          )}
        </div>

        {/* SQL Editor Area */}
        <div className="relative">
          <textarea
            className="min-h-36 w-full rounded-xl border border-zinc-200 bg-white p-3.5 font-mono text-xs text-zinc-900 shadow-2xs focus:border-blue-500 focus:outline-none focus:ring-1 focus:ring-blue-500/30 leading-relaxed dark:border-zinc-800 dark:bg-zinc-950 dark:text-zinc-100 dark:focus:border-blue-500/70"
            value={sql}
            onChange={(e) => {
              setSql(e.target.value);
              setSelectedPresetLabel("");
            }}
            spellCheck={false}
            placeholder="Type your SELECT or WITH query here..."
          />
        </div>

        {/* Toolbar */}
        <div className="flex flex-wrap items-center justify-between gap-2">
          <div className="flex items-center gap-2">
            <Button variant="primary" onClick={() => void run()} disabled={running}>
              {running ? <Loader2 className="h-4 w-4 animate-spin" /> : <Database className="h-4 w-4" />}
              Run query
            </Button>
            <Button variant="outline" size="sm" onClick={() => void copySql()} title="Copy SQL">
              {copied ? <Check className="h-3.5 w-3.5 text-emerald-600 dark:text-emerald-400" /> : <Copy className="h-3.5 w-3.5" />}
              {copied ? "Copied" : "Copy SQL"}
            </Button>
            <Button
              variant="ghost"
              size="sm"
              onClick={() => {
                setSql("");
                setSelectedPresetLabel("");
                setResult(null);
              }}
            >
              Clear
            </Button>
          </div>

          <div className="flex items-center gap-2">
            <Button
              variant="outline"
              size="sm"
              onClick={exportCSV}
              disabled={!result || result.rows.length === 0}
            >
              <Download className="h-3.5 w-3.5" />
              CSV
            </Button>
            <Button
              variant="outline"
              size="sm"
              onClick={exportJSON}
              disabled={!result || result.rows.length === 0}
            >
              <Download className="h-3.5 w-3.5" />
              JSON
            </Button>
          </div>
        </div>

        {/* Error Alert */}
        {result?.error ? (
          <div className="flex items-start gap-2.5 rounded-xl border border-red-500/40 bg-red-50 p-3.5 text-xs text-red-900 dark:bg-red-500/10 dark:text-red-200">
            <TriangleAlert className="mt-0.5 h-4 w-4 shrink-0 text-red-600 dark:text-red-400" />
            <div>
              <p className="font-semibold text-red-800 dark:text-red-300">Query Failed</p>
              <p className="mt-0.5 font-mono text-[11px] text-red-700 dark:text-red-200/90">{result.error}</p>
            </div>
          </div>
        ) : null}

        {/* Results View */}
        {result && !result.error ? (
          <div className="space-y-2">
            <div className="flex items-center justify-between px-1 text-xs text-zinc-500 dark:text-zinc-400">
              <div className="flex items-center gap-2">
                <span className="font-semibold text-zinc-800 dark:text-zinc-200">{formatNumber(result.rows.length)}</span>
                <span>{result.rows.length === 1 ? "row" : "rows"} returned</span>
                <span>•</span>
                <span className="font-mono text-zinc-700 dark:text-zinc-300">{result.ms} ms</span>
                {result.columns.length > 0 && (
                  <>
                    <span>•</span>
                    <span>{result.columns.length} columns</span>
                  </>
                )}
              </div>
            </div>

            {result.rows.length === 0 ? (
              <div className="rounded-xl border border-zinc-200 bg-zinc-50/70 p-8 text-center text-xs text-zinc-500 dark:border-zinc-800 dark:bg-zinc-950/40">
                Query executed successfully, but returned 0 rows.
              </div>
            ) : (
              <div className="overflow-x-auto max-h-[480px] overflow-y-auto rounded-xl border border-zinc-200 bg-white dark:border-zinc-800 dark:bg-zinc-950 shadow-2xs">
                <table className="w-full text-xs">
                  <thead className="bg-zinc-100/90 sticky top-0 z-10 border-b border-zinc-200 dark:bg-zinc-900 dark:border-zinc-800">
                    <tr>
                      <th className="px-3 py-2.5 text-left font-medium uppercase tracking-wider text-zinc-500 w-12 bg-zinc-100/90 dark:bg-zinc-900">
                        #
                      </th>
                      {result.columns.map((c) => (
                        <th key={c} className="px-3 py-2.5 text-left font-medium uppercase tracking-wider text-zinc-600 dark:text-zinc-400 bg-zinc-100/90 dark:bg-zinc-900">
                          {c}
                        </th>
                      ))}
                    </tr>
                  </thead>
                  <tbody>
                    {result.rows.slice(0, 100).map((r, i) => (
                      <tr key={i} className="border-t border-zinc-200/80 hover:bg-zinc-50/80 transition-colors dark:border-zinc-800/70 dark:hover:bg-zinc-900/40">
                        <td className="px-3 py-1.5 font-mono text-zinc-400 dark:text-zinc-600 select-none">
                          {i + 1}
                        </td>
                        {result.columns.map((c) => (
                          <td key={c} className="px-3 py-1.5 font-mono text-zinc-800 dark:text-zinc-300 max-w-xs truncate">
                            {formatCell(r[c])}
                          </td>
                        ))}
                      </tr>
                    ))}
                  </tbody>
                </table>
                {result.rows.length > 100 && (
                  <p className="border-t border-zinc-200 px-3 py-2 text-[11px] text-zinc-500 bg-zinc-50 dark:border-zinc-800 dark:bg-zinc-950">
                    Showing first 100 rows of {result.rows.length}. Export CSV/JSON for full data.
                  </p>
                )}
              </div>
            )}
          </div>
        ) : null}
      </CardContent>
    </Card>
  );
}

function formatCell(v: unknown): string {
  if (v === null || v === undefined) return "—";
  if (typeof v === "object") return JSON.stringify(v);
  return String(v);
}

/* --------------------------- Reminder management --------------------------- */

function RemindersManager({ onChanged }: { onChanged: () => void }) {
  const { data, loading } = useWazy();
  const [busy, setBusy] = useState(false);
  const [notice, setNotice] = useState<{ kind: "success" | "error"; text: string } | null>(null);

  const docOwner = new Map(data.documents.map((d) => [d.id, d.owner_id]));
  const pending = data.reminders.filter((r) => !r.sent_at);
  const sent = data.reminders.filter((r) => r.sent_at);
  const dueToday = pending.filter((r) => r.remind_at <= new Date().toISOString().slice(0, 10));

  const markDueAsSent = async () => {
    setBusy(true);
    setNotice(null);
    try {
      let done = 0;
      let failure: string | null = null;
      // Route-scoped, id-based updates through the generic admin-db route.
      for (const r of dueToday.slice(0, 200)) {
        const res = await fetch("/api/admin-db", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ action: "update", table: "reminders", id: r.id, payload: { sent_at: new Date().toISOString() } }),
        });
        const json = await res.json().catch(() => ({}));
        if (!res.ok) {
          failure = json.error ?? `Request failed (${res.status})`;
          break;
        }
        done += 1;
      }
      if (failure) setNotice({ kind: "error", text: `Batch stopped after ${done}: ${failure}` });
      else {
        setNotice({ kind: "success", text: `Marked ${done} due reminder(s) as sent.` });
        onChanged();
      }
    } finally {
      setBusy(false);
    }
  };

  const clearStale = async () => {
    setBusy(true);
    setNotice(null);
    try {
      let done = 0;
      let failure: string | null = null;
      const cutoff = new Date(Date.now() - 90 * 86_400_000).toISOString();
      for (const r of sent.filter((r) => r.sent_at && r.sent_at < cutoff).slice(0, 200)) {
        const res = await fetch("/api/admin-db", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ action: "delete", table: "reminders", id: r.id }),
        });
        const json = await res.json().catch(() => ({}));
        if (!res.ok) {
          failure = json.error ?? `Request failed (${res.status})`;
          break;
        }
        done += 1;
      }
      if (failure) setNotice({ kind: "error", text: `Cleanup stopped after ${done}: ${failure}` });
      else {
        setNotice({ kind: "success", text: `Deleted ${done} stale sent reminder(s) older than 90 days.` });
        onChanged();
      }
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="space-y-4">
      <div className="grid grid-cols-2 gap-4 xl:grid-cols-4">
        <StatTile label="Pending reminders" value={pending.length} />
        <StatTile label="Due (remind_at ≤ today)" value={dueToday.length} tone={dueToday.length > 0 ? "text-amber-600 dark:text-amber-400" : "text-slate-900 dark:text-white"} />
        <StatTile label="Sent" value={sent.length} />
        <StatTile label="Total scheduled" value={data.reminders.length} />
      </div>

      {notice ? (
        <p className={cn("text-xs", notice.kind === "success" ? "text-emerald-400" : "text-red-400")}>{notice.text}</p>
      ) : null}

      <Card>
        <CardHeader>
          <CardTitle>Pending reminders</CardTitle>
          <CardDescription>Notifications not yet sent, grouped per channel · owners come from their document</CardDescription>
        </CardHeader>
        <CardContent>
          {loading ? (
            <p className="text-sm text-zinc-600">Loading…</p>
          ) : pending.length === 0 ? (
            <EmptyState icon={<BellRing className="h-10 w-10" />} title="No pending reminders" />
          ) : (
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Remind at</TableHead>
                  <TableHead>Channel</TableHead>
                  <TableHead>Owner</TableHead>
                  <TableHead className="text-right">State</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {pending.slice(0, 100).map((r) => {
                  const ownerId = docOwner.get(r.document_id);
                  const due = r.remind_at <= new Date().toISOString().slice(0, 10);
                  return (
                    <TableRow key={r.id}>
                      <TableCell>{formatDate(r.remind_at)}</TableCell>
                      <TableCell>
                        <Badge variant="neutral">{titleize(r.channel)}</Badge>
                      </TableCell>
                      <TableCell>
                        <span className="font-mono text-[11px] text-zinc-500">{ownerId ? `${ownerId.slice(0, 8)}…` : "unknown doc"}</span>
                      </TableCell>
                      <TableCell className="text-right">
                        {due ? <Badge variant="warning">due now</Badge> : <Badge variant="info">scheduled</Badge>}
                      </TableCell>
                    </TableRow>
                  );
                })}
              </TableBody>
            </Table>
          )}
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>Maintenance actions</CardTitle>
          <CardDescription>
            Batch-mark due reminders as sent, or purge sent reminders older than 90 days. The app&apos;s own
            create_due_reminders() scan runs on its normal schedule.
          </CardDescription>
        </CardHeader>
        <CardContent className="flex flex-wrap gap-3">
          <Button variant="secondary" onClick={() => void markDueAsSent()} disabled={busy || dueToday.length === 0}>
            <Send className="h-4 w-4" />
            Mark {dueToday.length} due as sent
          </Button>
          <Button variant="danger" onClick={() => void clearStale()} disabled={busy}>
            <Trash2 className="h-4 w-4" />
            Clear sent &gt; 90 days
          </Button>
        </CardContent>
      </Card>
    </div>
  );
}

function StatTile({ label, value, tone = "text-slate-900 dark:text-white" }: { label: string; value: number; tone?: string }) {
  return (
    <Card>
      <CardContent className="pt-5">
        <p className="text-[11px] font-semibold uppercase tracking-wider text-slate-700 dark:text-zinc-500">{label}</p>
        <p className={cn("mt-1 text-2xl font-semibold", tone)}>{formatNumber(value)}</p>
      </CardContent>
    </Card>
  );
}

/* ------------------------- App version & force update ----------------------- */

interface VersionDraft {
  minRequiredVersion: string;
  latestVersion: string;
  isForceUpdate: boolean;
  downloadUrl: string;
  releaseNotes: string;
}

const EMPTY_DRAFT: VersionDraft = {
  minRequiredVersion: "",
  latestVersion: "",
  isForceUpdate: false,
  downloadUrl: "",
  releaseNotes: "",
};

function AppVersionManager() {
  const { data, refresh } = useWazy();
  const [platform, setPlatform] = useState<string>("all");
  const [draft, setDraft] = useState<VersionDraft>(EMPTY_DRAFT);
  const [busy, setBusy] = useState(false);
  const [notice, setNotice] = useState<{ kind: "success" | "error"; text: string } | null>(null);

  const current = data.appVersions.find((v) => v.platform === platform);

  const selectPlatform = (p: string) => {
    setPlatform(p);
    const row = data.appVersions.find((v) => v.platform === p);
    setDraft(
      row
        ? {
            minRequiredVersion: row.min_required_version ?? "",
            latestVersion: row.latest_version ?? "",
            isForceUpdate: row.is_force_update,
            downloadUrl: row.download_url ?? "",
            releaseNotes: row.release_notes ?? "",
          }
        : EMPTY_DRAFT,
    );
  };

  const save = async () => {
    setBusy(true);
    setNotice(null);
    try {
      const res = await fetch("/api/app-versions", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          platform,
          minRequiredVersion: draft.minRequiredVersion || null,
          latestVersion: draft.latestVersion,
          isForceUpdate: draft.isForceUpdate,
          downloadUrl: draft.downloadUrl || null,
          releaseNotes: draft.releaseNotes || null,
        }),
      });
      const json = await res.json().catch(() => ({}));
      if (!res.ok || !json.ok) {
        setNotice({ kind: "error", text: json.error ?? `Save failed (${res.status})` });
        return;
      }
      setNotice({ kind: "success", text: `Version config saved for ${APP_PLATFORM_LABELS[platform as keyof typeof APP_PLATFORM_LABELS] ?? platform}.` });
      void refresh();
    } finally {
      setBusy(false);
    }
  };

  const disableForce = async () => {
    setDraft((d) => ({ ...d, isForceUpdate: false }));
    setBusy(true);
    setNotice(null);
    try {
      const res = await fetch("/api/app-versions", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          platform,
          minRequiredVersion: draft.minRequiredVersion || null,
          latestVersion: draft.latestVersion,
          isForceUpdate: false,
          downloadUrl: draft.downloadUrl || null,
          releaseNotes: draft.releaseNotes || null,
        }),
      });
      const json = await res.json().catch(() => ({}));
      if (!res.ok || !json.ok) {
        setNotice({ kind: "error", text: json.error ?? `Save failed (${res.status})` });
      } else {
        setNotice({ kind: "success", text: "Force update disabled — users can keep using the current version." });
        void refresh();
      }
    } finally {
      setBusy(false);
    }
  };

  const latestInvalid = draft.latestVersion.trim() !== "" && !isValidVersion(draft.latestVersion);
  const minInvalid = draft.minRequiredVersion.trim() !== "" && !isValidVersion(draft.minRequiredVersion);
  const forceNeedsMin = draft.isForceUpdate && draft.minRequiredVersion.trim() === "";

  return (
    <div className="space-y-4">
      {notice ? (
        <p className={cn("text-xs", notice.kind === "success" ? "text-emerald-400" : "text-red-400")}>{notice.text}</p>
      ) : null}

      <div className="grid grid-cols-1 gap-4 lg:grid-cols-3">
        <Card className="lg:col-span-2">
          <CardHeader>
            <CardTitle>Publish version config</CardTitle>
            <CardDescription>
              One row per platform · the app reads its platform row (falling back to “all”) before sign-in.
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="flex flex-wrap gap-2">
              {APP_PLATFORMS.map((p) => (
                <button
                  key={p}
                  type="button"
                  onClick={() => selectPlatform(p)}
                  className={cn(
                    "rounded-lg border px-3 py-1.5 text-xs transition-colors",
                    platform === p
                      ? "border-blue-500/50 bg-blue-500/10 text-blue-300"
                      : "border-zinc-800 text-zinc-400 hover:border-zinc-700 hover:text-zinc-200",
                  )}
                >
                  {APP_PLATFORM_LABELS[p]}
                </button>
              ))}
            </div>

            <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
              <div>
                <label className="mb-1.5 block text-[11px] font-medium uppercase tracking-wider text-zinc-500">Latest version *</label>
                <Input
                  placeholder="1.2.0"
                  value={draft.latestVersion}
                  onChange={(e) => setDraft((d) => ({ ...d, latestVersion: e.target.value }))}
                  className={latestInvalid ? "border-red-500/60" : ""}
                />
                {latestInvalid ? <p className="mt-1 text-[11px] text-red-400">Must look like 1.2.0</p> : null}
              </div>
              <div>
                <label className="mb-1.5 block text-[11px] font-medium uppercase tracking-wider text-zinc-500">Minimum required version</label>
                <Input
                  placeholder="1.1.0 (blank = no minimum)"
                  value={draft.minRequiredVersion}
                  onChange={(e) => setDraft((d) => ({ ...d, minRequiredVersion: e.target.value }))}
                  className={minInvalid ? "border-red-500/60" : ""}
                />
                {minInvalid ? <p className="mt-1 text-[11px] text-red-400">Must look like 1.1.0</p> : null}
              </div>
              <div className="sm:col-span-2">
                <label className="mb-1.5 block text-[11px] font-medium uppercase tracking-wider text-zinc-500">Download URL</label>
                <Input
                  placeholder="https://apps.apple.com/… or https://play.google.com/…"
                  value={draft.downloadUrl}
                  onChange={(e) => setDraft((d) => ({ ...d, downloadUrl: e.target.value }))}
                />
              </div>
              <div className="sm:col-span-2">
                <label className="mb-1.5 block text-[11px] font-medium uppercase tracking-wider text-zinc-500">Release notes</label>
                <textarea
                  rows={3}
                  className="w-full rounded-lg border border-zinc-800 bg-zinc-950 px-3 py-2 text-sm text-zinc-100 placeholder:text-zinc-600 focus:border-blue-500/60 focus:outline-none"
                  placeholder="What's new in this version…"
                  value={draft.releaseNotes}
                  onChange={(e) => setDraft((d) => ({ ...d, releaseNotes: e.target.value }))}
                />
              </div>
            </div>

            <label className="flex items-center gap-3 rounded-lg border border-amber-500/30 bg-amber-500/5 px-3 py-2.5">
              <input
                type="checkbox"
                checked={draft.isForceUpdate}
                onChange={(e) => setDraft((d) => ({ ...d, isForceUpdate: e.target.checked }))}
                className="h-4 w-4 accent-amber-400"
              />
              <span className="text-xs text-amber-300">
                Force update — block the app until the user upgrades to at least the minimum required version.
              </span>
            </label>
            {forceNeedsMin ? <p className="text-[11px] text-red-400">Force update needs a minimum required version.</p> : null}

            <div className="flex flex-wrap gap-3">
              <Button variant="primary" onClick={() => void save()} disabled={busy || latestInvalid || minInvalid || forceNeedsMin}>
                {busy ? <Loader2 className="h-4 w-4 animate-spin" /> : <Rocket className="h-4 w-4" />}
                Publish config
              </Button>
              {current?.is_force_update ? (
                <Button variant="secondary" onClick={() => void disableForce()} disabled={busy}>
                  <RotateCcw className="h-4 w-4" />
                  Disable force update
                </Button>
              ) : null}
            </div>
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle>Current config</CardTitle>
            <CardDescription>All platform rows as stored in public.app_versions</CardDescription>
          </CardHeader>
          <CardContent className="space-y-3">
            {data.appVersions.length === 0 ? (
              <p className="text-sm text-zinc-600">
                No version rows yet. Run supabase/app_version_schema.sql first, then publish a config.
              </p>
            ) : (
              data.appVersions.map((v) => (
                <div key={v.id} className="rounded-xl border border-zinc-800 bg-black/40 p-3">
                  <div className="flex items-center justify-between">
                    <p className="text-sm font-semibold text-zinc-100">{APP_PLATFORM_LABELS[v.platform as keyof typeof APP_PLATFORM_LABELS] ?? v.platform}</p>
                    {v.is_force_update ? <Badge variant="danger">force update</Badge> : <Badge variant="success">soft update</Badge>}
                  </div>
                  <p className="mt-1 text-[11px] text-zinc-500">
                    latest {v.latest_version ?? "—"} · min {v.min_required_version ?? "none"} · updated {formatDate(v.updated_at)}
                  </p>
                  {v.release_notes ? <p className="mt-1.5 line-clamp-2 text-[11px] text-zinc-400">{v.release_notes}</p> : null}
                </div>
              ))
            )}
          </CardContent>
        </Card>
      </div>
    </div>
  );
}

/* ------------------------------- Audit log -------------------------------- */

interface AdminAuditRow {
  id: number | string;
  action: string;
  user_id: string | null;
  target_table: string | null;
  target_id: string | null;
  details: Record<string, unknown>;
  performed_by: string;
  performed_at: string;
}

const AUDIT_ACTION_LABELS: Record<string, string> = {
  "user.ban": "Banned user",
  "user.unban": "Unbanned user",
  "user.delete": "Deleted user",
  "user.reset_password": "Sent password reset",
  "user.data_purge": "Purged user data",
  "tier.grant": "Tier change",
  "quota.reset": "AI quota reset",
  "version.publish": "Version published",
  "reminder.mark_sent": "Reminders marked sent",
  "reminder.cleanup": "Reminder cleanup",
  "row.insert": "Row inserted",
  "row.update": "Row updated",
  "row.delete": "Row deleted",
};

function auditActionLabel(action: string): string {
  return AUDIT_ACTION_LABELS[action] ?? action;
}

function auditVariant(action: string): "danger" | "warning" | "success" | "info" | "neutral" {
  if (action === "user.delete" || action === "user.data_purge" || action === "row.delete") return "danger";
  if (action === "user.ban" || action === "quota.reset") return "warning";
  if (action === "user.unban" || action === "user.reset_password") return "success";
  if (action === "tier.grant" || action === "version.publish") return "info";
  return "neutral";
}

function AdminAuditViewer() {
  const [rows, setRows] = useState<AdminAuditRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [message, setMessage] = useState<string | null>(null);
  const [filter, setFilter] = useState("");
  const [userFilter, setUserFilter] = useState("");

  const load = async () => {
    setLoading(true);
    setMessage(null);
    try {
      const res = await fetch("/api/admin-audit?limit=200", { cache: "no-store" });
      const json = await res.json().catch(() => ({}));
      setRows(json.rows ?? []);
      setMessage(json.message ?? null);
    } catch {
      setMessage("Failed to load the audit log.");
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    void load();
  }, []);

  const visible = rows.filter((r) => {
    const q = filter.trim().toLowerCase();
    if (q && !`${r.action} ${r.performed_by} ${r.target_table ?? ""} ${JSON.stringify(r.details ?? {})}`.toLowerCase().includes(q)) {
      return false;
    }
    if (userFilter.trim() && !(r.user_id ?? "").toLowerCase().includes(userFilter.trim().toLowerCase())) return false;
    return true;
  });

  return (
    <Card>
      <CardHeader>
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div>
            <CardTitle>Admin Audit Log</CardTitle>
            <CardDescription>
              Every console action recorded in public.admin_audit_log — user management, tier grants, quota resets,
              version publishes and row edits. Failures are recorded too.
            </CardDescription>
          </div>
          <div className="flex flex-wrap items-center gap-3">
            <Input
              className="w-56"
              placeholder="Search action, table, details…"
              value={filter}
              onChange={(e) => setFilter(e.target.value)}
            />
            <Input
              className="w-56"
              placeholder="Filter by user id…"
              value={userFilter}
              onChange={(e) => setUserFilter(e.target.value)}
            />
            <Button variant="secondary" size="sm" onClick={() => void load()} disabled={loading}>
              <History className={cn("h-4 w-4", loading && "animate-spin")} />
              Refresh
            </Button>
          </div>
        </div>
      </CardHeader>
      <CardContent>
        {loading ? (
          <p className="text-sm text-zinc-600">Loading audit log…</p>
        ) : message && rows.length === 0 ? (
          <p className="text-sm text-amber-400">{message}</p>
        ) : visible.length === 0 ? (
          <p className="py-6 text-center text-sm text-zinc-500">
            {rows.length === 0
              ? "No admin actions recorded yet. Run supabase/admin_audit_log_schema.sql to enable logging."
              : "No entries match the filters."}
          </p>
        ) : (
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>When</TableHead>
                <TableHead>Action</TableHead>
                <TableHead>User / target</TableHead>
                <TableHead>Details</TableHead>
                <TableHead>By</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {visible.map((r) => (
                <TableRow key={String(r.id)}>
                  <TableCell className="whitespace-nowrap">
                    <span className="text-xs text-zinc-300">{formatDate(r.performed_at)}</span>
                    <span className="block text-[10px] text-zinc-600">
                      {new Date(r.performed_at).toLocaleTimeString("en-GB")}
                    </span>
                  </TableCell>
                  <TableCell>
                    <Badge variant={auditVariant(r.action)}>{auditActionLabel(r.action)}</Badge>
                  </TableCell>
                  <TableCell>
                    {r.user_id ? (
                      <span className="font-mono text-[11px] text-zinc-400">{r.user_id.slice(0, 8)}…</span>
                    ) : r.target_table ? (
                      <span className="text-[11px] text-zinc-400">
                        {titleize(r.target_table)}
                        {r.target_id ? <span className="ml-1 font-mono text-zinc-600">{String(r.target_id).slice(0, 8)}…</span> : null}
                      </span>
                    ) : (
                      <span className="text-zinc-600">—</span>
                    )}
                  </TableCell>
                  <TableCell className="max-w-md">
                    <span className="line-clamp-2 text-[11px] text-zinc-500">{summarizeDetails(r.details)}</span>
                  </TableCell>
                  <TableCell className="whitespace-nowrap text-xs text-zinc-400">{r.performed_by}</TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        )}
      </CardContent>
    </Card>
  );
}

function summarizeDetails(details: Record<string, unknown> | null | undefined): string {
  if (!details || typeof details !== "object") return "—";
  const parts: string[] = [];
  for (const [key, value] of Object.entries(details)) {
    if (value === null || value === undefined || (typeof value === "object" && Object.keys(value as object).length === 0)) {
      continue;
    }
    if (typeof value === "object") {
      parts.push(`${key}: ${JSON.stringify(value)}`);
    } else {
      parts.push(`${key}: ${String(value)}`);
    }
  }
  return parts.length > 0 ? parts.join(" · ") : "—";
}

/* --------------------------- Custom doc type CRUD -------------------------- */

function CustomTypesManager({ types, onChanged }: { types: CustomDocumentType[]; onChanged: () => void }) {
  const [name, setName] = useState("");
  const [authority, setAuthority] = useState("");
  const [days, setDays] = useState("365");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const add = async () => {
    if (name.trim() === "") {
      setError("Name is required");
      return;
    }
    setBusy(true);
    setError(null);
    const { error: err } = await insertRow("custom_document_types", {
      name: name.trim(),
      renewal_authority: authority.trim() || null,
      renewal_days: Number(days) || 365,
    });
    setBusy(false);
    if (err) {
      setError(err);
      return;
    }
    setName("");
    setAuthority("");
    setDays("365");
    onChanged();
  };

  const remove = async (id: string) => {
    setBusy(true);
    const { error: err } = await deleteRow("custom_document_types", id);
    setBusy(false);
    if (err) setError(err);
    else onChanged();
  };

  return (
    <Card>
      <CardHeader>
        <CardTitle>Custom Document Types</CardTitle>
        <CardDescription>Configure bespoke document categories and their renewal cycles</CardDescription>
      </CardHeader>
      <CardContent className="space-y-4">
        <div className="grid grid-cols-1 gap-3 sm:grid-cols-4">
          <Input placeholder="Type name (e.g. Trade Permit)" value={name} onChange={(e) => setName(e.target.value)} />
          <Input placeholder="Renewal authority" value={authority} onChange={(e) => setAuthority(e.target.value)} />
          <Input type="number" min={1} placeholder="Renewal days" value={days} onChange={(e) => setDays(e.target.value)} />
          <Button variant="primary" onClick={() => void add()} disabled={busy}>
            <Plus className="h-4 w-4" />
            Add type
          </Button>
        </div>
        {error ? <p className="text-xs text-red-400">{error}</p> : null}

        {types.length === 0 ? (
          <p className="text-sm text-zinc-600">No custom document types configured yet.</p>
        ) : (
          <div className="space-y-2">
            {types.map((t) => (
              <div key={t.id} className="flex items-center justify-between rounded-xl border border-zinc-800 bg-black/40 px-4 py-3">
                <div>
                  <p className="text-sm font-medium text-zinc-100">{t.name}</p>
                  <p className="text-[11px] text-zinc-500">
                    {t.renewal_authority ? `${t.renewal_authority} · ` : ""}
                    every {t.renewal_days ?? 365} days
                  </p>
                </div>
                <div className="flex items-center gap-2">
                  <Badge variant="info">custom-{t.id.slice(0, 8)}</Badge>                <Button variant="danger" size="sm" onClick={() => void remove(t.id)} disabled={busy}>
                  <Trash2 className="h-3.5 w-3.5" />
                  Delete
                </Button>
              </div>
            </div>
          ))}
          </div>
        )}
      </CardContent>
    </Card>
  );
}

/* ------------------------------- Danger zone ------------------------------ */

/**
 * Critical-action gate: wipe ALL app data for every user. Requires:
 *   1. acknowledgement checkbox (understands what is deleted),
 *   2. typing the exact project ref (proves which database),
 *   3. typing the exact confirmation token,
 *   4. a press-and-hold button (2s) to fire.
 */
function DangerZone() {
  const { data, refresh } = useWazy();
  const { isSuperAdmin } = useAdminAuth();
  // SUPABASE_SERVICE_ROLE_KEY is server-only — the browser cannot see it, so
  // ask the API for the real configuration instead of checking process.env
  // client-side (which always reports "not configured").
  const [status, setStatus] = useState<{ configured: boolean; projectRef: string | null; tables: string[] } | null>(null);

  useEffect(() => {
    let alive = true;
    fetch("/api/admin-data/selective-purge", { cache: "no-store" })
      .then((r) => r.json())
      .then((j) => {
        if (alive) setStatus({ configured: Boolean(j.configured), projectRef: j.projectRef ?? null, tables: Array.isArray(j.tables) ? j.tables : [] });
      })
      .catch(() => {
        if (alive) setStatus({ configured: false, projectRef: null, tables: [] });
      });
    return () => {
      alive = false;
    };
  }, []);

  const projectRef = status?.projectRef ?? supabaseProjectRef(SUPABASE_URL);
  const serviceConfigured = status?.configured ?? false;
  const wipeableTables = status?.tables ?? APP_DATA_TABLES.map((t) => t.table);

  const [selectedTables, setSelectedTables] = useState<Set<string>>(new Set());
  const [excludeAdmins, setExcludeAdmins] = useState(true);
  const [includeSupportRequests, setIncludeSupportRequests] = useState(false);
  const [wipeAuthUsers, setWipeAuthUsers] = useState(false);
  const [refText, setRefText] = useState("");
  const [tokenText, setTokenText] = useState("");
  const [busy, setBusy] = useState(false);
  const [armProgress, setArmProgress] = useState(0);
  const [result, setResult] = useState<{ ok: boolean; text: string } | null>(null);

  const toggleTable = (table: string) => {
    setSelectedTables((prev) => {
      const next = new Set(prev);
      if (next.has(table)) next.delete(table);
      else next.add(table);
      return next;
    });
  };

  const selectAll = () => setSelectedTables(new Set(wipeableTables));
  const clearAll = () => setSelectedTables(new Set());

  // If the wipeable list changes (e.g. after refresh), keep only still-valid selections.
  useEffect(() => {
    setSelectedTables((prev) => {
      const next = new Set(prev);
      for (const t of next.keys()) {
        if (!wipeableTables.includes(t)) next.delete(t);
      }
      return next;
    });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [wipeableTables]);

  const getRowCount = (table: string): number => {
    switch (table) {
      case "reminders": return data.reminders.length;
      case "finance_transactions": return data.transactions.length;
      case "category_budgets": return data.budgets.length;
      case "savings_envelopes": return data.envelopes.length;
      case "recurring_transactions": return data.recurring.length;
      case "ai_quota_usage": return data.aiQuotaUsage.length;
      case "user_tier_audit": return 0;
      case "user_tiers": return data.userTiers.length;
      case "custom_document_types": return data.customDocumentTypes.length;
      case "documents": return data.documents.length;
      case "collections": return data.collections.length;
      case "support_requests": return data.supportRequests.length;
      case "error_reports": return data.errorReports.length;
      default: return 0;
    }
  };

  const rowCountForTable = useMemo(() => getRowCount, [data]); // eslint-disable-line react-hooks/exhaustive-deps



  const totalSelectedRows = useMemo(
    () => [...selectedTables].reduce((s, t) => s + rowCountForTable(t), 0),
    [selectedTables, rowCountForTable],
  );
  const selectedCount = selectedTables.size;



  const canArm =
    serviceConfigured &&
    selectedCount > 0 &&
    refText.trim() === projectRef &&
    tokenText.trim() === SELECTIVE_WIPE_CONFIRM_TOKEN;

  // Press-and-hold: fill progress over 2s, fire at 100%, drain on release.
  useEffect(() => {
    if (armProgress <= 0 || armProgress >= 100 || busy) return;
    const t = window.setTimeout(() => setArmProgress((p) => Math.min(p + 5, 100)), 100);
    return () => window.clearTimeout(t);
  }, [armProgress, busy]);

  useEffect(() => {
    if (armProgress >= 100 && !busy) void fire();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [armProgress]);

  const startArm = () => {
    if (!canArm || busy) return;
    setArmProgress(1);
  };
  const cancelArm = () => {
    if (!busy) setArmProgress(0);
  };

  const fire = async () => {
    setBusy(true);
    setResult(null);
    try {
      const res = await authenticatedFetch("/api/admin-data/selective-purge", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          confirm: projectRef,
          tables: [...selectedTables],
          excludeAdmins,
          wipeSupportRequests: includeSupportRequests,
          wipeAuthUsers,
        }),
      });
      const json = await res.json().catch(() => ({}));
      const purged = json.purged as Record<string, number> | undefined;
      const rowsWiped = purged
        ? Object.entries(purged)
            .filter(([k]) => !k.startsWith("storage:"))
            .reduce((s, [, n]) => s + Number(n), 0)
        : 0;
      if (res.ok || res.status === 207) {
        const tableSummary = purged
          ? Object.entries(purged)
              .filter(([k]) => !k.startsWith("storage:"))
              .sort(([a], [b]) => a.localeCompare(b))
              .map(([t, n]) => `${t}: ${n}`)
              .join(", ")
          : "no rows matched the selection";
        setResult({
          ok: json.ok || res.status === 207,
          text: json.ok
            ? `Wiped ${rowsWiped} data rows${purged ? ` across [${tableSummary}]` : ""}${json.storageRemoved ? ` + ${json.storageRemoved} storage files` : ""}.${excludeAdmins ? " Admin users and their data were excluded." : ""}`
            : `Completed with errors: ${json.error ?? "unknown"}`,
        });
        await refresh();
      } else {
        setResult({ ok: false, text: json.error ?? `Wipe failed (${res.status})` });
      }
    } catch (err) {
      setResult({ ok: false, text: err instanceof Error ? err.message : "Wipe failed" });
    } finally {
      setBusy(false);
      setArmProgress(0);
      setRefText("");
      setTokenText("");
    }
  };

  if (!isSuperAdmin) {
    return (
      <Card className="border-amber-500/20 bg-amber-500/5">
        <CardHeader>
          <div className="flex items-center gap-2">
            <ShieldAlert className="h-5 w-5 text-amber-600 dark:text-amber-400" />
            <CardTitle className="text-slate-900 dark:text-white">Danger Zone: Selective Data Wipe</CardTitle>
          </div>
          <CardDescription>
            Restricted to Super Administrators. Standard Administrators do not have authorization to purge platform data.
          </CardDescription>
        </CardHeader>
      </Card>
    );
  }

  return (
    <Card className="border-red-500/30">
      <CardHeader>
        <div className="flex items-center gap-2">
          <ShieldAlert className="h-4 w-4 text-red-400" />
          <CardTitle className="text-red-300">Danger Zone — Selective data wipe</CardTitle>
        </div>
        <CardDescription>
          Pick exactly which tables and kinds of data to delete. User accounts (auth.users) are never deleted here.
          Admin users and their data can be kept even when everything else is wiped. This cannot be undone.
        </CardDescription>
      </CardHeader>
      <CardContent className="space-y-4">
        {/* Selection matrix */}
        <div className="rounded-xl border border-zinc-800 bg-black/40 p-3">
          <div className="flex items-center justify-between mb-2">
            <p className="text-xs font-semibold uppercase tracking-wider text-zinc-300">Tables to wipe</p>
            <div className="flex items-center gap-2">
              <button
                type="button"
                onClick={selectedCount === wipeableTables.length ? clearAll : selectAll}
                disabled={busy}
                className="text-[11px] text-zinc-400 hover:text-zinc-200 disabled:opacity-40"
              >
                {selectedCount === wipeableTables.length ? "Deselect all" : "Select all"}
              </button>
              {selectedCount > 0 && (
                <>
                  <span className="text-zinc-600">·</span>
                  <span className="text-[11px] text-zinc-500">{selectedCount}/{wipeableTables.length} · {totalSelectedRows} rows</span>
                </>
              )}
            </div>
          </div>

          <div className="grid grid-cols-2 gap-x-2 gap-y-0.5 sm:grid-cols-3">
            {wipeableTables.map((table) => {
              const label = SELECTIVE_TABLE_LABELS[table] ?? table;
              const checked = selectedTables.has(table);
              const count = rowCountForTable(table);
              return (
                <label
                  key={table}
                  className={cn(
                    "flex items-center gap-2 rounded px-2 py-1.5 text-xs cursor-pointer transition-colors",
                    checked && !busy ? "bg-zinc-800/60 text-zinc-100" : "text-zinc-400 hover:bg-zinc-800/30 hover:text-zinc-200",
                    busy && "opacity-50 cursor-not-allowed",
                  )}
                >
                  <input
                    type="checkbox"
                    checked={checked}
                    disabled={busy}
                    onChange={() => toggleTable(table)}
                    className="h-3.5 w-3.5 shrink-0 rounded border-zinc-700 bg-zinc-950"
                  />
                  <span className="truncate">{label}</span>
                  {count > 0 && (
                    <span className={cn("ml-auto shrink-0 tabular-nums text-[10px] font-medium rounded-full px-1.5 py-0.5", checked ? "bg-red-500/20 text-red-300" : "bg-zinc-800 text-zinc-500")}>{count}</span>
                  )}
                </label>
              );
            })}
          </div>
        </div>

        {/* What else gets wiped */}
        <div className="rounded-xl border border-zinc-800 bg-black/40 p-3 text-xs text-zinc-400">
          <p>
            Target database: <span className="font-mono text-zinc-200">{projectRef ?? "custom URL"}</span> — confirm it matches the sidebar. Wiping the
            wrong project cannot be undone.
          </p>
          {!status ? (
            <p className="mt-2 text-zinc-500">Checking deployment configuration…</p>
          ) : !serviceConfigured ? (
            <p className="mt-2 text-amber-300">
              The server reports SUPABASE_SERVICE_ROLE_KEY is not configured in this deployment — the wipe endpoint is
              disabled. Add it to the deployment&apos;s environment variables and redeploy.
            </p>
          ) : null}
        </div>

        {/* Admin exclusion */}
        <label className="flex items-start gap-3 rounded-lg px-3 py-2.5 border border-zinc-800 bg-black/40">
          <input
            type="checkbox"
            checked={excludeAdmins}
            disabled={busy}
            onChange={(e) => setExcludeAdmins(e.target.checked)}
            className="mt-0.5 h-4 w-4 shrink-0 rounded border-zinc-700 bg-zinc-950 text-zinc-900"
          />
          <div className="min-w-0">
            <p className="text-sm font-medium text-zinc-200">Exclude admin users and their data</p>
            <p className="text-[11px] text-zinc-500">
              When checked, active admins and any rows owned by them are left intact even if their tables are in the selection.
              Use this when you want to wipe end-user data while keeping the console operators functional.
            </p>
          </div>
        </label>

        {/* Support requests toggle */}
        <label className="flex items-start gap-3 rounded-lg px-3 py-2.5 border border-zinc-800 bg-black/40">
          <input
            type="checkbox"
            checked={includeSupportRequests}
            disabled={busy}
            onChange={(e) => setIncludeSupportRequests(e.target.checked)}
            className="mt-0.5 h-4 w-4 shrink-0 rounded border-zinc-700 bg-zinc-950 text-zinc-900"
          />
          <div className="min-w-0">
            <p className="text-sm font-medium text-zinc-200">Include support requests in the wipe</p>
            <p className="text-[11px] text-zinc-500">
              Support requests are usually kept (the ticket survives, the author field is anonymized). Turn this on only when you
              explicitly want those rows deleted too.
            </p>
          </div>
        </label>

        {/* Auth users accounts deletion toggle */}
        <label className="flex items-start gap-3 rounded-lg px-3 py-2.5 border border-zinc-800 bg-black/40">
          <input
            type="checkbox"
            checked={wipeAuthUsers}
            disabled={busy}
            onChange={(e) => setWipeAuthUsers(e.target.checked)}
            className="mt-0.5 h-4 w-4 shrink-0 rounded border-zinc-700 bg-zinc-950 text-zinc-900"
          />
          <div className="min-w-0">
            <p className="text-sm font-medium text-zinc-200">
              Delete user accounts from Supabase Auth (<code className="rounded bg-zinc-900 px-1 font-mono text-xs">auth.users</code>)
            </p>
            <p className="text-[11px] text-zinc-500">
              When checked, registered user logins are permanently removed from Supabase Auth.
              {excludeAdmins ? " Administrator accounts are protected and will NOT be deleted." : " ⚠️ Warning: admin accounts will be deleted unless 'Exclude admin users' is checked above."}
            </p>
          </div>
        </label>



        {/* Confirm ref */}
        <div>
          <p className="mb-1 text-xs text-zinc-400">
            Type the project ref <span className="font-mono font-semibold text-zinc-200">{projectRef ?? "(custom URL)"}</span>
          </p>
          <Input
            value={refText}
            onChange={(e) => setRefText(e.target.value)}
            placeholder={projectRef ?? "custom URL"}
            disabled={busy}
            className="max-w-sm font-mono"
          />          </div>

        {/* Confirm token */}
        <div>
          <p className="mb-1 text-xs text-zinc-400">
            Type <span className="font-mono font-semibold text-red-300">{SELECTIVE_WIPE_CONFIRM_TOKEN}</span>
          </p>
          <Input
            value={tokenText}
            onChange={(e) => setTokenText(e.target.value)}
            placeholder={SELECTIVE_WIPE_CONFIRM_TOKEN}
            disabled={busy}
            className="max-w-sm"
          />
        </div>

        {/* Arm button */}
        <div className="flex flex-wrap items-center gap-3">
          <button
            type="button"
            disabled={!canArm || busy}
            onMouseDown={startArm}
            onMouseUp={cancelArm}
            onMouseLeave={cancelArm}
            onTouchStart={startArm}
            onTouchEnd={cancelArm}
            className={cn(
              "relative inline-flex h-11 select-none items-center justify-center gap-2 overflow-hidden rounded-lg border px-5 text-sm font-semibold transition-colors",
              canArm && !busy
                ? "border-red-500/50 bg-red-500/10 text-red-300 hover:bg-red-500/20"
                : "cursor-not-allowed border-zinc-800 bg-zinc-900 text-zinc-600",
            )}
          >
            <span
              className="absolute inset-y-0 left-0 bg-red-500/40 transition-[width] duration-100"
              style={{ width: `${armProgress}%` }}
            />
            <span className="relative flex items-center gap-2">
              {busy ? <Loader2 className="h-4 w-4 animate-spin" /> : <Trash2 className="h-4 w-4" />}
              {busy ? "Wiping…" : armProgress > 0 ? "Keep holding…" : "Hold to wipe selected data"}
            </span>
          </button>
          {!canArm && !busy ? (
            <p className="text-[11px] text-zinc-600">
              {selectedCount === 0
                ? "Select at least one table to continue."
                : "Complete the project-ref and token gates above to arm the button."}
            </p>
          ) : null}
        </div>

        {result ? (
          <p className={cn("text-xs", result.ok ? "text-emerald-400" : "text-red-400")}>{result.text}</p>
        ) : null}
      </CardContent>
    </Card>
  );
}

const SELECTIVE_WIPE_CONFIRM_TOKEN = "SELECTIVE WIPE";

const SELECTIVE_TABLE_LABELS: Record<string, string> = {
  reminders: "Reminders",
  finance_transactions: "Finance transactions",
  category_budgets: "Category budgets",
  savings_envelopes: "Savings envelopes",
  recurring_transactions: "Recurring transactions",
  ai_quota_usage: "AI quota usage",
  user_tier_audit: "User tier audit",
  user_tiers: "User tiers",
  custom_document_types: "Custom document types",
  documents: "Documents",
  collections: "Collections",
  support_requests: "Support requests",
};


function ErrorReportsTab() {
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [reports, setReports] = useState<Array<{
    id: string;
    user_id: string | null;
    platform: string | null;
    app_version: string | null;
    device_info: string | null;
    error_type: string | null;
    error_message: string | null;
    stack_trace: string | null;
    severity: 'error' | 'critical' | 'fatal' | null;
    created_at: string;
  }>>([]);
  const [total, setTotal] = useState(0);
  const [page, setPage] = useState(1);
  const [severityFilter, setSeverityFilter] = useState<'all' | 'error' | 'critical' | 'fatal'>('all');

  const loadData = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const params = new URLSearchParams({
        limit: '50',
        offset: String((page - 1) * 50),
      });
      if (severityFilter !== 'all') {
        params.set('severity', severityFilter);
      }
      const res = await fetch(`/api/system/error-reports?${params}`, { cache: 'no-store' });
      const json = await res.json().catch(() => ({}));
      if (!res.ok || !json.ok) {
        setError(json.error ?? 'Failed to load error reports');
        setReports([]);
        setTotal(0);
        return;
      }
      setReports(json.reports ?? []);
      setTotal(json.total);
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Failed to load data');
      setReports([]);
      setTotal(0);
    } finally {
      setLoading(false);
    }
  }, [page, severityFilter]);

  useEffect(() => {
    void loadData();
  }, [loadData]);

  const totalPages = Math.max(1, Math.ceil(total / 50));

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div className="flex items-center gap-3">
          <select
            value={severityFilter}
            onChange={(e) => setSeverityFilter(e.target.value as 'all' | 'error' | 'critical' | 'fatal')}
            className="rounded-lg border border-zinc-800 bg-zinc-900 px-3 py-2 text-sm text-zinc-100 focus:border-blue-500/60 focus:outline-none"
          >
            <option value="all">All severities</option>
            <option value="fatal">Fatal</option>
            <option value="critical">Critical</option>
            <option value="error">Error</option>
          </select>
          <button
            onClick={loadData}
            className="flex items-center gap-2 rounded-lg border border-zinc-800 px-4 py-2 text-sm font-medium text-zinc-200 hover:bg-zinc-800 transition-colors disabled:opacity-50"
            disabled={loading}
          >
            <RefreshCw className={`h-4 w-4 ${loading ? 'animate-spin' : ''}`} />
            Refresh
          </button>
        </div>
      </div>

      {error ? (
        <Card className="border-red-500/30">
          <CardContent className="pt-5">
            <p className="text-sm font-medium text-red-400">Error loading data</p>
            <p className="mt-1 text-xs text-zinc-400">{error}</p>
          </CardContent>
        </Card>
      ) : null}

      {loading ? (
        <div className="grid grid-cols-1 gap-4 sm:grid-cols-3">
          {[1, 2, 3].map((i) => (
            <Card key={i}>
              <CardContent className="pt-5">
                <div className="h-4 w-24 animate-pulse bg-zinc-800 rounded" />
                <div className="mt-2 h-8 w-16 animate-pulse bg-zinc-800 rounded" />
              </CardContent>
            </Card>
          ))}
        </div>
      ) : reports.length === 0 ? (
        <Card>
          <CardContent className="pt-10 text-center">
            <CheckCircle className="h-12 w-12 text-emerald-500 mx-auto mb-3" />
            <p className="text-sm text-zinc-500">No error reports yet.</p>
            <p className="text-xs text-zinc-600 mt-1">
              Errors will appear here once the mobile app submits them to the database.
            </p>
          </CardContent>
        </Card>
      ) : (
        <>
          <div className="grid grid-cols-1 gap-4 sm:grid-cols-3">
            <Card>
              <CardContent className="pt-5">
                <div className="flex items-center gap-2 text-zinc-500 mb-2">
                  <AlertTriangle className="h-4 w-4 text-amber-500" />
                  <span className="text-[11px] font-semibold uppercase tracking-wider text-slate-700 dark:text-zinc-500">Total Errors</span>
                </div>
                <p className="text-2xl font-semibold text-slate-900 dark:text-white">{total}</p>
              </CardContent>
            </Card>

            <Card>
              <CardContent className="pt-5">
                <div className="flex items-center gap-2 text-zinc-500 mb-2">
                  <XCircle className="h-4 w-4 text-rose-400" />
                  <span className="text-[11px] font-medium uppercase tracking-wider">Fatal + Critical</span>
                </div>
                <p className="text-2xl font-semibold text-rose-400">
                  {reports.filter((r) => r.severity === 'fatal' || r.severity === 'critical').length}
                </p>
              </CardContent>
            </Card>

            <Card>
              <CardContent className="pt-5">
                <div className="flex items-center gap-2 text-zinc-500 mb-2">
                  <CheckCircle className="h-4 w-4 text-emerald-400" />
                  <span className="text-[11px] font-medium uppercase tracking-wider">Error (non-critical)</span>
                </div>
                <p className="text-2xl font-semibold text-emerald-400">
                  {reports.filter((r) => r.severity === 'error').length}
                </p>
              </CardContent>
            </Card>
          </div>

          <Card>
            <CardHeader>
              <CardTitle className="text-lg">Recent Error Reports</CardTitle>
              <CardDescription>Most recent crashes and errors, sorted by reported time.</CardDescription>
            </CardHeader>
            <CardContent>
              <div className="space-y-3">
                {reports.map((report) => (
                  <div
                    key={report.id}
                    className="rounded-xl border border-zinc-800 bg-black/40 p-4"
                  >
                    <div className="flex items-start justify-between gap-3 mb-2">
                      <div className="min-w-0 flex items-center gap-2">
                        {report.severity === 'fatal' ? (
                          <AlertTriangle className="h-5 w-5 shrink-0 text-red-400" />
                        ) : report.severity === 'critical' ? (
                          <AlertTriangle className="h-5 w-5 shrink-0 text-amber-400" />
                        ) : (
                          <AlertTriangle className="h-5 w-5 shrink-0 text-zinc-500" />
                        )}
                        <div className="min-w-0">
                          <p className="text-sm font-medium text-zinc-100 truncate">
                            {report.error_type || 'Unknown error'}
                          </p>
                          <div className="flex flex-wrap gap-2 mt-1">
                            <Badge variant="neutral">
                              {report.platform ? report.platform.toUpperCase() : 'UNKNOWN'}
                            </Badge>
                            <Badge variant="neutral" className="text-amber-300 border-amber-700/50">
                              {(report.severity ?? 'error').toUpperCase()}
                            </Badge>
                            {report.app_version && (
                              <Badge variant="neutral" className="font-mono">
                                {report.app_version}
                              </Badge>
                            )}
                          </div>
                        </div>
                      </div>
                      <p className="text-xs text-zinc-500 shrink-0">
                        {new Date(report.created_at).toLocaleString()}
                      </p>
                    </div>

                    {report.error_message ? (
                      <p className="text-xs text-zinc-400 mb-2">
                        {report.error_message}
                      </p>
                    ) : null}

                    {report.stack_trace ? (
                      <pre className="text-xs text-zinc-400 whitespace-pre-wrap rounded-lg bg-zinc-900/60 p-2 border border-zinc-800/60 max-h-28 overflow-y-auto">
                        {report.stack_trace}
                      </pre>
                    ) : null}
                  </div>
                ))}
              </div>

              {totalPages > 1 && (
                <div className="mt-4 flex items-center justify-between gap-3">
                  <p className="text-xs text-zinc-500">
                    Page {page} of {totalPages} - {total} total
                  </p>
                  <div className="flex gap-2">
                    <button
                      type="button"
                      onClick={() => setPage((p) => Math.max(1, p - 1))}
                      disabled={page === 1 || loading}
                      className="flex items-center gap-1 rounded-lg border border-zinc-800 px-3 py-1.5 text-xs text-zinc-300 hover:bg-zinc-800 disabled:opacity-50"
                    >
                      <ChevronLeft className="h-4 w-4" />
                      Prev
                    </button>
                    <button
                      type="button"
                      onClick={() => setPage((p) => Math.min(totalPages, p + 1))}
                      disabled={page === totalPages || loading}
                      className="flex items-center gap-1 rounded-lg border border-zinc-800 px-3 py-1.5 text-xs text-zinc-300 hover:bg-zinc-800 disabled:opacity-50"
                    >
                      Next
                      <ChevronRight className="h-4 w-4" />
                    </button>
                  </div>
                </div>
              )}
            </CardContent>
          </Card>
        </>
      )}
    </div>
  );
}


/* ------------------------- App Health Dashboard ------------------------- */

import AppHealthPage from "./app-health/page";

function AppHealthDashboard() {
  return <AppHealthPage />;
}
