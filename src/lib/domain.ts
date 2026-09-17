import type {
  CategoryBudget,
  Collection,
  CustomDocumentType,
  Document,
  FinanceTransaction,
  RecurringTransaction,
  Reminder,
} from "@/lib/types";
import { toNumber } from "@/lib/format";

/** Utility to compute the next occurrence date of a recurring transaction. */
export function nextOccurrence(r: RecurringTransaction, today = new Date()): string | null {
  if (!r.is_active) return null;
  const start = new Date(r.start_date);
  if (Number.isNaN(start.getTime())) return null;

  const day = Math.min(Math.max(r.day_of_month || 1, 1), 28);
  const base = new Date(today.getFullYear(), today.getMonth(), day, 12);
  if (base >= startOfDay(today) && base >= startOfDay(start)) return iso(base);
  // otherwise roll to the next period
  const step = r.frequency === "monthly" ? 1 : r.frequency === "quarterly" ? 3 : 12;
  const next = new Date(today.getFullYear(), today.getMonth() + step, day, 12);
  if (r.end_date && next > new Date(r.end_date)) return null;
  return iso(next);
}

/** Simulates logging a recurring transaction now: returns the finance_transaction payload. */
export function simulateTrigger(r: RecurringTransaction, today = new Date()) {
  const when = nextOccurrence(r, today) ?? iso(today);
  return {
    owner_id: r.owner_id,
    collection_id: r.collection_id,
    kind: r.kind,
    category: r.category,
    title: r.title,
    amount: toNumber(r.amount),
    currency: r.currency || "AED",
    occurred_at: when,
    note: `Recurring: ${r.title} (${r.frequency})`,
    document_id: r.collection_id,
  };
}

export function documentLabel(doc: Document | undefined, collections: Collection[]): string {
  if (!doc) return "—";
  const col = collections.find((c) => c.id === doc.collection_id);
  return col ? `${doc.display_name} · ${col.name}` : doc.display_name;
}

export function remindersForDocument(reminders: Reminder[], documentId: string): Reminder[] {
  return reminders.filter((r) => r.document_id === documentId);
}

export function transactionsForDocument(transactions: FinanceTransaction[], documentId: string): FinanceTransaction[] {
  return transactions.filter((t) => t.document_id === documentId);
}

export function renewalHistory(doc: Document): { date: string; status: string }[] {
  const history: { date: string; status: string }[] = [];
  if (doc.created_at) history.push({ date: doc.created_at, status: "Registered" });
  if (doc.expires_at) history.push({ date: doc.expires_at, status: "Expiry" });
  if (doc.status === "renewed") history.push({ date: doc.updated_at, status: "Renewed" });
  return history;
}

export function budgetSummary(budgets: CategoryBudget[]): string {
  return budgets.length === 0 ? "No budgets configured" : `${budgets.length} monthly budgets`;
}

export function envelopeProgress(saved: number | string, target: number | string): number {
  const t = toNumber(target);
  if (t <= 0) return 0;
  return Math.min(toNumber(saved) / t, 1);
}

export function customTypeName(
  docType: string,
  customTypes: CustomDocumentType[],
): string {
  if (!docType.startsWith("custom-")) return docType;
  const match = customTypes.find((ct) => docType === `custom-${ct.id}` || docType === `custom-${ct.name}`);
  return match?.name ?? docType;
}

function startOfDay(d: Date): Date {
  return new Date(d.getFullYear(), d.getMonth(), d.getDate());
}

function iso(d: Date): string {
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
}
