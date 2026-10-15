"use client";

import { Progress } from "@/components/ui/progress";
import { Card, CardContent, CardDescription, CardHeader, CardTitle, EmptyState } from "@/components/ui/primitives";
import { useWazy } from "@/components/providers/data-provider";
import { useDisplayCurrency } from "@/components/providers/currency-provider";
import { computeBudgetStatuses } from "@/lib/analytics";
import { collectionCurrencyResolver } from "@/lib/gcc";
import { isNative } from "@/lib/currency";
import { formatSplit } from "@/lib/format";
import { cn } from "@/lib/cn";
import { useMemo } from "react";

export function BudgetBars({ ownerId }: { ownerId?: string } = {}) {
  const { data } = useWazy();
  const { currency: displayCurrency } = useDisplayCurrency();
  // When scoped to an owner, only their budgets vs their own spend — the
  // unscoped view would mix every user's limits against platform-wide spend.
  const budgets = ownerId ? data.budgets.filter((b) => b.owner_id === ownerId) : data.budgets;
  const transactions = ownerId ? data.transactions.filter((t) => t.owner_id === ownerId) : data.transactions;
  // Budgets carry no currency column — resolve each collection's GCC currency
  // so SAR limits are compared against SAR spend, both converted to the display
  // currency the admin picked.
  const moneyOpts = useMemo(
    () => ({
      displayCurrency,
      currencyForCollection: collectionCurrencyResolver(data.collections),
    }),
    [displayCurrency, data.collections],
  );
  const statuses = computeBudgetStatuses(budgets, transactions, new Date(), moneyOpts);

  if (statuses.length === 0) {
    return (
      <Card>
        <CardHeader>
          <CardTitle>Category Budgets</CardTitle>
          <CardDescription>Spent vs monthly limit (MTD)</CardDescription>
        </CardHeader>
        <CardContent>
          <EmptyState title="No budgets configured" description="Add rows to category_budgets to track spending limits." />
        </CardContent>
      </Card>
    );
  }

  return (
    <Card>
      <CardHeader>
        <CardTitle>Category Budgets</CardTitle>
        <CardDescription>
          Spent vs monthly limit (MTD{isNative(displayCurrency) ? ", each in its own currency" : `, ${displayCurrency}`}) ·
          warning &gt;80%, danger &gt;100%
        </CardDescription>
      </CardHeader>
      <CardContent className="space-y-4">
        {statuses.map((b) => (
          <div key={b.category}>
            <div className="mb-1.5 flex items-center justify-between text-sm">
              <span className="font-medium text-zinc-100">{b.label}</span>
              <span className="text-xs text-zinc-400">
                {formatSplit(b.spentByCurrency, displayCurrency)} / {formatSplit(b.limitByCurrency, displayCurrency)}
                <span
                  className={cn(
                    "ml-2 font-semibold",
                    b.state === "danger" ? "text-red-400" : b.state === "warning" ? "text-amber-400" : "text-emerald-400",
                  )}
                >
                  {Math.round(b.utilization * 100)}%
                </span>
              </span>
            </div>
            <Progress
              value={Math.min(b.utilization * 100, 100)}
              indicatorClassName={cn(
                b.state === "danger"
                  ? "bg-red-500"
                  : b.state === "warning"
                    ? "bg-amber-500"
                    : "bg-blue-500",
              )}
            />
          </div>
        ))}
      </CardContent>
    </Card>
  );
}
