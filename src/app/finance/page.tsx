"use client";

import { useEffect, useMemo, useState } from "react";
import { Activity, ArrowUpDown, PiggyBank, Receipt, Search, TrendingDown, TrendingUp, Users } from "lucide-react";
import { useWazy } from "@/components/providers/data-provider";
import { KpiCard } from "@/components/dashboard/kpi-card";
import { UserFinanceDialog } from "@/components/finance/user-finance-dialog";
import {
  Badge,
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
  EmptyState,
  Input,
  Skeleton,
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui";
import { computeFinancePlatformTotals, computeFinanceUserRows, type FinanceUserRow } from "@/lib/finance-monitor";
import { formatCurrency, formatDate } from "@/lib/format";
import { cn } from "@/lib/cn";

/**
 * Finance Activity — the admin's monitor for the finance module.
 *
 * Replaces the old cross-user transaction dump: raw per-user rows were
 * meaningless without owner attribution. Now the page leads with platform
 * KPIs (active users, MTD spend, feature adoption), then one rollup row per
 * user, with a click-through dialog for an individual user's ledger.
 */

type SortField = "lastLoggedAt" | "transactionsCount" | "expensesThisMonth" | "expensesTotal" | "ownerId";

interface AuthUser {
  id: string;
  email: string | null;
}

export default function FinancePage() {
  const { data, loading, error, lastUpdated } = useWazy();
  const [authUsers, setAuthUsers] = useState<AuthUser[]>([]);
  const [query, setQuery] = useState("");
  const [sort, setSort] = useState<{ field: SortField; dir: "asc" | "desc" }>({
    field: "lastLoggedAt",
    dir: "desc",
  });
  const [selected, setSelected] = useState<FinanceUserRow | null>(null);

  // Email mapping for owner ids (degrades gracefully to raw ids if the
  // auth-users route is unavailable on this deployment).
  useEffect(() => {
    let cancelled = false;
    void (async () => {
      try {
        const res = await fetch("/api/admin-users", { cache: "no-store" });
        const json = await res.json();
        if (!cancelled) setAuthUsers(json.users ?? []);
      } catch {
        /* keep empty — table falls back to short owner ids */
      }
    })();
    return () => {
      cancelled = true;
    };
  }, []);

  const emailByOwner = useMemo(() => {
    const map = new Map<string, string>();
    for (const u of authUsers) if (u.email) map.set(u.id, u.email);
    return map;
  }, [authUsers]);

  const totals = useMemo(() => computeFinancePlatformTotals(data, new Date()), [data]);
  const rows = useMemo(() => computeFinanceUserRows(data, new Date()), [data]);

  const filteredRows = useMemo(() => {
    const q = query.trim().toLowerCase();
    const filtered = rows.filter((r) => {
      if (!q) return true;
      const email = emailByOwner.get(r.ownerId) ?? "";
      return email.toLowerCase().includes(q) || r.ownerId.toLowerCase().includes(q);
    });
    const dir = sort.dir === "asc" ? 1 : -1;
    return [...filtered].sort((a, b) => {
      switch (sort.field) {
        case "transactionsCount":
          return (a.transactionsCount - b.transactionsCount) * dir;
        case "expensesThisMonth":
          return (a.expensesThisMonth - b.expensesThisMonth) * dir;
        case "expensesTotal":
          return (a.expensesTotal - b.expensesTotal) * dir;
        case "ownerId":
          return (emailByOwner.get(a.ownerId) ?? a.ownerId).localeCompare(emailByOwner.get(b.ownerId) ?? b.ownerId) * dir;
        default:
          return (a.lastLoggedAt ?? "").localeCompare(b.lastLoggedAt ?? "") * dir;
      }
    });
  }, [rows, query, sort, emailByOwner]);

  const toggle = (field: SortField) =>
    setSort((s) => ({ field, dir: s.field === field && s.dir === "asc" ? "desc" : "asc" }));

  if (error) {
    return (
      <Card className="border-red-500/30">
        <CardContent className="pt-5">
          <p className="text-sm font-medium text-red-400">Failed to load finance data</p>
          <p className="mt-1 text-xs text-zinc-400">{error}</p>
        </CardContent>
      </Card>
    );
  }

  const adoptionUsers = Math.max(totals.usersWithBudgets, totals.usersWithEnvelopes, totals.usersWithRecurring);

  return (
    <div className="space-y-4">
      {/* Platform KPIs */}
      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 xl:grid-cols-4">
        <KpiCard
          title="Active Finance Users"
          value={String(totals.activeUsersThisMonth)}
          subvalue={`logged a transaction this month · ${totals.usersWithFinanceData} total with data`}
          icon={<Users className="h-4 w-4" />}
          accent={totals.activeUsersThisMonth > 0 ? "emerald" : "white"}
          loading={loading}
        />
        <KpiCard
          title="Expenses This Month"
          value={formatCurrency(totals.expensesThisMonth)}
          subvalue={`${totals.transactionsThisMonth} transactions MTD · net ${formatCurrency(totals.netThisMonth)}`}
          icon={<TrendingDown className="h-4 w-4" />}
          accent="red"
          loading={loading}
        />
        <KpiCard
          title="Income This Month"
          value={formatCurrency(totals.incomeThisMonth)}
          subvalue={`${totals.transactionsTotal} transactions logged all-time`}
          icon={<TrendingUp className="h-4 w-4" />}
          accent="emerald"
          loading={loading}
        />
        <KpiCard
          title="Users With Budgets"
          value={String(totals.usersWithBudgets)}
          subvalue={`${totals.usersWithEnvelopes} with envelopes · ${totals.usersWithRecurring} with recurring rules · ${adoptionUsers} using tracking tools`}
          icon={<PiggyBank className="h-4 w-4" />}
          accent="blue"
          loading={loading}
        />
      </div>

      {/* Per-user rollup */}
      <Card>
        <CardHeader>
          <div className="flex flex-wrap items-center justify-between gap-3">
            <div>
              <CardTitle>User Finance Activity</CardTitle>
              <CardDescription>
                {rows.length} user{rows.length === 1 ? "" : "s"} with finance data · click a row to inspect their ledger
                {lastUpdated ? ` · updated ${lastUpdated.toLocaleTimeString()}` : ""}
              </CardDescription>
            </div>
            <div className="relative w-full sm:w-72">
              <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-zinc-600" />
              <Input
                className="pl-9"
                placeholder="Search by email or owner id…"
                value={query}
                onChange={(e) => setQuery(e.target.value)}
              />
            </div>
          </div>
        </CardHeader>
        <CardContent>
          {loading && rows.length === 0 ? (
            <div className="space-y-2">
              {Array.from({ length: 6 }).map((_, i) => (
                <Skeleton key={i} className="h-12 w-full" />
              ))}
            </div>
          ) : rows.length === 0 ? (
            <EmptyState
              icon={<Receipt className="h-10 w-10" />}
              title="No finance activity yet"
              description="No user has logged a transaction, budget, envelope, or recurring rule."
            />
          ) : filteredRows.length === 0 ? (
            <EmptyState icon={<Search className="h-10 w-10" />} title="No users match your search" />
          ) : (
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>
                    <SortBtn label="User" field="ownerId" sort={sort} onToggle={() => toggle("ownerId")} />
                  </TableHead>
                  <TableHead>
                    <SortBtn
                      label="Last activity"
                      field="lastLoggedAt"
                      sort={sort}
                      onToggle={() => toggle("lastLoggedAt")}
                    />
                  </TableHead>
                  <TableHead className="text-right">
                    <SortBtn
                      label="Transactions"
                      field="transactionsCount"
                      sort={sort}
                      onToggle={() => toggle("transactionsCount")}
                    />
                  </TableHead>
                  <TableHead className="text-right">
                    <SortBtn
                      label="Spend (MTD)"
                      field="expensesThisMonth"
                      sort={sort}
                      onToggle={() => toggle("expensesThisMonth")}
                    />
                  </TableHead>
                  <TableHead className="text-right">
                    <SortBtn label="Spend (all)" field="expensesTotal" sort={sort} onToggle={() => toggle("expensesTotal")} />
                  </TableHead>
                  <TableHead>Tracking tools</TableHead>
                  <TableHead aria-label="Open" />
                </TableRow>
              </TableHeader>
              <TableBody>
                {filteredRows.map((r) => {
                  const email = emailByOwner.get(r.ownerId) ?? null;
                  const mtdActive = r.transactionsThisMonth > 0;
                  return (
                    <TableRow
                      key={r.ownerId}
                      className="cursor-pointer"
                      onClick={() => setSelected(r)}
                      tabIndex={0}
                      onKeyDown={(e) => {
                        if (e.key === "Enter" || e.key === " ") {
                          e.preventDefault();
                          setSelected(r);
                        }
                      }}
                    >
                      <TableCell>
                        <p className="font-medium text-zinc-100">{email ?? `Owner ${r.ownerId.slice(0, 8)}`}</p>
                        {!email ? (
                          <p className="text-[11px] text-zinc-500">no auth email on record</p>
                        ) : null}
                      </TableCell>
                      <TableCell>
                        <p className="text-zinc-300">{formatDate(r.lastLoggedAt)}</p>
                        <p className="text-[11px] text-zinc-500">last entry {formatDate(r.lastEntryAt)}</p>
                      </TableCell>
                      <TableCell className="text-right">
                        <p className="font-semibold text-zinc-100">{r.transactionsCount}</p>
                        <p className="text-[11px] text-zinc-500">{r.transactionsThisMonth} MTD</p>
                      </TableCell>
                      <TableCell className="text-right">
                        <span className="font-semibold text-red-400">{formatCurrency(r.expensesThisMonth)}</span>
                      </TableCell>
                      <TableCell className="text-right">
                        <span className="font-semibold text-zinc-300">{formatCurrency(r.expensesTotal)}</span>
                        <p className="text-[11px] text-zinc-500">income {formatCurrency(r.incomeTotal)}</p>
                      </TableCell>
                      <TableCell>
                        <div className="flex flex-wrap gap-1">
                          {mtdActive ? <Badge variant="success">active MTD</Badge> : null}
                          {r.budgetsCount > 0 ? <Badge variant="info">{r.budgetsCount} budgets</Badge> : null}
                          {r.envelopesCount > 0 ? <Badge variant="default">{r.envelopesCount} envelopes</Badge> : null}
                          {r.activeRecurring > 0 ? (
                            <Badge variant="neutral">{r.activeRecurring} recurring</Badge>
                          ) : null}
                          {!mtdActive && r.budgetsCount === 0 && r.envelopesCount === 0 && r.activeRecurring === 0 ? (
                            <Badge variant="warning">dormant</Badge>
                          ) : null}
                        </div>
                      </TableCell>
                      <TableCell className="text-right text-zinc-600">
                        <Activity className="ml-auto h-4 w-4" aria-hidden />
                      </TableCell>
                    </TableRow>
                  );
                })}
              </TableBody>
            </Table>
          )}
        </CardContent>
      </Card>

      {selected ? (
        <UserFinanceDialog
          row={selected}
          email={emailByOwner.get(selected.ownerId) ?? null}
          onClose={() => setSelected(null)}
        />
      ) : null}
    </div>
  );
}

function SortBtn({
  label,
  field,
  sort,
  onToggle,
}: {
  label: string;
  field: SortField;
  sort: { field: SortField; dir: "asc" | "desc" };
  onToggle: () => void;
}) {
  const active = sort.field === field;
  return (
    <button
      type="button"
      onClick={onToggle}
      className={cn(
        "flex items-center gap-1 uppercase tracking-wider",
        active ? "text-zinc-200" : "hover:text-zinc-300",
      )}
    >
      {label}
      <ArrowUpDown className={cn("h-3 w-3", active ? "text-zinc-200" : "opacity-40")} />
    </button>
  );
}
