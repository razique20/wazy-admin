import type { WazyDataBundle } from "@/lib/types";
import { monthKey, toNumber } from "@/lib/format";

/**
 * Minimal auth.users shape needed to derive the account status. Only `id` and
 * `email` are required — the confirmation/ban fields are optional so callers
 * with a plain {id, email} list keep working (status then degrades to
 * "unconfirmed" for confirmed-less users).
 */
export interface AuthUserLite {
  id: string;
  email: string | null;
  /** When the auth row was created — used to detect stale reads after a delete. */
  createdAt?: string | null;
  /** When the current ban (if any) lifts; a future date means currently banned. */
  bannedUntil?: string | null;
  /** Supabase sets this once the email/identity is confirmed. */
  emailConfirmedAt?: string | null;
}

/**
 * Account state of a user row, derived from auth.users (or its absence):
 * - active:      auth account exists and its email is confirmed
 * - banned:      auth account exists but is currently suspended
 * - unconfirmed: auth account exists but the email is not confirmed
 * - orphaned:    data rows exist but NO auth.users account — the account was
 *                deleted while its data stayed behind (ghost user)
 * - unknown:     the auth.users list is unavailable on this deployment
 *                (e.g. SUPABASE_SERVICE_ROLE_KEY not configured), so the
 *                account's existence cannot be verified
 */
export type AccountStatus = "active" | "banned" | "unconfirmed" | "orphaned" | "unknown";

/** Per-user (owner) summary derived from all fetched tables. */
export interface UserSummary {
  ownerId: string;
  email: string | null;
  /** Derived account state shown to admins beside the email. */
  accountStatus: AccountStatus;
  /**
   * True when the owner has data rows but no auth.users account — usually
   * left behind by an incomplete delete on projects without cascade FKs.
   */
  orphaned?: boolean;
  collectionsCount: number;
  personalCollections: number;
  companyCollections: number;
  documentsCount: number;
  urgentExpiries: number; // expires within 30 days, active docs only
  expiredDocuments: number;
  incomeTotal: number;
  expensesTotal: number;
  netTotal: number;
  incomeThisMonth: number;
  expensesThisMonth: number;
  budgetsCount: number;
  envelopesCount: number;
  savedTotal: number;
  remindersCount: number;
  lastActivity: string | null;
}

function startOfDay(d: Date): Date {
  return new Date(d.getFullYear(), d.getMonth(), d.getDate());
}

function daysTo(dateStr: string, today: Date): number {
  return Math.round((new Date(dateStr).getTime() - startOfDay(today).getTime()) / 86_400_000);
}

function blankSummary(ownerId: string): UserSummary {
  return {
    ownerId,
    email: null,
    accountStatus: "active",
    collectionsCount: 0,
    personalCollections: 0,
    companyCollections: 0,
    documentsCount: 0,
    urgentExpiries: 0,
    expiredDocuments: 0,
    incomeTotal: 0,
    expensesTotal: 0,
    netTotal: 0,
    incomeThisMonth: 0,
    expensesThisMonth: 0,
    budgetsCount: 0,
    envelopesCount: 0,
    savedTotal: 0,
    remindersCount: 0,
    lastActivity: null,
  };
}

function touchLastActivity(summary: UserSummary, at: string | null | undefined) {
  if (!at) return;
  if (!summary.lastActivity || at > summary.lastActivity) summary.lastActivity = at;
}

/**
 * A user.delete audit entry, used to detect accounts that are already deleted
 * but still returned by a stale auth.users read (GoTrue replica lag).
 */
export interface DeletedUserRecord {
  deletedUserId: string;
  performedAt: string;
}

/**
 * Builds one summary row per distinct owner found in auth users (optional) and
 * across collections / documents / transactions / budgets / envelopes / recurring.
 *
 * `authKnown` tells whether `authUsers` is the complete, trustworthy auth.users
 * list (service-role fetch succeeded). When false — e.g. the deployment lacks
 * SUPABASE_SERVICE_ROLE_KEY — data-only rows get status "unknown" instead of
 * being silently treated as active, and orphaned detection stays off because
 * a missing auth row cannot be distinguished from an unfetchable list.
 *
 * `deletedUsers` carries user.delete audit entries: any owner that appears in
 * it is treated as deleted even if the (possibly stale) auth list still
 * contains it — the console then shows the truth instead of replica lag.
 */
