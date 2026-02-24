# Progress Log — Platform API Usage Dashboard

## Feature Overview
Platform admin screen for tracking API usage across MeetingBaaS, Gladia, and Deepgram with:
- Cost monitoring and plan limit tracking
- Progress bars showing usage vs limits
- Slack alerts at 80%, 90%, 100% thresholds
- Daily cron sync + manual refresh

---

## Codebase Patterns
<!-- Reusable learnings -->

- Platform admin pages use `isPlatformAdmin` from `useUserPermissions()`
- Existing pattern: `src/pages/platform/CostAnalysis.tsx`
- Edge functions use Deno, access secrets via `Deno.env.get()`
- Service role bypasses RLS for platform-level tables
- Lazy imports via `src/routes/lazyPages.tsx`

---

## Provider API Reference

### MeetingBaaS
- Base: `https://api.meetingbaas.com`
- Auth: `x-spoke-api-key` header
- Secret: `MEETINGBAAS_API_KEY`
- Metrics: bots deployed, recording minutes, storage

### Gladia
- Base: `https://api.gladia.io`
- Auth: `x-gladia-key` header
- Secret: `GLADIA_API_KEY`
- Free tier: 10 hours/month
- Metrics: transcription minutes, API calls

### Deepgram
- Base: `https://api.deepgram.com`
- Auth: `Authorization: Token {key}`
- Secret: `DEEPGRAM_API_KEY`
- May need: `DEEPGRAM_PROJECT_ID`
- Metrics: transcription hours, requests, cost

---

## Session Log

### Session 2026-01-25

**USAGE-001**: ✅ Created schema
- Migration: `20260125185615_create_api_usage_snapshots.sql`
- Tables: `api_usage_snapshots`, `api_usage_alerts`
- Fixed UNIQUE constraint syntax error

**USAGE-002, 003, 004**: ✅ Provider fetch functions (parallel)
- `supabase/functions/fetch-meetingbaas-usage/`
- `supabase/functions/fetch-gladia-usage/`
- `supabase/functions/fetch-deepgram-usage/`
- All deployed to staging

**USAGE-005**: ✅ Cron orchestrator
- `supabase/functions/api-usage-cron/`
- Calls all fetch functions + alerts
- Deployed to staging

**USAGE-006**: ✅ Alerts function
- `supabase/functions/api-usage-alerts/`
- Checks 80%, 90%, 100% thresholds
- Sends Slack notifications
- Deployed to staging

**USAGE-007**: ✅ Frontend service + types
- `src/lib/types/apiUsage.ts`
- `src/lib/services/apiUsageService.ts`

**USAGE-008**: ✅ Dashboard page
- `src/pages/platform/ApiUsageDashboard.tsx`
- Progress bars, status badges, refresh button

**USAGE-009**: ✅ Route + navigation
- Added lazy import in `lazyPages.tsx`
- Added import + route in `App.tsx`
- Added nav card in `PlatformDashboard.tsx`

---

## Stories Status

| ID | Title | Status | Time |
|----|-------|--------|------|
| USAGE-001 | Create api_usage_snapshots table | ✅ complete | ~10m |
| USAGE-002 | Create fetch-meetingbaas-usage function | ✅ complete | ~5m |
| USAGE-003 | Create fetch-gladia-usage function | ✅ complete | ~5m |
| USAGE-004 | Create fetch-deepgram-usage function | ✅ complete | ~5m |
| USAGE-005 | Create api-usage-cron function | ✅ complete | ~5m |
| USAGE-006 | Create api-usage-alerts function | ✅ complete | ~8m |
| USAGE-007 | Create apiUsageService | ✅ complete | ~5m |
| USAGE-008 | Create ApiUsageDashboard page | ✅ complete | ~10m |
| USAGE-009 | Add refresh button and navigation | ✅ complete | ~5m |

**All 9 stories complete!**

---

## Files Created/Modified

### Edge Functions (supabase/functions/)
- `fetch-meetingbaas-usage/index.ts` - NEW
- `fetch-gladia-usage/index.ts` - NEW
- `fetch-deepgram-usage/index.ts` - NEW
- `api-usage-cron/index.ts` - NEW
- `api-usage-alerts/index.ts` - NEW

### Migrations (supabase/migrations/)
- `20260125185615_create_api_usage_snapshots.sql` - NEW

### Frontend (src/)
- `lib/types/apiUsage.ts` - NEW
- `lib/services/apiUsageService.ts` - NEW
- `pages/platform/ApiUsageDashboard.tsx` - NEW
- `routes/lazyPages.tsx` - MODIFIED (added export)
- `App.tsx` - MODIFIED (added import + route)
- `pages/platform/PlatformDashboard.tsx` - MODIFIED (added nav card)

---

## Required Secrets (check in Supabase dashboard)

- `MEETINGBAAS_API_KEY` - For bot stats
- `GLADIA_API_KEY` - For transcription stats
- `DEEPGRAM_API_KEY` - For transcription stats
- `PLATFORM_ALERTS_SLACK_WEBHOOK` - For alerts (optional, falls back to SLACK_WEBHOOK_URL)

---

## Next Steps

1. Test the dashboard at `/platform/api-usage`
2. Configure provider API keys if not already set
3. Set up daily cron schedule for `api-usage-cron`
4. Test Slack alerts work with thresholds
