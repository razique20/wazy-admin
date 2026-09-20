import type { TierDuration, UserTier, UserTierRow } from "@/lib/types";

/**
 * Subscription tier domain logic shared by the admin UI and the server route.
 *
 * Contract with the Wazy Flutter app (do not change):
 * - Valid tier values are the exact lowercase strings `free`, `plus`, `business`.
 * - A missing `user_tiers` row — or any other value — resolves to Free in the app.
 * - One row per user (`user_id` PK): the console always upserts, never duplicates.
 */

export const TIER_VALUES: readonly UserTier[] = ["free", "plus", "business"] as const;

/** Grant durations an admin can pick when setting a tier. `none` = no expiry. */
export const TIER_DURATIONS: readonly TierDuration[] = ["none", "1m", "3m", "1y"] as const;

/** Human labels for the duration picker. */
export const TIER_DURATION_LABELS: Record<TierDuration, string> = {
  none: "No expiry",
  "1m": "1 month",
  "3m": "3 months",
  "1y": "1 year",
};

/** Months added to `now` for each duration; `none` never reaches this map. */
const DURATION_MONTHS: Record<Exclude<TierDuration, "none">, number> = {
  "1m": 1,
  "3m": 3,
  "1y": 12,
};

export const TIER_LABELS: Record<UserTier, string> = {
  free: "Free",
  plus: "Plus",
  business: "Business",
};

/** Higher number = more entitlements. Used to phrase grant vs downgrade. */
export const TIER_RANK: Record<UserTier, number> = {
  free: 0,
  plus: 1,
  business: 2,
};

/** What each tier unlocks in the app — used for labels and tooltips in the console. */
export const TIER_INFO: Record<UserTier, { label: string; summary: string; unlocks: string[] }> = {
  free: {
    label: "Free",
    summary: "Default tier — 10 documents, no company collections, standard reminders.",
    unlocks: [
      "10 documents",
      "0 company collections",
      "Standard 90/60/30/7-day reminders",
    ],
  },
  plus: {
    label: "Plus",
    summary: "Unlimited documents, 1 company collection, 90-day forecast, exports, custom alerts, AI summary.",
    unlocks: [
      "Unlimited documents",
      "1 company collection",
      "90-day cash-flow forecast",
      "PDF/CSV export",
      "Custom alert days",
      "AI monthly summary",
    ],
  },
  business: {
    label: "Business",
    summary: "Everything in Plus, plus unlimited company workspaces, assignment, audit history and team exports.",
    unlocks: [
      "Everything in Plus",
      "Unlimited company workspaces",
      "Document assignment",
      "Renewal audit history",
      "Team exports",
    ],
  },
};

/** Strict server-side validation: only the exact lowercase contract values pass. */
export function isTier(value: unknown): value is UserTier {
  return typeof value === "string" && (TIER_VALUES as readonly string[]).includes(value);
}

/** Lenient parse for user-supplied input: trims + lowercases before validating. */
export function toTier(value: unknown): UserTier | null {
  if (typeof value !== "string") return null;
  const normalized = value.trim().toLowerCase();
  return isTier(normalized) ? normalized : null;
}

/**
 * Resolves the effective tier the same way the Flutter app does:
 * a missing row or an unexpected value falls back to Free.
 */
export function resolveTier(row: Pick<UserTierRow, "tier"> | null | undefined): UserTier {
  return toTier(row?.tier) ?? "free";
}

/** Strict server-side validation of the duration picker values. */
export function isTierDuration(value: unknown): value is TierDuration {
  return typeof value === "string" && (TIER_DURATIONS as readonly string[]).includes(value);
}

/**
 * Expiry timestamp for a grant made `from` (default now) with the given
 * duration; null for `none`. Uses calendar months so "1 year" is exactly
 * 12 months (Jan 15 → next Jan 15), matching how subscriptions are priced.
 * Month-end overflows are clamped (Jan 31 + 1 month → Feb 28), the way
 * subscription billing does it — a naive setMonth would roll into March.
 */
