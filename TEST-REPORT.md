# Wazy Admin Console — Test Report

**Project:** wazy-admin (`/Users/raziquemk/Desktop/wazy-admin`)
**Date:** 2026-09-23
**Build tested at commit:** `b38efc5` + working changes (audit log & ghost-user fix)
**Tester:** Buffy (Codebuff) — automated verification suite

---

## 1. Executive Summary

| Check | Result |
|---|---|
| TypeScript typecheck (`tsc --noEmit`) | ✅ PASS — 0 errors |
| ESLint (`next lint`) | ✅ PASS — 0 warnings, 0 errors |
| Unit tests (`vitest run`) | ✅ PASS — 8 files, **71/71 tests** |
| Production build (`next build`) | ✅ PASS — 19 routes compiled |
| Overall | ✅ **ALL CHECKS PASSED** |

---

## 2. Feature Inventory — Reference Doc vs Implementation

### §1 User Management
| Feature | Status | Where |
|---|---|---|
| List all users (email, sign-up, last sign-in, email confirmed) | ✅ Implemented | `/api/admin-users`, Users page |
| Search users by email / user ID | ✅ Implemented | Users page + Subscriptions page search box |
| Disable / ban user | ✅ Implemented | `POST /api/admin-users/actions` (`ban` → GoTrue `ban_duration: 876000h`) |
| Unban user | ✅ Implemented | Same route (`unban` → `ban_duration: none`) |
| Delete user + all data | ✅ Implemented (hardened) | Same route (`delete`) — see §4 Ghost-user fix |
| Delete leftover data of orphaned user | ✅ Implemented | Same route (`purge_data`) — new |
| Reset password (recovery email) | ✅ Implemented | Same route (`reset_password` → `generateLink({type:"recovery"})`) |
| View user details (drill-down) | ✅ Implemented | `UserDetailModal` — collections/docs/finance/envelopes tabs |

### §2 Subscription & Tier Management
| Feature | Status | Where |
|---|---|---|
| Grant/upgrade tier (free/plus/business) | ✅ Implemented | `POST /api/user-tiers/set` |
| Plan durations (none/1m/3m/1y) → `expires_at` | ✅ Implemented | Server-side `expiryForDuration`, calendar-month clamp logic unit-tested |
| Downgrade to Free (clears expiry) | ✅ Implemented | Same route, `tier=free` upserts `expires_at: null` |
| Expiry view / days remaining | ✅ Implemented | Subscriptions page “until …” labels; dashboard “plans end ≤30d” |
| Bulk expire check | ✅ Implemented | Expired grants resolve to Free at read time (`isExpired`, 5-min skew guard) |
| Admin notes | ✅ Implemented | Note field persisted in audit rows |
| Upsert (never duplicate rows) | ✅ Implemented | `onConflict: "user_id"` |
| Tier audit trail (§11) | ✅ Implemented | `user_tier_audit` + “Audit history” dialog on Subscriptions page |

### §3 AI Quota Management
| Feature | Status | Where |
|---|---|---|
| View per-user AI usage for month | ✅ Implemented | `/ai-usage` page, `computeAiUsage` rollup |
| Per-tier quota limits (3/2 · 30/20 · 100/60) | ✅ Implemented | `AI_QUOTA_LIMITS`, over-limit badges |
| Reset single user quota | ✅ Implemented | `POST /api/ai-quota/reset` (userId + optional feature + month) |
| Reset all quotas (monthly bulk) | ✅ Implemented | Same route (`allUsers: true`) |
| Usage analytics (feature totals, top users) | ✅ Implemented | Feature cards + leaderboard ordering, dashboard AI widget |
| Adjust quota exceptions | ℹ️ By design | Limits live in app code (`TierLimits`); console resets counters only, per doc note |

