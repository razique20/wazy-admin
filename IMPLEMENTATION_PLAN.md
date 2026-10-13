# Finavig Admin Console — Implementation Plan

**Project:** wazy-admin + finavig mobile app
**Date:** 2026-10-11
**Source:** Analysis of `~/Desktop/finavig/` (mobile app) + `wazy-admin/` (admin console)

---

## Priority 1 — Critical (Implement First, Week 1-4)

These features require mobile app changes + new admin capabilities. Highest ROI.

---

### P1.1 AI Feature Adoption & Quota Health Monitoring ✅ COMPLETED

**Problem:** Admin can see raw AI usage counts but not adoption rates, quota exhaustion, or trends.

**Mobile App Changes Needed:**
- [ ] `lib/services/ai_executive_summary_service.dart` — Already writes to `ai_quota_usage`, add `generated_at` timestamp for trend analysis
- [ ] `lib/services/ai_budget_plan_service.dart` — Same: add timestamp

**New Admin Capabilities:**
- [x] **AI Adoption Rate** — % of active users using each AI feature per month
- [x] **Quota Exhaustion Alerts** — List users at >80% of tier limit (Free: 3/2, Plus: 15/10, Business: 40/25)
- [ ] **AI Usage Trends** — Week-over-week calls by feature and tier
- [ ] **AI Cost Estimation** — Total calls × Groq cost per call (if pricing known)
- [ ] **AI Conversion Correlation** — Do AI users upgrade more often?

**Files to Create/Modify:**
```
src/app/ai-adoption/page.tsx                 — ✅ CREATED: AI adoption dashboard
src/app/api/ai-adoption/route.ts              — ✅ CREATED: Adoption analytics API
src/lib/ai-quota.ts                           — ✅ MODIFIED: Add adoption rate calculations
src/app/page.tsx                              — ✅ MODIFIED: Add AI adoption widget to dashboard
```

**Database:** No new tables (uses existing `ai_quota_usage` + `auth.users`)

**Commit:** b68ea5e

---

### P1.2 App Health & Version Adoption Tracking ✅

**Problem:** Admin has no visibility into app version adoption, active users, or platform distribution.

**Mobile App Changes Needed:**
- [ ] `lib/services/app_version_service.dart` — On sign-in/check, write to `app_usage_stats` table
- [ ] `lib/main.dart` — On each app launch, update `last_app_open` timestamp
- [ ] Add new field: `app_version` + `platform` reported on each session

**New Database Tables:**
```sql
-- supabase/app_usage_stats_schema.sql
CREATE TABLE public.app_usage_stats (
  user_id UUID PRIMARY KEY REFERENCES auth.users(id) ON DELETE CASCADE,
  platform TEXT NOT NULL,
  app_version TEXT NOT NULL,                 -- e.g. '1.0.0'
  last_app_open TIMESTAMPTZ,
  first_seen TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  total_sessions INT NOT NULL DEFAULT 1
);
```

**New Admin Capabilities:**
- [x] **Version Adoption Chart** — % users on each version (v1.0.0: 45%, v1.1.0: 35%...)
- [x] **Platform Distribution** — iOS vs Android vs Web breakdown
- [x] **Active Users (DAU/WAU/MAU)** — Daily, weekly, monthly active users
- [ ] **Retention Rates** — Day-1, Day-7, Day-30 retention
- [x] **Force Update Compliance** — Users blocked vs upgraded after force update

**Admin Console Added:**
- [x] Sidebar link in `src/components/layout/app-shell.tsx`: `/system/app-health`
- [x] `src/app/system/app-health/page.tsx`
- [x] `src/app/api/app-health/route.ts`
- [x] `src/app/system/page.tsx` tab + `src/components/layout/app-shell.tsx` nav link

**Commit:** a1ea9c3

---

### P1.3 Error & Crash Reporting ✅ COMPLETED

**Problem:** `ErrorCaptureService` stores errors locally only (SharedPreferences). Admin never sees crashes.

**Mobile App Changes Needed:**
- [ ] `lib/services/error_capture_service.dart` — In addition to local storage, submit to `error_reports` table via Supabase

