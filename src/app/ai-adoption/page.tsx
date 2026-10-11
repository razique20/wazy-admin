"use client";

import { useMemo, useState, useEffect } from "react";
import {
  Bot,
  TrendingUp,
  AlertTriangle,
  Users,
  Copyright,
} from "lucide-react";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/primitives";
import { Badge } from "@/components/ui/primitives";
import { formatNumber } from "@/lib/format";
import { quotaMonthLabel, aiFeatureLabel, AI_FEATURES } from "@/lib/ai-quota";
import type { AiAdoptionMetrics } from "@/lib/ai-quota";

interface ApiResponse {
  ok: boolean;
  month: string;
  metrics?: AiAdoptionMetrics;
  error?: string;
}

export default function AiAdoptionPage() {
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [, setCurrentMonth] = useState<string>("");
  const [metrics, setMetrics] = useState<AiAdoptionMetrics | null>(null);

  const loadData = async (selectedMonth: string = "") => {
    setLoading(true);
    setError(null);
    try {
      const url = selectedMonth
        ? `/api/ai-adoption?month=${selectedMonth}`
        : "/api/ai-adoption";
      const res = await fetch(url, { cache: "no-store" });
      const json: ApiResponse = await res.json();
      if (!res.ok || !json.ok) {
        setError(json.error ?? "Failed to load AI adoption data");
        setMetrics(null);
        return;
      }
      setCurrentMonth(json.month); // Keep for potential future use
      setMetrics(json.metrics ?? null);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Failed to load data");
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    void loadData();
  }, []);

  const activeMetrics = metrics;
  const exhaustedUsers = useMemo(
    () => activeMetrics?.quotaExhaustion.filter((u) => u.status === "exhausted") ?? [],
    [activeMetrics]
  );
  const warningUsers = useMemo(
    () => activeMetrics?.quotaExhaustion.filter((u) => u.status === "warning") ?? [],
    [activeMetrics]
  );

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-center justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold text-white">AI Feature Adoption</h1>
          <p className="text-sm text-zinc-400 mt-1">
            Track AI feature usage, adoption rates, and quota health across your user base.
          </p>
        </div>
        <button
          onClick={() => void loadData()}
          className="flex items-center gap-2 rounded-lg border border-zinc-800 px-4 py-2 text-sm font-medium text-zinc-200 hover:bg-zinc-800 transition-colors disabled:opacity-50"
        >
          <RefreshIcon className="h-4 w-4" />
          Refresh
        </button>
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
      ) : !activeMetrics ? (
        <Card>
          <CardContent className="pt-10 text-center">
            <Bot className="h-12 w-12 text-zinc-600 mx-auto mb-3" />
            <p className="text-sm text-zinc-500">No AI adoption data available yet.</p>
            <p className="text-xs text-zinc-600 mt-1">
              AI adoption metrics appear once users start using AI features.
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
                  <Users className="h-4 w-4" />
                  <span className="text-[11px] font-medium uppercase tracking-wider">Active Users</span>
                </div>
                <p className="text-2xl font-semibold text-white">
                  {formatNumber(activeMetrics.activeUsers)}
                </p>
                <p className="text-xs text-zinc-500 mt-1">
                  of {formatNumber(activeMetrics.totalUsers)} total registered users
                </p>
              </CardContent>
            </Card>

            <Card>
              <CardContent className="pt-5">
                <div className="flex items-center gap-2 text-zinc-500 mb-2">
                  <Bot className="h-4 w-4" />
                  <span className="text-[11px] font-medium uppercase tracking-wider">AI Adoption Rate</span>
                </div>
                <p className="text-2xl font-semibold text-emerald-400">
                  {activeMetrics.adoptionRate.toFixed(1)}%
                </p>
                <p className="text-xs text-zinc-500 mt-1">
                  {formatNumber(activeMetrics.usersWithAiUsage)} users using AI features
                </p>
              </CardContent>
            </Card>

            <Card>
              <CardContent className="pt-5">
                <div className="flex items-center gap-2 text-zinc-500 mb-2">
                  <TrendingUp className="h-4 w-4" />
                  <span className="text-[11px] font-medium uppercase tracking-wider">AI Calls This Month</span>
                </div>
                <p className="text-2xl font-semibold text-blue-400">
                  {formatNumber(
                    activeMetrics.byFeature.reduce((sum, f) => sum + f.totalCalls, 0)
                  )}
                </p>
                <p className="text-xs text-zinc-500 mt-1">
                  across {AI_FEATURES.length} AI features
                </p>
              </CardContent>
            </Card>

            <Card>
              <CardContent className="pt-5">
                <div className="flex items-center gap-2 text-zinc-500 mb-2">
                  <AlertTriangle className="h-4 w-4" />
                  <span className="text-[11px] font-medium uppercase tracking-wider">Quota Exhausted</span>
                </div>
                <p className="text-2xl font-semibold text-amber-400">
                  {formatNumber(exhaustedUsers.length)}
                </p>
                <p className="text-xs text-zinc-500 mt-1">
                  {formatNumber(warningUsers.length)} users approaching limit
                </p>
              </CardContent>
            </Card>
          </div>

          {/* Month selector */}
          <div className="flex flex-wrap items-center gap-4">
            <span className="text-sm text-zinc-400">Reporting month:</span>
            <Badge variant="neutral" className="text-sm">
              {quotaMonthLabel(activeMetrics.month)}
            </Badge>
            <span className="text-xs text-zinc-600">
              Month: {activeMetrics.month}
            </span>
          </div>

          {/* Per-Feature Adoption */}
          <Card>
            <CardHeader>
              <CardTitle className="text-lg">Feature Adoption Breakdown</CardTitle>
              <CardDescription>
                Usage and adoption rate for each AI feature this month.
              </CardDescription>
            </CardHeader>
            <CardContent>
              <div className="space-y-4">
                {activeMetrics.byFeature.map((feature) => (
                  <div
                    key={feature.feature}
                    className="rounded-xl border border-zinc-800 bg-black/40 p-4"
                  >
                    <div className="flex flex-wrap items-center justify-between gap-2">
                      <div>
                        <div className="flex items-center gap-2">
                          <h3 className="font-medium text-zinc-100">{feature.label}</h3>
                          <Badge variant="info">{feature.feature}</Badge>
                        </div>
                        <p className="text-xs text-zinc-500 mt-1">
                          {formatNumber(feature.users)} users - {formatNumber(feature.totalCalls)} total calls
                        </p>
                      </div>
                      <div className="text-right">
                        <p className="text-2xl font-semibold text-zinc-100">
                          {feature.adoptionRate.toFixed(1)}%
                        </p>
                        <p className="text-xs text-zinc-500">adoption rate</p>
                      </div>
                    </div>
                    {/* Adoption bar visualization */}
                    <div className="mt-3 h-2 bg-zinc-800 rounded-full overflow-hidden">
                      <div
                        className="h-full bg-gradient-to-r from-blue-500 to-cyan-400 transition-all duration-500 rounded-full"
                        style={{ width: `${Math.min(feature.adoptionRate, 100)}%` }}
                      />
                    </div>
                  </div>
                ))}
              </div>
            </CardContent>
          </Card>

          {/* Quota Exhaustion Alerts */}
          {exhaustedUsers.length > 0 && (
            <Card className="border-red-500/30">
              <CardHeader>
                <div className="flex items-center gap-2">
                  <AlertTriangle className="h-5 w-5 text-red-400" />
                  <CardTitle className="text-lg text-red-300">Quota Exhausted</CardTitle>
                </div>
                <CardDescription>
                  Users who have exceeded their monthly AI quota limit. They cannot use AI features until
                  the quota resets or an admin resets their counter.
                </CardDescription>
              </CardHeader>
              <CardContent>
                <div className="space-y-2">
                  {exhaustedUsers.map((user) => (
                    <div
                      key={`${user.userId}-${user.feature}`}
                      className="flex flex-wrap items-center justify-between gap-2 rounded-lg border border-red-500/20 bg-red-500/5 p-3"
                    >
                      <div className="flex items-center gap-3">
                        <div className="w-8 h-8 rounded-full bg-red-500/20 flex items-center justify-center">
                          <Copyright className="h-4 w-4 text-red-400" />
                        </div>
                        <div>
                          <p className="text-sm font-medium text-zinc-100">
                            {user.email ?? user.userId.slice(0, 8) + "..."}
                          </p>
                          <p className="text-xs text-zinc-500">
                            {user.tier} tier - {aiFeatureLabel(user.feature)}
                          </p>
                        </div>
                      </div>
                      <div className="text-right">
                        <p className="text-sm font-semibold text-red-400">
                          {user.used}/{user.limit} ({user.percentUsed.toFixed(0)}%)
                        </p>
                        <Badge variant="danger">Exhausted</Badge>
                      </div>
                    </div>
                  ))}
                </div>
              </CardContent>
            </Card>
          )}

          {/* Quota Warning */}
          {warningUsers.length > 0 && (
            <Card className="border-amber-500/30">
              <CardHeader>
                <div className="flex items-center gap-2">
                  <AlertTriangle className="h-5 w-5 text-amber-400" />
                  <CardTitle className="text-lg text-amber-300">Approaching Quota Limit</CardTitle>
                </div>
                <CardDescription>
                  Users who have used 80% or more of their monthly AI quota. Consider resetting their
                  counters or upgrading their tier if they need more.
                </CardDescription>
              </CardHeader>
              <CardContent>
                <div className="space-y-2">
                  {warningUsers.map((user) => (
                    <div
                      key={`${user.userId}-${user.feature}`}
                      className="flex flex-wrap items-center justify-between gap-2 rounded-lg border border-amber-500/20 bg-amber-500/5 p-3"
                    >
                      <div className="flex items-center gap-3">
                        <div className="w-8 h-8 rounded-full bg-amber-500/20 flex items-center justify-center">
                          <Users className="h-4 w-4 text-amber-400" />
                        </div>
                        <div>
                          <p className="text-sm font-medium text-zinc-100">
                            {user.email ?? user.userId.slice(0, 8) + "..."}
                          </p>
                          <p className="text-xs text-zinc-500">
                            {user.tier} tier - {aiFeatureLabel(user.feature)}
                          </p>
                        </div>
                      </div>
                      <div className="text-right">
                        <p className="text-sm font-semibold text-amber-400">
                          {user.used}/{user.limit} ({user.percentUsed.toFixed(0)}%)
                        </p>
                        <Badge variant="warning">{100 - user.percentUsed <= 10 ? "Almost there" : "Warning"}</Badge>
                      </div>
                    </div>
                  ))}
                </div>
              </CardContent>
            </Card>
          )}

          {/* All Users Usage */}
          <Card>
            <CardHeader>
              <CardTitle className="text-lg">All Users with AI Usage</CardTitle>
              <CardDescription>
                Complete list of users who have used AI features this month, sorted by usage.
              </CardDescription>
            </CardHeader>
            <CardContent>
              {activeMetrics.quotaExhaustion.length === 0 ? (
                <p className="text-sm text-zinc-500 py-4 text-center">
                  No users have used AI features this month yet.
                </p>
              ) : (
                <div className="overflow-x-auto">
                  <table className="w-full text-sm">
                    <thead>
                      <tr className="border-b border-zinc-800">
                        <th className="text-left py-2 px-3 text-xs font-medium uppercase tracking-wider text-zinc-500">
                          User
                        </th>
                        <th className="text-left py-2 px-3 text-xs font-medium uppercase tracking-wider text-zinc-500">
                          Tier
                        </th>
                        <th className="text-left py-2 px-3 text-xs font-medium uppercase tracking-wider text-zinc-500">
                          Feature
                        </th>
                        <th className="text-right py-2 px-3 text-xs font-medium uppercase tracking-wider text-zinc-500">
                          Used
                        </th>
                        <th className="text-right py-2 px-3 text-xs font-medium uppercase tracking-wider text-zinc-500">
                          Limit
                        </th>
                        <th className="text-right py-2 px-3 text-xs font-medium uppercase tracking-wider text-zinc-500">
                          % Used
                        </th>
                        <th className="text-right py-2 px-3 text-xs font-medium uppercase tracking-wider text-zinc-500">
                          Status
                        </th>
                      </tr>
                    </thead>
                    <tbody>
                      {activeMetrics.quotaExhaustion.map((user) => (
                        <tr
                          key={`${user.userId}-${user.feature}`}
                          className="border-b border-zinc-800/50 hover:bg-zinc-800/30"
                        >
                          <td className="py-2 px-3">
                            <span className="font-mono text-xs text-zinc-300">
                              {user.email ?? user.userId.slice(0, 8) + "..."}
                            </span>
                          </td>
                          <td className="py-2 px-3">
                            <Badge
                              variant={
                                user.tier === "business"
                                  ? "success"
                                  : user.tier === "plus"
                                  ? "info"
                                  : "neutral"
                              }
                            >
                              {user.tier}
                            </Badge>
                          </td>
                          <td className="py-2 px-3">
                            <span className="text-zinc-300">{aiFeatureLabel(user.feature)}</span>
                          </td>
                          <td className="py-2 px-3 text-right text-zinc-300">
                            {user.used}
                          </td>
                          <td className="py-2 px-3 text-right text-zinc-500">
                            {user.limit}
                          </td>
                          <td className="py-2 px-3 text-right">
                            <span
                              className={`font-medium ${
                                user.status === "exhausted"
                                  ? "text-red-400"
                                  : user.status === "warning"
                                  ? "text-amber-400"
                                  : "text-zinc-400"
                              }`}
                            >
                              {user.percentUsed.toFixed(0)}%
                            </span>
                          </td>
                          <td className="py-2 px-3 text-right">
                            <Badge
                              variant={
                                user.status === "exhausted"
                                  ? "danger"
                                  : user.status === "warning"
                                  ? "warning"
                                  : "success"
                              }
                            >
                              {user.status}
                            </Badge>
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              )}
            </CardContent>
          </Card>
        </>
      )}
    </div>
  );
}

function RefreshIcon({ className }: { className?: string }) {
  return (
    <svg
      className={className}
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="2"
      strokeLinecap="round"
      strokeLinejoin="round"
    >
      <path d="M21 12a9 9 0 0 0-9-9 9.75 9.75 0 0 0-6.74 2.74L3 8" />
      <path d="M3 3v5h5" />
      <path d="M3 12a9 9 0 0 0 9 9 9.75 9.75 0 0 0 6.74-2.74L21 16" />
      <path d="M16 16h5v5" />
    </svg>
  );
}