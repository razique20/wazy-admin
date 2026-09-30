-- ============================================================
-- Finavig — Finance module schema (Tier 1 + 2 budget tracking)
-- Adds: finance_transactions, category_budgets, savings_envelopes.
--
-- Safe to re-run: every statement is idempotent.
-- Run this AFTER supabase/schema.sql.
-- ============================================================

-- ------------------------------------------------------------
-- 1. Tables
-- ------------------------------------------------------------

-- Money movements (expenses and income) scoped to a collection.
create table if not exists public.finance_transactions (
  id uuid primary key,
  owner_id uuid not null references auth.users(id) on delete cascade,
  collection_id uuid not null references public.collections(id) on delete cascade,
  kind text not null default 'expense' check (kind in ('expense','income')),
  category text not null default 'other' check (category in (
    'renewals','salaries','rent','utilities','suppliers','marketing',
    'transport','software','sales','other')),
  title text not null,
  amount numeric(12,2) not null check (amount >= 0),
  currency text not null default 'AED',
  occurred_at date not null default current_date,
  note text,
  document_id uuid references public.documents(id) on delete set null,
  created_at timestamptz not null default now()
);

create index if not exists idx_finance_tx_owner
  on public.finance_transactions(owner_id);
create index if not exists idx_finance_tx_collection_date
  on public.finance_transactions(collection_id, occurred_at);

-- Monthly spending limit per category, per collection.
create table if not exists public.category_budgets (
  id uuid primary key,
  owner_id uuid not null references auth.users(id) on delete cascade,
  collection_id uuid not null references public.collections(id) on delete cascade,
  category text not null check (category in (
    'renewals','salaries','rent','utilities','suppliers','marketing',
    'transport','software','sales','other')),
  monthly_limit numeric(12,2) not null check (monthly_limit >= 0),
  created_at timestamptz not null default now(),
  unique (collection_id, category)
);

create index if not exists idx_budgets_owner on public.category_budgets(owner_id);

-- Set-aside savings goals ("envelopes"). Tracking only — no money moves.
create table if not exists public.savings_envelopes (
  id uuid primary key,
  owner_id uuid not null references auth.users(id) on delete cascade,
  collection_id uuid not null references public.collections(id) on delete cascade,
  name text not null,
  target_amount numeric(12,2) not null check (target_amount >= 0),
  saved_amount numeric(12,2) not null default 0 check (saved_amount >= 0),
  monthly_contribution numeric(12,2) not null default 0,
  document_id uuid references public.documents(id) on delete set null,
  created_at timestamptz not null default now()
);

create index if not exists idx_envelopes_owner on public.savings_envelopes(owner_id);

-- Recurring transaction templates (rent, salaries, software). The client
-- auto-logs FinanceTransactions per template via RecurrenceMath; this table
-- only stores the template (frequency, day-of-month, active window).
create table if not exists public.recurring_transactions (
  id uuid primary key,
  owner_id uuid not null references auth.users(id) on delete cascade,
  collection_id uuid not null references public.collections(id) on delete cascade,
  kind text not null default 'expense' check (kind in ('expense','income')),
  category text not null default 'other' check (category in (
    'renewals','salaries','rent','utilities','suppliers','marketing',
    'transport','software','sales','other')),
  title text not null,
  amount numeric(12,2) not null check (amount >= 0),
  currency text not null default 'AED',
  frequency text not null default 'monthly' check (frequency in ('monthly','quarterly','yearly')),
  day_of_month int not null default 1 check (day_of_month between 1 and 31),
  start_date date not null default current_date,
  end_date date,
  is_active boolean not null default true,
  last_logged_at date,
  created_at timestamptz not null default now()
);

create index if not exists idx_recurring_owner on public.recurring_transactions(owner_id);
create index if not exists idx_recurring_collection on public.recurring_transactions(collection_id);

-- ------------------------------------------------------------
-- 2. Row Level Security — same owner-scoped model as the core tables
-- ------------------------------------------------------------

alter table public.finance_transactions enable row level security;
alter table public.category_budgets enable row level security;
alter table public.savings_envelopes enable row level security;
alter table public.recurring_transactions enable row level security;

-- Transactions: full access to own rows.
drop policy if exists "own finance tx select" on public.finance_transactions;
create policy "own finance tx select" on public.finance_transactions
  for select using (auth.uid() = owner_id);

drop policy if exists "own finance tx insert" on public.finance_transactions;
create policy "own finance tx insert" on public.finance_transactions
  for insert with check (auth.uid() = owner_id);

drop policy if exists "own finance tx update" on public.finance_transactions;
create policy "own finance tx update" on public.finance_transactions
  for update using (auth.uid() = owner_id)
  with check (auth.uid() = owner_id);

drop policy if exists "own finance tx delete" on public.finance_transactions;
create policy "own finance tx delete" on public.finance_transactions
  for delete using (auth.uid() = owner_id);

-- Budgets: full access to own rows.
drop policy if exists "own budgets select" on public.category_budgets;
create policy "own budgets select" on public.category_budgets
  for select using (auth.uid() = owner_id);

drop policy if exists "own budgets insert" on public.category_budgets;
create policy "own budgets insert" on public.category_budgets
  for insert with check (auth.uid() = owner_id);

drop policy if exists "own budgets update" on public.category_budgets;
create policy "own budgets update" on public.category_budgets
  for update using (auth.uid() = owner_id)
  with check (auth.uid() = owner_id);

drop policy if exists "own budgets delete" on public.category_budgets;
create policy "own budgets delete" on public.category_budgets
  for delete using (auth.uid() = owner_id);

-- Envelopes: full access to own rows.
drop policy if exists "own envelopes select" on public.savings_envelopes;
create policy "own envelopes select" on public.savings_envelopes
  for select using (auth.uid() = owner_id);

drop policy if exists "own envelopes insert" on public.savings_envelopes;
create policy "own envelopes insert" on public.savings_envelopes
  for insert with check (auth.uid() = owner_id);

drop policy if exists "own envelopes update" on public.savings_envelopes;
create policy "own envelopes update" on public.savings_envelopes
  for update using (auth.uid() = owner_id)
  with check (auth.uid() = owner_id);

drop policy if exists "own envelopes delete" on public.savings_envelopes;
create policy "own envelopes delete" on public.savings_envelopes
  for delete using (auth.uid() = owner_id);

-- Recurring templates: full access to own rows.
drop policy if exists "own recurring select" on public.recurring_transactions;
create policy "own recurring select" on public.recurring_transactions
  for select using (auth.uid() = owner_id);

drop policy if exists "own recurring insert" on public.recurring_transactions;
create policy "own recurring insert" on public.recurring_transactions
  for insert with check (auth.uid() = owner_id);

drop policy if exists "own recurring update" on public.recurring_transactions;
create policy "own recurring update" on public.recurring_transactions
  for update using (auth.uid() = owner_id)
  with check (auth.uid() = owner_id);

drop policy if exists "own recurring delete" on public.recurring_transactions;
create policy "own recurring delete" on public.recurring_transactions
  for delete using (auth.uid() = owner_id);
