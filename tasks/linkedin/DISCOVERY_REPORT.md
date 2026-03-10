# LinkedIn Integration Hub — Discovery Report

**Date**: 2026-03-10
**Branch**: `feat/linkedin-ad-manager`
**Status**: Discovery Complete

---

## Executive Summary

The LinkedIn integration spans **7 PRDs**, **18 edge functions**, **9 migrations**, **6 frontend services**, **6 hooks**, **4 separate pages**, and a full OAuth infrastructure. **5 of 7 PRDs are 65-85% implemented** with working backend and frontend code. **2 PRDs are 0% implemented** (Event-to-Pipeline Engine, Graph Import).

Currently, LinkedIn features are **scattered across 4 separate routes** (`/campaigns`, `/intelligence/ads`, `/intelligence/linkedin-revenue`, `/intelligence/linkedin-analytics`). The plan is to **consolidate under one `/linkedin` hub tab** with sub-navigation.

**5 critical blockers** must be resolved before production deployment.

---

## Current State Audit

### What's Working

| PRD | Feature | Backend | Frontend | Schema | Status |
|-----|---------|---------|----------|--------|--------|
| 1 | Lead Response Copilot | 7 edge functions | Hook + Config Modal | 4 tables | ~85% done |
| 2 | Revenue Feedback Loop | 4 edge functions | Page + Hook + Service | 4 tables | ~80% done |
| 3 | Advertising Analytics | 1 edge function | Page + Hook + Service | 3 tables + view | ~75% done |
| 4 | Ad Manager | 3 edge functions | Page + Hook + Service | 6 tables | ~65% done |
| 5 | Ad Library Intelligence | 5 edge functions | Page + Hook + Service | 3 tables | ~80% done |
| 6 | Event-to-Pipeline Engine | None | None | None | 0% |
| 7 | Graph Import | None | None | None | 0% |

### Current Route Fragmentation

| Route | Page | Feature |
|-------|------|---------|
| `/campaigns` | `CampaignsPage.tsx` | Ad Manager (campaigns, groups, creatives, approvals, audiences) |
| `/intelligence/ads` | `AdLibrary.tsx` | Ad Library Intelligence (search, watchlist, analytics) |
| `/intelligence/linkedin-revenue` | `LinkedInRevenue.tsx` | Revenue Feedback Loop (conversion rules, pipeline milestones) |
| `/intelligence/linkedin-analytics` | `LinkedInAnalytics.tsx` | Advertising Analytics (performance, demographics, sync) |

### Edge Functions Inventory (18 total)

**Lead Ingestion (7)**:
- `webhook-linkedin/index.ts` — Public webhook receiver, HMAC verification
- `linkedin-lead-ingest/index.ts` — Lead normalization pipeline (5 sub-modules: matching, scoring, drafting, notification, tasks)
- `linkedin-lead-reconcile/index.ts` — Missed webhook reconciliation poller

**OAuth & Tokens (3)**:
- `linkedin-oauth-callback/index.ts` — Public OAuth callback, token exchange
- `oauth-initiate/providers/linkedin.ts` — OAuth flow initiation
- `oauth-token-refresh/providers/linkedin.ts` — Proactive token refresh

**Campaign Management (3)**:
- `linkedin-campaign-manager/index.ts` — 18-action CRUD router (campaigns, groups, creatives, audiences)
- `linkedin-campaign-sync/index.ts` — Bidirectional sync with LinkedIn
- `linkedin-campaign-approval/index.ts` — Approval workflow

**Analytics & Revenue (3)**:
- `linkedin-analytics-sync/index.ts` — Performance + demographic data sync
- `linkedin-campaign-quality-alert/index.ts` — Quality scoring alerts
- `linkedin-conversion-config/index.ts` + `linkedin-conversion-trigger/index.ts` + `linkedin-conversion-stream/index.ts` — Revenue feedback loop

**Ad Library (4+1)**:
- `linkedin-ad-capture/index.ts` — Apify scraper for competitor ads
- `linkedin-ad-search/index.ts` — AI-powered search, clustering, trends
- `linkedin-ad-classify/index.ts` — AI classification (angle, persona, offer)
- `linkedin-ad-digest/index.ts` — Periodic insight summaries
- `linkedin-ad-enrich/index.ts` — Engagement enrichment

### Database Schema (9 migrations)

