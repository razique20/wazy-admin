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
| `npm run test` | Run vitest unit tests (analytics, anomaly engine, CSV export, schema validation) |
| `npm run lint` | ESLint |

## Tech stack

Next.js 14 App Router · TypeScript · Tailwind CSS (dark theme: slate-950 base,
emerald/teal/cyan accents) · @supabase/supabase-js · recharts · lucide-react · vitest
