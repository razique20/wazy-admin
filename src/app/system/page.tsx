"use client";

import { useEffect, useState } from "react";
import { BellRing, Database, Download, FileJson, FileSpreadsheet, History, Loader2, Plus, RotateCcw, Rocket, Send, Trash2, TriangleAlert } from "lucide-react";
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

type ExportKind = "documents" | "transactions";

const QUICK_QUERIES: { label: string; sql: string }[] = [
  { label: "Counts per table", sql: "SELECT 'collections' AS table_name, COUNT(*) FROM collections UNION ALL SELECT 'documents', COUNT(*) FROM documents UNION ALL SELECT 'finance_transactions', COUNT(*) FROM finance_transactions;" },
  { label: "Expired documents", sql: "SELECT display_name, expires_at, status FROM documents WHERE status = 'expired' ORDER BY expires_at DESC;" },
  { label: "Spend by category", sql: "SELECT category, SUM(amount) AS total FROM finance_transactions WHERE kind = 'expense' GROUP BY category ORDER BY total DESC;" },
  { label: "Upcoming reminders", sql: "SELECT d.display_name, r.remind_at, r.channel, r.sent_at FROM reminders r JOIN documents d ON d.id = r.document_id WHERE r.sent_at IS NULL ORDER BY r.remind_at ASC;" },
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

      <Tabs defaultValue="export">
        <TabsList>
          <TabsTrigger value="export">Data Exporter</TabsTrigger>
          <TabsTrigger value="sql">SQL Runner</TabsTrigger>
          <TabsTrigger value="types">Custom Doc Types</TabsTrigger>
          <TabsTrigger value="reminders">Reminders</TabsTrigger>
          <TabsTrigger value="versions">App Version</TabsTrigger>
          <TabsTrigger value="audit">Audit Log</TabsTrigger>
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

        <TabsContent value="audit">
          <AdminAuditViewer />
        </TabsContent>
      </Tabs>
    </div>
  );
}

function StatCard({ label, value }: { label: string; value: number }) {
  return (
    <Card>
      <CardContent className="pt-5">
        <p className="text-[11px] font-medium uppercase tracking-wider text-zinc-500">{label}</p>
        <p className="mt-1 text-2xl font-semibold text-white">{formatNumber(value)}</p>
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
  const [result, setResult] = useState<SqlResult | null>(null);
  const [running, setRunning] = useState(false);

  const run = async () => {
    setRunning(true);
    setResult(null);
    const started = performance.now();
    try {
      const parsed = parseSql(sql);
      const res = await fetch("/api/admin-db", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          action: "select",
          table: parsed.table,
          order: parsed.order ?? undefined,
          limit: parsed.limit,
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
      setResult({ columns: [], rows: [], error: err instanceof Error ? err.message : "Query failed", ms: Math.round(performance.now() - started) });
    } finally {
      setRunning(false);
    }
  };

  return (
    <Card>
      <CardHeader>
        <CardTitle>SQL Runner / Query Explorer</CardTitle>
        <CardDescription>
          Only read-only SELECT-style queries against known tables are supported — translated to PostgREST filters
          by the browser client.
        </CardDescription>
      </CardHeader>
      <CardContent className="space-y-3">
        <div className="flex flex-wrap gap-2">
          {QUICK_QUERIES.map((q) => (
            <Button key={q.label} variant="secondary" size="sm" onClick={() => setSql(q.sql)}>
              {q.label}
            </Button>
          ))}
        </div>
        <textarea
          className="min-h-32 w-full rounded-xl border border-zinc-800 bg-black p-3 font-mono text-xs text-zinc-200 focus:border-blue-500/60 focus:outline-none"
          value={sql}
          onChange={(e) => setSql(e.target.value)}
          spellCheck={false}
        />
        <div className="flex items-center gap-3">
          <Button variant="primary" onClick={() => void run()} disabled={running}>
            {running ? <Loader2 className="h-4 w-4 animate-spin" /> : <Database className="h-4 w-4" />}
            Run query
          </Button>
          <Button
            variant="ghost"
            size="sm"
            onClick={() => {
              if (result && result.rows.length > 0) {
                downloadFile(toCSV(result.rows), `wazy-query-${timestampSlug()}.csv`, "text/csv");
              }
            }}
            disabled={!result || result.rows.length === 0}
          >
            <Download className="h-3.5 w-3.5" />
            Export result
          </Button>
        </div>

        {result?.error ? (
          <div className="flex items-start gap-2 rounded-xl border border-red-500/30 bg-red-500/5 p-3 text-xs text-red-300">
            <TriangleAlert className="mt-0.5 h-4 w-4 shrink-0" />
            {result.error}
          </div>
        ) : null}

        {result && !result.error ? (
          <div className="overflow-x-auto rounded-xl border border-zinc-800">
            <table className="w-full text-xs">
              <thead className="bg-zinc-900">
                <tr>
                  {result.columns.map((c) => (
                    <th key={c} className="px-3 py-2 text-left font-medium uppercase tracking-wider text-zinc-500">
                      {c}
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {result.rows.slice(0, 100).map((r, i) => (
                  <tr key={i} className="border-t border-zinc-800/70">
                    {result.columns.map((c) => (
                      <td key={c} className="px-3 py-1.5 font-mono text-zinc-300">
                        {formatCell(r[c])}
                      </td>
                    ))}
                  </tr>
                ))}
              </tbody>
            </table>
            <p className="border-t border-zinc-800 px-3 py-2 text-[11px] text-zinc-600">
              {result.rows.length} rows in {result.ms} ms
            </p>
          </div>
        ) : null}
      </CardContent>
    </Card>
  );
}

function parseSql(sql: string): { table: string; limit: number; order: string | null } {
  const KNOWN_TABLES = [
    "collections",
    "documents",
    "reminders",
    "custom_document_types",
    "finance_transactions",
    "category_budgets",
    "savings_envelopes",
    "recurring_transactions",
  ];
  const normalized = sql.replace(/\s+/g, " ").trim();
  if (!/^select /i.test(normalized)) {
    throw new Error("Only SELECT queries are supported in the browser runner.");
  }
  if (/;/.test(normalized.replace(/;\s*$/, ""))) {
    throw new Error("Multiple statements are not allowed.");
  }
  const match = normalized.match(/FROM\s+([a-z_]+)/i);
  if (!match) throw new Error("Could not find a FROM clause with a known table.");
  const table = match[1];
  if (!KNOWN_TABLES.includes(table)) {
    throw new Error(`Table “${table}” is not in the allowed list: ${KNOWN_TABLES.join(", ")}`);
  }
  const limitMatch = normalized.match(/LIMIT\s+(\d+)/i);
  const orderMatch = normalized.match(/ORDER BY\s+([a-z_]+)/i);
  return {
    table,
    limit: limitMatch ? Math.min(Number(limitMatch[1]), 200) : 100,
    order: orderMatch ? orderMatch[1] : null,
  };
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
        <StatTile label="Due (remind_at ≤ today)" value={dueToday.length} tone={dueToday.length > 0 ? "text-amber-400" : "text-white"} />
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

function StatTile({ label, value, tone = "text-white" }: { label: string; value: number; tone?: string }) {
  return (
    <Card>
      <CardContent className="pt-5">
        <p className="text-[11px] font-medium uppercase tracking-wider text-zinc-500">{label}</p>
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
      const res = await fetch("/api/admin-audit?limit=200");
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
                  <Badge variant="info">custom-{t.id.slice(0, 8)}</Badge>
                  <Button variant="danger" size="sm" onClick={() => void remove(t.id)} disabled={busy}>
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