| Migration | Tables Created |
|-----------|---------------|
| `20260309211920_linkedin_lead_tables.sql` | `linkedin_org_integrations`, `linkedin_lead_sources`, `linkedin_sync_runs` |
| `20260309220115_linkedin_ad_library_tables.sql` | `linkedin_ad_library_watchlist`, `linkedin_ad_library_ads`, `linkedin_ad_library_classifications` |
| `20260309231228_linkedin_revenue_feedback_loop.sql` | `linkedin_conversion_rules`, `linkedin_conversion_mappings`, `linkedin_conversion_events`, `linkedin_conversion_delivery_log` |
| `20260309232430_linkedin_advertising_analytics.sql` | `linkedin_campaign_metrics`, `linkedin_demographic_metrics`, `linkedin_analytics_with_pipeline` view |
| `20260310080252_linkedin_campaign_management.sql` | `linkedin_managed_campaign_groups`, `linkedin_managed_campaigns`, `linkedin_managed_creatives`, `linkedin_managed_lead_forms`, `linkedin_campaign_approvals` |
| `20260310090740_linkedin_integration_rls_write_policies.sql` | RLS policies (UNTRACKED) |
| `20260310091242_add_engagement_to_ad_library.sql` | Engagement columns (UNTRACKED) |
| `20260310092143_linkedin_matched_audiences.sql` | `linkedin_matched_audiences` (UNTRACKED) |
| `20260310100238_add_is_saved_to_ad_library.sql` | `is_saved` column (UNTRACKED) |

---

## Critical Blockers (5)

### CRITICAL-1: Missing Token Storage Columns on `linkedin_org_integrations`

**Impact**: ALL LinkedIn features requiring fresh tokens will fail silently.

Edge functions reference `access_token_encrypted`, `refresh_token_encrypted`, `token_expires_at` columns on `linkedin_org_integrations`, but the migration creates the table **without these columns**.

**Affected files**:
- `linkedin-analytics-sync/index.ts` (reads tokens)
- `oauth-token-refresh/providers/linkedin.ts` (refreshes tokens)
- `linkedin-oauth-callback/index.ts` (stores tokens)

**Fix**: Create migration adding the missing columns:
```sql
ALTER TABLE linkedin_org_integrations
  ADD COLUMN IF NOT EXISTS access_token_encrypted text,
  ADD COLUMN IF NOT EXISTS refresh_token_encrypted text,
  ADD COLUMN IF NOT EXISTS token_expires_at timestamptz;
```

### CRITICAL-2: Webhook Org Resolution Drops Leads Silently

**Impact**: Leads from unregistered forms or multi-org setups are silently discarded.

`webhook-linkedin/index.ts` returns HTTP 200 on failed org resolution (preventing LinkedIn retries) with only a `console.error` — no audit trail, no alerting.

**Fix**: Log failed resolutions to a `linkedin_webhook_resolution_failures` table and add daily alert.

### CRITICAL-3: OAuth State Not Single-Use

**Impact**: Potential account takeover vector — intercepted OAuth redirects can be replayed.

`linkedin-oauth-callback/index.ts` validates state expiry but doesn't mark it as used. A second use of the same state succeeds.

**Fix**: Add `used_at` column to `linkedin_oauth_states`, set on first use, reject if already set.

### CRITICAL-4: API Scopes Incomplete for All 7 PRDs

**Impact**: Ad Manager campaign creation/editing will fail with 401.

OAuth currently requests 5 read-only scopes. Missing:
- `rw_ads` — needed to create/edit campaigns (Ad Manager PRD)
- `rw_conversions` — needed to stream conversion events (Revenue Feedback Loop PRD)

**Fix**: Update scopes in `oauth-initiate/providers/linkedin.ts`. Note: existing users must re-authorize.

### CRITICAL-5: Untracked Migration Files

**Impact**: 3 migration files (`..._rls_write_policies.sql`, `..._engagement_to_ad_library.sql`, `..._matched_audiences.sql`) exist on disk but aren't committed — won't apply in CI/production.

**Fix**: Review, test with `npx supabase db push --linked --dry-run`, and commit.

---

## Medium Risks (6)

| Risk | Impact | Mitigation |
|------|--------|------------|
| RLS INSERT policy missing for `linkedin_lead_sources` | Frontend can't create new lead sources | Add INSERT policy to RLS migration |
| Token refresh ignores long-lived tokens | 60-day tokens may expire between cron runs | Refresh when age > 30 days |
| Webhook accepts unsigned requests in staging | Security hole — fake leads possible | Always verify HMAC if secret exists |
| Lead ingest no email validation | Malformed emails stored as contacts | Add regex validation |
| No transaction isolation on lead dedup | Race condition on duplicate webhooks | Check existing before sync_run creation |
| Ad Library engagement columns migration untracked | Engagement data can't be stored | Commit migration |

