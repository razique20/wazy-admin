"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { Lightbulb, Download, TrendingUp, Clock } from "lucide-react";
import {
  Badge,
  Button,
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/primitives";
import { formatNumber } from "@/lib/format";
import { formatDate } from "@/lib/format";
import type { SupportRequest } from "@/lib/types";

interface FeaturePopularity {
  feature_name: string;
  request_count: number;
  first_requested: string;
  last_requested: string;
}

export default function FeaturePopularityPage() {
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [features, setFeatures] = useState<FeaturePopularity[]>([]);
  const [total, setTotal] = useState(0);
  const [featureDetail, setFeatureDetail] = useState<string | null>(null);

  const loadData = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const res = await fetch("/api/support-analytics", { cache: "no-store" });
      if (!res.ok) {
        setError("Failed to load feature popularity");
        setFeatures([]);
        setTotal(0);
        return;
      }
      const json = (await res.json()) as {
        ok?: boolean;
        error?: string;
        features?: unknown[];
        total?: number;
      };
      if (!res.ok || !json.ok) {
        setError((json as { error?: string }).error ?? "Failed to load feature popularity");
        setFeatures([]);
        setTotal(0);
        return;
      }
      if (!Array.isArray(json.features)) {
        setError("Unexpected response shape from feature popularity API");
        setFeatures([]);
        setTotal(0);
        return;
      }
      const typed = json.features as FeaturePopularity[];
      setFeatures(typed);
      setTotal(typeof json.total === "number" ? json.total : 0);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Failed to load data");
      setFeatures([]);
      setTotal(0);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void loadData();
  }, [loadData]);

  const topFeature = features[0];
  const featurePercentage = total > 0 ? ((topFeature?.request_count ?? 0) / total) * 100 : 0;

  return (
    <div className="space-y-6">
      <PageHeader />

      {error ? (
        <Card className="border-red-500/30">
          <CardContent className="pt-5">
            <p className="text-sm font-medium text-red-400">Error loading data</p>
            <p className="mt-1 text-xs text-zinc-400">{error}</p>
          </CardContent>
        </Card>
      ) : null}

      {featureDetail ? (
        <FeatureDetailPanel
          featureName={featureDetail}
          onClose={() => setFeatureDetail(null)}
          refresh={loadData}
        />
      ) : null}

      {loading ? (
        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 xl:grid-cols-4">
          {[1, 2, 3, 4].map((i) => (
            <Card key={i}>
              <CardContent className="pt-5">
                <div className="h-4 w-24 animate-pulse bg-zinc-800 rounded" />
                <div className="mt-2 h-8 w-16 animate-pulse bg-zinc-800 rounded" />
              </CardContent>
            </Card>
          ))}
        </div>
      ) : features.length === 0 ? (
        <Card>
          <CardContent className="pt-10 text-center">
            <Lightbulb className="h-12 w-12 text-amber-500 mx-auto mb-3" />
            <p className="text-sm text-zinc-500">No feature requests yet.</p>
            <p className="text-xs text-zinc-600 mt-1">
              Feature requests will appear here once users submit them with a feature name.
            </p>
          </CardContent>
        </Card>
      ) : (
        <>
          {/* Summary Cards */}
          <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 xl:grid-cols-4">
            <Card>
              <CardContent className="pt-5">
                <div className="flex items-center gap-2 text-slate-700 dark:text-zinc-500 mb-2">
                  <TrendingUp className="h-4 w-4 text-[#0078D4] dark:text-blue-400" />
                  <span className="text-[11px] font-semibold uppercase tracking-wider">Total Requests</span>
                </div>
                <p className="text-2xl font-semibold text-slate-900 dark:text-white">{formatNumber(total)}</p>
                <p className="text-xs text-slate-600 dark:text-zinc-500 mt-1">All feature requests</p>
              </CardContent>
            </Card>

            <Card>
              <CardContent className="pt-5">
                <div className="flex items-center gap-2 text-slate-700 dark:text-zinc-500 mb-2">
                  <Lightbulb className="h-4 w-4 text-amber-600 dark:text-amber-400" />
                  <span className="text-[11px] font-semibold uppercase tracking-wider">Unique Features</span>
                </div>
                <p className="text-2xl font-semibold text-amber-600 dark:text-amber-400">{features.length}</p>
                <p className="text-xs text-slate-600 dark:text-zinc-500 mt-1">Distinct features requested</p>
              </CardContent>
            </Card>

            {topFeature && (
              <Card>
                <CardContent className="pt-5">
                  <div className="flex items-center gap-2 text-zinc-500 mb-2">
                    <Lightbulb className="h-4 w-4 text-emerald-400" />
                    <span className="text-[11px] font-medium uppercase tracking-wider">Top Feature</span>
                  </div>
                  <p className="text-lg font-semibold text-zinc-100 truncate">{topFeature.feature_name}</p>
                  <p className="text-xs text-zinc-500 mt-1">{topFeature.request_count} requests ({featurePercentage.toFixed(1)}%)</p>
                </CardContent>
              </Card>
            )}

            <Card>
              <CardContent className="pt-5">
                <div className="flex items-center gap-2 text-zinc-500 mb-2">
                  <Clock className="h-4 w-4 text-purple-400" />
                  <span className="text-[11px] font-medium uppercase tracking-wider">Most Recent</span>
                </div>
                <p className="text-lg font-semibold text-zinc-100 truncate">{topFeature?.feature_name ?? "—"}</p>
                <p className="text-xs text-zinc-500 mt-1">
                  {topFeature?.last_requested ? new Date(topFeature.last_requested).toLocaleDateString() : "—"}
                </p>
              </CardContent>
            </Card>
          </div>

          {/* Feature Rankings */}
          <Card>
            <CardHeader>
              <CardTitle className="text-lg">Feature Rankings</CardTitle>
              <CardDescription>Features ranked by number of requests. Helps prioritize which features to build first.</CardDescription>
            </CardHeader>
            <CardContent>
              <div className="space-y-3">
                {features.map((feature, index) => {
                  const percentage = total > 0 ? (feature.request_count / total) * 100 : 0;
                  const firstDate = feature.first_requested
                    ? new Date(feature.first_requested).toLocaleDateString()
                    : "—";
                  const lastDate = feature.last_requested
                    ? new Date(feature.last_requested).toLocaleDateString()
                    : "—";
                  return (
                    <div
                      key={feature.feature_name}
                      className="rounded-xl border border-zinc-800 bg-black/40 p-4"
                    >
                      <div className="flex items-center justify-between mb-2">
                        <div className="flex items-center gap-3">
                          <span className="text-lg font-bold text-zinc-600">#{index + 1}</span>
                          <div className="flex items-center gap-2">
                            <Lightbulb className="h-5 w-5 text-amber-400" />
                            <span className="font-medium text-zinc-100">{feature.feature_name}</span>
                          </div>
                        </div>
                        <div className="text-right">
                          <p className="text-2xl font-bold text-slate-900 dark:text-white">{feature.request_count}</p>
                          <p className="text-xs text-zinc-500">requests</p>
                        </div>
                      </div>

                      <div className="mt-2">
                        <div className="h-2 bg-zinc-800 rounded-full overflow-hidden">
                          <div
                            className="h-full bg-gradient-to-r from-amber-500 to-orange-400 rounded-full transition-all duration-500"
                            style={{ width: `${percentage}%` }}
                          />
                        </div>
                        <div className="flex justify-between mt-1 text-xs text-zinc-500">
                          <span>{feature.request_count > 0 ? percentage.toFixed(1) : "0"}% of requests</span>
                          <span>{firstDate} → {lastDate}</span>
                        </div>
                        <button
                          type="button"
                          className="mt-3 inline-flex items-center gap-1.5 rounded-lg border border-zinc-800 bg-zinc-900/60 px-3 py-1.5 text-xs text-zinc-300 hover:border-zinc-700 hover:text-zinc-100"
                          onClick={() => setFeatureDetail(feature.feature_name)}
                        >
                          View requests
                        </button>
                      </div>
                    </div>
                  );
                })}
              </div>
            </CardContent>
          </Card>

          {/* Export */}
          <Card>
            <CardHeader>
              <CardTitle>Export Data</CardTitle>
              <CardDescription>
                Download feature popularity data for external analysis or roadmap planning.
              </CardDescription>
            </CardHeader>
            <CardContent>
              <div className="flex flex-wrap gap-3">
                <ExportCsvButton features={features} loadData={loadData} />
              </div>
            </CardContent>
          </Card>
        </>
      )}
    </div>
  );
}

