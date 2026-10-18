"use client";

import {
  Area,
  AreaChart,
  Bar,
  BarChart,
  CartesianGrid,
  Cell,
  Pie,
  PieChart,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
  Legend,
} from "recharts";
import { FolderKanban, FileText, Gauge, Globe2, TrendingUp, TrendingDown, LifeBuoy, Bot, Users } from "lucide-react";
import { useEffect, useMemo, useState } from "react";
import { useWazy } from "@/components/providers/data-provider";
import { KpiCard } from "@/components/dashboard/kpi-card";
import { Card, CardContent, CardDescription, CardHeader, CardTitle, Badge } from "@/components/ui/primitives";
import {
  computeKpis,
  computeMonthlyCashFlow,
  computeExpenseBreakdown,
  computeRenewalHorizon,
  type MonthlyCashFlowPoint,
} from "@/lib/analytics";
import { computeSupportStats } from "@/lib/support";
import { quotaMonthKey, totalAiCalls, computeAiAdoption } from "@/lib/ai-quota";
import { toTier, TIER_LABELS } from "@/lib/tiers";
import { formatCurrency, formatNumber, formatSplit } from "@/lib/format";
import Link from "next/link";
import { Skeleton } from "@/components/ui/primitives";
import { cn } from "@/lib/cn";
import { useDisplayCurrency } from "@/components/providers/currency-provider";
import { collectionCurrencyResolver, computeGccStats } from "@/lib/gcc";
import { isNative } from "@/lib/currency";

/** Two-decimal rounding for per-currency chart legs. */
const round2 = (n: number) => Math.round(n * 100) / 100;

const TOOLTIP_STYLE = {
  backgroundColor: "var(--chart-tooltip-bg, #0a0a0a)",
  border: "1px solid var(--chart-tooltip-border, #27272a)",
  borderRadius: "8px",
  color: "var(--chart-tooltip-text, #e4e4e7)",
  fontSize: "12px",
  boxShadow: "var(--chart-tooltip-shadow, 0 4px 12px rgba(0,0,0,0.5))",
};

// Vercel-ish monochrome + blue series palette
const SERIES = {
  blue: "#0070f3",
  cyan: "#50e3ff",
  emerald: "#0cce6b",
  amber: "#f5a623",
  red: "#ee4d4d",
  purple: "#7928ca",
  pink: "#ff0080",
  gray: "#8a8f98",
};

const DONUT_COLORS = [SERIES.blue, SERIES.cyan, SERIES.emerald, SERIES.amber, SERIES.purple, SERIES.pink, SERIES.gray, "#3f3f46", "#52525b", "#71717a"];

/** Per-currency series colours for the multi-currency cash-flow chart. */
const SERIES_LIST = [SERIES.blue, SERIES.emerald, SERIES.amber, SERIES.purple, SERIES.pink, SERIES.cyan];

interface AuthUser {
  id: string;
  email: string | null;
  createdAt: string | null;
  lastSignInAt: string | null;
}

