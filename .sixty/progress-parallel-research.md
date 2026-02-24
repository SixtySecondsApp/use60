# Progress Log — Parallel Research Upgrade

## Feature Overview
Upgrade `researchCompanyNewsAdapter` from single `deep-enrich-organization` call to 5 parallel Gemini web-grounded research queries with AI synthesis. Save enrichment to companies table. Upgrade Gemini model. Fix Slack Block Kit for meeting briefings.

## Architecture Decisions
- Call Gemini API directly from adapter (not via gemini-research edge function) — avoids auth complexity + 5x HTTP overhead
- 5 parallel queries: Company Overview, Products & Market, Funding & Growth, Leadership & Team, Competition & News
- Claude Haiku synthesis merges 5 results (same pattern as existing generateBriefingAdapter)
- enrichment_data JSONB column on companies table stores full structured profile
- buildMeetingPrepMessage() reused for rich Slack Block Kit formatting

## Key Reuse Points
- Gemini API + Google Search grounding pattern from `gemini-research/index.ts`
- Claude Haiku synthesis pattern from `generateBriefingAdapter` in preMeeting.ts
- `buildMeetingPrepMessage()` + `MeetingPrepData` interface from `_shared/slackBlocks.ts`
- `getServiceClient()` from `contextEnrichment.ts`
- `useContactCompanyGraph` hook for company data fetching

---

## Session Log

### 2026-02-14 17:30 — RES-001 + RES-002 + RES-003 (Wave 1) ✅
**Stories**: Migration + Gemini model upgrade + Parallel research adapter rewrite
**Files**: supabase/migrations/20260214190000_add_company_enrichment_data.sql, supabase/functions/gemini-research/index.ts, supabase/functions/_shared/orchestrator/adapters/preMeeting.ts
**Time**: ~15 min (est: 35 min combined)
**Learnings**: `gemini-3-flash-preview` is the correct model ID (found in src/lib/prompts/index.ts). Direct Gemini API calls from adapter avoid auth complexity.

---

### 2026-02-14 17:35 — RES-004 + RES-005 + RES-006 (Wave 2) ✅
**Stories**: Save enrichment to companies + Slack Block Kit handler + CompanyProfile display
**Files**: preMeeting.ts, send-slack-message/index.ts, CompanyMainContent.tsx, models.ts
**Time**: ~10 min (est: 45 min combined)
**Learnings**: `useContactCompanyGraph` uses `select('*')` so new columns auto-selected. `buildMeetingPrepMessage` imported from `_shared/slackBlocks.ts`.

---

### 2026-02-14 17:42 — RES-007 ✅
**Story**: Deploy all functions, run migration, e2e test with live data
**Files**: 3 edge functions deployed, migration applied
**Gates**: deploy ✅ | e2e test ✅
**E2E Results**:
- Job status: `completed` (5/5 steps)
- 5/5 parallel Gemini queries succeeded, 7 web sources
- Company: Businesstransfergroup (businesstransfergroup.com)
- Classification: re-engagement, discovery call
- `companies.enrichment_data` populated: key_people (5), competitors (5+), products (7+), recent_news (3+)
- Claude Haiku briefing: 5 talking points, 5 questions, 3 risk signals
- Slack delivery: delivered=true, method=slack, Block Kit message sent

