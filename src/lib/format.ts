/** Shared UI formatting helpers for the Wazy admin console. */

import {
  type CurrencySplit,
  convertCurrency,
  fractionDigitsFor,
  isNative,
  normalizeCurrency,
  splitEntries,
  splitTotal,
} from "@/lib/currency";

/**
 * Formats a money amount with its currency code (AED, SAR, KWD, QAR, BHD,
 * OMR). GCC currencies carry their own minor units — the three-dinar states
 * (KWD/BHD/OMR) keep 3 decimals — and unknown codes are normalised so an
 * invalid Intl currency never throws. Round amounts still render without
 * decimals, matching the console's compact style.
 */
export function formatCurrency(
  value: number | string | null | undefined,
  currency: string | null | undefined = "AED",
): string {
  const n = toNumber(value);
  const code = normalizeCurrency(currency);
  const maximumFractionDigits = n % 1 === 0 ? 0 : fractionDigitsFor(code);
  try {
    return new Intl.NumberFormat("en-AE", {
      style: "currency",
      currency: code,
      maximumFractionDigits,
      minimumFractionDigits: 0,
    }).format(n);
  } catch {
    // Non-ISO or unsupported currency string — fall back to a plain code prefix.
    return `${code} ${new Intl.NumberFormat("en-AE", { maximumFractionDigits, minimumFractionDigits: 0 }).format(n)}`;
  }
}

/**
 * Renders a multi-currency aggregate for the UI:
 *  - native mode (the console default) → every leg in its own currency:
 *    `AED 1,200 · SAR 300`
 *  - converted → one number in the chosen display currency
 *
 * A split that is entirely zero still renders as a zero in its own currency
 * (falling back to AED when the split holds no currency at all), so KPI cards
 * never show an em dash where a number belongs.
 */
export function formatSplit(
  split: CurrencySplit | undefined,
  display: string | null | undefined,
): string {
  const entries = splitEntries(split);
  if (isNative(display)) {
    if (entries.length > 0) return entries.map(([code, amount]) => formatCurrency(amount, code)).join(" · ");
    const codes = Object.keys(split ?? {});
    return formatCurrency(0, codes.length === 1 ? codes[0] : "AED");
  }
  return formatCurrency(splitTotal(split, display), display);
}

/**
 * `AED 1,200 · SAR 300` for a single figure that has a known currency — used
 * for per-row amounts where the original currency must stay visible.
 */
export function formatCurrencyWithOriginal(
  amount: number,
  originalCurrency: string | null | undefined,
  display: string | null | undefined,
): string {
  const native = formatCurrency(amount, originalCurrency);
  if (isNative(display) || normalizeCurrency(originalCurrency) === normalizeCurrency(display)) return native;
  return `${native} ≈ ${formatCurrency(convertCurrency(amount, originalCurrency, display), display)}`;
}

export function formatNumber(value: number | string | null | undefined): string {
  return new Intl.NumberFormat("en-AE").format(toNumber(value));
}

export function formatBytes(bytes: number | string | null | undefined): string {
  const n = toNumber(bytes);
  if (n <= 0) return "0 B";
  const units = ["B", "KB", "MB", "GB", "TB"];
  const i = Math.min(Math.floor(Math.log(n) / Math.log(1024)), units.length - 1);
  return `${(n / 1024 ** i).toFixed(i === 0 ? 0 : 1)} ${units[i]}`;
}

export function formatDate(value: string | null | undefined): string {
  if (!value) return "—";
  const d = new Date(value);
  if (Number.isNaN(d.getTime())) return "—";
  return d.toLocaleDateString("en-GB", { day: "2-digit", month: "short", year: "numeric" });
}

export function toNumber(value: number | string | null | undefined): number {
  if (typeof value === "number") return Number.isFinite(value) ? value : 0;
  if (typeof value === "string" && value.trim() !== "") {
    const parsed = Number(value);
    return Number.isFinite(parsed) ? parsed : 0;
  }
  return 0;
}

export function monthKey(date: Date | string): string {
  const d = typeof date === "string" ? new Date(date) : date;
  if (Number.isNaN(d.getTime())) return "";
  return `${d.getUTCFullYear()}-${String(d.getUTCMonth() + 1).padStart(2, "0")}`;
}

const MONTH_SHORT = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];

export function monthLabel(key: string): string {
  const [y, m] = key.split("-").map(Number);
  if (!y || !m) return key;
  return `${MONTH_SHORT[m - 1]} ${String(y).slice(2)}`;
}

export function addMonthsToKey(key: string, delta: number): string {
  const [y, m] = key.split("-").map(Number);
  const d = new Date(Date.UTC(y, m - 1 + delta, 1));
  return monthKey(d);
}

export function titleize(value: string | null | undefined): string {
  if (!value) return "—";
  return value
    .replace(/[-_]+/g, " ")
    .replace(/([a-z])([A-Z])/g, "$1 $2")
    .replace(/\s+/g, " ")
    .trim()
    .replace(/\b\w/g, (c) => c.toUpperCase());
}
