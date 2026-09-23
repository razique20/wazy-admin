import type { AiQuotaUsage, UserTier } from "@/lib/types";

/** Feature names written by the Flutter app — do not change. */
export const AI_FEATURES: readonly string[] = ["groq_ai_summary", "groq_ai_budget_plan"] as const;

export const AI_FEATURE_LABELS: Record<string, string> = {
  groq_ai_summary: "AI Monthly Summary",
  groq_ai_budget_plan: "AI Budget Plan",
};

/** Monthly call limits per tier, mirroring the app's TierLimits. */
export const AI_QUOTA_LIMITS: Record<UserTier, Record<string, number>> = {
  free: { groq_ai_summary: 3, groq_ai_budget_plan: 2 },
  plus: { groq_ai_summary: 30, groq_ai_budget_plan: 20 },
  business: { groq_ai_summary: 100, groq_ai_budget_plan: 60 },
};

/** Month key in the same `YYYY-MM` format the table stores. */
export function quotaMonthKey(date: Date = new Date()): string {
  return `${date.getUTCFullYear()}-${String(date.getUTCMonth() + 1).padStart(2, "0")}`;
}

export function quotaMonthLabel(key: string): string {
  const [y, m] = key.split("-").map(Number);
  if (!y || !m) return key;
  return new Date(Date.UTC(y, m - 1, 1)).toLocaleDateString("en-GB", { month: "long", year: "numeric" });
}

export function aiFeatureLabel(feature: string): string {
  return AI_FEATURE_LABELS[feature] ?? feature;
}

export interface AiUserUsage {
  userId: string;
  total: number;
  byFeature: Record<string, number>;
  lastUsedAt: string | null;
}

/** Per-user usage rollup for a given `YYYY-MM` month, heaviest first. */
export function computeAiUsage(
  rows: AiQuotaUsage[],
  month: string,
): AiUserUsage[] {
  const byUser = new Map<string, AiUserUsage>();
  for (const row of rows) {
    if (row.usage_month !== month) continue;
    let entry = byUser.get(row.user_id);
    if (!entry) {
      entry = { userId: row.user_id, total: 0, byFeature: {}, lastUsedAt: null };
      byUser.set(row.user_id, entry);
    }
    const count = Number.isFinite(row.used_count) ? row.used_count : 0;
    entry.total += count;
    entry.byFeature[row.feature_name] = (entry.byFeature[row.feature_name] ?? 0) + count;
    if (row.updated_at && (!entry.lastUsedAt || row.updated_at > entry.lastUsedAt)) {
      entry.lastUsedAt = row.updated_at;
    }
  }
  return [...byUser.values()].sort((a, b) => b.total - a.total || a.userId.localeCompare(b.userId));
}

export interface AiFeatureTotals {
  feature: string;
  label: string;
  totalCalls: number;
  users: number;
}

/** Feature-level totals for a month. */
export function computeAiFeatureTotals(rows: AiQuotaUsage[], month: string): AiFeatureTotals[] {
  const byFeature = new Map<string, { totalCalls: number; users: Set<string> }>();
  for (const row of rows) {
    if (row.usage_month !== month) continue;
    let entry = byFeature.get(row.feature_name);
    if (!entry) {
      entry = { totalCalls: 0, users: new Set() };
      byFeature.set(row.feature_name, entry);
    }
    entry.totalCalls += Number.isFinite(row.used_count) ? row.used_count : 0;
    entry.users.add(row.user_id);
  }
  return [...byFeature.entries()]
    .map(([feature, e]) => ({ feature, label: aiFeatureLabel(feature), totalCalls: e.totalCalls, users: e.users.size }))
    .sort((a, b) => b.totalCalls - a.totalCalls);
}

/** Total AI calls recorded in a month (dashboard widget). */
export function totalAiCalls(rows: AiQuotaUsage[], month: string): number {
  return rows.reduce((sum, r) => (r.usage_month === month ? sum + (Number.isFinite(r.used_count) ? r.used_count : 0) : sum), 0);
}
