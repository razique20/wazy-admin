import { describe, expect, it } from "vitest";
import {
  buildMonthKeys,
  colorForIndex,
  computeBudgetStatuses,
  computeExpenseBreakdown,
  computeKpis,
  computeMonthlyCashFlow,
  computeRenewalHorizon,
  labelForCategory,
} from "@/lib/analytics";
import type { Document, FinanceTransaction } from "@/lib/types";

const REF = new Date("2026-09-15T12:00:00Z");

function tx(partial: Partial<FinanceTransaction>): FinanceTransaction {
  return {
    id: partial.id ?? Math.random().toString(),
    owner_id: "owner",
    collection_id: null,
    kind: "expense",
    category: "rent",
    title: "t",
    amount: 100,
    currency: "AED",
    occurred_at: "2026-09-01",
    note: null,
    document_id: null,
    created_at: "2026-01-01",
    ...partial,
  };
}

function doc(partial: Partial<Document>): Document {
  return {
    id: partial.id ?? Math.random().toString(),
    owner_id: "owner",
    collection_id: null,
    doc_type: "passport",
    display_name: "Passport",
    expires_at: "2026-09-20",
    reminder_days: 30,
    status: "active",
    assigned_to: null,
    renewal_fee: null,
    notes: null,
    file_name: null,
    file_path: null,
    file_size: null,
    created_at: "2026-01-01",
    updated_at: "2026-01-01",
    ...partial,
  };
}

describe("buildMonthKeys", () => {
  it("returns the last N months oldest-first", () => {
    expect(buildMonthKeys("2026-09", 3)).toEqual(["2026-07", "2026-08", "2026-09"]);
  });

  it("wraps across year boundaries", () => {
    expect(buildMonthKeys("2026-01", 3)).toEqual(["2025-11", "2025-12", "2026-01"]);
  });
});

describe("computeMonthlyCashFlow", () => {
  it("aggregates income and expenses per month", () => {
    const points = computeMonthlyCashFlow(
      [
        tx({ kind: "income", amount: 1000, occurred_at: "2026-09-02", category: "sales" }),
        tx({ kind: "expense", amount: 400, occurred_at: "2026-09-10" }),
        tx({ kind: "expense", amount: 100, occurred_at: "2026-08-05" }),
        tx({ kind: "expense", amount: 999, occurred_at: "2025-01-01" }), // out of window
      ],
      6,
      REF,
    );
    const sept = points.find((p) => p.key === "2026-09")!;
    expect(sept.income).toBe(1000);
    expect(sept.expenses).toBe(400);
    expect(sept.net).toBe(600);
    const aug = points.find((p) => p.key === "2026-08")!;
    expect(aug.expenses).toBe(100);
  });
});

describe("computeExpenseBreakdown", () => {
  it("only includes current-month expenses and sorts descending", () => {
    const points = computeExpenseBreakdown(
      [
        tx({ category: "rent", amount: 500, occurred_at: "2026-09-01" }),
        tx({ category: "utilities", amount: 300, occurred_at: "2026-09-02" }),
        tx({ category: "rent", amount: 250, occurred_at: "2026-09-03" }),
        tx({ category: "rent", amount: 999, occurred_at: "2026-08-01" }), // prior month
        tx({ kind: "income", category: "sales", amount: 5000, occurred_at: "2026-09-04" }), // income excluded
      ],
      REF,
    );
    expect(points).toHaveLength(2);
    expect(points[0]).toMatchObject({ category: "rent", amount: 750 });
    expect(points[1].category).toBe("utilities");
  });
});

describe("computeRenewalHorizon", () => {
  it("buckets documents by days to expiry", () => {
    const points = computeRenewalHorizon(
      [
        doc({ expires_at: "2026-09-01", status: "active" }), // expired
        doc({ expires_at: "2026-09-30", status: "active" }), // ≤30
        doc({ expires_at: "2026-10-20", status: "active" }), // 31-60
        doc({ expires_at: "2026-11-15", status: "active" }), // 61-90
        doc({ expires_at: "2027-01-15", status: "active" }), // 90+
        doc({ expires_at: "2026-09-30", status: "archived" }), // ignored
      ],
      REF,
    );
    expect(points[0].expired).toBe(1);
    expect(points[1].days30).toBe(1);
    expect(points[2].days60).toBe(1);
    expect(points[3].days90).toBe(1);
    expect(points[4].days90Plus).toBe(1);
  });
});

describe("computeBudgetStatuses", () => {
  it("marks warning above 80% and danger above 100%", () => {
    const statuses = computeBudgetStatuses(
      [
        { category: "rent", monthly_limit: 1000 },
        { category: "utilities", monthly_limit: 100 },
        { category: "marketing", monthly_limit: 100 },
      ],
      [
        tx({ category: "rent", amount: 850 }),
        tx({ category: "utilities", amount: 120 }),
      ],
      REF,
    );
    const rent = statuses.find((s) => s.category === "rent")!;
    expect(rent.state).toBe("warning");
    expect(rent.utilization).toBeCloseTo(0.85);
    expect(statuses.find((s) => s.category === "utilities")!.state).toBe("danger");
    expect(statuses.find((s) => s.category === "marketing")!.state).toBe("ok");
  });
});

describe("computeKpis", () => {
  it("computes monthly totals, urgent expiries and budget utilization", () => {
    const kpis = computeKpis(
      {
        collections: [{ is_personal: true }, { is_personal: false }, { is_personal: false }],
        documents: [
          doc({ expires_at: "2026-09-20" }),
          doc({ expires_at: "2026-09-01" }),
          doc({ expires_at: "2026-12-01" }),
        ],
        transactions: [
          tx({ kind: "income", amount: 3000, category: "sales", occurred_at: "2026-09-05" }),
          tx({ kind: "expense", amount: 1200, category: "rent", occurred_at: "2026-09-06" }),
        ],
        budgets: [{ category: "rent", monthly_limit: 1000 }],
      },
      REF,
    );
    expect(kpis.totalCollections).toBe(3);
    expect(kpis.companyCollections).toBe(2);
    expect(kpis.urgentExpiries).toBe(1);
    expect(kpis.expiredDocuments).toBe(1);
    expect(kpis.monthlyIncome).toBe(3000);
    expect(kpis.monthlyExpenses).toBe(1200);
    expect(kpis.netCashFlow).toBe(1800);
    expect(kpis.budgetUtilization).toBeCloseTo(1.2);
  });
});

describe("misc", () => {
  it("colorForIndex cycles the palette", () => {
    expect(colorForIndex(0)).toBe(colorForIndex(10));
  });

  it("labelForCategory titleizes snake/camel case", () => {
    expect(labelForCategory("trade_licence")).toBe("Trade Licence");
    expect(labelForCategory("emiratesId")).toBe("Emirates Id");
  });
});