function PageHeader() {
  return (
    <div>
      <h1 className="text-2xl font-bold text-slate-900 dark:text-white">Feature Request Popularity</h1>
      <p className="text-sm text-zinc-400 mt-1">
        Track which features are most requested by users. Helps prioritize roadmap decisions.
      </p>
    </div>
  );
}

function FeatureDetailPanel({
  featureName,
  onClose,
  refresh,
}: {
  featureName: string | null;
  onClose: () => void;
  refresh: () => Promise<void>;
}) {
  const [rows, setRows] = useState<SupportRequest[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [reloadToken, setReloadToken] = useState(0);

  useEffect(() => {
    if (!featureName) {
      setRows([]);
      return;
    }
    let cancelled = false;
    const load = async () => {
      setLoading(true);
      setError(null);
      try {
        const res = await fetch("/api/admin-data", { cache: "no-store" });
        if (!res.ok) throw new Error("Failed to load support requests");
        const data = (await res.json()) as {
          data: Record<string, unknown[]>;
          errors: Record<string, string>;
          ok: boolean;
          source: "direct_pg" | "service_role" | "anon";
        };
        if (!data.ok) throw new Error(data.errors?.support_requests ?? "Failed to load support requests");
        const supportRequests = (data.data.supportRequests ?? []) as SupportRequest[];
        if (cancelled) return;
        setRows(
          supportRequests
            .filter((r) => r.request_type === "feature_request")
            .sort((a, b) => new Date(b.created_at).getTime() - new Date(a.created_at).getTime()),
        );
      } catch (e) {
        if (!cancelled) setError(e instanceof Error ? e.message : "Failed to load requests");
      } finally {
        if (!cancelled) setLoading(false);
      }
    };
    void load();
    return () => { cancelled = true; };
  }, [featureName, reloadToken]);

  const filtered = useMemo(
    () =>
      rows
        .filter((r) => {
          if (!featureName) return false;
          const fn = typeof r.feature_name === "string" ? r.feature_name.trim() : "";
          return fn.toLowerCase() === featureName.toLowerCase();
        })
        .sort((a, b) => new Date(b.created_at).getTime() - new Date(a.created_at).getTime()),
    [rows, featureName],
  );

  if (!featureName) return null;

  return (
    <Card className="border-amber-500/30 bg-zinc-950/40 mt-4">
      <CardHeader className="flex flex-wrap items-center justify-between gap-3">
        <div className="flex items-center gap-2">
          <Lightbulb className="h-4 w-4 text-amber-400" />
          <CardTitle className="text-lg">Requests for {featureName}</CardTitle>
        </div>
        <div className="flex items-center gap-2">
          <Button
            variant="secondary"
            size="sm"
            onClick={() => { setReloadToken((t) => t + 1); void refresh(); }}
          >
            Refresh requests
          </Button>
          <Button variant="ghost" size="sm" onClick={onClose}>
            Close
          </Button>
        </div>
      </CardHeader>
      <CardDescription>
        All feature requests that asked for {featureName}. Titles and descriptions are shown as submitted by users.
      </CardDescription>
      <CardContent className="space-y-3">
        {error ? (
          <p className="text-sm text-red-400">{error}</p>
        ) : loading ? (
          <div className="space-y-2">
            {Array.from({ length: 4 }).map((_, i) => (
              <div key={i} className="h-12 w-full animate-pulse rounded-lg bg-zinc-800" />
            ))}
          </div>
        ) : filtered.length === 0 ? (
          <p className="text-sm text-zinc-500">No requests found for {featureName}.</p>
        ) : (
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Request</TableHead>
                <TableHead>Status</TableHead>
                <TableHead>User</TableHead>
                <TableHead>Submitted</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {filtered.map((r) => (
                <TableRow key={r.id}>
                  <TableCell style={{ maxWidth: 320 }}>
                    <p className="max-w-full truncate font-medium text-zinc-100">{r.title}</p>
                    {r.description ? (
                      <p className="mt-1 max-w-full truncate text-[11px] text-zinc-500">
                        {r.description}
                      </p>
                    ) : null}
                  </TableCell>
                  <TableCell>
                    <Badge variant="neutral">{r.status ?? "unknown"}</Badge>
                  </TableCell>
                  <TableCell>
                    <p className="max-w-[180px] truncate text-zinc-200">{r.user_email ?? "Unknown"}</p>
                    {r.user_id ? (
                      <p className="truncate font-mono text-[11px] text-zinc-600">{r.user_id.slice(0, 8)}…</p>
                    ) : null}
                  </TableCell>
                  <TableCell>{formatDate(r.created_at)}</TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        )}
      </CardContent>
    </Card>
  );
}

function ExportCsvButton({
  features,
  loadData,
}: {
  features: FeaturePopularity[];
  loadData: () => void;
}) {
  const forceExport = useCallback(() => {
    const csv =
      "feature_name,request_count,first_requested,last_requested\n" +
      features
        .map((f) => `${f.feature_name},${f.request_count},${f.first_requested},${f.last_requested}`)
        .join("\n");
    const blob = new Blob([csv], { type: "text/csv" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `feature-requests-${new Date().toISOString().split("T")[0]}.csv`;
    a.click();
    URL.revokeObjectURL(url);
  }, [features]);

  return (
    <Button variant="outline" onClick={() => { void forceExport(); void loadData(); }}>
      <Download className="h-4 w-4 mr-2" />
      Export CSV
    </Button>
  );
}
