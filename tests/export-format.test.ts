import { describe, expect, it } from "vitest";
import { toCSV } from "@/lib/export";
import { formatBytes, formatCurrency, monthKey, monthLabel, addMonthsToKey, toNumber } from "@/lib/format";
import { envelopeProgress, nextOccurrence, simulateTrigger } from "@/lib/domain";
import type { RecurringTransaction } from "@/lib/types";

describe("toCSV", () => {
  it("serializes rows with headers and escapes values", () => {
    const csv = toCSV(
      [
        { name: "Plain", value: 1 },
        { name: "Has, comma", value: "quote \" inside" },
        { name: "Line\nbreak", value: null },
      ],
      ["name", "value"],
    );
    const lines = csv.split("\n");
    expect(lines[0]).toBe("name,value");
    expect(lines[1]).toBe("Plain,1");
    expect(lines[2]).toBe('"Has, comma","quote "" inside"');
    expect(csv).toContain('"Line\nbreak",');
  });

  it("returns empty string for no rows", () => {
    expect(toCSV([])).toBe("");
  });
});

describe("format helpers", () => {
  it("formats AED currency", () => {
    expect(formatCurrency(1250)).toContain("1,250");
  });

  it("formats byte sizes", () => {
    expect(formatBytes(0)).toBe("0 B");
    expect(formatBytes(2048)).toBe("2.0 KB");
  });

  it("handles numeric strings", () => {
    expect(toNumber("42.5")).toBe(42.5);
    expect(toNumber("")).toBe(0);
    expect(toNumber(null)).toBe(0);
  });

  it("computes month keys and labels", () => {
    expect(monthKey("2026-09-17T10:00:00Z")).toBe("2026-09");
    expect(monthLabel("2026-09")).toBe("Sep 26");
    expect(addMonthsToKey("2026-01", -1)).toBe("2025-12");
  });
});

describe("domain helpers", () => {
  const base: RecurringTransaction = {
    id: "r1",
    owner_id: "owner",
    collection_id: null,
    kind: "expense",
    category: "rent",
    title: "Office rent",
    amount: 5000,
    currency: "AED",
    frequency: "monthly",
    day_of_month: 5,
    start_date: "2026-01-01",
    end_date: null,
    is_active: true,
    last_logged_at: null,
  };

  it("computes the next occurrence this month or next", () => {
    const midMonth = new Date(2026, 8, 10); // Sep 10 2026
    expect(nextOccurrence(base, midMonth)).toBe("2026-10-05");
    const early = new Date(2026, 8, 2); // Sep 2 2026
    expect(nextOccurrence(base, early)).toBe("2026-09-05");
  });

  it("returns null when inactive", () => {
    expect(nextOccurrence({ ...base, is_active: false }, new Date(2026, 8, 10))).toBeNull();
  });

  it("simulates a ledger entry from a recurring row", () => {
    const payload = simulateTrigger(base, new Date(2026, 8, 10));
    expect(payload.title).toBe("Office rent");
    expect(payload.kind).toBe("expense");
    expect(payload.amount).toBe(5000);
    expect(String(payload.occurred_at)).toMatch(/^\d{4}-\d{2}-\d{2}$/);
  });

  it("computes envelope progress capped at 1", () => {
    expect(envelopeProgress(50, 100)).toBe(0.5);
    expect(envelopeProgress(150, 100)).toBe(1);
    expect(envelopeProgress(10, 0)).toBe(0);
  });
});