export default function OverviewPage() {
  const { data, loading, error } = useWazy();
  const { currency: displayCurrency } = useDisplayCurrency();
  const [authUsers, setAuthUsers] = useState<AuthUser[]>([]);
  const [, setActiveUsers] = useState<AuthUser[]>([]);
  const [tiers, setTiers] = useState<Record<string, string>>({});
  const [tierExpiries, setTierExpiries] = useState<Record<string, string>>({});

  useEffect(() => {
    let cancelled = false;
    void (async () => {
      try {
        const [usersRes, tiersRes] = await Promise.all([
          fetch("/api/admin-users", { cache: "no-store" }),
          fetch("/api/user-tiers", { cache: "no-store" }),
        ]);
        const usersJson = await usersRes.json().catch(() => ({}));
        const tiersJson = await tiersRes.json().catch(() => ({}));
        if (cancelled) return;
        const users = usersJson.users ?? [];
        setAuthUsers(users);
        // Active users: signed in within 30 days or created within 30 days
        const thirtyDaysAgo = new Date(Date.now() - 30 * 86_400_000);
        setActiveUsers(
          users.filter((u: AuthUser) => {
            if (!u.lastSignInAt && !u.createdAt) return false;
            const lastActivity = u.lastSignInAt ? new Date(u.lastSignInAt) : new Date(u.createdAt!);
            return lastActivity >= thirtyDaysAgo;
          })
        );
        setTiers(tiersJson.tiers ?? {});
        setTierExpiries(tiersJson.expiries ?? {});
      } catch {
        // Dashboard still renders platform-data widgets without auth info.
      }
    })();
    return () => {
      cancelled = true;
    };
  }, []);

  const moneyOpts = useMemo(
    () => ({
      displayCurrency: displayCurrency,
      currencyForCollection: collectionCurrencyResolver(data.collections),
    }),
    [displayCurrency, data.collections],
  );

  const kpis = useMemo(() => computeKpis(data, new Date(), moneyOpts), [data, moneyOpts]);
  const cashFlow = useMemo(
    () => computeMonthlyCashFlow(data.transactions, 6, new Date(), moneyOpts),
    [data.transactions, moneyOpts],
  );
  const breakdown = useMemo(
    () => computeExpenseBreakdown(data.transactions, new Date(), moneyOpts),
    [data.transactions, moneyOpts],
  );
  const horizon = useMemo(() => computeRenewalHorizon(data.documents), [data.documents]);
  // Per-GCC-market coverage: how many documents and transactions each of the
  // six states contributes, with money shown in the display currency.
  const gccStats = useMemo(
    () => computeGccStats(data, { displayCurrency }),
    [data, displayCurrency],
  );

  // In the default (as-recorded) view a month can hold several currencies at
  // once, so the chart draws one Income/Expenses pair per currency instead of
  // pretending AED 1,200 and SAR 300 are the same number. With a single
  // currency — or when the admin picks one — the classic two-series chart is
  // exact and much easier to read.
  const chartCurrencies = useMemo(() => {
    const codes = new Set<string>();
    for (const p of cashFlow) {
      for (const code of [...Object.keys(p.incomeByCurrency), ...Object.keys(p.expensesByCurrency)]) codes.add(code);
    }
    return [...codes].sort();
  }, [cashFlow]);

  const multiCurrencyChart = isNative(displayCurrency) && chartCurrencies.length > 1;

  const cashFlowData = useMemo(() => {
    if (!multiCurrencyChart) return cashFlow;
    return cashFlow.map((p) => {
      const row: Record<string, string | number> = { label: p.label };
      for (const code of chartCurrencies) {
        row[`Income ${code}`] = round2(p.incomeByCurrency[code] ?? 0);
        row[`Expenses ${code}`] = round2(p.expensesByCurrency[code] ?? 0);
      }
      return row;
    });
  }, [cashFlow, multiCurrencyChart, chartCurrencies]);

  // Same idea for the donut: with several currencies in play, break the month
  // down by currency so each slice is a real, unconvertible amount.
  const breakdownData = useMemo(() => {
    if (!multiCurrencyChart) return breakdown.map((b) => ({ key: b.category, label: b.label, value: b.amount }));
    const byCurrency = new Map<string, number>();
    for (const b of breakdown) {
      for (const [code, amount] of Object.entries(b.byCurrency)) {
        byCurrency.set(code, (byCurrency.get(code) ?? 0) + amount);
      }
    }
    return [...byCurrency.entries()]
      .map(([code, value]) => ({ key: code, label: code, value: round2(value) }))
      .sort((a, b) => b.value - a.value);
  }, [breakdown, multiCurrencyChart]);

  const currencyLabel = isNative(displayCurrency) ? "as recorded" : displayCurrency;

  // Platform widgets (doc §12)
  const supportStats = useMemo(() => computeSupportStats(data.supportRequests), [data.supportRequests]);
  const aiCalls = useMemo(() => totalAiCalls(data.aiQuotaUsage, quotaMonthKey()), [data.aiQuotaUsage]);
  const aiAdoption = useMemo(
    () =>
      authUsers.length > 0 && data.aiQuotaUsage.length > 0
        ? computeAiAdoption(data.aiQuotaUsage, authUsers, quotaMonthKey())
        : null,
    [data.aiQuotaUsage, authUsers],
  );
  const platform = useMemo(() => {
    const resolved: Record<string, ReturnType<typeof toTier>> = {};
    for (const [userId, raw] of Object.entries(tiers)) resolved[userId] = toTier(raw);
    const counts = { free: 0, plus: 0, business: 0 };
    for (const u of authUsers) {
      const t = resolved[u.id] ?? "free";
      if (t) counts[t] += 1;
    }
    const newUsers7d = authUsers.filter((u) => {
      if (!u.createdAt) return false;
      const created = new Date(u.createdAt).getTime();
      return Number.isFinite(created) && created >= Date.now() - 7 * 86_400_000;
    }).length;
    const expiringPlans = Object.entries(tierExpiries).filter(([, iso]) => {
      if (!iso) return false;
      const t = new Date(iso).getTime();
      return Number.isFinite(t) && t > Date.now() && t <= Date.now() + 30 * 86_400_000;
    }).length;
    return { counts, newUsers7d, expiringPlans };
  }, [authUsers, tiers, tierExpiries]);

  const horizonData = horizon.map((h) => ({
    bucket: h.bucket,
    Documents: h.expired + h.days30 + h.days60 + h.days90 + h.days90Plus,
  }));

  if (error) {
    return (
      <Card className="border-red-500/30">
        <CardContent className="pt-5">
          <p className="text-sm font-medium text-red-400">Failed to load dashboard data</p>
          <p className="mt-1 text-xs text-zinc-400">{error}</p>
        </CardContent>
      </Card>
    );
  }

  return (
    <div className="space-y-6">
      {/* Platform & Financial KPI Cards (2 responsive rows of 4) */}
      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 xl:grid-cols-4">
        <KpiCard
          title="Total Users"
          value={String(authUsers.length)}
          subvalue={`${platform.newUsers7d} new in the last 7 days`}
          icon={<Users className="h-4 w-4" />}
          accent="white"
          href="/users"
          loading={loading && authUsers.length === 0}
        />
        <KpiCard
          title="Paid Users"
          value={String(platform.counts.plus + platform.counts.business)}
          subvalue={`${platform.counts.plus} ${TIER_LABELS.plus} · ${platform.counts.business} ${TIER_LABELS.business} · ${platform.expiringPlans} plans end ≤30d`}
          icon={<TrendingUp className="h-4 w-4" />}
          accent={platform.counts.plus + platform.counts.business > 0 ? "emerald" : "white"}
          href="/subscriptions"
          loading={loading && authUsers.length === 0}
        />
        <KpiCard
          title="Open Support Tickets"
          value={String(supportStats.open)}
          subvalue={`${supportStats.trackingRequests} tracking requests (feature demand)`}
          icon={<LifeBuoy className="h-4 w-4" />}
          accent={supportStats.open > 0 ? "amber" : "blue"}
          href="/support"
          loading={loading}
        />
        <KpiCard
          title="AI Usage & Adoption"
          value={aiAdoption ? `${aiAdoption.adoptionRate.toFixed(1)}%` : `${formatNumber(aiCalls)} calls`}
          subvalue={
            aiAdoption
              ? `${formatNumber(aiCalls)} calls MTD · ${aiAdoption.usersWithAiUsage} of ${aiAdoption.activeUsers} active users`
              : `${formatNumber(aiCalls)} calls across all users and AI features`
          }
          icon={<Bot className="h-4 w-4" />}
          accent={aiAdoption && aiAdoption.adoptionRate > 20 ? "emerald" : "blue"}
          href="/ai-adoption"
          loading={loading}
        />
        <KpiCard
          title="Total Collections"
          value={String(kpis.totalCollections)}
          subvalue={`${kpis.personalCollections} personal · ${kpis.companyCollections} company`}
          icon={<FolderKanban className="h-4 w-4" />}
          accent="white"
          href="/collections"
          loading={loading}
        />
        <KpiCard
          title="Documents"
          value={String(kpis.totalDocuments)}
          subvalue={`${kpis.urgentExpiries} expiring <30d · ${kpis.expiredDocuments} expired`}
          icon={<FileText className="h-4 w-4" />}
          accent={kpis.urgentExpiries + kpis.expiredDocuments > 0 ? "amber" : "blue"}
          href="/collections"
          loading={loading}
        />
        {(() => {
          const isMulti = isNative(displayCurrency) && Object.keys(kpis.netCashFlowByCurrency).length > 1;
          const displayVal = isMulti
            ? formatCurrency(kpis.netCashFlow, "AED")
            : formatSplit(kpis.netCashFlowByCurrency, displayCurrency);
          const displaySub = isMulti
            ? "Total in AED · View GCC split →"
            : `${formatSplit(kpis.monthlyIncomeByCurrency, displayCurrency)} in · ${formatSplit(kpis.monthlyExpensesByCurrency, displayCurrency)} out`;
          return (
            <KpiCard
              title="Net Cash Flow (MTD)"
              value={displayVal}
              subvalue={displaySub}
              icon={kpis.netCashFlow >= 0 ? <TrendingUp className="h-4 w-4" /> : <TrendingDown className="h-4 w-4" />}
              accent={kpis.netCashFlow >= 0 ? "emerald" : "red"}
              href={isMulti ? "/gcc" : "/finance"}
              loading={loading}
            />
          );
        })()}
        <KpiCard
          title="Budget Utilization"
          value={`${Math.round(kpis.budgetUtilization * 100)}%`}
          subvalue="Across all category budgets (MTD)"
          icon={<Gauge className="h-4 w-4" />}
          accent={kpis.budgetUtilization > 1 ? "red" : kpis.budgetUtilization > 0.8 ? "amber" : "blue"}
          href="/finance"
          loading={loading}
        />
      </div>

      {/* GCC market coverage — documents & transactions per Gulf state */}
      <Card>
        <CardHeader>
          <div className="flex flex-wrap items-center justify-between gap-3">
            <div>
              <CardTitle className="flex items-center gap-2">
                <Globe2 className="h-4 w-4 text-emerald-400" />
                GCC Market Coverage
              </CardTitle>
              <CardDescription>
                Documents &amp; transactions per Gulf state · money {isNative(displayCurrency) ? "as recorded" : `in ${displayCurrency}`}
              </CardDescription>
            </div>
            <Link
              href="/gcc"
              className="text-xs font-medium text-blue-400 hover:text-blue-300"
            >
              Full GCC overview →
            </Link>
          </div>
        </CardHeader>
        <CardContent>
          {loading ? (
            <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 xl:grid-cols-6">
              {Array.from({ length: 6 }).map((_, i) => (
                <Skeleton key={i} className="h-24 w-full" />
              ))}
            </div>
          ) : (
            <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 xl:grid-cols-6">
              {gccStats.countries.map((c) => {
                const active = c.collections > 0 || c.documents > 0 || c.transactions > 0;
                return (
                  <Link
                    key={c.code}
                    href="/gcc"
                    className={cn(
                      "rounded-xl border border-zinc-200 dark:border-zinc-800 bg-white/70 dark:bg-black/40 p-3 transition-colors hover:border-zinc-300 dark:hover:border-zinc-700",
                      !active && "opacity-50",
                    )}
                  >
                    <p className="flex items-center justify-between text-sm font-medium text-zinc-100">
                      <span className="flex items-center gap-1.5">
                        <span aria-hidden>{c.flag}</span>
                        {c.code}
                      </span>
                      <Badge variant={!isNative(displayCurrency) && c.currency === displayCurrency ? "info" : "neutral"}>
                        {c.currency}
                      </Badge>
                    </p>
                    <p className="mt-2 text-lg font-semibold text-slate-900 dark:text-white">{formatNumber(c.documents)}</p>
                    <p className="text-[11px] text-slate-600 dark:text-zinc-500 font-medium">documents</p>
                    <p className="mt-1.5 text-lg font-semibold text-emerald-600 dark:text-emerald-400">{formatNumber(c.transactions)}</p>
                    <p className="text-[11px] text-slate-600 dark:text-zinc-500 font-medium">transactions</p>
                    {c.expenses !== 0 || c.income !== 0 ? (
                      <p className="mt-1.5 break-words text-[11px] leading-relaxed text-slate-700 dark:text-zinc-400 font-medium">
                        net {formatSplit(c.netByCurrency, displayCurrency)}
                      </p>
                    ) : null}
                  </Link>
                );
              })}
            </div>
          )}
        </CardContent>
      </Card>

      {/* Charts */}
      <div className="grid grid-cols-1 gap-4 xl:grid-cols-3">
        <Card className="xl:col-span-2">
          <CardHeader>
            <CardTitle>Monthly Cash Flow Trend</CardTitle>
            <CardDescription>
              {multiCurrencyChart
                ? `Income vs expenses, last 6 months — one series per currency (${chartCurrencies.join(", ")})`
                : `Income vs expenses, last 6 months (${isNative(displayCurrency) ? chartCurrencies[0] ?? "AED" : displayCurrency})`}
            </CardDescription>
          </CardHeader>
          <CardContent>
            <div className="h-72">
              <ResponsiveContainer width="100%" height="100%">
                <AreaChart data={cashFlowData as MonthlyCashFlowPoint[]} margin={{ top: 10, right: 10, left: 0, bottom: 0 }}>
                  <defs>
                    <linearGradient id="incomeGrad" x1="0" y1="0" x2="0" y2="1">
                      <stop offset="0%" stopColor={SERIES.blue} stopOpacity={0.35} />
                      <stop offset="100%" stopColor={SERIES.blue} stopOpacity={0} />
                    </linearGradient>
                    <linearGradient id="expenseGrad" x1="0" y1="0" x2="0" y2="1">
                      <stop offset="0%" stopColor={SERIES.gray} stopOpacity={0.3} />
                      <stop offset="100%" stopColor={SERIES.gray} stopOpacity={0} />
                    </linearGradient>
                  </defs>
                  <CartesianGrid strokeDasharray="3 3" stroke="var(--chart-grid, #1c1c1f)" vertical={false} />
                  <XAxis dataKey="label" tick={{ fill: "var(--chart-axis, #71717a)", fontSize: 11 }} axisLine={false} tickLine={false} />
                  <YAxis
                    tick={{ fill: "var(--chart-axis, #71717a)", fontSize: 11 }}
                    axisLine={false}
                    tickLine={false}
                    tickFormatter={(v: number) => (v >= 1000 ? `${Math.round(v / 1000)}k` : String(v))}
                  />
                  <Tooltip
                    contentStyle={TOOLTIP_STYLE}
                    formatter={(v, name) => {
                      // In the multi-currency view each series already carries
                      // its own currency in its name — don't re-convert it.
                      const code =
                        multiCurrencyChart && typeof name === "string"
                          ? (name.split(" ").pop() ?? displayCurrency)
                          : displayCurrency;
                      return formatCurrency(Number(v), isNative(code) ? "AED" : code);
                    }}
                  />
                  <Legend wrapperStyle={{ fontSize: 12, color: "#a1a1aa" }} />
                  {multiCurrencyChart ? (
                    // One Income/Expenses pair per currency — every amount is
                    // shown in the exact currency it was recorded in.
                    chartCurrencies.flatMap((code, i) => {
                      const color = SERIES_LIST[i % SERIES_LIST.length];
                      return [
                        <Area
                          key={`in-${code}`}
                          type="monotone"
                          dataKey={`Income ${code}`}
                          name={`Income ${code}`}
                          stroke={color}
                          fill="transparent"
                          strokeWidth={2}
                          strokeDasharray="4 2"
                        />,
                        <Area
                          key={`out-${code}`}
                          type="monotone"
                          dataKey={`Expenses ${code}`}
                          name={`Expenses ${code}`}
                          stroke={color}
                          fill="transparent"
                          strokeWidth={2}
                        />,
                      ];
                    })
                  ) : (
                    <>
                      <Area type="monotone" dataKey="income" name="Income" stroke={SERIES.blue} fill="url(#incomeGrad)" strokeWidth={2} />
                      <Area type="monotone" dataKey="expenses" name="Expenses" stroke={SERIES.gray} fill="url(#expenseGrad)" strokeWidth={2} />
                    </>
                  )}
                </AreaChart>
              </ResponsiveContainer>
            </div>
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle>Expense Breakdown</CardTitle>
            <CardDescription>
              {multiCurrencyChart
                ? `Current month spending by currency (as recorded · ${currencyLabel})`
                : `Current month spending by category (${isNative(displayCurrency) ? chartCurrencies[0] ?? "AED" : displayCurrency})`}
            </CardDescription>
          </CardHeader>
          <CardContent>
            {breakdownData.length === 0 ? (
              <div className="flex h-72 items-center justify-center text-sm text-zinc-600">No expenses this month</div>
            ) : (
              <div className="h-72">
                <ResponsiveContainer width="100%" height="100%">
                  <PieChart>
                    <Pie
                      data={breakdownData}
                      dataKey="value"
                      nameKey="label"
                      innerRadius="58%"
                      outerRadius="85%"
                      paddingAngle={3}
                      strokeWidth={0}
                    >
                      {breakdownData.map((_, i) => (
                        <Cell key={i} fill={DONUT_COLORS[i % DONUT_COLORS.length]} />
                      ))}
                    </Pie>
                    <Tooltip
                      contentStyle={TOOLTIP_STYLE}
                      formatter={(v, name) =>
                        // Each slice is already in its own currency in the
                        // multi-currency view; otherwise convert to display.
                        // Native mode has no single code — fall back to the
                        // chart's one currency (or AED) instead of the
                        // literal string "native", which Intl can't format.
                        (() => {
                          const code =
                            multiCurrencyChart && typeof name === "string"
                              ? name
                              : isNative(displayCurrency)
                                ? chartCurrencies[0] ?? "AED"
                                : displayCurrency;
                          return formatCurrency(Number(v), code);
                        })()
                      }
                    />
                    <Legend wrapperStyle={{ fontSize: 11, color: "#a1a1aa" }} />
                  </PieChart>
                </ResponsiveContainer>
              </div>
            )}
          </CardContent>
        </Card>
      </div>

      {/* Renewal horizon */}
      <Card>
        <CardHeader>
          <div className="flex items-center justify-between">
            <div>
              <CardTitle>Upcoming Renewal Horizon</CardTitle>
              <CardDescription>Active documents grouped by days until expiry</CardDescription>
            </div>
            <div className="hidden gap-2 md:flex">
              <Badge variant="danger">{horizon[0].expired} expired</Badge>
              <Badge variant="warning">{horizon[1].days30} ≤30d</Badge>
              <Badge variant="info">{horizon[2].days60} 31–60d</Badge>
            </div>
          </div>
        </CardHeader>
        <CardContent>
          <div className="h-56">
            <ResponsiveContainer width="100%" height="100%">
              <BarChart data={horizonData} margin={{ top: 10, right: 10, left: 0, bottom: 0 }}>
                <CartesianGrid strokeDasharray="3 3" stroke="var(--chart-grid, #1c1c1f)" vertical={false} />
                <XAxis dataKey="bucket" tick={{ fill: "var(--chart-axis, #71717a)", fontSize: 11 }} axisLine={false} tickLine={false} />
                <YAxis allowDecimals={false} tick={{ fill: "var(--chart-axis, #71717a)", fontSize: 11 }} axisLine={false} tickLine={false} />
                <Tooltip contentStyle={TOOLTIP_STYLE} cursor={{ fill: "var(--chart-grid, #18181b)", opacity: 0.5 }} />
                <Bar dataKey="Documents" radius={[4, 4, 0, 0]}>
                  {horizonData.map((_, i) => (
                    <Cell key={i} fill={[SERIES.red, SERIES.amber, SERIES.blue, SERIES.cyan, SERIES.emerald][i]} />
                  ))}
                </Bar>
              </BarChart>
            </ResponsiveContainer>
          </div>
        </CardContent>
      </Card>
    </div>
  );
}