**New Database Tables:**
```sql
-- supabase/error_reports_schema.sql (also see error_reports_p13.sql for admin console shape)
CREATE TABLE public.error_reports (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID REFERENCES auth.users(id) ON DELETE CASCADE,
  message TEXT NOT NULL,
  context TEXT NOT NULL,                     -- 'flutter' | 'platform' | 'zone'
  stack_head TEXT,                           -- first 6 frames
  timestamp TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  resolved BOOLEAN NOT NULL DEFAULT FALSE,
  admin_notes TEXT
);
CREATE INDEX idx_error_reports_timestamp ON public.error_reports(timestamp DESC);
CREATE INDEX idx_error_reports_user_id ON public.error_reports(user_id);
```

**New Admin Capabilities:**
- [x] **Error List** — Recent errors with stack traces, frequency
- [x] **Error by Type** — Flutter vs platform vs zone breakdown
- [x] **Affected Users** — Which users experiencing each error
- [x] **Resolution Tracking** — Mark errors as resolved, add admin notes
- [ ] **Error Frequency Trends** — Errors per day/week

**Admin Console Completed:**
- [x] `src/app/system/error-reports/page.tsx` — Error reporting dashboard (embedded in system page as tab)
- [x] `src/app/api/system/error-reports/route.ts` — Error reports API (paginated, filterable by severity)
- [x] `src/app/system/page.tsx` — Error Reports tab added with severity filter, summary cards, pagination
- [x] `supabase/error_reports_schema.sql` — Original schema
- [x] `supabase/error_reports_p13.sql` — Admin console shape (platform, app_version, severity, etc.)
- [x] `supabase/error_reports_p13_console.sql` — Reconciliation script
- [x] `supabase/error_reports_dummy_data.csv` — Test data for import

**Commit:** 83054df (also includes fixes for missing imports, TypeScript errors, default tab)

---

### P1.3b Duplicate Local Error Storage on Flush ✅ COMPLETED

**Problem:** `ErrorCaptureService` can replay the same local errors every flush, creating duplicate rows in `error_reports`.

**Solution:**
- [x] Keep each error's local identity stable (SHA1 hash of message + context + timestamp + stackHead)
- [x] Mobile: Use `upsert` with `onConflict: 'user_id, error_fingerprint'` to skip duplicates
- [x] Server: Add unique index `error_reports_fingerprint_unique` on `(user_id, error_fingerprint) WHERE error_fingerprint IS NOT NULL`

**Files Modified:**
```
lib/services/error_capture_service.dart     — Updated _submitToAdmin with onConflict upsert
supabase/error_reports_p13.sql               — Added unique index for fingerprint dedup
```

**Commit:** 254f57b

---

---

### P1.4 Feature Request Popularity Tracking

**Problem:** `ErrorCaptureService` can replay the same local errors every flush, creating duplicate rows in `error_reports`.

**Recommended behavior:**
- [x] Keep each error’s local identity stable (e.g. hash of timestamp + context + normalized message)
- [x] Skip insert if an `error_reports` row already exists for that fingerprint
- [x] Only submit new/changed local errors on each flush

**Why this matters:** Without dedup, the same crash can appear many times in the admin list and distort frequency counts.

**Commit:** pending

---

### P1.3c Admin-side Deduplication Fallback ✅ COMPLETED (merged into P1.3b)

**Solution:** Server-side unique index `error_reports_fingerprint_unique` on `(user_id, error_fingerprint) WHERE error_fingerprint IS NOT NULL` provides the race-condition fallback — conflicting upserts are silently skipped. The mobile's `onConflict: 'user_id, error_fingerprint'` handles the common case; the unique index handles the edge case of concurrent submissions from two devices.

**Files Modified:**
```
supabase/error_reports_p13.sql               — Added unique index for fingerprint dedup
```

**Commit:** 254f57b

---

### P1.4 Feature Request Popularity Tracking

**Problem:** Support requests have `request_type = 'feature_request'` but no field for WHICH feature is requested.

**Mobile App Changes Needed:**
- [ ] `lib/services/support_service.dart` — When `requestType = 'feature_request'`, include `feature_name` or `feature_id` field

**Schema Change:**
```sql
ALTER TABLE public.support_requests 
ADD COLUMN IF NOT EXISTS feature_name TEXT;
```

