"use client";

import { useState, useEffect, useCallback } from "react";
import {
  Users,
  Smartphone,
  Laptop,
  TrendingUp,
  AlertTriangle,
  RefreshCw,
  Clock,
} from "lucide-react";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/primitives";
import { Badge } from "@/components/ui/primitives";
import { formatNumber } from "@/lib/format";

interface VersionAdoption {
  version: string;
  platform: string;
  users: number;
  percentage: number;
}

interface PlatformDistribution {
  platform: string;
  users: number;
  percentage: number;
}

interface ForceUpdateStatus {
  isForceUpdateEnabled: boolean;
  minRequiredVersion: string | null;
  usersBelowMinVersion: number;
}

interface AppHealthMetrics {
  period: string;
  totalRegisteredUsers: number;
  usersWithUsageHistory: number;
  activeUsers: {
    dau: number;
    wau: number;
    mau: number;
  };
  versionAdoption: VersionAdoption[];
  platformDistribution: PlatformDistribution[];
  forceUpdateStatus: ForceUpdateStatus | null;
}

interface AppHealthApiResponse {
  ok: boolean;
  metrics?: AppHealthMetrics;
  errorReports?: Array<{
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
  }>;
  error?: string;
}

const PLATFORM_LABELS: Record<string, string> = {
  ios: "iOS",
  android: "Android",
  web: "Web",
};

