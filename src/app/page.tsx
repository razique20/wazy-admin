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
import { FolderKanban, FileText, Gauge, TrendingUp, TrendingDown } from "lucide-react";
import { useMemo } from "react";
import { useWazy } from "@/components/providers/data-provider";
import { KpiCard } from "@/components/dashboard/kpi-card";
import { Card, CardContent, CardDescription, CardHeader, CardTitle, Badge } from "@/components/ui/primitives";
import { computeKpis, computeMonthlyCashFlow, computeExpenseBreakdown, computeRenewalHorizon } from "@/lib/analytics";
import { formatCurrency } from "@/lib/format";

const TOOLTIP_STYLE = {
  backgroundColor: "#0a0a0a",
  border: "1px solid #27272a",
  borderRadius: "8px",
  color: "#e4e4e7",
  fontSize: "12px",
  boxShadow: "0 4px 12px rgba(0,0,0,0.5)",
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

export default function OverviewPage() {
  const { data, loading, error } = useWazy();

  const kpis = useMemo(() => computeKpis(data, new Date()), [data]);
  const cashFlow = useMemo(() => computeMonthlyCashFlow(data.transactions, 6), [data.transactions]);
  const breakdown = useMemo(() => computeExpenseBreakdown(data.transactions), [data.transactions]);
  const horizon = useMemo(() => computeRenewalHorizon(data.documents), [data.documents]);

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
      {/* KPI grid */}
      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 xl:grid-cols-4">
        <KpiCard
          title="Total Collections"
          value={String(kpis.totalCollections)}
          subvalue={`${kpis.personalCollections} personal · ${kpis.companyCollections} company`}
          icon={<FolderKanban className="h-4 w-4" />}
          accent="white"
          loading={loading}
        />
        <KpiCard
          title="Documents"
          value={String(kpis.totalDocuments)}
          subvalue={`${kpis.urgentExpiries} expiring <30d · ${kpis.expiredDocuments} expired`}
          icon={<FileText className="h-4 w-4" />}
          accent={kpis.urgentExpiries + kpis.expiredDocuments > 0 ? "amber" : "blue"}
          loading={loading}
        />
        <KpiCard
          title="Net Cash Flow (MTD)"
          value={formatCurrency(kpis.netCashFlow)}
          subvalue={`${formatCurrency(kpis.monthlyIncome)} in · ${formatCurrency(kpis.monthlyExpenses)} out`}
          icon={kpis.netCashFlow >= 0 ? <TrendingUp className="h-4 w-4" /> : <TrendingDown className="h-4 w-4" />}
          accent={kpis.netCashFlow >= 0 ? "emerald" : "red"}
          loading={loading}
        />
        <KpiCard
          title="Budget Utilization"
          value={`${Math.round(kpis.budgetUtilization * 100)}%`}
          subvalue="Across all category budgets (MTD)"
          icon={<Gauge className="h-4 w-4" />}
          accent={kpis.budgetUtilization > 1 ? "red" : kpis.budgetUtilization > 0.8 ? "amber" : "blue"}
          loading={loading}
        />
      </div>

      {/* Charts */}
      <div className="grid grid-cols-1 gap-4 xl:grid-cols-3">
        <Card className="xl:col-span-2">
          <CardHeader>
            <CardTitle>Monthly Cash Flow Trend</CardTitle>
            <CardDescription>Income vs expenses, last 6 months (AED)</CardDescription>
          </CardHeader>
          <CardContent>
            <div className="h-72">
              <ResponsiveContainer width="100%" height="100%">
                <AreaChart data={cashFlow} margin={{ top: 10, right: 10, left: 0, bottom: 0 }}>
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
                  <CartesianGrid strokeDasharray="3 3" stroke="#1c1c1f" vertical={false} />
                  <XAxis dataKey="label" tick={{ fill: "#71717a", fontSize: 11 }} axisLine={false} tickLine={false} />
                  <YAxis
                    tick={{ fill: "#71717a", fontSize: 11 }}
                    axisLine={false}
                    tickLine={false}
                    tickFormatter={(v: number) => (v >= 1000 ? `${Math.round(v / 1000)}k` : String(v))}
                  />
                  <Tooltip contentStyle={TOOLTIP_STYLE} formatter={(v) => formatCurrency(Number(v))} />
                  <Legend wrapperStyle={{ fontSize: 12, color: "#a1a1aa" }} />
                  <Area type="monotone" dataKey="income" name="Income" stroke={SERIES.blue} fill="url(#incomeGrad)" strokeWidth={2} />
                  <Area type="monotone" dataKey="expenses" name="Expenses" stroke={SERIES.gray} fill="url(#expenseGrad)" strokeWidth={2} />
                </AreaChart>
              </ResponsiveContainer>
            </div>
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle>Expense Breakdown</CardTitle>
            <CardDescription>Current month spending by category</CardDescription>
          </CardHeader>
          <CardContent>
            {breakdown.length === 0 ? (
              <div className="flex h-72 items-center justify-center text-sm text-zinc-600">No expenses this month</div>
            ) : (
              <div className="h-72">
                <ResponsiveContainer width="100%" height="100%">
                  <PieChart>
                    <Pie
                      data={breakdown}
                      dataKey="amount"
                      nameKey="label"
                      innerRadius="58%"
                      outerRadius="85%"
                      paddingAngle={3}
                      strokeWidth={0}
                    >
                      {breakdown.map((_, i) => (
                        <Cell key={i} fill={DONUT_COLORS[i % DONUT_COLORS.length]} />
                      ))}
                    </Pie>
                    <Tooltip contentStyle={TOOLTIP_STYLE} formatter={(v) => formatCurrency(Number(v))} />
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
                <CartesianGrid strokeDasharray="3 3" stroke="#1c1c1f" vertical={false} />
                <XAxis dataKey="bucket" tick={{ fill: "#71717a", fontSize: 11 }} axisLine={false} tickLine={false} />
                <YAxis allowDecimals={false} tick={{ fill: "#71717a", fontSize: 11 }} axisLine={false} tickLine={false} />
                <Tooltip contentStyle={TOOLTIP_STYLE} cursor={{ fill: "#18181b" }} />
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
