import { describe, expect, it } from "vitest";
import { detectAnomalies, severityFor } from "@/lib/anomaly";
import type { FinanceTransaction } from "@/lib/types";

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
    created_at: "2026-01-01",
    ...partial,
  };
}

describe("severityFor", () => {
  it("maps ratios to severity bands", () => {
    expect(severityFor(0.4, 0.35)).toBe("minor");
    expect(severityFor(0.7, 0.35)).toBe("moderate");
    expect(severityFor(1.5, 0.35)).toBe("severe");
  });
});

describe("detectAnomalies", () => {
  it("flags a >35% spike over the 3-month moving average", () => {
    const anomalies = detectAnomalies(
      [
        tx({ amount: 100, occurred_at: "2026-05-05" }),
        tx({ amount: 110, occurred_at: "2026-06-05" }),
        tx({ amount: 120, occurred_at: "2026-07-05" }),
        tx({ amount: 300, occurred_at: "2026-08-05" }), // avg ~110 → +172%
      ],
      { reference: REF },
    );
    expect(anomalies).toHaveLength(1);
    expect(anomalies[0].severity).toBe("severe");
    expect(anomalies[0].category).toBe("utilities");
    expect(anomalies[0].pctAboveAvg).toBeGreaterThan(100);
  });

  it("ignores spikes at or below the threshold", () => {
    const anomalies = detectAnomalies(
      [
        tx({ amount: 100, occurred_at: "2026-05-05" }),
        tx({ amount: 100, occurred_at: "2026-06-05" }),
        tx({ amount: 100, occurred_at: "2026-07-05" }),
        tx({ amount: 110, occurred_at: "2026-08-05" }), // +10% only
      ],
      { reference: REF },
    );
    expect(anomalies).toHaveLength(0);
  });

  it("requires at least two months of baseline history", () => {
    const anomalies = detectAnomalies(
      [tx({ amount: 100, occurred_at: "2026-07-05" }), tx({ amount: 500, occurred_at: "2026-08-05" })],
      { reference: REF },
    );
    expect(anomalies).toHaveLength(0);
  });

  it("respects a custom threshold", () => {
    const anomalies = detectAnomalies(
      [
        tx({ amount: 100, occurred_at: "2026-05-05" }),
        tx({ amount: 100, occurred_at: "2026-06-05" }),
        tx({ amount: 100, occurred_at: "2026-07-05" }),
        tx({ amount: 150, occurred_at: "2026-08-05" }), // +50%
      ],
      { reference: REF, threshold: 0.6 },
    );
    expect(anomalies).toHaveLength(0);
  });

  it("ignores income transactions", () => {
    const anomalies = detectAnomalies(
      [
        tx({ kind: "income", amount: 100, occurred_at: "2026-05-05" }),
        tx({ kind: "income", amount: 100, occurred_at: "2026-06-05" }),
        tx({ kind: "income", amount: 100, occurred_at: "2026-07-05" }),
        tx({ kind: "income", amount: 1000, occurred_at: "2026-08-05" }),
      ],
      { reference: REF },
    );
    expect(anomalies).toHaveLength(0);
  });
});
