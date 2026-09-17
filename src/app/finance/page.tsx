"use client";

import { useMemo, useState } from "react";
import { ArrowUpDown, Search, Wallet } from "lucide-react";
import { useWazy } from "@/components/providers/data-provider";
import { BudgetBars } from "@/components/finance/budget-bars";
import { EnvelopeCards } from "@/components/finance/envelope-cards";
import { RecurringList } from "@/components/finance/recurring-list";
import {
  Badge,
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
  EmptyState,
  Input,
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
  Skeleton,
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui";
import { formatCurrency, formatDate, titleize } from "@/lib/format";
import { cn } from "@/lib/cn";

type SortField = "occurred_at" | "amount" | "title";

export default function FinancePage() {
  const { data, loading, error } = useWazy();
  const [query, setQuery] = useState("");
  const [kind, setKind] = useState("all");
  const [category, setCategory] = useState("all");
  const [sort, setSort] = useState<{ field: SortField; dir: "asc" | "desc" }>({ field: "occurred_at", dir: "desc" });

  const categories = useMemo(
    () => [...new Set(data.transactions.map((t) => t.category))].sort(),
    [data.transactions],
  );

  const rows = useMemo(() => {
    const q = query.trim().toLowerCase();
    const filtered = data.transactions.filter((t) => {
      if (q && !`${t.title} ${t.note ?? ""}`.toLowerCase().includes(q)) return false;
      if (kind !== "all" && t.kind !== kind) return false;
      if (category !== "all" && t.category !== category) return false;
      return true;
    });
    const dir = sort.dir === "asc" ? 1 : -1;
    return filtered.sort((a, b) => {
      if (sort.field === "amount") return (Number(a.amount) - Number(b.amount)) * dir;
      if (sort.field === "title") return a.title.localeCompare(b.title) * dir;
      return a.occurred_at.localeCompare(b.occurred_at) * dir;
    });
  }, [data.transactions, query, kind, category, sort]);

  const totals = useMemo(() => {
    let income = 0;
    let expenses = 0;
    for (const t of rows) {
      if (t.kind === "income") income += Number(t.amount);
      else expenses += Number(t.amount);
    }
    return { income, expenses, net: income - expenses };
  }, [rows]);

  const toggle = (field: SortField) =>
    setSort((s) => ({ field, dir: s.field === field && s.dir === "asc" ? "desc" : "asc" }));

  if (error) {
    return (
      <Card className="border-red-500/30">
        <CardContent className="pt-5">
          <p className="text-sm font-medium text-red-400">Failed to load ledger</p>
          <p className="mt-1 text-xs text-zinc-400">{error}</p>
        </CardContent>
      </Card>
    );
  }

  return (
    <div className="space-y-4">
      {/* Ledger */}
      <Card>
        <CardHeader>
          <div className="flex flex-wrap items-center justify-between gap-3">
            <div>
              <CardTitle>Finance & Expense Ledger</CardTitle>
              <CardDescription>
                {rows.length} of {data.transactions.length} transactions · income {formatCurrency(totals.income)} ·
                expenses {formatCurrency(totals.expenses)} · net {formatCurrency(totals.net)}
              </CardDescription>
            </div>
          </div>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="grid grid-cols-1 gap-3 md:grid-cols-4">
            <div className="relative md:col-span-2">
              <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-zinc-600" />
              <Input
                className="pl-9"
                placeholder="Search title or note…"
                value={query}
                onChange={(e) => setQuery(e.target.value)}
              />
            </div>
            <Select value={kind} onValueChange={setKind}>
              <SelectTrigger>
                <SelectValue placeholder="Kind" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">All kinds</SelectItem>
                <SelectItem value="expense">Expense</SelectItem>
                <SelectItem value="income">Income</SelectItem>
              </SelectContent>
            </Select>
            <Select value={category} onValueChange={setCategory}>
              <SelectTrigger>
                <SelectValue placeholder="Category" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">All categories</SelectItem>
                {categories.map((c) => (
                  <SelectItem key={c} value={c}>
                    {titleize(c)}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>

          {loading ? (
            <div className="space-y-2">
              {Array.from({ length: 6 }).map((_, i) => (
                <Skeleton key={i} className="h-12 w-full" />
              ))}
            </div>
          ) : rows.length === 0 ? (
            <EmptyState icon={<Wallet className="h-10 w-10" />} title="No transactions found" />
          ) : (
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>
                    <SortBtn label="Date" field="occurred_at" sort={sort} onToggle={() => toggle("occurred_at")} />
                  </TableHead>
                  <TableHead>
                    <SortBtn label="Title" field="title" sort={sort} onToggle={() => toggle("title")} />
                  </TableHead>
                  <TableHead>Category</TableHead>
                  <TableHead>Kind</TableHead>
                  <TableHead className="text-right">
                    <SortBtn label="Amount" field="amount" sort={sort} onToggle={() => toggle("amount")} />
                  </TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {rows.map((t) => (
                  <TableRow key={t.id}>
                    <TableCell>{formatDate(t.occurred_at)} </TableCell>
                    <TableCell>
                      <p className="font-medium text-zinc-100">{t.title}</p>
                      {t.note ? <p className="text-[11px] text-zinc-500">{t.note}</p> : null}
                    </TableCell>
                    <TableCell>{titleize(t.category)}</TableCell>
                    <TableCell>
                      <Badge variant={t.kind === "income" ? "success" : "danger"}>{titleize(t.kind)}</Badge>
                    </TableCell>
                    <TableCell className="text-right">
                      <span className={t.kind === "income" ? "font-semibold text-emerald-400" : "font-semibold text-red-400"}>
                        {t.kind === "income" ? "+" : "−"}
                        {formatCurrency(t.amount, t.currency)}
                      </span>
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          )}
        </CardContent>
      </Card>

      {/* Budgets / Envelopes */}
      <div className="grid grid-cols-1 gap-4 xl:grid-cols-2">
        <BudgetBars />
        <EnvelopeCards />
      </div>

      <RecurringList />
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
      <ArrowUpDown className={active ? "h-3 w-3 text-zinc-200" : "h-3 w-3 opacity-40"} />
    </button>
  );
}