**New Admin Capabilities:**
- [ ] **Feature Popularity Ranking** — Which features most requested (e.g., "AI Budget Planner: 45 requests")
- [ ] **Feature Category Breakdown** — AI features vs export features vs team features
- [ ] **Feature Demand Trend** — New feature requests per week

**Files to Create/Modify:**
```
src/app/support/page.tsx                      — MODIFY: Add feature popularity section
src/lib/support.ts                            — MODIFY: Add feature breakdown stats
supabase/support_requests_schema.sql          — MODIFY: Add feature_name column
lib/services/support_service.dart             — MODIFY: Send feature_name
```

---

## Priority 2 — High (Implement Next, Week 3-6)

These enhance existing capabilities and improve operational efficiency.

---

### P2.1 Support Response Time & SLA Monitoring

**Problem:** No tracking of how long tickets sit before admin responds.

**New Admin Capabilities:**
- [ ] **Response Time Stats** — Average time from `created_at` to first `admin_notes`
- [ ] **Ticket Aging View** — Open tickets grouped by age: <24h, 1-3d, 3-7d, >7d
- [ ] **SLA Alerts** — Notifications for tickets open >48h / >72h
- [ ] **Response Time by Ticket Type** — Feature requests vs bugs vs support

**Files to Create/Modify:**
```
src/app/support/page.tsx                      — MODIFY: Add response time + aging views
src/lib/support.ts                            — MODIFY: Add response time calculations
src/app/api/support-analytics/route.ts        — NEW: Support analytics API
```

---

### P2.2 Upgrade Request Queue & Conversion Tracking

**Problem:** Mobile app sends upgrade requests via email (`aethylglobal@gmail.com`) but admin console has no tracking.

**Mobile App Changes Needed:**
- [ ] `lib/services/upgrade_request_service.dart` — Create `support_request` with type `'upgrade_request'` in database, not just email

**New Database Tables:**
```sql
-- supabase/upgrade_requests_schema.sql
CREATE TABLE public.upgrade_requests (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID REFERENCES auth.users(id) ON DELETE CASCADE,
  requested_tier TEXT NOT NULL CHECK (requested_tier IN ('plus', 'business')),
  requested_duration TEXT NOT NULL,          -- '1_month', '3_months', '1_year'
  requested_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  status TEXT NOT NULL DEFAULT 'pending' 
    CHECK (status IN ('pending', 'granted', 'cancelled', 'expired')),
  granted_at TIMESTAMPTZ,
  granted_by TEXT                             -- admin who processed
);
```

**New Admin Capabilities:**
- [ ] **Upgrade Request Queue** — List of pending requests
- [ ] **One-Click Grant** — Convert request → grant tier (creates `user_tiers` row)
- [ ] **Conversion Rate** — Requests → grants percentage
- [ ] **Pending Request Aging** — How long requests sit unaddressed

**Files to Create/Modify:**
```
src/app/subscriptions/upgrade-requests/page.tsx — NEW: Upgrade request queue
src/app/api/upgrade-requests/route.ts           — NEW: Upgrade requests API
src/app/api/upgrade-requests/[id]/grant/route.ts — NEW: Grant tier from request
src/lib/tiers.ts                                — MODIFY: Add duration parsing for upgrade
supabase/upgrade_requests_schema.sql            — NEW: Upgrade requests table
lib/services/upgrade_request_service.dart       — MODIFY: DB logging
```

---

### P2.3 Bug Report Severity Tracking

**Problem:** Bug reports have no severity field; admin can't prioritize.

**Mobile App Changes Needed:**
- [ ] `lib/services/support_service.dart` — Add `severity` field to bug reports (low/medium/high/critical)

**Schema Change:**
```sql
ALTER TABLE public.support_requests 
ADD COLUMN IF NOT EXISTS severity TEXT 
  CHECK (severity IN ('low', 'medium', 'high', 'critical') OR severity IS NULL);
```

**New Admin Capabilities:**
- [ ] **Bug Severity Breakdown** — Count by severity
- [ ] **Critical Bug Alerts** — Immediate visibility for critical bugs
- [ ] **Bug Resolution Rate** — Time to resolve by severity

**Files to Create/Modify:**
```
src/app/support/page.tsx                      — MODIFY: Add severity filter/badges
lib/services/support_service.dart             — MODIFY: Add severity field
supabase/support_requests_schema.sql          — MODIFY: Add severity column
```

