"use client";

import { Progress } from "@/components/ui/progress";
import { Card, CardContent, CardDescription, CardHeader, CardTitle, EmptyState } from "@/components/ui/primitives";
import { useWazy } from "@/components/providers/data-provider";
import { computeBudgetStatuses } from "@/lib/analytics";
import { formatCurrency } from "@/lib/format";
import { cn } from "@/lib/cn";

export function BudgetBars() {
  const { data } = useWazy();
  const statuses = computeBudgetStatuses(data.budgets, data.transactions);

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
        <CardDescription>Spent vs monthly limit (MTD) · warning &gt;80%, danger &gt;100%</CardDescription>
      </CardHeader>
      <CardContent className="space-y-4">
        {statuses.map((b) => (
          <div key={b.category}>
            <div className="mb-1.5 flex items-center justify-between text-sm">
              <span className="font-medium text-zinc-100">{b.label}</span>
              <span className="text-xs text-zinc-400">
                {formatCurrency(b.spent)} / {formatCurrency(b.limit)}
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
