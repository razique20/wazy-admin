/**
 * GCC country support for the admin console.
 *
 * Mirrors the mobile app's `lib/models/gcc_country.dart`: six member states,
 * each with its own currency, and `collections.country_code` (added by
 * `supabase/gcc_migration.sql`) telling which state a workspace belongs to.
 * Documents inherit their country from their collection; transactions inherit
 * it from their collection too. Rows with no resolvable country fall back to
 * the location-string heuristics the console used before `country_code`
 * existed, and ultimately to the UAE (the app's default).
 *
 * Every money figure produced here is converted into the caller's display
 * currency (default AED) with the pegged rates in `@/lib/currency`.
 */

import type { Collection, Document, FinanceTransaction, WazyDataBundle } from "@/lib/types";
import {
  type CurrencySplit,
  type GccCurrencyCode,
  GCC_CURRENCY_CODES as GCC_CURRENCY_ALL,
  isGccCurrency,
  normalizeCurrency,
  resolveRowCurrency,
  roundMoney,
  splitAdd,
  splitCodes,
  splitNet,
  splitTotal,
  type MoneyOptions,
} from "@/lib/currency";

export interface GccCountry {
  code: string;
  name: string;
  flag: string;
  /** Native currency of the state (also its default for new collections). */
  currency: GccCurrencyCode;
  phoneCode: string;
}

/** The six GCC member states, in the mobile app's declaration order. */
export const GCC_COUNTRIES: GccCountry[] = [
  { code: "AE", name: "United Arab Emirates", flag: "🇦🇪", currency: "AED", phoneCode: "+971" },
  { code: "SA", name: "Saudi Arabia", flag: "🇸🇦", currency: "SAR", phoneCode: "+966" },
  { code: "KW", name: "Kuwait", flag: "🇰🇼", currency: "KWD", phoneCode: "+965" },
  { code: "QA", name: "Qatar", flag: "🇶🇦", currency: "QAR", phoneCode: "+974" },
  { code: "BH", name: "Bahrain", flag: "🇧🇭", currency: "BHD", phoneCode: "+973" },
  { code: "OM", name: "Oman", flag: "🇴🇲", currency: "OMR", phoneCode: "+968" },
];

/** Short labels used in tables and filters. */
export const GCC_COUNTRY_LABELS: Record<string, string> = {
  AE: "UAE",
  SA: "Saudi Arabia",
  KW: "Kuwait",
  QA: "Qatar",
  BH: "Bahrain",
  OM: "Oman",
};

export const DEFAULT_COUNTRY_CODE = "AE";

export function isGccCountryCode(code: string | null | undefined): boolean {
  const upper = (code ?? "").trim().toUpperCase();
  return GCC_COUNTRIES.some((c) => c.code === upper);
}

/** Resolves any code (or garbage) to a GCC country; unknown codes fall back to the UAE. */
export function countryFromCode(code: string | null | undefined): GccCountry {
  const upper = (code ?? "").trim().toUpperCase();
  return GCC_COUNTRIES.find((c) => c.code === upper) ?? GCC_COUNTRIES[0];
}

/** Native currency for a country code (AED for unknown/missing codes). */
export function currencyForCountry(code: string | null | undefined): GccCurrencyCode {
  return countryFromCode(code).currency;
}

/**
 * Location-string heuristics — kept as the fallback for documents created
 * before `collections.country_code` existed. Matches the previous behaviour
 * of the Collections page (e.g. "Dubai Municipality (Dubai)" ⇒ AE).
 */
export function countryFromLocation(location: string | null | undefined): string | null {
  const loc = (location ?? "").toLowerCase();
  if (!loc) return null;
  if (
    loc.includes("uae") ||
    loc.includes("united arab emirates") ||
    loc.includes("emirates") ||
    loc.includes("dubai") ||
    loc.includes("abu dhabi") ||
    loc.includes("sharjah") ||
    loc.includes("ajman") ||
    loc.includes("umm al quwain") ||
    loc.includes("ras al khaimah") ||
    loc.includes("fujairah")
  ) {
    return "AE";
  }
  if (loc.includes("saudi") || loc.includes("ksa") || loc.includes("riyadh") || loc.includes("jeddah") || loc.includes("dammam") || loc.includes("khobar")) {
    return "SA";
  }
  if (loc.includes("qatar") || loc.includes("doha")) return "QA";
  if (loc.includes("kuwait")) return "KW";
  if (loc.includes("bahrain")) return "BH";
  if (loc.includes("oman") || loc.includes("muscat")) return "OM";
  return null;
}