---

### P2.4 Tier Expiry Alerts & Bulk Operations

**Problem:** Admin can see individual expiring tiers but no bulk operations or proactive alerts.

**New Admin Capabilities:**
- [ ] **Expiry Dashboard** — Users with plans expiring in 7/14/30 days
- [ ] **Bulk Email Notification** — Send renewal reminder to all expiring users
- [ ] **Churn Risk List** — Expiring tier + low engagement users
- [ ] **Bulk Tier Operations** — Export users by tier, bulk actions

**Files to Create/Modify:**
```
src/app/subscriptions/page.tsx                — MODIFY: Add expiry alerts section
src/app/api/user-tiers/bulk-expiry/route.ts   — NEW: Bulk expiry notification
src/lib/tiers.ts                              — MODIFY: Add bulk expiry utilities
```

---

## Priority 3 — Medium (Implement After Core, Week 5-8)

Nice-to-have analytics and compliance features.

---

### P3.1 Document Compliance Monitoring

**Problem:** Admin can view documents but can't easily spot compliance issues.

**New Admin Capabilities:**
- [ ] **Renewal Failure Tracking** — Documents expired >30 days without renewal
- [ ] **Tier Limit Compliance** — Users potentially violating collection/document limits
- [ ] **At-Risk Users** — Users with multiple expiring documents + free tier

**Files to Create/Modify:**
```
src/app/documents/compliance/page.tsx         — NEW: Compliance dashboard
src/lib/domain.ts                             — MODIFY: Add compliance checks
```

---

### P3.2 Finance Anomaly Resolution Workflow

**Problem:** Anomalies detected but no admin workflow to resolve them.

**New Admin Capabilities:**
- [ ] **Anomaly List** — All detected anomalies with status
- [ ] **Resolution Status** — Mark as investigated/resolved/false-positive
- [ ] **Anomaly Patterns** — Recurring anomaly patterns across users

**Files to Create/Modify:**
```
src/app/finance/anomalies/page.tsx           — MODIFY: Add resolution workflow
src/lib/anomaly.ts                           — MODIFY: Add resolution status
```

---

### P3.3 Tier Conversion Funnel Analytics

**Problem:** No visibility into free→paid conversion funnel.

**New Admin Capabilities:**
- [ ] **Conversion Rates** — Free→Plus, Free→Business, Plus→Business
- [ ] **Time-to-Convert** — Average time from signup to upgrade
- [ ] **Funnel Drop-off** — Where users fall out of conversion funnel
- [ ] **Cohort Analysis** — Conversion by signup month

**Files to Create/Modify:**
```
src/app/analytics/page.tsx                    — NEW: Revenue analytics dashboard
src/lib/analytics.ts                          — MODIFY: Add conversion calculations
src/app/api/analytics/route.ts                — NEW: Analytics API
```

---

### P3.4 Document & Data Quota Monitoring

**Problem:** Free tier limits (10 docs, 1 collection) not actively monitored.

**New Admin Capabilities:**
- [ ] **Quota Approach Alerts** — Users at >80% of document limit
- [ ] **Collection Lock Monitoring** — Users hitting company collection limits
- [ ] **Upsell Opportunities** — Users who would benefit from upgrade

**Files to Create/Modify:**
```
src/app/users/page.tsx                        — MODIFY: Add quota warning badges
src/lib/users.ts                              — MODIFY: Add quota calculation
```

---

## Priority 4 — Future Enhancements (Backlog)

Lower priority, implement when resources available.

---

### P4.1 Advanced Revenue Analytics
- Monthly recurring revenue (MRR) calculation
- Customer lifetime value (LTV) estimation
- Revenue by tier breakdown
- Churn rate calculation

### P4.2 Push Notification / Email Campaigns
- Admin can send broadcast messages to users
- Targeted campaigns (e.g., "Your plan expires in 7 days")
- Feature announcement campaigns

### P4.3 A/B Testing Framework
- Track feature adoption by cohort
- Test pricing pages, onboarding flows
- Measure feature impact on retention

### P4.4 Team Collaboration Features (Business Tier)
- Admin can assign documents to team members
- Team export functionality
- Renewal audit history view