### §4 Support Request Management
| Feature | Status | Where |
|---|---|---|
| View all requests, filter by type/status, search | ✅ Implemented | `/support` page |
| Update status (open → in_progress → resolved) | ✅ Implemented | Manage dialog → `updateRow("support_requests", …)` |
| Admin notes (visible to user) | ✅ Implemented | Same dialog, `Textarea` primitive added |
| Delete request (spam/dupes) | ✅ Implemented | Delete button per row |
| Counters by type/status | ✅ Implemented | `computeSupportStats` — unit-tested |

### §5 Document Management
| Feature | Status | Where |
|---|---|---|
| View/search/filter all documents | ✅ Implemented | `/collections` page (query, collection, status, type, date range) |
| Expired / expiring-soon views | ✅ Implemented | Horizon chart + “X d overdue / in X d” + badges |
| Document count per user (tier audit) | ✅ Implemented | Users page + user modal |
| Renewal history | ✅ Implemented | `DocumentDetailModal` |
| CSV/JSON export | ✅ Implemented | System → Data Exporter, export helpers unit-tested |

### §6 Collection (Workspace) Management
| Feature | Status | Where |
|---|---|---|
| View all collections w/ owner + personal/company split | ✅ Implemented | Users page columns, user modal |
| Tier compliance (company workspaces) | ✅ Implemented | Personal/company counts per user |
| View collection contents | ✅ Implemented | User modal docs-per-collection counts, doc detail modal |

### §7 Finance Management
| Feature | Status | Where |
|---|---|---|
| Transactions, budgets, envelopes, recurring | ✅ Implemented | `/finance` page (ledger, budget bars, envelope cards, recurring list) |
| Platform spending & category breakdown | ✅ Implemented | Dashboard (MTD cash flow, expense donut) |
| Budget compliance (ok/warning/danger) | ✅ Implemented | `computeBudgetStatuses` — unit-tested |
| Recurring simulate/trigger | ✅ Implemented | `simulateTrigger`, `nextOccurrence` in `lib/domain.ts` |

### §8 App Version & Force Update Control
| Feature | Status | Where |
|---|---|---|
| Publish latest version + release notes + download URL | ✅ Implemented | System → App Version tab, `POST /api/app-versions` |
| Force update toggle w/ min version validation | ✅ Implemented | Server + client validation (`isValidVersion`), force-needs-min guard |
| Per-platform rows (all/ios/android/web) | ✅ Implemented | Platform picker, one row per platform (unique constraint) |
| Disable force update | ✅ Implemented | Dedicated button when row is in force mode |
| Version compare semantics | ✅ Unit-tested | `compareVersions`, `isForceUpdateRequired` (platform row > `all` fallback) |

### §9 Reminder & Notification Management
| Feature | Status | Where |
|---|---|---|
| View pending reminders (due vs scheduled) | ✅ Implemented | System → Reminders tab |
| View sent reminders | ✅ Implemented | Sent counts; stale list purge |
| Batch-mark due as sent | ✅ Implemented | Id-based batch update (max 200/run) |
| Clear stale sent (>90 days) | ✅ Implemented | Batch delete |
| Trigger `create_due_reminders()` | ℹ️ By design | Runs on app schedule; console performs the equivalent batch-mark action |

### §10 Custom Document Types
| Feature | Status | Where |
|---|---|---|
| CRUD custom types | ✅ Implemented | System → Custom Doc Types tab |
| Type resolution (`custom-<id>`) | ✅ Implemented | `customTypeName` in `lib/domain.ts` |

### §11 Tier Audit History
| Feature | Status | Where |
|---|---|---|
| View tier audit trail w/ auto-expiry entries | ✅ Implemented | Subscriptions → “Audit history” dialog (`/api/tier-audit`) |
| NEW: full admin action log | ✅ Implemented | System → Audit Log tab (`/api/admin-audit`) — see §3 below |

