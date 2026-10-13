"use client";

import { useCallback, useEffect, useState } from "react";
import { Lightbulb, Download, TrendingUp, Clock } from "lucide-react";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/primitives";
import { Button } from "@/components/ui/primitives";
import { formatNumber } from "@/lib/format";

interface FeaturePopularity {
  feature_name: string;
  request_count: number;
  first_requested: string;
  last_requested: string;
}

interface FeaturePopularityResponse {
  ok: boolean;
  features?: FeaturePopularity[];
  total?: number;
  error?: string;
}

export default function FeaturePopularityPage() {
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [features, setFeatures] = useState<FeaturePopularity[]>([]);
  const [total, setTotal] = useState(0);
  const loadData = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const res = await fetch("/api/support-analytics", { cache: "no-store" });
      const json: FeaturePopularityResponse = await res.json();
      if (!res.ok || !json.ok) {
        setError(json.error ?? "Failed to load feature popularity");
        setFeatures([]);
        setTotal(0);
        return;
      }
      setFeatures(json.features ?? []);
      setTotal(json.total ?? 0);
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
      <div>
        <h1 className="text-2xl font-bold text-white">Feature Request Popularity</h1>
        <p className="text-sm text-zinc-400 mt-1">
          Track which features are most requested by users. Helps prioritize roadmap decisions.
        </p>
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
                <div className="flex items-center gap-2 text-zinc-500 mb-2">
                  <TrendingUp className="h-4 w-4 text-blue-400" />
                  <span className="text-[11px] font-medium uppercase tracking-wider">Total Requests</span>
                </div>
                <p className="text-2xl font-semibold text-white">{formatNumber(total)}</p>
                <p className="text-xs text-zinc-500 mt-1">All feature requests</p>
              </CardContent>
            </Card>

            <Card>
              <CardContent className="pt-5">
                <div className="flex items-center gap-2 text-zinc-500 mb-2">
                  <Lightbulb className="h-4 w-4 text-amber-400" />
                  <span className="text-[11px] font-medium uppercase tracking-wider">Unique Features</span>
                </div>
                <p className="text-2xl font-semibold text-amber-400">{features.length}</p>
                <p className="text-xs text-zinc-500 mt-1">Distinct features requested</p>
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
                <p className="text-lg font-semibold text-zinc-100 truncate">{features[0]?.feature_name ?? "—"}</p>
                <p className="text-xs text-zinc-500 mt-1">
                  {features[0]?.last_requested ? new Date(features[0].last_requested).toLocaleDateString() : "—"}
                </p>
              </CardContent>
            </Card>
          </div>

          {/* Feature Popularity List */}
          <Card>
            <CardHeader>
              <CardTitle className="text-lg">Feature Rankings</CardTitle>
              <CardDescription>Features ranked by number of requests. Helps prioritize which features to build first.</CardDescription>
            </CardHeader>
            <CardContent>
              <div className="space-y-3">
                {features.map((feature, index) => (
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
                        <p className="text-2xl font-bold text-white">{feature.request_count}</p>
                        <p className="text-xs text-zinc-500">requests</p>
                      </div>
                    </div>

                    <div className="mt-2">
                      <div className="h-2 bg-zinc-800 rounded-full overflow-hidden">
                        <div
                          className="h-full bg-gradient-to-r from-amber-500 to-orange-400 rounded-full transition-all duration-500"
                          style={{ width: `${(feature.request_count / total) * 100}%` }}
                        />
                      </div>
                      <div className="flex justify-between mt-1 text-xs text-zinc-500">
                        <span>{feature.request_count > 0 ? ((feature.request_count / total) * 100).toFixed(1) : "0"}% of requests</span>
                        <span>
                          {feature.first_requested ? new Date(feature.first_requested).toLocaleDateString() : "—"} →{" "}
                          {feature.last_requested ? new Date(feature.last_requested).toLocaleDateString() : "—"}
                        </span>
                      </div>
                    </div>
                  </div>
                ))}
              </div>
            </CardContent>
          </Card>

          {/* Export */}
          <Card>
            <CardHeader>
              <CardTitle className="text-lg">Export Data</CardTitle>
              <CardDescription>Download feature popularity data for external analysis or roadmap planning.</CardDescription>
            </CardHeader>
            <CardContent>
              <div className="flex flex-wrap gap-3">
                <Button variant="outline" onClick={() => {
                  const csv = "feature_name,request_count,first_requested,last_requested\n" +
                    features.map(f => `${f.feature_name},${f.request_count},${f.first_requested},${f.last_requested}`).join("\n");
                  const blob = new Blob([csv], { type: "text/csv" });
                  const url = URL.createObjectURL(blob);
                  const a = document.createElement("a");
                  a.href = url;
                  a.download = `feature-requests-${new Date().toISOString().split("T")[0]}.csv`;
                  a.click();
                  URL.revokeObjectURL(url);
                }}>
                  <Download className="h-4 w-4 mr-2" />
                  Export CSV
                </Button>
              </div>
            </CardContent>
          </Card>
        </>
      )}
    </div>
  );
}