/** Collection → country code, defaulting to the UAE like the mobile app. */
export function countryForCollection(collection: Collection | undefined | null): string {
  const upper = (collection?.country_code ?? "").trim().toUpperCase();
  if (isGccCountryCode(upper)) return upper;
  return countryFromLocation(upper) ?? DEFAULT_COUNTRY_CODE;
}

/**
 * Country of a document: its collection's `country_code` first, then the
 * location-string heuristics, then the UAE default.
 */
export function countryForDocument(
  doc: Pick<Document, "location" | "collection_id">,
  collections: Collection[],
): string {
  if (doc.collection_id) {
    const collection = collections.find((c) => c.id === doc.collection_id);
    if (collection) return countryForCollection(collection);
  }
  return countryFromLocation(doc.location) ?? DEFAULT_COUNTRY_CODE;
}

/** Country of a finance transaction — always follows its collection. */
export function countryForTransaction(
  tx: Pick<FinanceTransaction, "collection_id">,
  collections: Collection[],
): string {
  if (tx.collection_id) {
    const collection = collections.find((c) => c.id === tx.collection_id);
    if (collection) return countryForCollection(collection);
  }
  return DEFAULT_COUNTRY_CODE;
}

/**
 * Resolver for rows that carry no `currency` column (budgets, envelopes):
 * their collection's country decides the currency. Unknown collections fall
 * back to AED.
 */
export function collectionCurrencyResolver(
  collections: Collection[],
): (collectionId: string | null | undefined) => GccCurrencyCode {
  const currencyByCollection = new Map<string, GccCurrencyCode>();
  for (const c of collections) currencyByCollection.set(c.id, currencyForCountry(countryForCollection(c)));
  return (collectionId) =>
    (collectionId ? currencyByCollection.get(collectionId) : undefined) ?? "AED";
}

/**
 * Resolver for the *spending* currency of a transaction.
 *
 * The collection's own currency wins by default: every collection belongs to
 * one GCC state, so its rows are recorded in that state's currency. The row's
 * `currency` column is only trusted when it records a *different, explicit*
 * non-AED currency (e.g. an admin-created row in a foreign currency).
 *
 * This deliberately ignores a stored "AED" on rows in non-AE collections:
 * older mobile-app versions constructed transactions without passing a
 * currency, so the model/DB default 'AED' was stamped even in Kuwait, Saudi
 * … workspaces. Trusting that stamp made KWD amounts render as AED and then
 * get re-converted — never assume AED for a collection that isn't Emirati.
 */
export function transactionCurrencyResolver(
  collections: Collection[],
): (tx: Pick<FinanceTransaction, "currency" | "collection_id">) => string {
  const collectionCurrency = collectionCurrencyResolver(collections);
  return (tx) => resolveRowCurrency(tx.currency, tx.collection_id, collectionCurrency);
}

export interface GccCountryStat {
  code: string;
  name: string;
  flag: string;
  /** Native currency of the state — money shown per-country is converted to it or to the display currency. */
  currency: GccCurrencyCode;
  collections: number;
  documents: number;
  /** Documents whose expiry is within 30 days (active/renewed excluded). */
  expiringSoon: number;
  transactions: number;
  /** Distinct owners with at least one collection/document/transaction in this country. */
  users: number;
  /** Money figures below are shown in the requested display currency. */
  displayCurrency: string;
  income: number;
  expenses: number;
  net: number;
  /** Same expenses converted to the country's own currency (native view). */
  nativeExpenses: number;
  /** Per-recorded-currency splits — render with formatSplit for exactness. */
  incomeByCurrency: CurrencySplit;
  expensesByCurrency: CurrencySplit;
  netByCurrency: CurrencySplit;
  /** Currency codes actually present in this country's transactions. */
  currencies: string[];
}

export interface GccStats {
  displayCurrency: string;
  countries: GccCountryStat[];
  totals: {
    collections: number;
    documents: number;
    transactions: number;
    users: number;
    income: number;
    expenses: number;
    net: number;
  };
}

/**
 * All platform data rolled up by the currency it was recorded in — the
 * "Default" view on the GCC page. Each row keeps its exact amounts (no FX),
 * so an admin can see how much of the platform's money moves in AED vs SAR
 * vs KWD and so on.
 */
export interface GccCurrencyStat {
  currency: GccCurrencyCode;
  /** GCC states whose collections/transactions use this currency. */
  countries: string[];
  collections: number;
  documents: number;
  transactions: number;
  users: number;
  /** Amounts are in `currency` itself — never converted. */
  income: number;
  expenses: number;
  net: number;
  /** The same expenses expressed in the admin's display currency. */
  displayExpenses: number;
}

