/**
 * Ordered list of application data tables for a full data wipe.
 *
 * Order matters: children first so FK constraints never block a delete.
 * `pk` is the primary-key/id column used with `.select(pk)` to count the
 * removed rows. Tables that don't exist in a given project are skipped
 * with a warning instead of failing the whole wipe.
 */
export const APP_DATA_TABLES: { table: string; pk: string }[] = [
  { table: "reminders", pk: "id" },
  { table: "finance_transactions", pk: "id" },
  { table: "category_budgets", pk: "id" },
  { table: "savings_envelopes", pk: "id" },
  { table: "recurring_transactions", pk: "id" },
  { table: "ai_quota_usage", pk: "id" },
  { table: "user_tier_audit", pk: "id" },
  { table: "user_tiers", pk: "user_id" },
  { table: "custom_document_types", pk: "id" },
  { table: "documents", pk: "id" },
  { table: "collections", pk: "id" },
];
