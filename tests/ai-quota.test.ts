import { describe, expect, it } from "vitest";
import {
  AI_QUOTA_LIMITS,
  aiFeatureLabel,
  computeAiFeatureTotals,
  computeAiUsage,
  quotaMonthKey,
  totalAiCalls,
} from "@/lib/ai-quota";
import type { AiQuotaUsage } from "@/lib/types";

const MONTH = "2026-09";

function row(overrides: Partial<AiQuotaUsage>): AiQuotaUsage {
  return {
    id: overrides.id ?? "00000000-0000-0000-0000-000000000001",
    user_id: "3f2a1b2c-4d5e-4f60-8a7b-9c0d1e2f3a4b",
    feature_name: "groq_ai_summary",
    usage_month: MONTH,
    used_count: 1,
    updated_at: "2026-09-05T10:00:00Z",
    ...overrides,
  };
}

describe("quotaMonthKey", () => {
  it("formats the UTC month as YYYY-MM", () => {
    expect(quotaMonthKey(new Date(Date.UTC(2026, 8, 23)))).toBe("2026-09");
    expect(quotaMonthKey(new Date(Date.UTC(2026, 0, 1)))).toBe("2026-01");
  });
});

describe("computeAiUsage", () => {
  it("rolls up per user and per feature, heaviest first", () => {
    const userA = "3f2a1b2c-4d5e-4f60-8a7b-9c0d1e2f3a4b";
    const userB = "aaaaaaaa-bbbb-4ccc-8ddd-eeeeffff0000";
    const rows = [
      row({ user_id: userA, feature_name: "groq_ai_summary", used_count: 5 }),
      row({ user_id: userA, feature_name: "groq_ai_budget_plan", used_count: 2 }),
      row({ user_id: userB, feature_name: "groq_ai_summary", used_count: 9 }),
      row({ user_id: userB, feature_name: "groq_ai_summary", used_count: 1 }), // same key, additively summed via separate row
    ];
    const usage = computeAiUsage(rows, MONTH);
    expect(usage).toHaveLength(2);
    expect(usage[0].userId).toBe(userB);
    expect(usage[0].total).toBe(10);
    expect(usage[1].userId).toBe(userA);
    expect(usage[1].total).toBe(7);
    expect(usage[1].byFeature["groq_ai_budget_plan"]).toBe(2);
  });

  it("ignores rows from other months", () => {
    const rows = [row({ usage_month: "2026-08", used_count: 50 })];
    expect(computeAiUsage(rows, MONTH)).toHaveLength(0);
  });

  it("tracks the latest updated_at as lastUsedAt", () => {
    const rows = [
      row({ updated_at: "2026-09-05T10:00:00Z" }),
      row({ id: "2", updated_at: "2026-09-09T12:00:00Z" }),
    ];
    const usage = computeAiUsage(rows, MONTH);
    expect(usage[0].lastUsedAt).toBe("2026-09-09T12:00:00Z");
  });
});

describe("computeAiFeatureTotals", () => {
  it("totals calls and distinct users per feature", () => {
    const userA = "3f2a1b2c-4d5e-4f60-8a7b-9c0d1e2f3a4b";
    const userB = "aaaaaaaa-bbbb-4ccc-8ddd-eeeeffff0000";
    const rows = [
      row({ user_id: userA, feature_name: "groq_ai_summary", used_count: 3 }),
      row({ user_id: userB, feature_name: "groq_ai_summary", used_count: 4 }),
      row({ user_id: userA, feature_name: "groq_ai_budget_plan", used_count: 6 }),
    ];
    const totals = computeAiFeatureTotals(rows, MONTH);
    expect(totals[0]).toMatchObject({ feature: "groq_ai_summary", totalCalls: 7, users: 2 });
    expect(totals[1]).toMatchObject({ feature: "groq_ai_budget_plan", totalCalls: 6, users: 1 });
  });
});

describe("totalAiCalls", () => {
  it("sums only the requested month", () => {
    const rows = [
      row({ used_count: 2 }),
      row({ id: "2", used_count: 3 }),
      row({ id: "3", used_count: 100, usage_month: "2026-08" }),
    ];
    expect(totalAiCalls(rows, MONTH)).toBe(5);
  });
});

describe("tier limits and labels", () => {
  it("matches the documented per-tier monthly quotas", () => {
    expect(AI_QUOTA_LIMITS.free).toEqual({ groq_ai_summary: 3, groq_ai_budget_plan: 2 });
    expect(AI_QUOTA_LIMITS.plus).toEqual({ groq_ai_summary: 30, groq_ai_budget_plan: 20 });
    expect(AI_QUOTA_LIMITS.business).toEqual({ groq_ai_summary: 100, groq_ai_budget_plan: 60 });
  });

  it("labels known features and passes through unknown ones", () => {
    expect(aiFeatureLabel("groq_ai_summary")).toBe("AI Monthly Summary");
    expect(aiFeatureLabel("groq_ai_budget_plan")).toBe("AI Budget Plan");
    expect(aiFeatureLabel("new_feature")).toBe("new_feature");
  });
});
