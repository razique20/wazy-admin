import type { WazyDataBundle } from "@/lib/types";
import { monthKey, toNumber } from "@/lib/format";

/**
 * Finance activity monitoring (admin console).
 *
 * The old Finance page rendered every user's raw transactions in one
 * undifferentiated table. These helpers instead produce:
 *  - one rollup row per owner (who uses the finance module, how much, how
 *    recently), and
 *  - platform totals (active finance users, MTD spend, feature adoption),
 * so the admin can monitor engagement and drill into a single user's ledger
 * rather than scanning a cross-user dump.
 *
 * All functions are pure — pass `reference` explicitly for testability.
 */

export interface FinanceUserRow {
  ownerId: string;
  /** Distinct transactions logged (all time). */
  transactionsCount: number;
  /** Transactions logged in the reference calendar month. */
  transactionsThisMonth: number;
  incomeTotal: number;
  expensesTotal: number;
  /** Income in the reference calendar month. */
  incomeThisMonth: number;
  /** Expenses in the reference calendar month. */
  expensesThisMonth: number;
  budgetsCount: number;
  envelopesCount: number;
  /** Envelope savings set aside (all time). */
  savedTotal: number;
  /** Recurring rules defined; `activeRecurring` counts those not paused. */
  recurringCount: number;
  activeRecurring: number;
  /** Latest `occurred_at` across the owner's transactions (money dated). */
  lastEntryAt: string | null;
  /** Latest `created_at` across finance rows (when they last logged anything). */
  lastLoggedAt: string | null;
}

export interface FinancePlatformTotals {
  /** Owners with at least one finance row (transaction/budget/envelope/recurring). */
  usersWithFinanceData: number;
  /** Owners who logged at least one transaction in the reference month. */
  activeUsersThisMonth: number;
  transactionsTotal: number;
  transactionsThisMonth: number;
  expensesThisMonth: number;
  incomeThisMonth: number;
  netThisMonth: number;
  /** Feature adoption: distinct owners using each feature. */
  usersWithTransactions: number;
  usersWithBudgets: number;
  usersWithEnvelopes: number;
  usersWithRecurring: number;
  currency: string;
}

function round2(n: number): number {
  return Math.round(n * 100) / 100;
}

function blankRow(ownerId: string): FinanceUserRow {
  return {
    ownerId,
    transactionsCount: 0,
    transactionsThisMonth: 0,
    incomeTotal: 0,
    expensesTotal: 0,
    incomeThisMonth: 0,
    expensesThisMonth: 0,
    budgetsCount: 0,
    envelopesCount: 0,
    savedTotal: 0,
    recurringCount: 0,
    activeRecurring: 0,
    lastEntryAt: null,
    lastLoggedAt: null,
  };
}

function touch(row: FinanceUserRow, at: string | null | undefined) {
  if (!at) return;
  if (!row.lastLoggedAt || at > row.lastLoggedAt) row.lastLoggedAt = at;
}

/**
 * One row per owner that has any finance footprint. Owners whose only rows
 * are budgets/envelopes (no transactions yet) are included so adoption gaps
 * are visible. Rows sort by most recent activity first, then by owner id for
 * a stable order.
 */
export function computeFinanceUserRows(
  data: Pick<WazyDataBundle, "transactions" | "budgets" | "envelopes" | "recurring">,
  reference = new Date(),
): FinanceUserRow[] {
  const thisMonth = monthKey(reference);
  const byOwner = new Map<string, FinanceUserRow>();
  const get = (ownerId: string): FinanceUserRow => {
    let row = byOwner.get(ownerId);
    if (!row) {
      row = blankRow(ownerId);
      byOwner.set(ownerId, row);
    }
    return row;
  };

  for (const t of data.transactions) {
    const row = get(t.owner_id);
    const amount = toNumber(t.amount);
    row.transactionsCount += 1;
    const mtd = monthKey(t.occurred_at) === thisMonth;
    if (mtd) row.transactionsThisMonth += 1;
    if (t.kind === "income") {
      row.incomeTotal += amount;
      if (mtd) row.incomeThisMonth += amount;
    } else {
      row.expensesTotal += amount;
      if (mtd) row.expensesThisMonth += amount;
    }
    if (!row.lastEntryAt || t.occurred_at > row.lastEntryAt) row.lastEntryAt = t.occurred_at;
    touch(row, t.created_at);
  }

  for (const b of data.budgets) {
    const row = get(b.owner_id);
    row.budgetsCount += 1;
    touch(row, b.created_at);
  }

  for (const e of data.envelopes) {
    const row = get(e.owner_id);
    row.envelopesCount += 1;
    row.savedTotal += toNumber(e.saved_amount);
    touch(row, e.created_at);
  }

  for (const r of data.recurring) {
    const row = get(r.owner_id);
    row.recurringCount += 1;
    if (r.is_active) row.activeRecurring += 1;
    touch(row, r.created_at);
  }

  const rows = [...byOwner.values()].map((row) => ({
    ...row,
    incomeTotal: round2(row.incomeTotal),
    expensesTotal: round2(row.expensesTotal),
    incomeThisMonth: round2(row.incomeThisMonth),
    expensesThisMonth: round2(row.expensesThisMonth),
    savedTotal: round2(row.savedTotal),
  }));

  rows.sort((a, b) => {
    const at = (b.lastLoggedAt ?? "").localeCompare(a.lastLoggedAt ?? "");
    if (at !== 0) return at;
    return a.ownerId.localeCompare(b.ownerId);
  });
  return rows;
}

/** Platform-level KPIs derived from the same bundle (no per-owner rows needed). */
export function computeFinancePlatformTotals(
  data: Pick<WazyDataBundle, "transactions" | "budgets" | "envelopes" | "recurring">,
  reference = new Date(),
): FinancePlatformTotals {
  const thisMonth = monthKey(reference);
  const owners = {
    finance: new Set<string>(),
    transactions: new Set<string>(),
    budgets: new Set<string>(),
    envelopes: new Set<string>(),
    recurring: new Set<string>(),
    active: new Set<string>(),
  };
  let transactionsTotal = 0;
  let transactionsThisMonth = 0;
  let expensesThisMonth = 0;
  let incomeThisMonth = 0;

  for (const t of data.transactions) {
    owners.finance.add(t.owner_id);
    owners.transactions.add(t.owner_id);
    transactionsTotal += 1;
    if (monthKey(t.occurred_at) === thisMonth) {
      owners.active.add(t.owner_id);
      transactionsThisMonth += 1;
      const amount = toNumber(t.amount);
      if (t.kind === "income") incomeThisMonth += amount;
      else expensesThisMonth += amount;
    }
  }
  for (const b of data.budgets) {
    owners.finance.add(b.owner_id);
    owners.budgets.add(b.owner_id);
  }
  for (const e of data.envelopes) {
    owners.finance.add(e.owner_id);
    owners.envelopes.add(e.owner_id);
  }
  for (const r of data.recurring) {
    owners.finance.add(r.owner_id);
    owners.recurring.add(r.owner_id);
  }

  return {
    usersWithFinanceData: owners.finance.size,
    activeUsersThisMonth: owners.active.size,
    transactionsTotal,
    transactionsThisMonth,
    expensesThisMonth: round2(expensesThisMonth),
    incomeThisMonth: round2(incomeThisMonth),
    netThisMonth: round2(incomeThisMonth - expensesThisMonth),
    usersWithTransactions: owners.transactions.size,
    usersWithBudgets: owners.budgets.size,
    usersWithEnvelopes: owners.envelopes.size,
    usersWithRecurring: owners.recurring.size,
    currency: "AED",
  };
}