---

## Unified Hub Architecture

### Navigation Design

Follow the **ProspectingHub pattern** (`src/pages/ProspectingHub.tsx`): custom pill-style tab component with state-driven content switching.

```
/linkedin (Hub Shell)
  ├── Overview tab (dashboard: connection status, key metrics, recent activity)
  ├── Leads tab (Lead Response Copilot — inbound leads, scoring, follow-up drafts)
  ├── Campaigns tab (Ad Manager — CRUD, creatives, approvals, lead forms)
  ├── Analytics tab (Advertising Analytics — performance, demographics, anomalies)
  ├── Revenue tab (Revenue Feedback Loop — conversion rules, pipeline quality)
  ├── Ad Library tab (Ad Library Intelligence — competitor monitoring, trends)
  ├── Events tab (Event-to-Pipeline — registrations, pre/post event workflows)
  ├── Network tab (Graph Import — archive upload, trust scoring overlay)
  └── Audiences tab (Matched Audiences — Ops table → LinkedIn audience sync)
```

### Ops Table Integration Points

| Feature | Ops Table Integration |
|---------|----------------------|
| Matched Audiences | Build LinkedIn audiences directly from Ops table rows via `push_ops_to_audience` (partially implemented) |
| Event Registrants | Auto-create Ops table from event registrant data for segmentation/enrichment |
| Lead Tracking | LinkedIn-sourced leads visible in Ops tables with source attribution |
| Campaign Contacts | Export campaign target lists as Ops tables for enrichment workflows |
| Ad Library | Save competitor ad collections as Ops table for team collaboration |

### Pipeline Status Tracking

LinkedIn-sourced contacts flow through the standard pipeline with source attribution:
```
LinkedIn Lead → Contact (source: linkedin) → Meeting Booked → Proposal → Deal → Won/Lost
                    ↓                              ↓                ↓          ↓
              Conversion Event           Conversion Event    Conversion   Revenue
              → LinkedIn API             → LinkedIn API      Event        Signal
```

Pipeline milestones mapped to LinkedIn conversion rules:
- `qualified_lead` → `meeting_booked` → `meeting_held` → `proposal_sent` → `closed_won`

---

## Dependency Graph

```
                    ┌────────────────────────────────┐
                    │     LinkedIn OAuth Foundation   │
                    │          (COMPLETE)             │
                    └──────────┬─────────────────────┘
                               │
           ┌───────────────────┼──────────────────────┐
           │                   │                      │
     ┌─────▼────┐    ┌────────▼───────┐    ┌─────────▼──────────┐
     │ Lead     │    │  Ad Manager    │    │  Ad Library         │
     │ Copilot  │    │  (PRD 4)       │    │  Intelligence       │
     │ (PRD 1)  │    │  ~65% done     │    │  (PRD 5)            │
     │  ~85%    │    └───┬────────┬───┘    │  ~80% done          │
     └─────┬────┘       │        │         └────────────────────┘
           │        ┌───▼────┐  ┌▼───────────────┐    (standalone)
     ┌─────▼────┐   │Analytics│  │Event-to-Pipeline│
     │ Revenue  │   │(PRD 3)  │  │   (PRD 6)       │
     │ Feedback │   │~75% done│  │   0% done       │
     │ (PRD 2)  │   └─────────┘  └─────────────────┘
     │ ~80% done│
     └──────────┘

     ┌──────────────────────┐
     │ Graph Import (PRD 7) │   ← fully independent, no LinkedIn API
     │      0% done         │
     └──────────────────────┘
```

---

## Complexity Score

| Dimension | Score | Rationale |
|-----------|-------|-----------|
| storyCount | 2 | ~49 stories across 7 PRDs |
| schemaChanges | 1 | 2 new PRDs need schema (9 new tables), plus 3 uncommitted migrations |
| externalAPIs | 2 | LinkedIn Advertising API, Conversions API, Events API, Lead Sync API, Apify |
| crossFeatureDeps | 1 | Heavy cross-PRD integration (shared OAuth, pipeline overlay, audience sync) |
| securitySurface | 2 | Public webhook, OAuth, token storage, budget-impacting writes, PII |
| novelArchitecture | 2 | Unified hub shell, bidirectional sync, AI campaign generation, trust scoring |
| **Total** | **10** | **Tier 4** |