### §12 Dashboard & Analytics
| Widget | Status |
|---|---|
| Total Users + new users 7d | ✅ |
| Tier distribution / paid users | ✅ |
| Expiring plans (≤30d) | ✅ |
| Open support tickets + tracking demand | ✅ |
| AI calls this month | ✅ |
| Documents / expiring documents | ✅ |
| Cash-flow trend + expense breakdown | ✅ |
| Renewal horizon | ✅ |
| Budget utilization | ✅ |

### §13 Schema Map — SQL files shipped
| Table | Schema file present |
|---|---|
| `user_tiers`, `user_tier_audit` | ✅ `supabase/user_tiers_schema.sql` (pre-existing) |
| `support_requests` | ✅ `supabase/support_requests_schema.sql` |
| `ai_quota_usage` | ✅ `supabase/ai_quota_schema.sql` |
| `app_versions` | ✅ `supabase/app_version_schema.sql` |
| `admin_audit_log` | ✅ `supabase/admin_audit_log_schema.sql` — **new, must be run** |
| `collections`, `documents`, `reminders`, `custom_document_types`, finance tables | ℹ️ Pre-existing app schema (out of console scope) |

---

## 3. New in This Change — Admin Audit Log

**Table:** `public.admin_audit_log` (RLS on, no policies — service-role only)

Recorded actions:

| Action | Trigger | Logged details |
|---|---|---|
| `user.ban` / `user.unban` | Account actions in user modal | userId |
| `user.delete` | Delete user | email, `authUserExisted`, per-table purged row counts |
| `user.data_purge` | “Delete leftover data” on orphaned users | per-table purged row counts |
| `user.reset_password` | Reset password action | email |
| `tier.grant` | Any tier save (grant/downgrade/duration) | previousTier, newTier, duration, expiresAt, note |
| `quota.reset` | AI quota reset (single or bulk) | month, feature, resetCount, allUsers flag |
| `version.publish` | App version save | platform, versions, force flag |
| `row.insert` / `row.update` / `row.delete` | Any admin-db write (support tickets, reminders cleanup, custom types) | table, target id, **field names only** (never values — keeps notes/descriptions out of the log) |

Design properties:
- **Best-effort, never blocking:** a missing `admin_audit_log` table logs a server warning; the admin action itself still succeeds.
- **Failures are logged too:** a failed user action writes an entry with `ok: false` + error text — an audit trail that only shows successes hides exactly the events worth investigating.
- **Viewer:** System → Audit Log tab — action badges (delete=danger, ban=warning…), search across action/table/details, filter by user id, timestamped.

## 4. Ghost-User Fix (the “deleted user still shows” bug)

**Root cause:** the Users list is built from data-table *owners* + `auth.users`. On projects where `documents`, `collections`, `finance_transactions`, etc. lack `ON DELETE CASCADE` foreign keys, deleting the auth user left all data rows behind → the user stayed visible, and a second delete failed with “User not found” (the auth row was already gone).

