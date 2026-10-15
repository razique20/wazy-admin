import type { Document, FinanceTransaction } from "@/lib/types";
import { addMonthsToKey, monthKey, monthLabel, toNumber } from "@/lib/format";
import {
  type CurrencySplit,
  isNative,
  resolveRowCurrency,
  splitAdd,
  splitEntries,
  splitNet,
  splitTotal,
  type MoneyOptions,
} from "@/lib/currency";

export interface MonthlyCashFlowPoint {
  key: string;
  label: string;
  income: number;
  expenses: number;
  net: number;
  /** Income split by recorded currency (AED/SAR/… — never "native"). */
  incomeByCurrency: CurrencySplit;
  expensesByCurrency: CurrencySplit;
}

export interface ExpenseBreakdownPoint {
  category: string;
  label: string;
  amount: number;
  /** Expense total per recorded currency — renders exactly in native mode. */
  byCurrency: CurrencySplit;
}

export interface RenewalHorizonPoint {
  bucket: "Expired" | "≤ 30 days" | "31–60 days" | "61–90 days" | "90+ days";
  expired: number;
  days30: number;
  days60: number;
  days90: number;
  days90Plus: number;
}

export interface Kpis {
  totalCollections: number;
  personalCollections: number;
  companyCollections: number;
  totalDocuments: number;
  urgentExpiries: number;
  expiredDocuments: number;
  monthlyIncome: number;
  monthlyExpenses: number;
  netCashFlow: number;
  budgetUtilization: number;
  currency: string;
  /** Month-to-date income per recorded currency — renders exactly natively. */
  monthlyIncomeByCurrency: CurrencySplit;
  monthlyExpensesByCurrency: CurrencySplit;
  netCashFlowByCurrency: CurrencySplit;
}

const EXPENSE_COLORS = [
  "#10B981",
  "#06B6D4",
  "#00E5FF",
  "#34D399",
  "#22D3EE",
  "#0EA5E9",
  "#2DD4BF",
  "#38BDF8",
  "#5EEAD4",
  "#67E8F9",
];

export function colorForIndex(i: number): string {
  return EXPENSE_COLORS[i % EXPENSE_COLORS.length];
}

export function labelForCategory(category: string): string {
  return category
    .replace(/[-_]+/g, " ")
    .replace(/([a-z])([A-Z])/g, "$1 $2")
    .replace(/\s+/g, " ")
    .trim()
    .replace(/\b\w/g, (c) => c.toUpperCase());
}

function round2(n: number): number {
  return Math.round(n * 100) / 100;
}

function startOfDay(d: Date): Date {
  return new Date(d.getFullYear(), d.getMonth(), d.getDate());
}

function daysBetween(from: Date, to: Date): number {
  return Math.round((to.getTime() - from.getTime()) / 86_400_000);
}

/** Last `months` months including the current one, oldest first. */
export function buildMonthKeys(endKey: string, months: number): string[] {
  const keys: string[] = [];
  for (let i = months - 1; i >= 0; i -= 1) keys.push(addMonthsToKey(endKey, -i));
  return keys;
}

export function computeMonthlyCashFlow(
  transactions: FinanceTransaction[],
  months = 6,
  reference = new Date(),
  options: MoneyOptions = {},
): MonthlyCashFlowPoint[] {
  const display = options.displayCurrency ?? "AED";
  const currencyFor = options.currencyForCollection;
  const endKey = monthKey(reference);
  const keys = buildMonthKeys(endKey, months);
  const totals = new Map<string, { income: CurrencySplit; expenses: CurrencySplit }>();
  keys.forEach((k) => totals.set(k, { income: {}, expenses: {} }));

  for (const t of transactions) {
    const key = monthKey(t.occurred_at);
    const bucket = totals.get(key);
    if (!bucket) continue;
    // Bucket each row in its true GCC currency — resolved from the collection
    // when the stored stamp is the legacy AED default (see resolveRowCurrency)
    // — so the chart can show every leg exactly, and derive the chart's scalar
    // values in whatever display mode the admin picked.
    const amount = toNumber(t.amount);
    const currency = resolveRowCurrency(t.currency, t.collection_id, currencyFor);
    if (t.kind === "income") splitAdd(bucket.income, amount, currency);
    else splitAdd(bucket.expenses, amount, currency);
  }

  return keys.map((key) => {
    const b = totals.get(key)!;
    const income = round2(splitTotal(b.income, display));
    const expenses = round2(splitTotal(b.expenses, display));
    return {
      key,
      label: monthLabel(key),
      income,
      expenses,
      net: round2(income - expenses),
      incomeByCurrency: b.income,
      expensesByCurrency: b.expenses,
    };
  });
}

