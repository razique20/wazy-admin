/**
 * GCC multi-currency support for the admin console.
 *
 * The Flutter app (lib/models/gcc_country.dart) lets every collection live in
 * one of the six GCC currencies (AED, SAR, KWD, QAR, BHD, OMR) and stamps each
 * transaction with its own `currency` column. The console therefore must never
 * assume AED: money rows are converted through the rates below before they are
 * aggregated, compared or charted.
 *
 * Rates are the USD-peg cross rates. The AED is pegged at 3.6725/USD and the
 * other five GCC currencies are pegged to the USD as well, so their AED cross
 * rates are fixed:
 *
 *   SAR 3.75/USD     → 3.6725 / 3.75    = 0.979333 AED per SAR
 *   QAR 3.64/USD     → 3.6725 / 3.64    = 1.008929 AED per QAR
 *   BHD 0.376/USD    → 3.6725 / 0.376   = 9.767287 AED per BHD
 *   OMR 0.3845/USD   → 3.6725 / 0.3845  = 9.551365 AED per OMR
 *
 * The KWD is pegged to an undisclosed currency basket instead, so it floats
 * slightly against the USD; the console uses 11.95 AED per KWD by default and
 * deployments can override it with NEXT_PUBLIC_FX_KWD_AED.
 */

export type GccCurrencyCode = "AED" | "SAR" | "KWD" | "QAR" | "BHD" | "OMR";

export interface CurrencyMeta {
  code: GccCurrencyCode;
  /** ISO 3166-1 alpha-2 code of the GCC state that issues the currency. */
  country: string;
  name: string;
  /** Minor units kept when formatting (KWD/BHD/OMR use 3 decimals). */
  decimals: number;
  /** Value of one unit of this currency in AED. */
  aedPerUnit: number;
}

/** Numeric override for the KWD/AED rate (the only non-pegged GCC currency). */
function kwdAedRate(): number {
  const raw = typeof process !== "undefined" ? process.env?.NEXT_PUBLIC_FX_KWD_AED : undefined;
  const parsed = raw != null && raw.trim() !== "" ? Number(raw) : Number.NaN;
  return Number.isFinite(parsed) && parsed > 0 ? parsed : 11.95;
}

export const CURRENCIES: Record<GccCurrencyCode, CurrencyMeta> = {
  AED: { code: "AED", country: "AE", name: "UAE Dirham", decimals: 2, aedPerUnit: 1 },
  SAR: { code: "SAR", country: "SA", name: "Saudi Riyal", decimals: 2, aedPerUnit: 3.6725 / 3.75 },
  KWD: { code: "KWD", country: "KW", name: "Kuwaiti Dinar", decimals: 3, aedPerUnit: kwdAedRate() },
  QAR: { code: "QAR", country: "QA", name: "Qatari Riyal", decimals: 2, aedPerUnit: 3.6725 / 3.64 },
  BHD: { code: "BHD", country: "BH", name: "Bahraini Dinar", decimals: 3, aedPerUnit: 3.6725 / 0.376 },
  OMR: { code: "OMR", country: "OM", name: "Omani Rial", decimals: 3, aedPerUnit: 3.6725 / 0.3845 },
};

/** Display order used by the console selectors (AED first, the base currency). */
export const GCC_CURRENCY_CODES: GccCurrencyCode[] = ["AED", "SAR", "KWD", "QAR", "BHD", "OMR"];

/** Uppercased/truncated currency code; empty or invalid input falls back to AED. */
export function normalizeCurrency(raw: string | null | undefined): string {
  const code = (raw ?? "").trim().toUpperCase();
  return code === "" ? "AED" : code;
}

export function isGccCurrency(code: string | null | undefined): code is GccCurrencyCode {
  const raw = (code ?? "").trim().toUpperCase();
  // No code at all is not a GCC currency — callers that want the AED default
  // should normalizeCurrency() first.
  if (raw === "") return false;
  return Object.prototype.hasOwnProperty.call(CURRENCIES, raw);
}

/** Minor units used for a currency when formatting (default 2). */
export function fractionDigitsFor(currency: string | null | undefined): number {
  const code = normalizeCurrency(currency);
  return isGccCurrency(code) ? CURRENCIES[code].decimals : 2;
}

/**
 * How many units of AED one unit of `currency` is worth. Unknown (non-GCC)
 * currencies return 1 so their amounts pass through unconverted instead of
 * being silently distorted — they are displayed in their own code.
 */
export function aedRateFor(currency: string | null | undefined): number {
  const code = normalizeCurrency(currency);
  return isGccCurrency(code) ? CURRENCIES[code].aedPerUnit : 1;
}

/** Converts `amount` from `from` into AED. */
export function toAed(amount: number, from: string | null | undefined): number {
  return amount * aedRateFor(from);
}

/** Converts `amount` from AED into `to`. */
export function fromAed(amount: number, to: string | null | undefined): number {
  return amount / aedRateFor(to);
}

/** Converts `amount` from one currency into another (GCC pairs only). */
export function convertCurrency(
  amount: number,
  from: string | null | undefined,
  to: string | null | undefined,
): number {
  const source = normalizeCurrency(from);
  // "native" means "keep the recorded currency" — no conversion.
  if (isNative(to)) return amount;
  const target = normalizeCurrency(to);
  if (source === target) return amount;
  return fromAed(toAed(amount, source), target);
}