export interface GccCurrencyStats {
  displayCurrency: string;
  currencies: GccCurrencyStat[];
  totals: {
    collections: number;
    documents: number;
    transactions: number;
    users: number;
    income: number;
    expenses: number;
    net: number;
    displayExpenses: number;
  };
}

function round2(n: number): number {
  return Math.round(n * 100) / 100;
}

/**
 * Per-GCC-country rollup of documents and finance activity. Used by the GCC
 * Overview page and the dashboard coverage card: the admin can see how much
 * of each market (documents, transactions, money) the platform supports, with
 * every amount converted into the selected display currency.
 */
export function computeGccStats(
  data: Pick<WazyDataBundle, "collections" | "documents" | "transactions">,
  options: MoneyOptions & { reference?: Date } = {},
): GccStats {
  const display = options.displayCurrency ?? "AED";
  const txCurrency = transactionCurrencyResolver(data.collections);

  interface Bucket {
    collections: number;
    documents: number;
    expiringSoon: number;
    transactions: number;
    users: Set<string>;
    income: CurrencySplit;
    expenses: CurrencySplit;
    currencies: Set<string>;
  }
  const buckets = new Map<string, Bucket>();
  const get = (code: string): Bucket => {
    let b = buckets.get(code);
    if (!b) {
      b = {
        collections: 0,
        documents: 0,
        expiringSoon: 0,
        transactions: 0,
        users: new Set(),
        income: {},
        expenses: {},
        currencies: new Set(),
      };
      buckets.set(code, b);
    }
    return b;
  };
  const touch = (code: string, ownerId: string) => get(code).users.add(ownerId);

  const now = options.reference ?? new Date();
  const startOfToday = new Date(now.getFullYear(), now.getMonth(), now.getDate());

  for (const c of data.collections) {
    const code = countryForCollection(c);
    get(code).collections += 1;
    touch(code, c.owner_id);
  }

  for (const d of data.documents) {
    const code = countryForDocument(d, data.collections);
    const b = get(code);
    b.documents += 1;
    touch(code, d.owner_id);
    if (d.expires_at && d.status !== "archived" && d.status !== "renewed") {
      const diff = Math.round((new Date(d.expires_at).getTime() - startOfToday.getTime()) / 86_400_000);
      // "Expiring ≤30d" counts documents that expire within the next 30 days
      // (already-expired docs are excluded — they show up as expired elsewhere).
      if (diff >= 0 && diff <= 30) b.expiringSoon += 1;
    }
  }

  for (const t of data.transactions) {
    const code = countryForTransaction(t, data.collections);
    const b = get(code);
    const currency = txCurrency(t);
    b.transactions += 1;
    touch(code, t.owner_id);
    b.currencies.add(normalizeCurrency(currency));
    // Bucketed in the recorded currency so the native view is exact.
    const amount = Number(t.amount) || 0;
    if (t.kind === "income") splitAdd(b.income, amount, currency);
    else splitAdd(b.expenses, amount, currency);
  }

  const countries: GccCountryStat[] = GCC_COUNTRIES.map((country) => {
    const b = buckets.get(country.code) ?? {
      collections: 0,
      documents: 0,
      expiringSoon: 0,
      transactions: 0,
      users: new Set<string>(),
      income: {},
      expenses: {},
      currencies: new Set<string>(),
    };
    const incomeTotal = splitTotal(b.income, display);
    const expensesTotal = splitTotal(b.expenses, display);
    // "Native" = the same spend expressed in this country's own currency,
    // which is what the mobile app shows its users. Independent of the
    // display currency — the whole point of the column is the local figure.
    const nativeExpenses = splitTotal(b.expenses, country.currency);
    const net = splitNet(b.income, b.expenses);
    return {
      code: country.code,
      name: GCC_COUNTRY_LABELS[country.code] ?? country.name,
      flag: country.flag,
      currency: country.currency,
      collections: b.collections,
      documents: b.documents,
      expiringSoon: b.expiringSoon,
      transactions: b.transactions,
      users: b.users.size,
      displayCurrency: display,
      income: round2(incomeTotal),
      expenses: round2(expensesTotal),
      net: round2(splitTotal(net, display)),
      nativeExpenses: roundMoney(nativeExpenses),
      incomeByCurrency: b.income,
      expensesByCurrency: b.expenses,
      netByCurrency: net,
      currencies: splitCodes(b.expenses).concat(splitCodes(b.income).filter((c) => !splitCodes(b.expenses).includes(c))),
    };
  });

  const totals = countries.reduce(
    (acc, c) => ({
      collections: acc.collections + c.collections,
      documents: acc.documents + c.documents,
      transactions: acc.transactions + c.transactions,
      users: acc.users + c.users,
      income: round2(acc.income + c.income),
      expenses: round2(acc.expenses + c.expenses),
      net: round2(acc.net + c.net),
    }),
    { collections: 0, documents: 0, transactions: 0, users: 0, income: 0, expenses: 0, net: 0 },
  );

  return { displayCurrency: display, countries, totals };
}

