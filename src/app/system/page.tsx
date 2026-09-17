"use client";

import { useState } from "react";
import { Database, Download, FileJson, FileSpreadsheet, Loader2, Plus, Trash2, TriangleAlert } from "lucide-react";
import { useWazy } from "@/components/providers/data-provider";
import { insertRow, deleteRow } from "@/lib/hooks";
import { downloadFile, timestampSlug, toCSV } from "@/lib/export";
import {
  Badge,
  Button,
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
  Input,
} from "@/components/ui/primitives";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import type { CustomDocumentType } from "@/lib/types";
import { formatNumber } from "@/lib/format";

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