**Fix (in `POST /api/admin-users/actions`):**
1. `delete` first checks whether the auth user still exists (`getUserById`) — no more misleading 404 path.
2. It then **purges all data rows regardless**, children-first: reminders (via the user's document ids) → finance_transactions → category_budgets → savings_envelopes → recurring_transactions → ai_quota_usage → support_requests → user_tiers → custom_document_types → documents → collections. Missing tables are skipped with a warning; row counts are returned and logged.
3. Only then does it call `auth.admin.deleteUser` (skipped silently if the auth row is already gone).
4. **Orphan detection in the UI:** owners that have data but no auth account are badged `orphaned` in the Users list, with an amber explainer card, and their modal offers **“Delete leftover data”** (`purge_data`) and **“Try full delete again”**.
5. After any action the modal closes and both the auth list **and** the data bundle refresh, so the ghost disappears immediately.

## 5. Automated Verification Results

```
$ npx tsc --noEmit
(exit 0 — no errors)

$ npm run lint
✔ No ESLint warnings or errors

$ npm test
 ✓ tests/support.test.ts     (7 tests)
 ✓ tests/tiers.test.ts      (19 tests)
 ✓ tests/ai-quota.test.ts    (8 tests)
 ✓ tests/app-version.test.ts (8 tests)
 ✓ tests/analytics.test.ts   (9 tests)
 ✓ tests/users.test.ts       (4 tests)
 ✓ tests/export-format.test.ts (10 tests)
 ✓ tests/anomaly.test.ts     (6 tests)
 Test Files  8 passed (8) — Tests 71 passed (71)

$ npm run build
✓ Compiled successfully — 19 routes (13 static/dynamic pages + API)
```

New/updated unit-test coverage highlights:
- Support statuses/types/stats (`tests/support.test.ts`)
- AI quota month keys, rollups, feature totals, tier limits (`tests/ai-quota.test.ts`)
- Platform validation, version compare, force-update resolution incl. `all`-fallback (`tests/app-version.test.ts`)
- Tier contract values, duration→expiry clamping (Jan 31 + 1m → Feb 28), upgrade-email parser (`tests/tiers.test.ts`)
- User summary aggregation incl. new bundle shape (`tests/users.test.ts`)

## 6. Manual Test Checklist (requires `SUPABASE_SERVICE_ROLE_KEY` + live Supabase)

| # | Scenario | Expected |
|---|---|---|
| 1 | Ban a test user → try signing in in the app | Sign-in blocked; Users list shows banned state; audit row `user.ban` |
| 2 | Unban the same user | Sign-in works again; audit row `user.unban` |
| 3 | Delete a user **with** documents/collections | Modal closes, user gone from auth list **and** Users page; audit row `user.delete` lists per-table purge counts |
| 4 | Delete a user whose auth row is already gone (ghost) | No “user not found” error; data rows purged; entry disappears after refresh |
| 5 | Orphaned badge flow | Users page shows `orphaned` badge + amber card; “Delete leftover data” removes the entry |
| 6 | Reset password | Recovery email received; audit row `user.reset_password` |
| 7 | Grant Plus/1m then downgrade | Tier + “until” date update; `user_tier_audit` + `admin_audit_log` rows written |
| 8 | AI quota reset (single & all) | Counters zeroed; `quota.reset` audit rows |
| 9 | Publish app version, enable/disable force update | Row upserted; `version.publish` audit row; force requires min version |
| 10 | Support ticket manage/delete | Status + notes persist; deletion works; `row.update`/`row.delete` audit rows |
| 11 | Audit Log tab | Shows all the above, newest first; filters work; empty state prompts schema install |
| 12 | Run console with `admin_audit_log` table absent | Admin actions still succeed; only server warnings logged |

## 7. Deployment Notes

1. **Run `supabase/admin_audit_log_schema.sql`** in the Supabase SQL editor (plus the three earlier schema files if not yet applied: `support_requests_schema.sql`, `ai_quota_schema.sql`, `app_version_schema.sql`).
2. Ensure `SUPABASE_SERVICE_ROLE_KEY` is set in the deployment environment (Vercel → Project → Settings → Environment Variables) — all admin writes and the audit log depend on it.
3. Audit retention: entries are append-only; if growth is a concern, prune periodically (e.g. delete rows older than 12 months) — no console feature depends on old entries.
4. The audit log stores **field names only** for row edits, never field values — safe for notes/descriptions, but keep in mind tier/permission changes *are* stored in full in `details`.

## 8. Known Limitations

- **No soft-delete**: user deletion is immediate and permanent (documented in the confirm dialog). A “ban first, purge later” flow is a possible follow-up.
- Quota limit *exceptions* per user remain an app-side concept (per the reference doc) — the console resets counters but does not override limits.
- The audit viewer caps at the most recent 200 entries per load (server supports up to 500).
- Reminder batch actions process up to 200 rows per click (repeat for larger backlogs).
