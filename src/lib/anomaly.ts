import type { FinanceTransaction } from "@/lib/types";
import { addMonthsToKey, monthKey, toNumber } from "@/lib/format";

export type Severity = "minor" | "moderate" | "severe";

export interface Anomaly {
  id: string;
  transaction: FinanceTransaction;
  category: string;
  label: string;
  month: string;
  monthLabel: string;
  amount: number;
  movingAverage: number;
  ratio: number;
  pctAboveAvg: number;
  severity: Severity;
  title: string;
  message: string;
}

export interface AnomalyOptions {
  /** Threshold ratio above the 3-month moving average to flag (default 0.35 = 35%). */
  threshold?: number;
  /** Number of months of history to scan (default 6). */
  months?: number;
  reference?: Date;
}

const SEVERITY_RULES: { severity: Severity; minRatio: number }[] = [
  { severity: "severe", minRatio: 1.0 },
  { severity: "moderate", minRatio: 0.6 },
  { severity: "minor", minRatio: 0.35 },
];

export function severityFor(pctAboveAvg: number, threshold: number): Severity {
  for (const rule of SEVERITY_RULES) {
    if (pctAboveAvg >= Math.max(rule.minRatio, threshold)) return rule.severity;
  }
  return "minor";
}

/**
 * Detects expense spikes: an expense in a month that exceeds its category's
 * 3-month moving average (of prior months) by more than `threshold` (default 35%).
 */
export function detectAnomalies(
  transactions: FinanceTransaction[],
  options: AnomalyOptions = {},
): Anomaly[] {
  const { threshold = 0.35, months = 6, reference = new Date() } = options;
  const endKey = monthKey(reference);
  const windowKeys = new Set<string>();
  for (let i = 1; i <= months; i += 1) windowKeys.add(addMonthsToKey(endKey, -i));

  // Group expenses by category -> monthKey -> total.
  const byCategory = new Map<string, Map<string, number>>();
  for (const t of transactions) {
    if (t.kind !== "expense") continue;
    const cat = t.category || "other";
    if (!byCategory.has(cat)) byCategory.set(cat, new Map());
    const monthMap = byCategory.get(cat)!;
    const key = monthKey(t.occurred_at);
    monthMap.set(key, (monthMap.get(key) ?? 0) + toNumber(t.amount));
  }

  const anomalies: Anomaly[] = [];

  for (const [category, monthMap] of byCategory) {
    const keys = [...monthMap.keys()].sort();
    for (const key of keys) {
      if (!windowKeys.has(key)) continue;

      // 3-month moving average of the three months prior to `key`.
      // Zero months (no bills) are excluded so sporadic billing cycles don't
      // create artificially low baselines.
      const prior = [1, 2, 3].map((i) => monthMap.get(addMonthsToKey(key, -i)) ?? 0);
      const nonZeroPrior = prior.filter((v) => v > 0);
      // Require at least two months of history to establish a baseline.
      if (nonZeroPrior.length < 2) continue;
      const movingAverage = nonZeroPrior.reduce((s, v) => s + v, 0) / nonZeroPrior.length;
      if (movingAverage <= 0) continue;

      const amount = monthMap.get(key) ?? 0;
      const ratio = amount / movingAverage - 1;
      if (ratio <= threshold) continue;

      const pctAboveAvg = Math.round(ratio * 100);
      const severity = severityFor(ratio, threshold);
      const label = category
        .replace(/[-_]+/g, " ")
        .replace(/([a-z])([A-Z])/g, "$1 $2")
        .replace(/\b\w/g, (c) => c.toUpperCase());
      const monthLabel = new Date(`${key}-15T00:00:00Z`).toLocaleDateString("en-GB", {
        month: "long",
        year: "numeric",
      });

      anomalies.push({
        id: `${category}-${key}`,
        transaction: transactions.find((t) => t.kind === "expense" && (t.category || "other") === category && monthKey(t.occurred_at) === key) ?? ({} as FinanceTransaction),
        category,
        label,
        month: key,
        monthLabel,
        amount,
        movingAverage,
        ratio,
        pctAboveAvg,
        severity,
        title: `${label} spike in ${monthLabel}`,
        message: `${label} expenses in ${monthLabel} were ${pctAboveAvg}% higher than the 3-month moving average (avg ${movingAverage.toLocaleString("en-AE", { maximumFractionDigits: 0 })} AED, this month ${amount.toLocaleString("en-AE", { maximumFractionDigits: 0 })} AED).`,
      });
    }
  }

  const order: Record<Severity, number> = { severe: 0, moderate: 1, minor: 2 };
  return anomalies.sort((a, b) => order[a.severity] - order[b.severity] || b.pctAboveAvg - a.pctAboveAvg);
}