export function computeExpenseBreakdown(
  transactions: FinanceTransaction[],
  reference = new Date(),
  options: MoneyOptions = {},
): ExpenseBreakdownPoint[] {
  const display = options.displayCurrency ?? "AED";
  const currencyFor = options.currencyForCollection;
  const key = monthKey(reference);
  const totals = new Map<string, CurrencySplit>();
  for (const t of transactions) {
    if (t.kind !== "expense") continue;
    if (monthKey(t.occurred_at) !== key) continue;
    const category = t.category || "other";
    const split = totals.get(category) ?? {};
    splitAdd(split, toNumber(t.amount), resolveRowCurrency(t.currency, t.collection_id, currencyFor));
    totals.set(category, split);
  }
  return [...totals.entries()]
    .map(([category, split]) => ({
      category,
      label: labelForCategory(category),
      amount: round2(splitTotal(split, display)),
      byCurrency: split,
    }))
    .filter((p) => splitEntries(p.byCurrency).length > 0)
    .sort((a, b) => b.amount - a.amount);
}

export function computeRenewalHorizon(documents: Document[], today = new Date()): RenewalHorizonPoint[] {
  const startOfToday = startOfDay(today);
  const buckets = { expired: 0, days30: 0, days60: 0, days90: 0, days90Plus: 0 };
  for (const doc of documents) {
    if (!doc.expires_at || doc.status === "archived" || doc.status === "renewed") continue;
    const diffDays = daysBetween(startOfToday, startOfDay(new Date(doc.expires_at)));
    if (diffDays < 0) buckets.expired += 1;
    else if (diffDays <= 30) buckets.days30 += 1;
    else if (diffDays <= 60) buckets.days60 += 1;
    else if (diffDays <= 90) buckets.days90 += 1;
    else buckets.days90Plus += 1;
  }

  return [
    { bucket: "Expired", expired: buckets.expired, days30: 0, days60: 0, days90: 0, days90Plus: 0 },
    { bucket: "≤ 30 days", expired: 0, days30: buckets.days30, days60: 0, days90: 0, days90Plus: 0 },
    { bucket: "31–60 days", expired: 0, days30: 0, days60: buckets.days60, days90: 0, days90Plus: 0 },
    { bucket: "61–90 days", expired: 0, days30: 0, days60: 0, days90: buckets.days90, days90Plus: 0 },
    { bucket: "90+ days", expired: 0, days30: 0, days60: 0, days90: 0, days90Plus: buckets.days90Plus },
  ];
}

export interface BudgetStatus {
  category: string;
  label: string;
  spent: number;
  limit: number;
  utilization: number;
  state: "ok" | "warning" | "danger";
  /** Spend per recorded currency — renders exactly in native mode. */
  spentByCurrency: CurrencySplit;
  /** Limit per currency (a limit is single-currency: its collection's). */
  limitByCurrency: CurrencySplit;
}

