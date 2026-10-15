import type { FinanceTransaction } from "@/lib/types";
import { addMonthsToKey, monthKey, toNumber } from "@/lib/format";
import { convertCurrency, fractionDigitsFor, isNative, normalizeCurrency, resolveRowCurrency } from "@/lib/currency";

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
  /**
   * Currency `amount`/`movingAverage` are expressed in. In native mode (the
   * default) that is the currency the GCC user actually recorded the expenses
   * in — spikes are detected per category *per currency*, so a SAR rent spike
   * is never compared against AED rent. When the admin picks a display
   * currency it is that code instead.
   */
  currency: string;
  title: string;
  message: string;
}

export interface AnomalyOptions {
  /** Threshold ratio above the 3-month moving average to flag (default 0.35 = 35%). */
  threshold?: number;
  /** Number of months of history to scan (default 6). */
  months?: number;
  reference?: Date;
  /**
   * Currency spike amounts/averages are shown in. "native" (default) keeps
   * each spike in the currency it was recorded in; any other code converts.
   */
  displayCurrency?: string | null;
  /** Resolves a row's true currency via its collection (legacy 'AED' stamps
   *  on non-AE collections are overridden — see resolveRowCurrency). */
  currencyForCollection?: (collectionId: string | null | undefined) => string | null | undefined;
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
  const native = isNative(options.displayCurrency);
  const display = normalizeCurrency(options.displayCurrency ?? "AED");
  const endKey = monthKey(reference);
  const windowKeys = new Set<string>();
  for (let i = 1; i <= months; i += 1) windowKeys.add(addMonthsToKey(endKey, -i));

  // Group expenses into one series per (category [, currency]) → month total.
  // In native mode each currency gets its own series so a SAR rent spike is
  // never compared against AED rent — every figure stays in the exact currency
  // the GCC user recorded it in. When a display currency is chosen, rows are
  // converted first and currencies merge into one series per category.
  const currencyFor = options.currencyForCollection;
  const byCategory = new Map<string, Map<string, number>>();
  for (const t of transactions) {
    if (t.kind !== "expense") continue;
    const cat = t.category || "other";
    // True currency — collection-resolved when the stamp is the legacy
    // AED default, so a KWD rent spike is never grouped as AED.
    const currency = normalizeCurrency(resolveRowCurrency(t.currency, t.collection_id, currencyFor));
    const groupKey = native ? `${cat}\u0000${currency}` : cat;
    if (!byCategory.has(groupKey)) byCategory.set(groupKey, new Map());
    const monthMap = byCategory.get(groupKey)!;
    const key = monthKey(t.occurred_at);
    const amount = native ? toNumber(t.amount) : convertCurrency(toNumber(t.amount), currency, display);
    monthMap.set(key, (monthMap.get(key) ?? 0) + amount);
  }

  const anomalies: Anomaly[] = [];

  for (const [groupKey, monthMap] of byCategory) {
    const [category, groupCurrency] = groupKey.split("\u0000");
    // Native mode: report in the series' own currency. Converted: the code.
    const currency = native ? groupCurrency : display;
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
      const rawLabel = category
        .replace(/[-_]+/g, " ")
        .replace(/([a-z])([A-Z])/g, "$1 $2")
        .replace(/\b\w/g, (c) => c.toUpperCase());
      // In native mode the same category can spike in several currencies at
      // once — name the currency so the two alerts never read as duplicates.
      const label = native ? `${rawLabel} (${currency})` : rawLabel;
      const monthLabel = new Date(`${key}-15T00:00:00Z`).toLocaleDateString("en-GB", {
        month: "long",
        year: "numeric",
      });
      const money = (n: number) =>
        n.toLocaleString("en-AE", { minimumFractionDigits: 0, maximumFractionDigits: fractionDigitsFor(currency) });

      anomalies.push({
        // Currency is part of the id in native mode: "rent" spiking in both
        // AED and SAR is two distinct alerts, not one overwriting the other.
        id: native ? `${category}-${currency}-${key}` : `${category}-${key}`,
        transaction:
          transactions.find(
            (t) =>
              t.kind === "expense" &&
              (t.category || "other") === category &&
              (!native ||
                normalizeCurrency(resolveRowCurrency(t.currency, t.collection_id, currencyFor)) === currency) &&
              monthKey(t.occurred_at) === key,
          ) ?? ({} as FinanceTransaction),
        category,
        label,
        month: key,
        monthLabel,
        amount,
        movingAverage,
        ratio,
        pctAboveAvg,
        severity,
        currency,
        title: `${label} spike in ${monthLabel}`,
        message: `${label} expenses in ${monthLabel} were ${pctAboveAvg}% higher than the 3-month moving average (avg ${money(movingAverage)} ${currency}, this month ${money(amount)} ${currency}).`,
      });
    }
  }

  const order: Record<Severity, number> = { severe: 0, moderate: 1, minor: 2 };
  return anomalies.sort((a, b) => order[a.severity] - order[b.severity] || b.pctAboveAvg - a.pctAboveAvg);
}