/**
 * Rolls the whole platform up by the currency each row was recorded in —
 * the GCC page's "Default" view. Every amount stays in its own currency
 * (no FX applied), so the admin sees the true per-currency volume: how many
 * collections, documents and transactions use AED vs SAR vs KWD …
 */
export function computeGccCurrencyStats(
  data: Pick<WazyDataBundle, "collections" | "documents" | "transactions">,
  options: MoneyOptions = {},
): GccCurrencyStats {
  const display = options.displayCurrency ?? "AED";
  const txCurrency = transactionCurrencyResolver(data.collections);

  interface Bucket {
    collections: number;
    documents: number;
    transactions: number;
    users: Set<string>;
    countries: Set<string>;
    income: CurrencySplit;
    expenses: CurrencySplit;
  }
  const buckets = new Map<string, Bucket>();
  const get = (code: string): Bucket => {
    let b = buckets.get(code);
    if (!b) {
      b = {
        collections: 0,
        documents: 0,
        transactions: 0,
        users: new Set(),
        countries: new Set(),
        income: {},
        expenses: {},
      };
      buckets.set(code, b);
    }
    return b;
  };

  // A collection's own currency decides where its documents/budgets count.
  const collectionBucket = (collectionId: string | null | undefined): Bucket => {
    const collection = data.collections.find((c) => c.id === collectionId);
    return get(collection ? currencyForCountry(countryForCollection(collection)) : "AED");
  };

  for (const c of data.collections) {
    const b = get(currencyForCountry(countryForCollection(c)));
    b.collections += 1;
    b.users.add(c.owner_id);
    b.countries.add(countryForCollection(c));
  }

  for (const d of data.documents) {
    const b = d.collection_id
      ? collectionBucket(d.collection_id)
      : get(currencyForCountry(countryFromLocation(d.location) ?? DEFAULT_COUNTRY_CODE));
    b.documents += 1;
    b.users.add(d.owner_id);
  }

  for (const t of data.transactions) {
    const currency = normalizeCurrency(txCurrency(t));
    const b = get(currency);
    b.transactions += 1;
    b.users.add(t.owner_id);
    b.countries.add(countryForTransaction(t, data.collections));
    const amount = Number(t.amount) || 0;
    if (t.kind === "income") splitAdd(b.income, amount, currency);
    else splitAdd(b.expenses, amount, currency);
  }

  const currencies: GccCurrencyStat[] = GCC_CURRENCY_ALL.map((code) => {
    const b = buckets.get(code) ?? {
      collections: 0,
      documents: 0,
      transactions: 0,
      users: new Set<string>(),
      countries: new Set<string>(),
      income: {},
      expenses: {},
    };
    const incomeTotal = splitTotal(b.income, code);
    const expensesTotal = splitTotal(b.expenses, code);
    const net = splitNet(b.income, b.expenses);
    return {
      currency: code,
      countries: [...b.countries].sort(),
      collections: b.collections,
      documents: b.documents,
      transactions: b.transactions,
      users: b.users.size,
      // Exact, unconverted amounts in the row's own currency.
      income: round2(incomeTotal),
      expenses: round2(expensesTotal),
      net: round2(splitTotal(net, code)),
      // Same spend converted so rows stay comparable when the admin wants it.
      displayExpenses: round2(splitTotal(b.expenses, display)),
    };
  });

  const totals = currencies.reduce(
    (acc, c) => ({
      collections: acc.collections + c.collections,
      documents: acc.documents + c.documents,
      transactions: acc.transactions + c.transactions,
      users: acc.users + c.users,
      income: round2(acc.income + c.income),
      expenses: round2(acc.expenses + c.expenses),
      net: round2(acc.net + c.net),
      displayExpenses: round2(acc.displayExpenses + c.displayExpenses),
    }),
    { collections: 0, documents: 0, transactions: 0, users: 0, income: 0, expenses: 0, net: 0, displayExpenses: 0 },
  );

  return { displayCurrency: display, currencies, totals };
}

/** True when a currency code is one the console can convert (GCC six). */
export { isGccCurrency };
