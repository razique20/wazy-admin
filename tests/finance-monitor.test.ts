import { describe, expect, it } from "vitest";
import { computeFinancePlatformTotals, computeFinanceUserRows } from "@/lib/finance-monitor";
import type { CategoryBudget, FinanceTransaction, RecurringTransaction, SavingsEnvelope } from "@/lib/types";

const REF = new Date("2026-09-15T12:00:00Z");

let seq = 0;
function tx(partial: Partial<FinanceTransaction>): FinanceTransaction {
  seq += 1;
  return {
    id: `t${seq}`,
    owner_id: "owner",
    collection_id: null,
    kind: "expense",
    category: "utilities",
    title: "bill",
    amount: 100,
    currency: "AED",
    occurred_at: "2026-09-01",
    note: null,
    document_id: null,
    created_at: "2026-09-01T10:00:00Z",
    ...partial,
  };
}

function budget(partial: Partial<CategoryBudget> = {}): CategoryBudget {
  seq += 1;
  return {
    id: `b${seq}`,
    owner_id: "owner",
    collection_id: null,
    category: "rent",
    monthly_limit: 5000,
    created_at: "2026-08-01T00:00:00Z",
    ...partial,
  };
}

function envelope(partial: Partial<SavingsEnvelope> = {}): SavingsEnvelope {
  seq += 1;
  return {
    id: `e${seq}`,
    owner_id: "owner",
    collection_id: null,
    name: "Goal",
    target_amount: 1000,
    saved_amount: 250,
    monthly_contribution: 100,
    document_id: null,
    created_at: "2026-08-01T00:00:00Z",
    ...partial,
  };
}

function recurring(partial: Partial<RecurringTransaction> = {}): RecurringTransaction {
  seq += 1;
  return {
    id: `r${seq}`,
    owner_id: "owner",
    collection_id: null,
    kind: "expense",
    category: "rent",
    title: "Rent",
    amount: 4000,
    currency: "AED",
    frequency: "monthly",
    day_of_month: 1,
    start_date: "2026-01-01",
    end_date: null,
    is_active: true,
    last_logged_at: null,
    created_at: "2026-08-01T00:00:00Z",
    ...partial,
  };
}

describe("computeFinanceUserRows", () => {
  it("rolls up per-owner counts, money totals and MTD figures", () => {
    const rows = computeFinanceUserRows(
      {
        transactions: [
          tx({ owner_id: "u1", kind: "expense", amount: 100, occurred_at: "2026-09-03" }),
          tx({ owner_id: "u1", kind: "expense", amount: 50, occurred_at: "2026-08-20" }),
          tx({ owner_id: "u1", kind: "income", amount: 1000, occurred_at: "2026-09-10" }),
        ],
        budgets: [budget({ owner_id: "u1" }), budget({ owner_id: "u1", category: "software" })],
        envelopes: [envelope({ owner_id: "u1", saved_amount: 300 })],
        recurring: [recurring({ owner_id: "u1" }), recurring({ owner_id: "u1", is_active: false })],
      },
      REF,
    );

    expect(rows).toHaveLength(1);
    expect(rows[0]).toMatchObject({
      ownerId: "u1",
      transactionsCount: 3,
      transactionsThisMonth: 2,
      incomeTotal: 1000,
      expensesTotal: 150,
      expensesThisMonth: 100,
      incomeThisMonth: 1000,
      budgetsCount: 2,
      envelopesCount: 1,
      savedTotal: 300,
      recurringCount: 2,
      activeRecurring: 1,
      lastEntryAt: "2026-09-10",
    });
  });

  it("includes owners with adoption but no transactions yet", () => {
    const rows = computeFinanceUserRows(
      { transactions: [], budgets: [budget({ owner_id: "u1" })], envelopes: [], recurring: [] },
      REF,
    );
    expect(rows).toHaveLength(1);
    expect(rows[0].transactionsCount).toBe(0);
    expect(rows[0].budgetsCount).toBe(1);
    expect(rows[0].lastEntryAt).toBeNull();
    expect(rows[0].lastLoggedAt).toBe("2026-08-01T00:00:00Z");
  });

  it("sorts most recently active first, with owner id as a stable tiebreak", () => {
    const rows = computeFinanceUserRows(
      {
        transactions: [
          tx({ owner_id: "quiet", occurred_at: "2026-07-01", created_at: "2026-07-01T00:00:00Z" }),
          tx({ owner_id: "active", occurred_at: "2026-09-05", created_at: "2026-09-05T00:00:00Z" }),
        ],
        budgets: [],
        envelopes: [],
        recurring: [
          recurring({ owner_id: "aaa", created_at: "2026-09-05T00:00:00Z" }),
          recurring({ owner_id: "bbb", created_at: "2026-09-05T00:00:00Z" }),
        ],
      },
      REF,
    );
    // "aaa", "active" and "bbb" all share the same lastLoggedAt → owner id tiebreak.
    expect(rows.map((r) => r.ownerId)).toEqual(["aaa", "active", "bbb", "quiet"]);
  });

  it("treats month boundaries in UTC (monthKey semantics)", () => {
    const rows = computeFinanceUserRows(
      {
        transactions: [
          // 2026-09-30T23:30Z is still September in UTC → counts as MTD.
          tx({ owner_id: "u1", occurred_at: "2026-09-30" }),
          tx({ owner_id: "u1", occurred_at: "2026-08-31" }),
        ],
        budgets: [],
        envelopes: [],
        recurring: [],
      },
      REF,
    );
    expect(rows[0].transactionsThisMonth).toBe(1);
    expect(rows[0].expensesThisMonth).toBe(100);
  });
});