/** Rounds to 2 decimals — the console's canonical money rounding. */
export function roundMoney(n: number): number {
  return Math.round(n * 100) / 100;
}

/**
 * Display-currency value meaning "do not convert": show every figure in the
 * exact currency the GCC user recorded it in inside the mobile app.
 *
 * This is the console default. Pick a real code (AED, SAR, …) instead to have
 * every aggregate converted into that one currency.
 */
export const NATIVE_CURRENCY = "native";

/** True when the admin chose the "as recorded" (per-row currency) view. */
export function isNative(currency: string | null | undefined): boolean {
  return (currency ?? "").trim().toLowerCase() === NATIVE_CURRENCY;
}

/**
 * Every value the display-currency selector offers: the "Default — as
 * recorded" option (each figure in the exact currency the GCC user logged it
 * in) followed by the six single-currency views.
 */
export const DISPLAY_CURRENCY_OPTIONS: string[] = [NATIVE_CURRENCY, ...GCC_CURRENCY_CODES];

/**
 * Per-currency bucket used for every aggregate that may mix GCC currencies.
 * Keyed by currency code (`AED`, `SAR`, …) — never by "native".
 */
export type CurrencySplit = Record<string, number>;

/** Adds `amount` (recorded in `currency`) into a split. */
export function splitAdd(
  split: CurrencySplit,
  amount: number,
  currency: string | null | undefined,
): void {
  const code = normalizeCurrency(currency);
  split[code] = (split[code] ?? 0) + amount;
}

/**
 * Split entries ordered by absolute magnitude, dropping near-zero values.
 * Returned as tuples so callers can format each leg in its own currency.
 */
export function splitEntries(split: CurrencySplit | undefined): [string, number][] {
  if (!split) return [];
  return Object.entries(split)
    .filter(([, v]) => Math.abs(v) > 1e-9)
    .sort((a, b) => Math.abs(b[1]) - Math.abs(a[1]));
}

/**
 * Single-number value of a split in `display`.
 *
 * For a real display currency this is the converted sum. For "native" there
 * is no meaningful single number across currencies, so the AED-equivalent is
 * returned as an internal fallback — it is used for sorting and sign checks
 * only; the UI must render `formatSplit` instead.
 */
export function splitTotal(split: CurrencySplit | undefined, display: string | null | undefined): number {
  if (!split) return 0;
  let total = 0;
  for (const [code, amount] of Object.entries(split)) {
    total += isNative(display) ? toAed(amount, code) : convertCurrency(amount, code, display);
  }
  return total;
}

/** `income − expenses` per currency — currencies never cancel across codes. */
export function splitNet(income: CurrencySplit | undefined, expenses: CurrencySplit | undefined): CurrencySplit {
  const net: CurrencySplit = {};
  for (const [code, amount] of Object.entries(income ?? {})) net[code] = (net[code] ?? 0) + amount;
  for (const [code, amount] of Object.entries(expenses ?? {})) net[code] = (net[code] ?? 0) - amount;
  return net;
}

/** Currency codes present in a split, largest absolute value first. */
export function splitCodes(split: CurrencySplit | undefined): string[] {
  return splitEntries(split).map(([code]) => code);
}

// `formatSplit` (renders a CurrencySplit for the UI) lives in @/lib/format —
// it needs formatCurrency, and format.ts already depends on this module.

/**
 * Options accepted by every money-aggregating helper in the console:
 * which currency to display amounts in, and how to resolve the currency of
 * rows that carry no `currency` column (budgets, envelopes) from their
 * collection's GCC country.
 */
export interface MoneyOptions {
  /**
   * Currency money figures are shown in. `NATIVE_CURRENCY` ("native", the
   * console default) keeps every amount in the exact currency the GCC user
   * recorded it in; any other code converts all aggregates into it.
   * Omitting the option behaves like AED (library default).
   */
  displayCurrency?: string | null;
  /** Resolves the currency of a row via its collection (country_code → currency). */
  currencyForCollection?: (collectionId: string | null | undefined) => string | null | undefined;
}

/**
 * True currency of a transaction row, given its stored `currency` column and
 * the collection it belongs to.
 *
 * The collection's currency wins whenever the stored value is empty **or the
 * bare default 'AED'** — every collection lives in exactly one GCC state, so
 * its rows are recorded in that state's currency. Older mobile-app builds
 * constructed transactions without passing a currency, so the model/DB
 * default 'AED' got stamped even in Kuwaiti, Saudi … workspaces; trusting it
 * made KWD amounts render as AED and then be converted *again* when a display
 * currency was picked. An explicit non-AED stamp (the current app always
 * writes one) is still honoured, so genuinely foreign-currency rows inside a
 * collection keep their code.
 */
export function resolveRowCurrency(
  currency: string | null | undefined,
  collectionId: string | null | undefined,
  currencyForCollection?: (collectionId: string | null | undefined) => string | null | undefined,
): string {
  const code = (currency ?? "").trim().toUpperCase();
  if (code !== "" && code !== "AED") return code;
  const owned = (currencyForCollection?.(collectionId) ?? "").trim().toUpperCase();
  return owned !== "" ? owned : "AED";
}
