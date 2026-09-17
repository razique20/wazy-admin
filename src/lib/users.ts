import type { WazyDataBundle } from "@/lib/types";
import { monthKey, toNumber } from "@/lib/format";

/** Per-user (owner) summary derived from all fetched tables. */
export interface UserSummary {
  ownerId: string;
  email: string | null;
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
 * Builds one summary row per distinct owner found in auth users (optional) and
 * across collections / documents / transactions / budgets / envelopes / recurring.
 */
export function computeUserSummaries(
  data: WazyDataBundle,
  authUsers: { id: string; email: string | null }[] = [],
  reference = new Date(),
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

  // Register auth users even if they have no data yet.
  for (const u of authUsers) {
    const s = get(u.id);
    s.email = u.email;
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
  for (const s of summaries) {
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
