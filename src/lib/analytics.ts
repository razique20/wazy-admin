import type { Document, FinanceTransaction } from "@/lib/types";
import { addMonthsToKey, monthKey, monthLabel, toNumber } from "@/lib/format";

export interface MonthlyCashFlowPoint {
  key: string;
  label: string;
  income: number;
  expenses: number;
  net: number;
}

export interface ExpenseBreakdownPoint {
  category: string;
  label: string;
  amount: number;
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
): MonthlyCashFlowPoint[] {
  const endKey = monthKey(reference);
  const keys = buildMonthKeys(endKey, months);
  const totals = new Map<string, { income: number; expenses: number }>();
  keys.forEach((k) => totals.set(k, { income: 0, expenses: 0 }));

  for (const t of transactions) {
    const key = monthKey(t.occurred_at);
    const bucket = totals.get(key);
    if (!bucket) continue;
    const amount = toNumber(t.amount);
    if (t.kind === "income") bucket.income += amount;
    else bucket.expenses += amount;
  }

  return keys.map((key) => {
    const b = totals.get(key)!;
    return {
      key,
      label: monthLabel(key),
      income: round2(b.income),
      expenses: round2(b.expenses),
      net: round2(b.income - b.expenses),
    };
  });
}

export function computeExpenseBreakdown(
  transactions: FinanceTransaction[],
  reference = new Date(),
): ExpenseBreakdownPoint[] {
  const key = monthKey(reference);
  const totals = new Map<string, number>();
  for (const t of transactions) {
    if (t.kind !== "expense") continue;
    if (monthKey(t.occurred_at) !== key) continue;
    const category = t.category || "other";
    totals.set(category, (totals.get(category) ?? 0) + toNumber(t.amount));
  }
  return [...totals.entries()]
    .map(([category, amount]) => ({ category, label: labelForCategory(category), amount: round2(amount) }))
    .filter((p) => p.amount > 0)
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
}

export function computeBudgetStatuses(
  budgets: { category: string; monthly_limit: number | string }[],
  transactions: FinanceTransaction[],
  reference = new Date(),
): BudgetStatus[] {
  const key = monthKey(reference);
  const spentByCategory = new Map<string, number>();
  for (const t of transactions) {
    if (t.kind !== "expense") continue;
    if (monthKey(t.occurred_at) !== key) continue;
    const category = t.category || "other";
    spentByCategory.set(category, (spentByCategory.get(category) ?? 0) + toNumber(t.amount));
  }

  return budgets.map((b) => {
    const limit = toNumber(b.monthly_limit);
    const spent = spentByCategory.get(b.category) ?? 0;
    const utilization = limit > 0 ? spent / limit : 0;
    const state: BudgetStatus["state"] = utilization > 1 ? "danger" : utilization > 0.8 ? "warning" : "ok";
    return {
      category: b.category,
      label: labelForCategory(b.category),
      spent: round2(spent),
      limit: round2(limit),
      utilization,
      state,
    };
  });
}

export function computeOverallBudgetUtilization(
  budgets: { category: string; monthly_limit: number | string }[],
  transactions: FinanceTransaction[],
  reference = new Date(),
): number {
  const statuses = computeBudgetStatuses(budgets, transactions, reference);
  const totalLimit = statuses.reduce((s, b) => s + b.limit, 0);
  const totalSpent = statuses.reduce((s, b) => s + b.spent, 0);
  return totalLimit > 0 ? totalSpent / totalLimit : 0;
}

function currentMonthTotals(transactions: FinanceTransaction[], reference: Date) {
  const key = monthKey(reference);
  let income = 0;
  let expenses = 0;
  for (const t of transactions) {
    if (monthKey(t.occurred_at) !== key) continue;
    const amount = toNumber(t.amount);
    if (t.kind === "income") income += amount;
    else expenses += amount;
  }
  return { income: round2(income), expenses: round2(expenses) };
}

export function computeKpis(
  args: {
    collections: { is_personal: boolean }[];
    documents: Document[];
    transactions: FinanceTransaction[];
    budgets: { category: string; monthly_limit: number | string }[];
  },
  reference = new Date(),
): Kpis {
  const { collections, documents, transactions, budgets } = args;
  const monthly = currentMonthTotals(transactions, reference);
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
    budgetUtilization: computeOverallBudgetUtilization(budgets, transactions, reference),
    currency: "AED",
  };
}