---

## Summary: Implementation Order

| Order | Feature | Effort | Impact | Dependencies | Status |
|-------|---------|--------|--------|--------------|--------|
| 1 | App Health + Error Reporting | Medium | High | New DB tables, mobile changes | ✅ DONE |
| 2 | AI Adoption Dashboard | Low | High | Uses existing data | ✅ DONE |
| 3 | Feature Request Popularity | Low | High | Mobile sends feature_name | ✅ DONE |
| 4 | Support Response Time + SLA | Low | Medium | Uses existing data | Pending |
| 5 | Upgrade Request Queue | Medium | High | New DB table, mobile changes | Pending |
| 6 | Bug Severity Tracking | Low | Medium | Schema change, mobile changes | Pending |
| 7 | Tier Expiry Alerts | Low | Medium | Uses existing data | Pending |
| 8 | Document Compliance | Medium | Medium | Uses existing data | Pending |
| 9 | Anomaly Resolution | Low | Medium | Uses existing data | Pending |
| 10 | Tier Conversion Funnel | Medium | High | Requires usage stats | Pending |

---

## Quick Start: First 3 Tasks

**Task 1: App Health Foundation (Week 1)** ✅
1. Run `supabase/app_usage_stats_schema.sql` in Supabase
2. Mobile: Add `app_usage_stats` write to `app_version_service.dart` on sign-in
3. Mobile: Add `last_app_open` update to `main.dart` on each launch
4. Admin: Create `src/app/system/app-health/page.tsx`
5. Admin: Create `src/app/api/app-health/route.ts`

**Task 2: Error Reporting (Week 1-2)**
1. Run `supabase/error_reports_schema.sql` in Supabase
2. Mobile: Modify `error_capture_service.dart` to also write to `error_reports`
3. Admin: Create `src/app/system/error-reports/page.tsx`
4. Admin: Create `src/app/api/error-reports/route.ts`

**Task 3: AI Adoption Dashboard (Week 2)** ✅
1. Admin: Add adoption rate calculations to `src/lib/ai-quota.ts`
2. Admin: Create `src/app/ai-adoption/page.tsx`
3. Admin: Create `src/app/api/ai-adoption/route.ts`
4. Admin: Add AI adoption widget to `src/app/page.tsx` dashboard

---

## Database Schema Files to Create

All new schemas go in `supabase/` directory (mirrored from mobile app pattern):

```
supabase/app_usage_stats_schema.sql         — Track app version, platform, sessions
supabase/error_reports_schema.sql           — Centralized crash/error reporting
supabase/upgrade_requests_schema.sql        — Track upgrade requests + conversion
```

---

## Mobile App Files to Modify

```
lib/services/app_version_service.dart       — Add app_usage_stats write
lib/main.dart                               — Add last_app_open update
lib/services/error_capture_service.dart     — Add error_reports submission
lib/services/support_service.dart           — Add feature_name + severity fields
lib/services/upgrade_request_service.dart   — Add database logging
```

---

## Admin Console Files to Create

```
src/app/system/app-health/page.tsx            — App version + active users
src/app/system/error-reports/page.tsx         — Error/crash dashboard
src/app/ai-adoption/page.tsx                  — AI feature adoption ✅ CREATED
src/app/support/analytics/page.tsx            — Support analytics
src/app/subscriptions/upgrade-requests/page.tsx — Upgrade queue
src/app/analytics/page.tsx                    — Revenue + conversion analytics
src/app/documents/compliance/page.tsx         — Document compliance

src/app/api/app-health/route.ts               — App health API
src/app/api/error-reports/route.ts            — Error reports API
src/app/api/ai-adoption/route.ts              — AI adoption API ✅ CREATED
src/app/api/support-analytics/route.ts        — Support analytics API
src/app/api/upgrade-requests/route.ts         — Upgrade requests API
src/app/api/upgrade-requests/[id]/grant/route.ts — Grant tier from request
src/app/api/user-tiers/bulk-expiry/route.ts   — Bulk expiry notifications
```

---

## Commits

| Commit | Description | Date |
|--------|-------------|------|
| b68ea5e | feat: add AI feature adoption dashboard and country filter for documents | 2026-10-11 |

---

*End of Implementation Plan*