---

## Build Plan

### Phase 0: Foundation Fixes (2-3 days)
**Must do before anything else:**
1. Fix token storage columns migration (CRITICAL-1)
2. Fix OAuth state single-use (CRITICAL-3)
3. Add missing scopes to OAuth flow (CRITICAL-4)
4. Commit untracked migrations (CRITICAL-5)
5. Fix webhook org resolution logging (CRITICAL-2)
6. Fix RLS INSERT policy gap
7. Add webhook rate limiting — 10 req/min per IP (Improvement #3)
8. Test on staging: `npx supabase db push --linked --dry-run`

### Phase 1: Hub Shell + Navigation Consolidation (3-5 days)
**Ship: Unified `/linkedin` route with all existing features under one tab**
1. Create `LinkedInHub.tsx` page with ProspectingHub-style tab navigation
2. Create `LinkedInHubTabs.tsx` component with pill-style tabs
3. Build **Overview Dashboard** as default tab (Improvement #1):
   - Connection health status + token expiry
   - Leads this week (count, top ICP scores)
   - Campaign spend summary (active campaigns, total spend, top performer)
   - Recent competitor ads (latest from watchlist)
   - Upcoming events (if Event-to-Pipeline is built)
   - Quick action buttons (new campaign, search ads, view pipeline)
4. Build **LinkedIn Health Monitor** in hub header (Improvement #4):
   - Token expiry countdown badge
   - Last sync timestamp
   - Webhook delivery rate (last 24h success %)
   - API quota usage indicator
5. Build **Onboarding Wizard** for first-time users (Improvement #2):
   - Step 1: Connect LinkedIn (OAuth flow)
   - Step 2: Select scopes and ad accounts
   - Step 3: Sync lead gen forms
   - Step 4: Create first campaign or explore ad library
   - Shown when `!isConnected`, dismissible after completion
6. Refactor existing pages into tab-content components:
   - `LinkedInOverviewTab.tsx` (new — default tab)
   - `LinkedInLeadsTab.tsx` (from Lead Copilot config)
   - `LinkedInCampaignsTab.tsx` (from CampaignsPage)
   - `LinkedInAnalyticsTab.tsx` (from LinkedInAnalytics)
   - `LinkedInRevenueTab.tsx` (from LinkedInRevenue)
   - `LinkedInAdLibraryTab.tsx` (from AdLibrary)
7. Consolidate 4 route entries into 1 in `routeConfig.ts`
8. Support URL params for deep-linking to tabs (`/linkedin?tab=campaigns`)

### Phase 2: Polish Existing PRDs (5-8 days)
**Ship: All 5 existing PRDs fully functional**

_Can be parallelized across 2-3 developers:_

**Group A: Ad Manager Completion (5-7 days)**
- Campaign creation wizard (multi-step form)
- Creative builder with AI copy generation
- Lead gen form builder
- Drift detection and reconciliation UI
- Bulk campaign actions

**Group B: Analytics + Revenue Polish (3-4 days)**
- Anomaly detection engine
- Demographic pivot UI improvements
- CSV export
- Campaign quality dashboard for Revenue Feedback
- Slack alert wiring for low-quality campaigns

**Group C: Ad Library + Lead Copilot Polish (2-3 days)**
- Battlecard/proposal integration hooks
- Weekly digest scheduling
- Trend view finalization
- Lead reconciliation cron setup

### Phase 3: Audiences + Ops Table Integration + Attribution (4-6 days)
**Ship: LinkedIn audiences built from Ops tables, pipeline tracking, cross-feature attribution**
1. Audience management tab in hub
2. Build audience from any Ops table (enhance existing `push_ops_to_audience`)
3. LinkedIn-sourced lead tracking in Ops tables
4. Campaign performance as Ops table view
5. Source attribution on contacts/deals for pipeline overlay
6. **Cross-feature attribution chain** (Improvement #5):
   - Track provenance: Ad Library insight → campaign ideation → campaign creation → lead form → contact → deal → revenue
   - Add `attribution_chain` JSONB column to contacts/deals (or dedicated `linkedin_attribution_events` table)
   - Surface in Overview Dashboard: "This deal was sourced from a campaign inspired by competitor ad X"
   - Enable full-loop reporting: "Ad Library insights that led to campaigns that generated $X revenue"

### Phase 4: Event-to-Pipeline Engine (8-12 days)
**Ship: Full event lifecycle management**
1. Schema migration (5 new tables)
2. Event connection + sync edge functions
3. Registrant prioritization service
4. Pre-event Slack briefing
5. Post-event follow-up (attendee/no-show branching)
6. Event registrant list as Ops table
7. Event-to-pipeline reporting tab in hub

### Phase 5: Graph Import (4-6 days)
**Ship: Personal relationship overlay**
1. Schema migration (4 user-scoped tables)
2. Archive upload wizard (reuse CSVImportOpsTableWizard pattern)
3. LinkedIn archive parser (Connections.csv + messages)
4. Trust scoring computation
5. CRM contact matching layer
6. Overlay in relationship health UI + Network tab in hub

---

## Parallel Execution Plan

With 2 developers over ~3 weeks:

```
Week 1:  Dev A: Phase 0 (fixes) + Phase 1 (hub shell)
         Dev B: Phase 2 Group A (Ad Manager)

Week 2:  Dev A: Phase 2 Groups B+C (Analytics/Revenue/AdLib polish)
         Dev B: Phase 3 (Audiences + Ops tables)

Week 3:  Dev A: Phase 4 start (Events schema + edge functions)
         Dev B: Phase 5 (Graph Import)

Week 4:  Both: Phase 4 completion (Events UI + testing)
```

---

## MVP Definition

**Minimum Viable LinkedIn Hub** that delivers immediate value:

1. Hub Navigation Shell with 6 tabs (Overview, Leads, Campaigns, Analytics, Revenue, Ad Library)
2. Overview Dashboard with connection health, key metrics, recent activity, quick actions
3. Health Monitor in hub header (token expiry, sync status, webhook delivery rate)
4. Onboarding Wizard for first-time LinkedIn connection
5. Webhook rate limiting on public endpoint
6. All 5 existing features consolidated and polished
7. Audiences tab with Ops table integration
8. Critical blocker fixes (token columns, OAuth security, scopes, migrations)

**Estimated: 14-18 days of focused development**

Phases 4 (Events) and 5 (Graph Import) can ship as v2 — they are lower priority and have zero existing implementation. Cross-feature attribution (Improvement #5) ships with Phase 3 as it requires the Ops table integration layer.

---

## Brief Improvement Suggestions

Before we continue, here are 5 ways I'd strengthen this integration:

1. **[SCOPE]** Add a unified LinkedIn Overview dashboard as the default tab — show connection health, leads this week, campaign spend, top-performing ads, and upcoming events in one glance
2. **[UX]** Add an onboarding wizard for first-time LinkedIn users — walk them through OAuth, scope selection, form sync, and first campaign setup in 4 steps instead of letting them discover features piecemeal
3. **[SECURITY]** Add rate limiting on the webhook endpoint — public-facing, currently accepts unlimited requests which could be abused for DDoS or fake lead injection
4. **[OPS]** Add a LinkedIn health monitor in the hub header — show token expiry countdown, sync last-run status, webhook delivery rate, and API quota usage so users know immediately if something's broken
5. **[DATA]** Add cross-feature attribution linking — when a lead comes from an ad that was inspired by an Ad Library insight, capture that provenance chain so users can see the full intelligence → campaign → lead → revenue loop

**All 5 selected** — incorporated into the build plan as cross-cutting requirements.

### How These Map to the Build Plan

| Improvement | Phase | Integration Point |
|-------------|-------|-------------------|
| 1. Overview Dashboard | Phase 1 (Hub Shell) | Default tab showing connection health, leads this week, campaign spend, top ads, upcoming events |
| 2. Onboarding Wizard | Phase 1 (Hub Shell) | First-time experience: OAuth → scope selection → form sync → first campaign, shown when `!isConnected` |
| 3. Webhook Rate Limiting | Phase 0 (Foundation Fixes) | Add to `webhook-linkedin/index.ts`: in-memory rate limit (10 req/min per IP, same pattern as `demo-research`) |
| 4. Health Monitor | Phase 1 (Hub Shell) | Persistent banner in hub header: token expiry countdown, last sync time, webhook delivery rate, API quota |
| 5. Cross-Feature Attribution | Phase 3 (Ops Table Integration) | Provenance chain on contacts: Ad Library insight → campaign → lead form → contact → deal → revenue |