export function expiryForDuration(duration: TierDuration, from: Date = new Date()): string | null {
  const months = DURATION_MONTHS[duration as Exclude<TierDuration, "none">];
  if (months === undefined) return null;
  const end = new Date(from);
  const day = end.getDate();
  end.setMonth(end.getMonth() + months);
  // setMonth overflowed into the next month (e.g. Jan 31 → Mar 3): clamp back
  // to the last day of the intended month.
  if (end.getDate() !== day) end.setDate(0);
  return end.toISOString();
}

/**
 * True when the row's expiry has passed (5-minute grace clock skew guard).
 * Null/absent/invalid expiry never expires.
 */
export function isExpired(expiresAt: string | null | undefined, now: Date = new Date()): boolean {
  if (!expiresAt) return false;
  const t = new Date(expiresAt).getTime();
  if (Number.isNaN(t)) return false;
  return t <= now.getTime() - 5 * 60 * 1000;
}

const UUID_SOURCE = "[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}";
const UUID_RE = new RegExp(UUID_SOURCE, "i");
const UUID_ONLY_RE = new RegExp(`^${UUID_SOURCE}$`, "i");

/** Strict user-id validation for the server route. */
export function isUserId(value: unknown): value is string {
  return typeof value === "string" && UUID_ONLY_RE.test(value.trim());
}

/** Short display form used in confirmation dialogs, e.g. `3f2a…`. */
export function shortUserId(userId: string): string {
  return `${userId.slice(0, 4)}…`;
}

export interface ParsedUpgradeRequest {
  userId: string;
  /** Requested tier when it could be identified, otherwise null. */
  tier: UserTier | null;
}

/**
 * Parses the "Paste user ID from upgrade email" quick action. Accepts:
 * - a raw user ID (`3f2a…-…`)
 * - the whole email subject line `Wazy upgrade request — {tier} — user {ID}`
 *   (em/en dashes or plain hyphens, any tier word)
 * - a pasted email body containing `User ID: …` and/or `Requested tier: …`
 */
export function parseUpgradeRequest(raw: string): ParsedUpgradeRequest | null {
  if (typeof raw !== "string") return null;
  // Normalize em/en dashes so subject lines and hyphens parse the same way.
  const text = raw.replace(/[\u2013\u2014]/g, "-").trim();
  if (!text) return null;

  // 1) A bare user ID.
  const direct = text.match(UUID_ONLY_RE);
  if (direct) return { userId: direct[0].toLowerCase(), tier: null };

  // 2) The full subject line: "Wazy upgrade request - plus - user <ID>".
  const subject = text.match(/wazy\s+upgrade\s+request\s*-\s*([a-z0-9_+-]+)\s*-\s*user\s+([0-9a-f-]{36})/i);
  if (subject) {
    return { userId: subject[2].toLowerCase(), tier: toTier(subject[1]) };
  }

  // 3) Labeled fields from the email body: "User ID: …".
  let userId: string | null = null;
  const labeledId = text.match(new RegExp(`user[_\\s-]*id\\s*[:=]\\s*(${UUID_SOURCE})`, "i"));
  if (labeledId) {
    userId = labeledId[1];
  } else {
    // 4) A UUID right after the word "user" (subject pasted without the prefix).
    const userWord = text.match(new RegExp(`\\buser\\s+(${UUID_SOURCE})\\b`, "i"));
    if (userWord) {
      userId = userWord[1];
    } else {
      // 5) Last resort: the first UUID anywhere in the pasted text.
      const anyUuid = text.match(UUID_RE);
      if (anyUuid) userId = anyUuid[0];
    }
  }
  if (!userId) return null;

  let tier: UserTier | null = null;
  const requested = text.match(/requested\s*tier\s*[:=]\s*(free|plus|business)/i);
  if (requested) {
    tier = toTier(requested[1]);
  } else {
    const generic = text.match(/\btier\s*[:=]\s*(free|plus|business)/i);
    if (generic) tier = toTier(generic[1]);
  }

  return { userId: userId.toLowerCase(), tier };
}
