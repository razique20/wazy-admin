"use client";

import { useState, useEffect, useCallback } from "react";
import {
  AlertTriangle,
  RefreshCw,
  CheckCircle,
  XCircle,
  ChevronLeft,
  ChevronRight,
} from "lucide-react";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/primitives";
import { Badge } from "@/components/ui/primitives";

interface ErrorReport {
  id: string;
  user_id: string | null;
  platform: string | null;
  app_version: string | null;
  device_info: string | null;
  error_type: string | null;
  error_message: string | null;
  stack_trace: string | null;
  severity: "error" | "critical" | "fatal" | null;
  created_at: string;
  fingerprint?: string | null;
}

interface ErrorReportsResponse {
  ok: boolean;
  reports?: ErrorReport[];
  total: number;
  error?: string;
}

export default function ErrorReportsPage() {
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [reports, setReports] = useState<ErrorReport[]>([]);
  const [total, setTotal] = useState(0);
  const [page, setPage] = useState(1);
  const [severityFilter, setSeverityFilter] = useState<"all" | "error" | "critical" | "fatal">("all");

  const loadData = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const params = new URLSearchParams({
        limit: "50",
        offset: String((page - 1) * 50),
      });
      if (severityFilter !== "all") {
        params.set("severity", severityFilter);
      }
      const res = await fetch(`/api/system/error-reports?${params}`, { cache: "no-store" });
      const json: ErrorReportsResponse = await res.json();
      if (!res.ok || !json.ok) {
        setError(json.error ?? "Failed to load error reports");
        setReports([]);
        setTotal(0);
        return;
      }
      setReports(json.reports ?? []);
      setTotal(json.total);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Failed to load data");
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
    <div className="space-y-6">
      <div className="flex flex-wrap items-center justify-between gap-4">
        <div>            <h1 className="text-2xl font-bold text-white">Error & Crash Reports</h1>
          <p className="text-sm text-zinc-400 mt-1">
            Centralized view of crashes and errors captured from the mobile app. Sorted by most recent first.
          </p>
        </div>
        <div className="flex items-center gap-3">
          <select
            value={severityFilter}
            onChange={(e) => setSeverityFilter(e.target.value as "all" | "error" | "critical" | "fatal")}
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
            <RefreshCw className={`h-4 w-4 ${loading ? "animate-spin" : ""}`} />
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
      ) : total > 0 && reports.length === 0 ? (
        <Card>
          <CardContent className="pt-10 text-center">
            <CheckCircle className="h-12 w-12 text-emerald-500 mx-auto mb-3" />
            <p className="text-sm text-zinc-500">No error reports yet.</p>
            <p className="text-xs text-zinc-600 mt-1">
              Errors will appear here once the mobile app submits them to the database.
            </p>
          </CardContent>
        </Card>
      ) : total > 0 ? (
        <>
          <div className="grid grid-cols-1 gap-4 sm:grid-cols-3">
            <Card>
              <CardContent className="pt-5">
                <div className="flex items-center gap-2 text-zinc-500 mb-2">
                  <AlertTriangle className="h-4 w-4 text-amber-400" />
                  <span className="text-[11px] font-medium uppercase tracking-wider">Total Errors</span>
                </div>
                <p className="text-2xl font-semibold text-white">{total}</p>
              </CardContent>
            </Card>

            <Card>
              <CardContent className="pt-5">
                <div className="flex items-center gap-2 text-zinc-500 mb-2">
                  <XCircle className="h-4 w-4 text-rose-400" />
                  <span className="text-[11px] font-medium uppercase tracking-wider">Fatal + Critical</span>
                </div>
                <p className="text-2xl font-semibold text-rose-400">
                  {reports.filter((r) => r.severity === "fatal" || r.severity === "critical").length}
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
                  {reports.filter((r) => r.severity === "error").length}
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
                        {report.severity === "fatal" ? (
                          <AlertTriangle className="h-5 w-5 shrink-0 text-red-400" />
                        ) : report.severity === "critical" ? (
                          <AlertTriangle className="h-5 w-5 shrink-0 text-amber-400" />
                        ) : (
                          <AlertTriangle className="h-5 w-5 shrink-0 text-zinc-500" />
                        )}
                        <div className="min-w-0">
                          <p className="text-sm font-medium text-zinc-100 truncate">
                            {report.error_type || "Unknown error"}
                          </p>
                          <div className="flex flex-wrap gap-2 mt-1">
                            <Badge variant="neutral">
                              {report.platform ? report.platform.toUpperCase() : "UNKNOWN"}
                            </Badge>
                            <Badge variant="neutral" className="text-amber-300 border-amber-700/50">
                              {(report.severity ?? "error").toUpperCase()}
                            </Badge>
                            {report.app_version && (
                              <Badge variant="neutral" className="font-mono">
                                {report.app_version}
                              </Badge>
                            )}
                            {report.fingerprint && (
                              <Badge variant="neutral" className="font-mono text-[10px]">
                                FP {report.fingerprint.slice(0, 8)}
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
                    Page {page} of {totalPages} · {total} total
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
      ) : null}
    </div>
  );
}