describe("computeFinancePlatformTotals", () => {
  it("computes distinct-owner adoption and platform MTD money", () => {
    const totals = computeFinancePlatformTotals(
      {
        transactions: [
          tx({ owner_id: "u1", kind: "expense", amount: 100, occurred_at: "2026-09-03" }),
          tx({ owner_id: "u2", kind: "income", amount: 500, occurred_at: "2026-09-04" }),
          tx({ owner_id: "u2", kind: "expense", amount: 200, occurred_at: "2026-08-04" }),
        ],
        budgets: [budget({ owner_id: "u1" }), budget({ owner_id: "u3" })],
        envelopes: [envelope({ owner_id: "u3" })],
        recurring: [recurring({ owner_id: "u4" })],
      },
      REF,
    );

    expect(totals).toMatchObject({
      usersWithFinanceData: 4,
      activeUsersThisMonth: 2,
      transactionsTotal: 3,
      transactionsThisMonth: 2,
      expensesThisMonth: 100,
      incomeThisMonth: 500,
      netThisMonth: 400,
      usersWithTransactions: 2,
      usersWithBudgets: 2,
      usersWithEnvelopes: 1,
      usersWithRecurring: 1,
    });
  });

  it("returns zeroed totals for an empty bundle", () => {
    const totals = computeFinancePlatformTotals(
      { transactions: [], budgets: [], envelopes: [], recurring: [] },
      REF,
    );
    expect(totals.usersWithFinanceData).toBe(0);
    expect(totals.transactionsTotal).toBe(0);
    expect(totals.netThisMonth).toBe(0);
  });

  it("converts non-AED transactions before totalling MTD money", () => {
    const totals = computeFinancePlatformTotals(
      {
        transactions: [
          // 375 SAR expense = 367.25 AED at the peg.
          tx({ owner_id: "u1", kind: "expense", amount: 375, currency: "SAR", occurred_at: "2026-09-03" }),
          tx({ owner_id: "u2", kind: "income", amount: 1, currency: "BHD", occurred_at: "2026-09-04" }),
        ],
        budgets: [],
        envelopes: [],
        recurring: [],
      },
      REF,
    );
    expect(totals.expensesThisMonth).toBeCloseTo(367.25, 2);
    // Totals round to 2 decimals: 1 BHD = 9.7673 AED → 9.77.
    expect(totals.incomeThisMonth).toBe(9.77);
    expect(totals.netThisMonth).toBe(-357.48);
    expect(totals.currency).toBe("AED");
  });

  it("reports totals in the requested display currency", () => {
    const totals = computeFinancePlatformTotals(
      {
        transactions: [
          tx({ owner_id: "u1", kind: "expense", amount: 375, currency: "SAR", occurred_at: "2026-09-03" }),
        ],
        budgets: [],
        envelopes: [],
        recurring: [],
      },
      REF,
      { displayCurrency: "SAR" },
    );
    // 375 SAR stays 375 SAR when SAR is the display currency.
    expect(totals.expensesThisMonth).toBe(375);
    expect(totals.currency).toBe("SAR");
  });
});

describe("multi-currency user rows", () => {
  it("converts each row's currency and resolves envelope currency from the collection", () => {
    const rows = computeFinanceUserRows(
      {
        transactions: [
          tx({ owner_id: "u1", kind: "expense", amount: 375, currency: "SAR", occurred_at: "2026-09-03" }),
          tx({ owner_id: "u1", kind: "income", amount: 100, currency: "AED", occurred_at: "2026-09-04" }),
        ],
        budgets: [],
        // Envelope lives in a SAR collection → 250 SAR = 244.83 AED.
        envelopes: [envelope({ owner_id: "u1", collection_id: "c-sa", saved_amount: 250 })],
        recurring: [],
      },
      REF,
      {
        displayCurrency: "AED",
        currencyForCollection: (id) => (id === "c-sa" ? "SAR" : "AED"),
      },
    );
    expect(rows[0].expensesTotal).toBeCloseTo(367.25, 2);
    expect(rows[0].incomeTotal).toBe(100);
    expect(rows[0].savedTotal).toBeCloseTo(244.83, 2);
  });
});