export function computeUserSummaries(
  data: WazyDataBundle,
  authUsers: AuthUserLite[] = [],
  reference = new Date(),
  authKnown: boolean = authUsers.length > 0,
  deletedUsers: DeletedUserRecord[] = [],
): UserSummary[] {
  const byOwner = new Map<string, UserSummary>();
  const get = (ownerId: string): UserSummary => {
    let s = byOwner.get(ownerId);
    if (!s) {
      s = blankSummary(ownerId);
      byOwner.set(ownerId, s);
    }
    return s;
  };

  // Register auth users even if they have no data yet, and derive their
  // account status so admins can see banned/unconfirmed accounts at a glance.
  const nowMs = reference.getTime();
  for (const u of authUsers) {
    const s = get(u.id);
    s.email = u.email;
    const currentlyBanned = Boolean(u.bannedUntil && new Date(u.bannedUntil).getTime() > nowMs);
    s.accountStatus = currentlyBanned ? "banned" : u.emailConfirmedAt ? "active" : "unconfirmed";
  }

  const thisMonth = monthKey(reference);

  for (const c of data.collections) {
    const s = get(c.owner_id);
    s.collectionsCount += 1;
    if (c.is_personal) s.personalCollections += 1;
    else s.companyCollections += 1;
    touchLastActivity(s, c.created_at);
  }

  const docOwner = new Map<string, string>();
  for (const d of data.documents) {
    docOwner.set(d.id, d.owner_id);
    const s = get(d.owner_id);
    s.documentsCount += 1;
    if (d.expires_at && d.status !== "archived" && d.status !== "renewed") {
      const days = daysTo(d.expires_at, reference);
      if (days < 0) s.expiredDocuments += 1;
      else if (days <= 30) s.urgentExpiries += 1;
    }
    touchLastActivity(s, d.updated_at);
  }

  for (const t of data.transactions) {
    const s = get(t.owner_id);
    const amount = toNumber(t.amount);
    if (t.kind === "income") {
      s.incomeTotal += amount;
      if (monthKey(t.occurred_at) === thisMonth) s.incomeThisMonth += amount;
    } else {
      s.expensesTotal += amount;
      if (monthKey(t.occurred_at) === thisMonth) s.expensesThisMonth += amount;
    }
    touchLastActivity(s, t.created_at);
  }

  for (const b of data.budgets) get(b.owner_id).budgetsCount += 1;

  for (const e of data.envelopes) {
    const s = get(e.owner_id);
    s.envelopesCount += 1;
    s.savedTotal += toNumber(e.saved_amount);
  }

  for (const r of data.recurring) get(r.owner_id).budgetsCount += 0; // no-op keeps type parity

  // Reminders inherit the owner of their document.
  for (const r of data.reminders) {
    const ownerId = docOwner.get(r.document_id);
    if (ownerId) get(ownerId).remindersCount += 1;
  }

  const summaries = [...byOwner.values()];
  const authIds = new Set(authUsers.map((u) => u.id));
  // Latest user.delete per user id — a stale auth read may still list the row.
  const deletedAt = new Map<string, string>();
  for (const d of deletedUsers) {
    const prev = deletedAt.get(d.deletedUserId);
    if (!prev || d.performedAt > prev) deletedAt.set(d.deletedUserId, d.performedAt);
  }
  // Auth rows created BEFORE the recorded delete are stale reads, not live
  // accounts; rows (re)created AFTER the delete timestamp are genuine.
  const staleAuthIds = new Set(
    authUsers.filter((u) => {
      const at = deletedAt.get(u.id);
      return Boolean(at && u.createdAt && u.createdAt < at);
    }).map((u) => u.id),
  );
  for (const s of summaries) {
    // Data rows exist for this owner but the auth account is gone.
    s.orphaned = !authIds.has(s.ownerId) && authKnown;
    // Ghost user: the account was deleted but its data rows remain.
    if (s.orphaned || staleAuthIds.has(s.ownerId)) {
      s.accountStatus = "orphaned";
      if (staleAuthIds.has(s.ownerId)) s.orphaned = true;
    } else if (!authIds.has(s.ownerId)) {
      // No auth entry AND we could not fetch the auth list — status unknown
      // (this is what production shows when the service-role key is missing).
      s.accountStatus = "unknown";
    }
    s.netTotal = round2(s.incomeTotal - s.expensesTotal);
    s.incomeThisMonth = round2(s.incomeThisMonth);
    s.expensesThisMonth = round2(s.expensesThisMonth);
    s.incomeTotal = round2(s.incomeTotal);
    s.expensesTotal = round2(s.expensesTotal);
    s.savedTotal = round2(s.savedTotal);
  }
  return summaries.sort((a, b) => (b.lastActivity ?? "").localeCompare(a.lastActivity ?? ""));
}

function round2(n: number): number {
  return Math.round(n * 100) / 100;
}
