"use client";

import { useMemo } from "react";
import {
  Badge,
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
  EmptyState,
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
  Tabs,
  TabsContent,
  TabsList,
  TabsTrigger,
} from "@/components/ui";
import { BudgetBars } from "@/components/finance/budget-bars";
import { EnvelopeCards } from "@/components/finance/envelope-cards";
import { RecurringList } from "@/components/finance/recurring-list";
import { useWazy } from "@/components/providers/data-provider";
import { useDisplayCurrency } from "@/components/providers/currency-provider";
import type { FinanceUserRow } from "@/lib/finance-monitor";
import { formatCurrency, formatDate, formatSplit, toNumber, titleize } from "@/lib/format";
import { convertCurrency, isNative } from "@/lib/currency";

/**
 * Drill-down for one owner's finance footprint: their raw ledger plus their
 * budgets / envelopes / recurring rules, all scoped to that owner. This is
 * how an admin inspects an individual user's data — the platform view stays
 * aggregated instead of dumping every user's rows into one table.
 */
export function UserFinanceDialog({ row, email, onClose }: {
  row: FinanceUserRow;
  email: string | null;
  onClose: () => void;
}) {
  const { data, loading } = useWazy();
  const { currency: displayCurrency } = useDisplayCurrency();

  const transactions = useMemo(
    () =>
      data.transactions
        .filter((t) => t.owner_id === row.ownerId)
        .sort((a, b) => b.occurred_at.localeCompare(a.occurred_at)),
    [data.transactions, row.ownerId],
  );

  return (
    <Dialog open onOpenChange={(open) => !open && onClose()}>
      <DialogContent className="max-w-3xl">
        <DialogHeader>
          <DialogTitle className="truncate">{email ?? `Owner ${shortId(row.ownerId)}`}</DialogTitle>
          <DialogDescription>
            Owner {shortId(row.ownerId)} · {row.transactionsCount} transactions · last entry{" "}
            {formatDate(row.lastEntryAt)} · last activity {formatDate(row.lastLoggedAt)}
          </DialogDescription>
        </DialogHeader>

        <div className="mb-4 grid grid-cols-2 gap-3 sm:grid-cols-4">
          <Stat
            label={isNative(displayCurrency) ? "Income (all)" : `Income (all) · ${displayCurrency}`}
            value={formatSplit(row.incomeTotalByCurrency, displayCurrency)}
            tone="text-emerald-400"
          />
          <Stat
            label={isNative(displayCurrency) ? "Expenses (all)" : `Expenses (all) · ${displayCurrency}`}
            value={formatSplit(row.expensesTotalByCurrency, displayCurrency)}
            tone="text-red-400"
          />
          <Stat
            label={isNative(displayCurrency) ? "Expenses (MTD)" : `Expenses (MTD) · ${displayCurrency}`}
            value={formatSplit(row.expensesThisMonthByCurrency, displayCurrency)}
            tone="text-zinc-100"
          />
          <Stat
            label={isNative(displayCurrency) ? "Saved in envelopes" : `Saved in envelopes · ${displayCurrency}`}
            value={formatSplit(row.savedTotalByCurrency, displayCurrency)}
            tone="text-blue-400"
          />
        </div>

        <Tabs defaultValue="ledger">
          <TabsList className="w-full sm:w-auto">
            <TabsTrigger value="ledger">Ledger</TabsTrigger>
            <TabsTrigger value="budgets">Budgets ({row.budgetsCount})</TabsTrigger>
            <TabsTrigger value="envelopes">Envelopes ({row.envelopesCount})</TabsTrigger>
            <TabsTrigger value="recurring">Recurring ({row.recurringCount})</TabsTrigger>
          </TabsList>

          <TabsContent value="ledger">
            {loading ? (
              <p className="py-8 text-center text-sm text-zinc-500">Loading…</p>
            ) : transactions.length === 0 ? (
              <EmptyState title="No transactions" description="This user has not logged any money movements yet." />
            ) : (
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Date</TableHead>
                    <TableHead>Title</TableHead>
                    <TableHead>Category</TableHead>
                    <TableHead>Kind</TableHead>
                    <TableHead className="text-right">Amount (as recorded)</TableHead>
                    {!isNative(displayCurrency) ? (
                      <TableHead className="text-right">Amount ({displayCurrency})</TableHead>
                    ) : null}
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {transactions.map((t) => (
                    <TableRow key={t.id}>
                      <TableCell>{formatDate(t.occurred_at)}</TableCell>
                      <TableCell>
                        <p className="font-medium text-zinc-100">{t.title}</p>
                        {t.note ? <p className="text-[11px] text-zinc-500">{t.note}</p> : null}
                      </TableCell>
                      <TableCell>{titleize(t.category)}</TableCell>
                      <TableCell>
                        <Badge variant={t.kind === "income" ? "success" : "danger"}>{titleize(t.kind)}</Badge>
                      </TableCell>
                      <TableCell
                        className={t.kind === "income" ? "text-right font-semibold text-emerald-400" : "text-right font-semibold text-red-400"}
                      >
                        {t.kind === "income" ? "+" : "−"}
                        {formatCurrency(t.amount, t.currency)}
                      </TableCell>
                      {!isNative(displayCurrency) ? (
                        <TableCell
                          className={t.kind === "income" ? "text-right font-semibold text-emerald-400" : "text-right font-semibold text-red-400"}
                        >
                          {t.kind === "income" ? "+" : "−"}
                          {formatCurrency(convertCurrency(toNumber(t.amount), t.currency, displayCurrency), displayCurrency)}
                        </TableCell>
                      ) : null}
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            )}
          </TabsContent>

          <TabsContent value="budgets">
            <BudgetBars ownerId={row.ownerId} />
          </TabsContent>
          <TabsContent value="envelopes">
            <EnvelopeCards ownerId={row.ownerId} />
          </TabsContent>
          <TabsContent value="recurring">
            <RecurringList ownerId={row.ownerId} />
          </TabsContent>
        </Tabs>
      </DialogContent>
    </Dialog>
  );
}

function Stat({ label, value, tone }: { label: string; value: string; tone: string }) {
  // Multi-currency splits can be long (`AED 1,200,000 · KWD 300 · SAR 90`) —
  // shrink one step instead of overflowing the pill, and wrap as a fallback.
  const size = value.length <= 18 ? "text-sm" : value.length <= 30 ? "text-xs" : "text-[11px]";
  return (
    <div className="rounded-xl border border-zinc-800 bg-black/40 p-3">
      <p className="break-words text-[11px] uppercase tracking-wider text-zinc-500">{label}</p>
      <p className={`mt-1 break-words font-semibold leading-tight ${size} ${tone}`}>{value}</p>
    </div>
  );
}

function shortId(id: string): string {
  return id.slice(0, 8);
}