export default function AppHealthPage() {
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [metrics, setMetrics] = useState<AppHealthMetrics | null>(null);
  const [period, setPeriod] = useState<string>("30");

  const loadData = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const res = await fetch(`/api/app-health?period=${period}d&includeErrorReports=true`, { cache: "no-store" });
      const json: AppHealthApiResponse = await res.json();
      if (!res.ok || !json.ok) {
        setError(json.error ?? "Failed to load app health data");
        setMetrics(null);
        return;
      }
      setMetrics(json.metrics ?? null);
      const reports: Array<{
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
      }> = json.errorReports ?? [];
      if (reports.length) {
        console.warn('[app-health] errorReports present in payload:', reports.length);
      }
    } catch (e) {
      setError(e instanceof Error ? e.message : "Failed to load data");
    } finally {
      setLoading(false);
    }
  }, [period]);

  useEffect(() => {
    void loadData();
  }, [loadData]);

  const activeMetrics = metrics;

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-center justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold text-white">App Health & Adoption</h1>
          <p className="text-sm text-zinc-400 mt-1">
            Track active users (DAU/WAU/MAU), version adoption, and platform distribution.
          </p>
        </div>
        <div className="flex items-center gap-3">
          <select
            value={period}
            onChange={(e) => setPeriod(e.target.value)}
            className="rounded-lg border border-zinc-800 bg-zinc-900 px-3 py-2 text-sm text-zinc-100 focus:border-blue-500/60 focus:outline-none"
          >
            <option value="7">Last 7 days</option>
            <option value="14">Last 14 days</option>
            <option value="30">Last 30 days</option>
            <option value="90">Last 90 days</option>
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
            <Users className="h-12 w-12 text-zinc-600 mx-auto mb-3" />
            <p className="text-sm text-zinc-500">No app health data available yet.</p>
            <p className="text-xs text-zinc-600 mt-1">
              App health metrics appear once the mobile app starts reporting usage stats.
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
                  <span className="text-[11px] font-medium uppercase tracking-wider">Total Registered</span>
                </div>
                <p className="text-2xl font-semibold text-white">
                  {formatNumber(activeMetrics.totalRegisteredUsers)}
                </p>
                <p className="text-xs text-zinc-500 mt-1">All auth.users in database</p>
              </CardContent>
            </Card>

            <Card>
              <CardContent className="pt-5">
                <div className="flex items-center gap-2 text-zinc-500 mb-2">
                  <span className="text-[11px] font-medium uppercase tracking-wider text-emerald-400">DAU</span>
                </div>
                <p className="text-2xl font-semibold text-emerald-400">
                  {formatNumber(activeMetrics.activeUsers.dau)}
                </p>
                <p className="text-xs text-zinc-500 mt-1">Daily active users</p>
              </CardContent>
            </Card>

            <Card>
              <CardContent className="pt-5">
                <div className="flex items-center gap-2 text-zinc-500 mb-2">
                  <TrendingUp className="h-4 w-4" />
                  <span className="text-[11px] font-medium uppercase tracking-wider">WAU</span>
                </div>
                <p className="text-2xl font-semibold text-blue-400">
                  {formatNumber(activeMetrics.activeUsers.wau)}
                </p>
                <p className="text-xs text-zinc-500 mt-1">Weekly active users</p>
              </CardContent>
            </Card>

            <Card>
              <CardContent className="pt-5">
                <div className="flex items-center gap-2 text-zinc-500 mb-2">
                  <Users className="h-4 w-4" />
                  <span className="text-[11px] font-medium uppercase tracking-wider">MAU</span>
                </div>
                <p className="text-2xl font-semibold text-white">
                  {formatNumber(activeMetrics.activeUsers.mau)}
                </p>
                <p className="text-xs text-zinc-500 mt-1">Monthly active users</p>
              </CardContent>
            </Card>
          </div>

          {/* Active Users Chart */}
          <Card>
            <CardHeader>
              <CardTitle className="text-lg">Active Users Overview</CardTitle>
              <CardDescription>Daily, weekly, and monthly active users for the selected period. Percentages are relative to users with usage history.</CardDescription>
            </CardHeader>
            <CardContent>
              <div className="grid grid-cols-3 gap-4">
                <div className="text-center p-4 rounded-xl border border-zinc-800 bg-black/40">
                  <Clock className="h-8 w-8 text-zinc-600 mx-auto mb-2" />
                  <p className="text-3xl font-bold text-emerald-400">{formatNumber(activeMetrics.activeUsers.dau)}</p>
                  <p className="text-sm text-zinc-500 mt-1">Daily Active</p>
                  <p className="text-xs text-zinc-600 mt-1">
                    {activeMetrics.usersWithUsageHistory > 0
                      ? `${((activeMetrics.activeUsers.dau / activeMetrics.usersWithUsageHistory) * 100).toFixed(1)}% of users with usage`
                      : "—"}
                  </p>
                </div>
                <div className="text-center p-4 rounded-xl border border-zinc-800 bg-black/40">
                  <Clock className="h-8 w-8 text-zinc-600 mx-auto mb-2 rotate-90" />
                  <p className="text-3xl font-bold text-blue-400">{formatNumber(activeMetrics.activeUsers.wau)}</p>
                  <p className="text-sm text-zinc-500 mt-1">Weekly Active</p>
                  <p className="text-xs text-zinc-600 mt-1">
                    {activeMetrics.usersWithUsageHistory > 0
                      ? `${((activeMetrics.activeUsers.wau / activeMetrics.usersWithUsageHistory) * 100).toFixed(1)}% of users with usage`
                      : "—"}
                  </p>
                </div>
                <div className="text-center p-4 rounded-xl border border-zinc-800 bg-black/40">
                  <Users className="h-8 w-8 text-zinc-600 mx-auto mb-2" />
                  <p className="text-3xl font-bold text-white">{formatNumber(activeMetrics.activeUsers.mau)}</p>
                  <p className="text-sm text-zinc-500 mt-1">Monthly Active</p>
                  <p className="text-xs text-zinc-600 mt-1">
                    {activeMetrics.usersWithUsageHistory > 0
                      ? `${((activeMetrics.activeUsers.mau / activeMetrics.usersWithUsageHistory) * 100).toFixed(1)}% of users with usage`
                      : "—"}
                  </p>
                </div>
              </div>
            </CardContent>
          </Card>

          {/* Platform Distribution */}
          <Card>
            <CardHeader>
              <CardTitle className="text-lg">Platform Distribution</CardTitle>
              <CardDescription>Breakdown of users by device platform.</CardDescription>
            </CardHeader>
            <CardContent>
              <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                {activeMetrics.platformDistribution.map((platform) => (
                  <div
                    key={platform.platform}
                    className="rounded-xl border border-zinc-800 bg-black/40 p-4"
                  >
                    <div className="flex items-center gap-3 mb-3">
                      {platform.platform === "ios" && <Smartphone className="h-6 w-6 text-blue-400" />}
                      {platform.platform === "android" && <Smartphone className="h-6 w-6 text-emerald-400" />}
                      {platform.platform === "web" && <Laptop className="h-6 w-6 text-zinc-400" />}
                      <div>
                        <p className="font-medium text-zinc-100">{PLATFORM_LABELS[platform.platform]}</p>
                        <p className="text-xs text-zinc-500">{platform.users} users</p>
                      </div>
                    </div>
                    <div className="h-3 bg-zinc-800 rounded-full overflow-hidden">
                      <div
                        className={`h-full rounded-full transition-all duration-500 ${
                          platform.platform === "ios"
                            ? "bg-blue-500"
                            : platform.platform === "android"
                            ? "bg-emerald-500"
                            : "bg-zinc-500"
                        }`}
                        style={{ width: `${Math.min(platform.percentage, 100)}%` }}
                      />
                    </div>
                    <p className="text-right text-sm font-medium text-zinc-400 mt-2">
                      {platform.percentage.toFixed(1)}%
                    </p>
                  </div>
                ))}
              </div>
            </CardContent>
          </Card>



          {/* Version Adoption */}
          <Card>
            <CardHeader>
              <CardTitle className="text-lg">Version Adoption</CardTitle>
              <CardDescription>
                Breakdown of users by app version. Helps track upgrade adoption after releases.
              </CardDescription>
            </CardHeader>
            <CardContent>
              {activeMetrics.versionAdoption.length === 0 ? (
                <p className="text-sm text-zinc-500 py-4 text-center">
                  No version data available yet. Mobile app needs to report version on launch.
                </p>
              ) : (
                <div className="space-y-3">
                  {activeMetrics.versionAdoption
                    .filter((v, i, arr) => i === 0 || v.version !== arr[i - 1].version)
                    .map((item) => {
                      const versionUsers = activeMetrics.versionAdoption
                        .filter((v) => v.version === item.version)
                        .reduce((sum, v) => sum + v.users, 0);
                      const versionPercentage =
                        activeMetrics.versionAdoption.reduce((sum, v) => sum + v.users, 0) > 0
                          ? (versionUsers /
                              activeMetrics.versionAdoption.reduce((sum, v) => sum + v.users, 0)) *
                            100
                          : 0;

                      return (
                        <div
                          key={`${item.version}-${item.platform}`}
                          className="rounded-xl border border-zinc-800 bg-black/40 p-4"
                        >
                          <div className="flex items-center justify-between mb-2">
                            <div className="flex items-center gap-2">
                              <Badge variant="neutral">{item.version}</Badge>
                              <span className="text-sm text-zinc-500">
                                {PLATFORM_LABELS[item.platform] ?? item.platform}
                              </span>
                            </div>
                            <div className="text-right">
                              <p className="text-lg font-semibold text-zinc-100">{formatNumber(versionUsers)}</p>
                              <p className="text-xs text-zinc-500">users</p>
                            </div>
                          </div>
                          <div className="h-2 bg-zinc-800 rounded-full overflow-hidden">
                            <div
                              className="h-full bg-gradient-to-r from-blue-500 to-cyan-400 rounded-full transition-all duration-500"
                              style={{ width: `${Math.min(versionPercentage, 100)}%` }}
                            />
                          </div>
                          <p className="text-xs text-zinc-500 mt-1 text-right">{versionPercentage.toFixed(1)}%</p>
                        </div>
                      );
                    })}
                </div>
              )}
            </CardContent>
          </Card>

          {/* Force Update Status */}
          {activeMetrics.forceUpdateStatus?.isForceUpdateEnabled && (
            <Card className="border-amber-500/30">
              <CardHeader>
                <div className="flex items-center gap-2">
                  <AlertTriangle className="h-5 w-5 text-amber-400" />
                  <CardTitle className="text-lg text-amber-300">Force Update Active</CardTitle>
                </div>
                <CardDescription>
                  A force update is currently enabled. Users below the minimum version will be blocked.
                </CardDescription>
              </CardHeader>
              <CardContent>
                <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                  <div className="rounded-xl border border-amber-500/20 bg-amber-500/5 p-4">
                    <p className="text-xs text-zinc-500 mb-1">Minimum Required Version</p>
                    <p className="text-2xl font-bold text-amber-400">
                      {activeMetrics.forceUpdateStatus.minRequiredVersion ?? "—"}
                    </p>
                  </div>
                  <div className="rounded-xl border border-amber-500/20 bg-amber-500/5 p-4">
                    <p className="text-xs text-zinc-500 mb-1">Users Below Min Version</p>
                    <p className="text-2xl font-bold text-red-400">
                      {formatNumber(activeMetrics.forceUpdateStatus.usersBelowMinVersion)}
                    </p>
                  </div>
                  <div className="rounded-xl border border-emerald-500/20 bg-emerald-500/5 p-4">
                    <p className="text-xs text-zinc-500 mb-1">Users Up to Date</p>
                    <p className="text-2xl font-bold text-emerald-400">
                      {formatNumber(
                        (activeMetrics.versionAdoption.reduce((sum, v) => sum + v.users, 0) -
                          activeMetrics.forceUpdateStatus.usersBelowMinVersion)
                      )}
                    </p>
                  </div>
                </div>
              </CardContent>
            </Card>
          )}

          {!activeMetrics.forceUpdateStatus?.isForceUpdateEnabled && (
            <Card className="border-emerald-500/30">
              <CardContent className="pt-5">
                <div className="flex items-center gap-2 text-emerald-400">
                  <TrendingUp className="h-5 w-5" />
                  <span className="font-medium">No Force Update Active</span>
                </div>
                <p className="text-sm text-zinc-500 mt-1">
                  All users can use their current app version. No version restrictions are enforced.
                </p>
              </CardContent>
            </Card>
          )}
        </>
      )}
    </div>
  );
}
