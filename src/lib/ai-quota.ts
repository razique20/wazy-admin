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

/**
 * Adoption metrics for AI features in a given month.
 * Requires both aiQuotaUsage rows and the full auth user list as denominator.
 */
export interface AiAdoptionMetrics {
  month: string;
  totalUsers: number;                    // All auth users (denominator)
  activeUsers: number;                   // Users who signed in (lastSignInAt within 30 days)
  usersWithAiUsage: number;             // Users with any ai_quota_usage row this month
  adoptionRate: number;                 // usersWithAiUsage / activeUsers (percentage)
  byFeature: AiFeatureAdoption[];      // Per-feature breakdown
  quotaExhaustion: AiQuotaExhaustion[]; // Users near/exceeding quota limits
}

/** Per-feature adoption breakdown. */
export interface AiFeatureAdoption {
  feature: string;
  label: string;
  users: number;                        // Distinct users using this feature
  totalCalls: number;                   // Total calls for this feature
  adoptionRate: number;                 // users / activeUsers (percentage)
}

/** Users approaching or at quota exhaustion. */
export interface AiQuotaExhaustion {
  userId: string;
  email: string | null;
  tier: UserTier;
  feature: string;
  used: number;
  limit: number;
  percentUsed: number;                  // used / limit * 100
  status: "ok" | "warning" | "exhausted"; // <80%, 80-99%, >=100%
}

/**
 * Compute AI adoption metrics for a given month.
 * - totalUsers: all auth users
 * - activeUsers: users with lastSignInAt within 30 days (or createdAt if never signed in)
 * - usersWithAiUsage: distinct users with ai_quota_usage rows this month
 * - adoptionRate: usersWithAiUsage / activeUsers
 */
export function computeAiAdoption(
  rows: AiQuotaUsage[],
  users: { id: string; email: string | null; lastSignInAt: string | null; createdAt: string | null }[],
  month: string,
): AiAdoptionMetrics {
  const now = new Date();
  const thirtyDaysAgo = new Date(now.getTime() - 30 * 86_400_000);

  // Active users: signed in within 30 days OR created within 30 days (new users)
  const activeUserIds = new Set<string>();
  for (const user of users) {
    if (!user.lastSignInAt && !user.createdAt) continue;
    const lastActivity = user.lastSignInAt ? new Date(user.lastSignInAt) : new Date(user.createdAt!);
    if (lastActivity >= thirtyDaysAgo) {
      activeUserIds.add(user.id);
    }
  }

  // Users with AI usage this month
  const usersWithAiUsage = new Set<string>();
  const byFeature = new Map<string, { users: Set<string>; totalCalls: number }>();

  for (const row of rows) {
    if (row.usage_month !== month) continue;
    usersWithAiUsage.add(row.user_id);
    const entry = byFeature.get(row.feature_name) ?? { users: new Set<string>(), totalCalls: 0 };
    entry.users.add(row.user_id);
    entry.totalCalls += Number.isFinite(row.used_count) ? row.used_count : 0;
    byFeature.set(row.feature_name, entry);
  }

  const totalUsers = users.length;
  const activeUsers = activeUserIds.size;
  const usersWithAi = usersWithAiUsage.size;
  const adoptionRate = activeUsers > 0 ? (usersWithAi / activeUsers) * 100 : 0;

  // Per-feature adoption
  const byFeatureArr: AiFeatureAdoption[] = AI_FEATURES.map((f) => {
    const data = byFeature.get(f) ?? { users: new Set<string>(), totalCalls: 0 };
    return {
      feature: f,
      label: aiFeatureLabel(f),
      users: data.users.size,
      totalCalls: data.totalCalls,
      adoptionRate: activeUsers > 0 ? (data.users.size / activeUsers) * 100 : 0,
    };
  });

  // Quota exhaustion analysis
  const userEmailMap = new Map(users.map((u) => [u.id, u.email]));

  const quotaExhaustion: AiQuotaExhaustion[] = [];

  // Group usage by user+feature
  const userFeatureUsage = new Map<string, Map<string, number>>();
  for (const row of rows) {
    if (row.usage_month !== month) continue;
    const userFeatures = userFeatureUsage.get(row.user_id) ?? new Map<string, number>();
    userFeatures.set(row.feature_name, (userFeatures.get(row.feature_name) ?? 0) + (Number.isFinite(row.used_count) ? row.used_count : 0));
    userFeatureUsage.set(row.user_id, userFeatures);
  }

  // For each user with usage, check quota status
  // Note: In production, you'd join with user_tiers to get actual tier.
  // For now, we assume Free tier as default (matching app behavior).
  for (const [userId, features] of userFeatureUsage.entries()) {
    const tier = "free"; // Default - in production, fetch from user_tiers
    const email = userEmailMap.get(userId) ?? null;

    for (const [feature, used] of features.entries()) {
      const limit = AI_QUOTA_LIMITS[tier]?.[feature] ?? 0;
      if (limit === 0) continue;

      const percentUsed = (used / limit) * 100;
      let status: "ok" | "warning" | "exhausted" = "ok";
      if (percentUsed >= 100) status = "exhausted";
      else if (percentUsed >= 80) status = "warning";

      quotaExhaustion.push({
        userId,
        email,
        tier,
        feature,
        used,
        limit,
        percentUsed,
        status,
      });
    }
  }

  // Sort by percentUsed descending (most exhausted first)
  quotaExhaustion.sort((a, b) => b.percentUsed - a.percentUsed);

  return {
    month,
    totalUsers,
    activeUsers,
    usersWithAiUsage: usersWithAi,
    adoptionRate,
    byFeature: byFeatureArr,
    quotaExhaustion,
  };
}

/**
 * Compute quota exhaustion for a specific user.
 * Useful for per-user views.
 */
export function computeUserQuotaStatus(
  usage: AiUserUsage,
  tier: UserTier,
): { feature: string; used: number; limit: number; percentUsed: number; status: "ok" | "warning" | "exhausted" }[] {
  const result: { feature: string; used: number; limit: number; percentUsed: number; status: "ok" | "warning" | "exhausted" }[] = [];

  for (const [feature, used] of Object.entries(usage.byFeature)) {
    const limit = AI_QUOTA_LIMITS[tier]?.[feature] ?? 0;
    if (limit === 0) continue;

    const percentUsed = (used / limit) * 100;
    let status: "ok" | "warning" | "exhausted" = "ok";
    if (percentUsed >= 100) status = "exhausted";
    else if (percentUsed >= 80) status = "warning";

    result.push({
      feature,
      used,
      limit,
      percentUsed,
      status,
    });
  }

  return result.sort((a, b) => b.percentUsed - a.percentUsed);
}
