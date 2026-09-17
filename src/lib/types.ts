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

export interface WazyDataBundle {
  collections: Collection[];
  documents: Document[];
  reminders: Reminder[];
  customDocumentTypes: CustomDocumentType[];
  transactions: FinanceTransaction[];
  budgets: CategoryBudget[];
  envelopes: SavingsEnvelope[];
  recurring: RecurringTransaction[];
}