export function computeBudgetStatuses(
  budgets: { category: string; monthly_limit: number | string; collection_id?: string | null }[],
  transactions: FinanceTransaction[],
  reference = new Date(),
  options: MoneyOptions = {},
): BudgetStatus[] {
  const display = options.displayCurrency ?? "AED";
  const currencyFor = options.currencyForCollection;
  const key = monthKey(reference);
  const spentByCategory = new Map<string, CurrencySplit>();
  for (const t of transactions) {
    if (t.kind !== "expense") continue;
    if (monthKey(t.occurred_at) !== key) continue;
    const category = t.category || "other";
    const split = spentByCategory.get(category) ?? {};
    splitAdd(split, toNumber(t.amount), resolveRowCurrency(t.currency, t.collection_id, currencyFor));
    spentByCategory.set(category, split);
  }

  return budgets.map((b) => {
    // Budget limits carry no currency column — they live in the collection's
    // GCC currency, so resolve it before comparing against recorded spend.
    const limitCurrency = options.currencyForCollection?.(b.collection_id) ?? "AED";
    const limitSplit: CurrencySplit = {};
    splitAdd(limitSplit, toNumber(b.monthly_limit), limitCurrency);
    const spentSplit = spentByCategory.get(b.category) ?? {};
    const limit = splitTotal(limitSplit, display);
    const spent = splitTotal(spentSplit, display);
    const utilization = limit > 0 ? spent / limit : 0;
    const state: BudgetStatus["state"] = utilization > 1 ? "danger" : utilization > 0.8 ? "warning" : "ok";
    return {
      category: b.category,
      label: labelForCategory(b.category),
      spent: round2(spent),
      limit: round2(limit),
      utilization,
      state,
      spentByCurrency: spentSplit,
      limitByCurrency: limitSplit,
    };
  });
}

export function computeOverallBudgetUtilization(
  budgets: { category: string; monthly_limit: number | string; collection_id?: string | null }[],
  transactions: FinanceTransaction[],
  reference = new Date(),
  options: MoneyOptions = {},
): number {
  const statuses = computeBudgetStatuses(budgets, transactions, reference, options);
  const totalLimit = statuses.reduce((s, b) => s + b.limit, 0);
  const totalSpent = statuses.reduce((s, b) => s + b.spent, 0);
  return totalLimit > 0 ? totalSpent / totalLimit : 0;
}

function currentMonthTotals(
  transactions: FinanceTransaction[],
  reference: Date,
  display: string,
  currencyFor?: (collectionId: string | null | undefined) => string | null | undefined,
) {
  const key = monthKey(reference);
  const income: CurrencySplit = {};
  const expenses: CurrencySplit = {};
  for (const t of transactions) {
    if (monthKey(t.occurred_at) !== key) continue;
    const amount = toNumber(t.amount);
    const currency = resolveRowCurrency(t.currency, t.collection_id, currencyFor);
    if (t.kind === "income") splitAdd(income, amount, currency);
    else splitAdd(expenses, amount, currency);
  }
  const incomeTotal = splitTotal(income, display);
  const expenseTotal = splitTotal(expenses, display);
  return {
    income: round2(incomeTotal),
    expenses: round2(expenseTotal),
    incomeByCurrency: income,
    expensesByCurrency: expenses,
  };
}

export function computeKpis(
  args: {
    collections: { is_personal: boolean }[];
    documents: Document[];
    transactions: FinanceTransaction[];
    budgets: { category: string; monthly_limit: number | string; collection_id?: string | null }[];
  },
  reference = new Date(),
  options: MoneyOptions = {},
): Kpis {
  const { collections, documents, transactions, budgets } = args;
  const display = options.displayCurrency ?? "AED";
  const monthly = currentMonthTotals(transactions, reference, display, options.currencyForCollection);
  const startOfToday = startOfDay(reference);

  let urgentExpiries = 0;
  let expiredDocuments = 0;
  for (const doc of documents) {
    if (!doc.expires_at || doc.status === "archived" || doc.status === "renewed") continue;
    const diffDays = daysBetween(startOfToday, startOfDay(new Date(doc.expires_at)));
    if (diffDays < 0) expiredDocuments += 1;
    else if (diffDays <= 30) urgentExpiries += 1;
  }

  return {
    totalCollections: collections.length,
    personalCollections: collections.filter((c) => c.is_personal).length,
    companyCollections: collections.filter((c) => !c.is_personal).length,
    totalDocuments: documents.length,
    urgentExpiries,
    expiredDocuments,
    monthlyIncome: monthly.income,
    monthlyExpenses: monthly.expenses,
    netCashFlow: round2(monthly.income - monthly.expenses),
    budgetUtilization: computeOverallBudgetUtilization(budgets, transactions, reference, options),
    currency: isNative(display) ? "native" : display,
    monthlyIncomeByCurrency: monthly.incomeByCurrency,
    monthlyExpensesByCurrency: monthly.expensesByCurrency,
    netCashFlowByCurrency: splitNet(monthly.incomeByCurrency, monthly.expensesByCurrency),
  };
}
