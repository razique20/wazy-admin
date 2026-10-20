/**
 * Ordered list of application data tables for a full data wipe.
 *
 * Order matters: children first so FK constraints never block a delete.
 * `pk` is the primary-key/id column used with `.select(pk)` to count the
 * removed rows. Tables that don't exist in a given project are skipped
 * with a warning instead of failing the whole wipe.
 */
export const APP_DATA_TABLES: { table: string; pk: string; column?: string }[] = [
  { table: "reminders", pk: "id", column: "document_id" },
  { table: "error_reports", pk: "id", column: "user_id" },
  { table: "finance_transactions", pk: "id", column: "owner_id" },
  { table: "category_budgets", pk: "id", column: "owner_id" },
  { table: "savings_envelopes", pk: "id", column: "owner_id" },
  { table: "recurring_transactions", pk: "id", column: "owner_id" },
  { table: "ai_quota_usage", pk: "id", column: "user_id" },
  { table: "user_tier_audit", pk: "id", column: "user_id" },
  { table: "user_tiers", pk: "user_id", column: "user_id" },
  { table: "custom_document_types", pk: "id", column: "owner_id" },
  { table: "documents", pk: "id", column: "owner_id" },
  { table: "collections", pk: "id", column: "owner_id" },
  { table: "support_requests", pk: "id", column: "user_id" },
];
