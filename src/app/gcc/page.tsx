"use client";

import { useMemo } from "react";
import { Bar, BarChart, CartesianGrid, ResponsiveContainer, Tooltip, XAxis, YAxis, Legend } from "recharts";
import { Coins, FileText, Globe2, Receipt, Wallet } from "lucide-react";
import { useWazy } from "@/components/providers/data-provider";
import { useDisplayCurrency } from "@/components/providers/currency-provider";
import { KpiCard } from "@/components/dashboard/kpi-card";
import {
  Badge,
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
  EmptyState,
  Skeleton,
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui";
import { CurrencySelect } from "@/components/ui/currency-select";
import {
  computeGccCurrencyStats,
  computeGccStats,
  GCC_COUNTRIES,
  type GccCountryStat,
} from "@/lib/gcc";
import { CURRENCIES, fractionDigitsFor, isNative, splitAdd, type CurrencySplit } from "@/lib/currency";
import { formatCurrency, formatNumber, formatSplit } from "@/lib/format";

const TOOLTIP_STYLE = {
  backgroundColor: "#0a0a0a",
  border: "1px solid #27272a",
  borderRadius: "8px",
  color: "#e4e4e7",
  fontSize: "12px",
  boxShadow: "0 4px 12px rgba(0,0,0,0.5)",
};

/**
 * GCC Overview — how much of each Gulf market the platform supports.
 *
 * The mobile app lets every collection live in one of the six GCC states, each
 * with its own currency (AED, SAR, KWD, QAR, BHD, OMR). This page aggregates
 * collections, documents, transactions and money per country, converting every
 * amount into the admin's chosen display currency (default AED) so totals are
 * comparable across markets.
 */
export default function GccOverviewPage() {
  const { data, loading, error } = useWazy();
  const { currency: displayCurrency } = useDisplayCurrency();
  const native = isNative(displayCurrency);
  /** Short label for headers: the display code, or "as recorded" in native mode. */
  const moneyLabel = native ? "as recorded" : displayCurrency;

  const stats = useMemo(
    () => computeGccStats(data, { displayCurrency }),
    [data, displayCurrency],
  );

  // Whole platform rolled up by the currency each row was recorded in —
  // the "Default" scope: exact amounts, never FX-converted.
  const currencyStats = useMemo(
    () => computeGccCurrencyStats(data, { displayCurrency }),
    [data, displayCurrency],
  );

  // Platform-wide splits merged from the per-country buckets so KPI money
  // figures render per-currency in native mode instead of a fake AED sum.
  const totalsSplit = useMemo(() => {
    const income: CurrencySplit = {};
    const expenses: CurrencySplit = {};
    for (const c of stats.countries) {
      for (const [code, amount] of Object.entries(c.incomeByCurrency)) splitAdd(income, amount, code);
      for (const [code, amount] of Object.entries(c.expensesByCurrency)) splitAdd(expenses, amount, code);
    }
    const net: CurrencySplit = {};
    for (const [code, amount] of Object.entries(income)) net[code] = amount;
    for (const [code, amount] of Object.entries(expenses)) net[code] = (net[code] ?? 0) - amount;
    return { income, expenses, net };
  }, [stats.countries]);

  const chartData = useMemo(
    () =>
      stats.countries.map((c) => ({
        country: c.code,
        Documents: c.documents,
        Transactions: c.transactions,
      })),
    [stats.countries],
  );

  const moneyChartData = useMemo(
    () =>
      stats.countries
        .filter((c) => c.income !== 0 || c.expenses !== 0)
        .map((c) => ({
          country: c.code,
          Income: c.income,
          Expenses: c.expenses,
        })),
    [stats.countries],
  );

  const activeCountries = stats.countries.filter(
    (c) => c.collections > 0 || c.documents > 0 || c.transactions > 0,
  );

  if (error) {
    return (
      <Card className="border-red-500/30">
        <CardContent className="pt-5">
          <p className="text-sm font-medium text-red-400">Failed to load GCC data</p>
          <p className="mt-1 text-xs text-zinc-400">{error}</p>
        </CardContent>
      </Card>
    );
  }

  return (
    <div className="space-y-6">
      {/* Header */}
      <Card className="p-4">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div className="flex items-start gap-3">
            <div className="flex h-9 w-9 items-center justify-center rounded-lg border border-zinc-800 bg-zinc-900">
              <Globe2 className="h-4 w-4 text-emerald-400" />
            </div>
            <div>
              <p className="text-sm font-semibold text-zinc-100">GCC Markets &amp; Currencies</p>
              <p className="text-xs text-zinc-500">
                Collections, documents and transactions across the six Gulf states —{" "}
                {native ? (
                  <>each amount shown in the currency it was recorded in.</>
                ) : (
                  <>
                    all money converted to <span className="font-medium text-zinc-300">{displayCurrency}</span> at pegged
                    rates.
                  </>
                )}
              </p>
            </div>
          </div>
          <CurrencySelect />
        </div>
      </Card>

      {/* Platform KPIs */}
      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 xl:grid-cols-4">
        <KpiCard
          title="GCC Countries Active"
          value={`${activeCountries.length} / ${GCC_COUNTRIES.length}`}
          subvalue={activeCountries.map((c) => c.code).join(" · ") || "no data yet"}
          icon={<Globe2 className="h-4 w-4" />}
          accent={activeCountries.length > 1 ? "emerald" : "white"}
          loading={loading}
        />
        <KpiCard
          title="Total Transactions"
          value={formatNumber(stats.totals.transactions)}
          subvalue={`across ${stats.totals.users} users · ${native ? "each in its own currency" : `all → ${displayCurrency}`}`}
          icon={<Receipt className="h-4 w-4" />}
          accent="blue"
          loading={loading}
        />
        <KpiCard
          title="Documents Tracked"
          value={formatNumber(stats.totals.documents)}
          subvalue={`${formatNumber(stats.totals.collections)} collections in GCC`}
          icon={<FileText className="h-4 w-4" />}
          accent="white"
          loading={loading}
        />
        <KpiCard
          title={`Net Cash Flow (${moneyLabel})`}
          value={formatSplit(totalsSplit.net, displayCurrency)}
          subvalue={`${formatSplit(totalsSplit.income, displayCurrency)} in · ${formatSplit(totalsSplit.expenses, displayCurrency)} out`}
          icon={<Wallet className="h-4 w-4" />}
          accent={stats.totals.net >= 0 ? "emerald" : "red"}
          loading={loading}
        />
      </div>

      {/* Per-country table */}
      <Card>
        <CardHeader>
          <CardTitle>By GCC Country</CardTitle>
          <CardDescription>
            {native ? (
              <>Every amount below stays in the currency it was recorded in; the “native” column shows the collection’s own currency.</>
            ) : (
              <>
                Every amount below is converted into {displayCurrency}; the “native” column shows the same figure in the
                country’s own currency (e.g. SAR for Saudi Arabia).
              </>
            )}
          </CardDescription>
        </CardHeader>
        <CardContent>
          {loading && stats.totals.transactions === 0 && stats.totals.documents === 0 ? (
            <div className="space-y-2">
              {Array.from({ length: 6 }).map((_, i) => (
                <Skeleton key={i} className="h-12 w-full" />
              ))}
            </div>
          ) : activeCountries.length === 0 ? (
            <EmptyState
              icon={<Globe2 className="h-10 w-10" />}
              title="No GCC activity yet"
              description="Collections, documents and transactions will be broken down by country here."
            />
          ) : (
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Country</TableHead>
                  <TableHead>Currency</TableHead>
                  <TableHead className="text-right">Collections</TableHead>
                  <TableHead className="text-right">Documents</TableHead>
                  <TableHead className="text-right">Expiring ≤30d</TableHead>
                  <TableHead className="text-right">Users</TableHead>
                  <TableHead className="text-right">Transactions</TableHead>
                  <TableHead className="text-right">Income ({moneyLabel})</TableHead>
                  <TableHead className="text-right">Expenses ({moneyLabel})</TableHead>
                  <TableHead className="text-right">Net ({moneyLabel})</TableHead>
                  <TableHead className="text-right">Expenses (native)</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {stats.countries.map((c) => (
                  <CountryRow key={c.code} stat={c} displayCurrency={displayCurrency} />
                ))}
              </TableBody>
            </Table>
          )}
        </CardContent>
      </Card>

      {/* All data by currency — the "Default" scope: exact, unconverted. */}
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <Coins className="h-4 w-4 text-amber-400" aria-hidden />
            All Data by Currency
          </CardTitle>
          <CardDescription>
            The whole platform rolled up by the currency each row was recorded in — no FX applied, so these are the exact
            amounts the GCC users entered.
            {native
              ? null
              : ` The last column shows the same spend converted to ${displayCurrency} for comparison.`}
          </CardDescription>
        </CardHeader>
        <CardContent>
          {loading && currencyStats.totals.transactions === 0 && currencyStats.totals.documents === 0 ? (
            <div className="space-y-2">
              {Array.from({ length: 3 }).map((_, i) => (
                <Skeleton key={i} className="h-12 w-full" />
              ))}
            </div>
          ) : currencyStats.totals.transactions === 0 && currencyStats.totals.collections === 0 ? (
            <EmptyState
              icon={<Coins className="h-10 w-10" />}
              title="No money recorded yet"
              description="Transactions will be broken down by their recorded currency here."
            />
          ) : (
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Currency</TableHead>
                  <TableHead>Countries</TableHead>
                  <TableHead className="text-right">Collections</TableHead>
                  <TableHead className="text-right">Documents</TableHead>
                  <TableHead className="text-right">Transactions</TableHead>
                  <TableHead className="text-right">Users</TableHead>
                  <TableHead className="text-right">Income</TableHead>
                  <TableHead className="text-right">Expenses</TableHead>
                  <TableHead className="text-right">Net</TableHead>
                  {!native ? <TableHead className="text-right">Expenses ({displayCurrency})</TableHead> : null}
                </TableRow>
              </TableHeader>
              <TableBody>
                {currencyStats.currencies
                  .filter(
                    (c) =>
                      c.collections > 0 || c.documents > 0 || c.transactions > 0 || c.income !== 0 || c.expenses !== 0,
                  )
                  .map((c) => (
                    <TableRow key={c.currency}>
                      <TableCell>
                        <Badge variant={c.currency === displayCurrency ? "info" : "neutral"}>{c.currency}</Badge>
                      </TableCell>
                      <TableCell className="text-xs text-zinc-400">
                        {c.countries.length > 0 ? c.countries.join(" · ") : "—"}
                      </TableCell>
                      <TableCell className="text-right text-zinc-300">{formatNumber(c.collections)}</TableCell>
                      <TableCell className="text-right text-zinc-300">{formatNumber(c.documents)}</TableCell>
                      <TableCell className="text-right text-zinc-300">{formatNumber(c.transactions)}</TableCell>
                      <TableCell className="text-right text-zinc-300">{formatNumber(c.users)}</TableCell>
                      <TableCell className="text-right font-semibold text-emerald-400">
                        {formatCurrency(c.income, c.currency)}
                      </TableCell>
                      <TableCell className="text-right font-semibold text-red-400">
                        {formatCurrency(c.expenses, c.currency)}
                      </TableCell>
                      <TableCell
                        className={`text-right font-semibold ${c.net >= 0 ? "text-zinc-100" : "text-red-400"}`}
                      >
                        {formatCurrency(c.net, c.currency)}
                      </TableCell>
                      {!native ? (
                        <TableCell className="text-right text-zinc-400">
                          {formatCurrency(c.displayExpenses, displayCurrency)}
                          {c.currency !== displayCurrency ? (
                            <span className="block text-[11px] text-zinc-600">converted</span>
                          ) : null}
                        </TableCell>
                      ) : null}
                    </TableRow>
                  ))}
              </TableBody>
            </Table>
          )}
        </CardContent>
      </Card>

      {/* Charts */}
      <div className="grid grid-cols-1 gap-4 xl:grid-cols-2">
        <Card>
          <CardHeader>
            <CardTitle>Documents &amp; Transactions by Country</CardTitle>
            <CardDescription>Platform coverage across the six GCC markets</CardDescription>
          </CardHeader>
          <CardContent>
            <div className="h-72">
              <ResponsiveContainer width="100%" height="100%">
                <BarChart data={chartData} margin={{ top: 10, right: 10, left: 0, bottom: 0 }}>
                  <CartesianGrid strokeDasharray="3 3" stroke="#1c1c1f" vertical={false} />
                  <XAxis dataKey="country" tick={{ fill: "#71717a", fontSize: 11 }} axisLine={false} tickLine={false} />
                  <YAxis allowDecimals={false} tick={{ fill: "#71717a", fontSize: 11 }} axisLine={false} tickLine={false} />
                  <Tooltip contentStyle={TOOLTIP_STYLE} cursor={{ fill: "#18181b" }} />
                  <Legend wrapperStyle={{ fontSize: 12, color: "#a1a1aa" }} />
                  <Bar dataKey="Documents" fill="#0070f3" radius={[4, 4, 0, 0]} />
                  <Bar dataKey="Transactions" fill="#0cce6b" radius={[4, 4, 0, 0]} />
                </BarChart>
              </ResponsiveContainer>
            </div>
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle>Income vs Expenses by Country</CardTitle>
            <CardDescription>
              {native ? "All-time, shown as AED-equivalent so the six markets share one axis" : `All-time, converted to ${displayCurrency}`}
            </CardDescription>
          </CardHeader>
          <CardContent>
            {moneyChartData.length === 0 ? (
              <div className="flex h-72 items-center justify-center text-sm text-zinc-600">
                No transactions logged yet
              </div>
            ) : (
              <div className="h-72">
                <ResponsiveContainer width="100%" height="100%">
                  <BarChart data={moneyChartData} margin={{ top: 10, right: 10, left: 0, bottom: 0 }}>
                    <CartesianGrid strokeDasharray="3 3" stroke="#1c1c1f" vertical={false} />
                    <XAxis dataKey="country" tick={{ fill: "#71717a", fontSize: 11 }} axisLine={false} tickLine={false} />
                    <YAxis
                      tick={{ fill: "#71717a", fontSize: 11 }}
                      axisLine={false}
                      tickLine={false}
                      tickFormatter={(v: number) => (v >= 1000 ? `${Math.round(v / 1000)}k` : String(v))}
                    />
                    <Tooltip
                      contentStyle={TOOLTIP_STYLE}
                      formatter={(v) => formatCurrency(Number(v), native ? "AED" : displayCurrency)}
                    />
                    <Legend wrapperStyle={{ fontSize: 12, color: "#a1a1aa" }} />
                    <Bar dataKey="Income" fill="#0cce6b" radius={[4, 4, 0, 0]} />
                    <Bar dataKey="Expenses" fill="#ee4d4d" radius={[4, 4, 0, 0]} />
                  </BarChart>
                </ResponsiveContainer>
              </div>
            )}
          </CardContent>
        </Card>
      </div>

      {/* Currency reference */}
      <Card>
        <CardHeader>
          <CardTitle>GCC Currency Reference</CardTitle>
          <CardDescription>
            Rates used to convert money into {displayCurrency} (pegged USD cross rates; KWD is the only floating one).
          </CardDescription>
        </CardHeader>
        <CardContent>
          <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 xl:grid-cols-3">
            {GCC_COUNTRIES.map((country) => {
              const meta = CURRENCIES[country.currency];
              return (
                <div key={country.code} className="rounded-xl border border-zinc-800 bg-black/40 p-4">
                  <div className="flex items-center justify-between">
                    <span className="flex items-center gap-2 text-sm font-medium text-zinc-200">
                      <span aria-hidden>{country.flag}</span>
                      {country.name}
                    </span>
                    <Badge variant="neutral">{country.currency}</Badge>
                  </div>
                  <p className="mt-2 text-xs text-zinc-500">
                    {meta.name} · {meta.decimals} decimal{meta.decimals > 1 ? "s" : ""}
                  </p>
                  <p className="mt-1 text-xs text-zinc-400">
                    1 {country.currency} ={" "}
                    <span className="font-semibold text-zinc-200">
                      {meta.aedPerUnit.toFixed(fractionDigitsFor("AED") + 2)}
                    </span>{" "}
                    AED
                    {country.currency !== displayCurrency ? (
                      <>
                        {" · "}
                        1 {displayCurrency} ={" "}
                        <span className="font-semibold text-zinc-200">
                          {(1 / meta.aedPerUnit).toFixed(fractionDigitsFor(country.currency) + 2)}
                        </span>{" "}
                        {country.currency}
                      </>
                    ) : null}
                  </p>
                </div>
              );
            })}
          </div>
          <p className="mt-4 text-[11px] leading-relaxed text-zinc-600">
            AED is pegged at 3.6725/USD; SAR (3.75), QAR (3.64), BHD (0.376) and OMR (0.3845) are USD-pegged, so their
            AED cross rates are fixed. KWD floats against a basket — override the default 11.95 AED/KWD with{" "}
            <code className="rounded bg-zinc-900 px-1 font-mono">NEXT_PUBLIC_FX_KWD_AED</code>.
          </p>
        </CardContent>
      </Card>
    </div>
  );
}

function CountryRow({ stat, displayCurrency }: { stat: GccCountryStat; displayCurrency: string }) {
  const isActive = stat.collections > 0 || stat.documents > 0 || stat.transactions > 0;
  return (
    <TableRow className={isActive ? undefined : "opacity-50"}>
      <TableCell>
        <span className="flex items-center gap-2 font-medium text-zinc-100">
          <span aria-hidden>{stat.flag}</span>
          {stat.name}
        </span>
      </TableCell>
      <TableCell>
        <Badge variant={stat.currency === displayCurrency ? "info" : "neutral"}>{stat.currency}</Badge>
      </TableCell>
      <TableCell className="text-right text-zinc-300">{formatNumber(stat.collections)}</TableCell>
      <TableCell className="text-right text-zinc-300">{formatNumber(stat.documents)}</TableCell>
      <TableCell className="text-right">
        {stat.expiringSoon > 0 ? (
          <span className="font-semibold text-amber-400">{formatNumber(stat.expiringSoon)}</span>
        ) : (
          <span className="text-zinc-600">0</span>
        )}
      </TableCell>
      <TableCell className="text-right text-zinc-300">{formatNumber(stat.users)}</TableCell>
      <TableCell className="text-right text-zinc-300">{formatNumber(stat.transactions)}</TableCell>
      <TableCell className="text-right font-semibold text-emerald-400">
        {formatSplit(stat.incomeByCurrency, displayCurrency)}
      </TableCell>
      <TableCell className="text-right font-semibold text-red-400">
        {formatSplit(stat.expensesByCurrency, displayCurrency)}
      </TableCell>
      <TableCell
        className={`text-right font-semibold ${stat.net >= 0 ? "text-zinc-100" : "text-red-400"}`}
      >
        {formatSplit(stat.netByCurrency, displayCurrency)}
      </TableCell>
      <TableCell className="text-right text-zinc-400">
        {formatCurrency(stat.nativeExpenses, stat.currency)}
        {stat.currency !== displayCurrency ? (
          <span className="block text-[11px] text-zinc-600">native</span>
        ) : null}
      </TableCell>
    </TableRow>
  );
}
