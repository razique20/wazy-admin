# Wazy Admin Console

Production-grade admin dashboard for **Wazy** — a personal & small-business document
expiry tracker and financial intelligence manager. Built with Next.js 14 (App Router),
TypeScript, Tailwind CSS, Supabase, Recharts and lucide-react.

## Features

- **📊 Overview Dashboard** — KPI cards (collections, documents & urgent expiries,
  monthly income/expenses/net cash flow, budget utilization) plus cash-flow area chart,
  expense breakdown donut and upcoming-renewal horizon stacked bars.
- **📁 Collections & Documents** — searchable/sortable/multi-filter data table, document
  detail modal (file info, reminders, linked transactions), quick status & fee editing.
- **💸 Finance & Expense Ledger** — transaction ledger, category budget progress bars
  (warning >80%, danger >100%), savings envelope rings, recurring transactions with
  status toggle.
- **⚠️ Anomaly Detection** — flags expense spikes >35% above the 3-month moving average
  with Minor/Moderate/Severe severity badges and resolution actions.
- **💳 Subscriptions (tier management)** — grants `free` / `plus` / `business` tiers per
  user (upsert into `public.user_tiers` with service-role key + audit row), tier badges
  with tooltips, search by email or user ID, pagination, confirmation dialog with the
  tier's entitlements, toasts, and a "Paste user ID from upgrade email" quick action that
  parses `Wazy upgrade request — {tier} — user <ID>`.
- **⚙️ System Administration** — read-only SQL query runner, CSV/JSON exporters,
  custom document type manager.

## Getting started

```bash
npm install
cp .env.local.example .env.local   # already provided as .env.local with the project keys
npm run dev
```

Open http://localhost:3000.

### Environment

| Variable | Purpose |
| --- | --- |
| `NEXT_PUBLIC_SUPABASE_URL` | Supabase project URL |
| `NEXT_PUBLIC_SUPABASE_ANON_KEY` | Anon/public key used by the browser client |
| `SUPABASE_SERVICE_ROLE_KEY` | Optional server-only key that bypasses RLS (never expose to the client) |

## Scripts

| Script | Description |
| --- | --- |
| `npm run dev` | Start the dev server |
| `npm run build` | Production build |
| `npm run test` | Run vitest unit tests (analytics, anomaly engine, CSV export, tiers, schema validation) |
| `npm run lint` | ESLint |

## User data integrity (orphaned users)

If the Users page ever shows an **orphaned / Unknown user** entry, it means data rows
exist for an owner id that is no longer in `auth.users` — typically a user deleted
before the app tables had cascade foreign keys (data rows store only the owner UUID,
so a re-registered user with a new UUID can never re-claim them).

Run `supabase/user_data_cascade_schema.sql` once in the Supabase SQL Editor. It
idempotently (1) deletes all rows whose owner no longer exists in `auth.users`,
(2) adds `on delete cascade` foreign keys from `collections`, `documents`, finance
and budget tables to `auth.users` so every future user delete cleans up
automatically, and (3) reports any remaining dangling rows via warnings. The orphaned
entry disappears from the console on the next refresh.

## Subscription tiers

Before using the **Subscriptions** section, run `supabase/user_tiers_schema.sql` once
against the production Supabase project (Dashboard → SQL Editor → New query). It creates
`public.user_tiers` (RLS on, self-read-only policy) and `public.user_tier_audit`
(service-role only), plus a trigger that blocks any write not made with the service role.

- Valid tier values are the lowercase strings `free`, `plus`, `business` — the Flutter
  app reads `user_tiers.tier` for `auth.uid()` and falls back to Free on a missing row.
- All console writes go through `POST /api/user-tiers/set` using
  `SUPABASE_SERVICE_ROLE_KEY` server-side; the anon key can never change a tier.
- Every change appends an audit row (old → new tier, end date, note). The user sees new
  entitlements by simply reopening the Profile tab in the app.

### Time-limited grants (1 month / 3 months / 1 year)

When setting a tier, the admin picks a duration: **No expiry** (default, permanent grant),
**1 month**, **3 months** or **1 year**. The route turns the duration into an absolute
`expires_at` timestamp (calendar months, clamped month-ends) stored on the `user_tiers` row
and mirrored in `user_tier_audit`. The Subscriptions list resolves an expired grant to Free,
so the user drops back automatically — no cron job needed. If you already ran an older
version of `supabase/user_tiers_schema.sql`, re-run it: it adds the `expires_at` columns
idempotently (`add column if not exists`).

## GCC multi-currency (native vs converted)

Every collection belongs to one of the six GCC states (`collections.country_code`), and
each state has its own currency — AED, SAR, KWD, QAR, BHD, OMR. Documents inherit their
currency from their collection; transactions carry their own `currency` column.

- **Default · as recorded** — the console's default display mode. Every money figure
  renders in the exact currency the GCC user entered it in (`AED 30,000 · KWD 800`),
  never summed across currencies. Aggregations that mix currencies use a per-currency
  split (`CurrencySplit`) rendered with `formatSplit`.
- **Converted** — picking a currency in the header selector converts every aggregate
  into it using the pegged USD cross rates in `src/lib/currency.ts` (override the KWD
  rate with `NEXT_PUBLIC_FX_KWD_AED`).
- **GCC Overview (`/gcc`)** — the platform rolled up per country (exact per-currency
  splits plus a "native" column showing each country's own-currency figure) and per
  currency (the "Default" scope: exact amounts, no FX applied).
- **Row currency resolution** — `resolveRowCurrency` trusts a row's `currency` stamp
  unless it is empty or the bare default `AED` on a **non-AE** collection, in which
  case the collection's currency wins. Older mobile-app builds constructed
  transactions without a currency, so `AED` was stored even in Kuwaiti/Saudi …
  workspaces; this rule keeps those rows reading as KWD/SAR/… while still honouring
  genuinely foreign-currency rows.
- **Mobile app** — `TransactionFormSheet`, the document-renewal log and the credit
  flows now stamp `DocumentCollectionService.activeCurrency` (the active collection's
  GCC currency) on every `FinanceTransaction` / `RecurringTransaction` they create.

## Tech stack

Next.js 14 App Router · TypeScript · Tailwind CSS (dark theme: slate-950 base,
emerald/teal/cyan accents) · @supabase/supabase-js · recharts · lucide-react · vitest
