/** TypeScript interfaces mirroring the Wazy Supabase schema. */

export type DocumentStatus = "active" | "renewed" | "expired" | "archived";
export type ReminderChannel = "push" | "email" | "whatsapp";
export type TransactionKind = "expense" | "income";
export type TransactionCategory =
  | "renewals"
  | "salaries"
  | "rent"
  | "utilities"
  | "suppliers"
  | "marketing"
  | "transport"
  | "software"
  | "sales"
  | "other";
export type Frequency = "monthly" | "quarterly" | "yearly";

export interface Collection {
  id: string;
  owner_id: string;
  name: string;
  is_personal: boolean;
  created_at: string;
}

export interface Document {
  id: string;
  owner_id: string;
  collection_id: string | null;
  doc_type: string;
  display_name: string;
  expires_at: string | null;
  reminder_days: number | null;
  status: DocumentStatus;
  assigned_to: string | null;
  renewal_fee: number | null;
  notes: string | null;
  file_name: string | null;
  file_path: string | null;
  file_size: number | null;
  created_at: string;
  updated_at: string;
}

export interface Reminder {
  id: string;
  document_id: string;
  remind_at: string;
  channel: ReminderChannel;
  sent_at: string | null;
  created_at: string;
}

export interface CustomDocumentType {
  id: string;
  owner_id: string;
  name: string;
  renewal_authority: string | null;
  renewal_days: number | null;
  created_at: string;
}

export interface FinanceTransaction {
  id: string;
  owner_id: string;
  collection_id: string | null;
  kind: TransactionKind;
  category: TransactionCategory | string;
  title: string;
  amount: number | string;
  currency: string;
  occurred_at: string;
  note: string | null;
  document_id: string | null;
  created_at: string;
}

export interface CategoryBudget {
  id: string;
  owner_id: string;
  collection_id: string | null;
  category: string;
  monthly_limit: number | string;
  created_at: string;
}

export interface SavingsEnvelope {
  id: string;
  owner_id: string;
  collection_id: string | null;
  name: string;
  target_amount: number | string;
  saved_amount: number | string;
  monthly_contribution: number | string;
  document_id: string | null;
  created_at: string;
}

export interface RecurringTransaction {
  id: string;
  owner_id: string;
  collection_id: string | null;
  kind: TransactionKind;
  category: TransactionCategory | string;
  title: string;
  amount: number | string;
  currency: string;
  frequency: Frequency;
  day_of_month: number;
  start_date: string;
  end_date: string | null;
  is_active: boolean;
  last_logged_at: string | null;
}

/**
 * Subscription tier values stored in `public.user_tiers.tier`. The Flutter app
 * resolves entitlements from these exact lowercase strings — do not change them.
 */
export type UserTier = "free" | "plus" | "business";

/**
 * How long an admin-granted tier lasts before it expires. `none` is the
 * default and means the grant has no end date (previous console behavior).
 * Console-only concept: the Flutter app never reads durations.
 */
export type TierDuration = "none" | "1m" | "3m" | "1y";

/** One row per user in `public.user_tiers` (missing row ⇒ Free in the app). */
export interface UserTierRow {
  user_id: string;
  tier: string;
  /** When the granted tier lapses back to Free; null/absent = no expiry. */
  expires_at?: string | null;
  updated_at?: string | null;
}

/** Immutable tier-change history row in `public.user_tier_audit` (service-role only). */
export interface UserTierAuditRow {
  id: number | string;
  user_id: string;
  old_tier: UserTier | null;
  new_tier: UserTier;
  /** Plan end date written at the time of the change; null = no expiry. */
  expires_at: string | null;
  changed_by: string | null;
  note: string | null;
  created_at: string;
}

export type SupportRequestType =
  | "tracking_option_request"
  | "feature_request"
  | "bug_report"
  | "support_request";
export type SupportStatus = "open" | "in_progress" | "resolved";

export interface SupportRequest {
  id: string;
  user_id: string | null;
  user_email: string | null;
  request_type: SupportRequestType | string;
  title: string;
  description: string | null;
  status: SupportStatus | string;
  admin_notes: string | null;
  created_at: string;
  updated_at: string;
}

/** `feature_name` values written by the Flutter app — do not change. */
export type AiFeatureName = "groq_ai_summary" | "groq_ai_budget_plan";

export interface AiQuotaUsage {
  id: string;
  user_id: string;
  feature_name: AiFeatureName | string;
  /** Format `YYYY-MM`. */
  usage_month: string;
  used_count: number;
  updated_at: string;
}

export type AppPlatform = "all" | "ios" | "android" | "web";

export interface AppVersion {
  id: string;
  platform: AppPlatform | string;
  min_required_version: string | null;
  latest_version: string | null;
  is_force_update: boolean;
  download_url: string | null;
  release_notes: string | null;
  created_at: string;
  updated_at: string;
}

export interface WazyDataBundle {
  collections: Collection[];
  documents: Document[];
  reminders: Reminder[];
  customDocumentTypes: CustomDocumentType[];
  transactions: FinanceTransaction[];
  budgets: CategoryBudget[];
  envelopes: SavingsEnvelope[];
  recurring: RecurringTransaction[];
  supportRequests: SupportRequest[];
  aiQuotaUsage: AiQuotaUsage[];
  appVersions: AppVersion[];
}
