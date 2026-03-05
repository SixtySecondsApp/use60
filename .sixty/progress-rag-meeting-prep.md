# Progress Log — RAG-Enhanced Pre-Meeting Prep (PRD-PMP-002)

## Codebase Patterns

- `_shared/memory/ragClient.ts` — existing RAGClient with circuit breaker, caching, `queryBatch()` for parallel queries
- `_shared/memory/types.ts` — RAGResult, RAGFilters, DealMemorySnapshot, Commitment types already defined
- `_shared/orchestrator/adapters/preMeeting.ts` — 5-adapter pipeline (enrich → CRM → news → briefing → Slack)
- `_shared/slackBlocks.ts` — Block Kit builders with text truncation safety
- `_shared/costTracking.ts` — `logAICostEvent()` + `logFlatRateCostEvent()` for credit tracking
- Meetings table uses `owner_user_id` (NOT user_id), calendar_events uses `user_id`
- RAGClient filters support: `contact_id`, `date_from`, `date_to`, `owner_user_id` — NOT `deal_id` directly
- Existing `createDealMemoryReader()` in preMeeting.ts already imported but used for snapshot/events, not RAG queries
- Edge functions deploy to staging with `--no-verify-jwt` (project ref: caerqjzvuerejfrdtygb)

## Key Files

| File | Purpose |
|------|---------|
| `supabase/functions/proactive-meeting-prep/index.ts` | Cron entry point, routes to orchestrator |
| `supabase/functions/_shared/orchestrator/adapters/preMeeting.ts` | 5-adapter pipeline (MODIFIED) |
| `supabase/functions/_shared/meeting-prep/types.ts` | All meeting prep types (NEW) |
| `supabase/functions/_shared/meeting-prep/ragQueries.ts` | RAG query definitions + execution (NEW) |
| `supabase/functions/_shared/meeting-prep/historyDetector.ts` | First vs return meeting detection (NEW) |
| `supabase/functions/_shared/meeting-prep/briefingComposer.ts` | Prompt builders + formatters (NEW) |
| `supabase/functions/demo-prep-briefing/index.ts` | SSE demo endpoint (NEW) |
| `supabase/functions/demo-recent-meetings/index.ts` | Recent meetings API (NEW) |
| `src/pages/platform/DemoPrepBriefing.tsx` | Demo UI page (NEW) |
| `src/App.tsx` | Route wiring (MODIFIED) |
| `src/lib/routes/routeConfig.ts` | Route config (MODIFIED) |
| `src/routes/lazyPages.tsx` | Lazy import (MODIFIED) |

## Architecture Decision: RAGClient vs DealMemoryReader

Used RAGClient for transcript-based queries (conversation summary, objections, commitments from meeting transcripts). DealMemoryReader provides structured snapshots (stakeholder maps, open commitments) when a deal_id exists. The adapter uses BOTH: RAGClient for transcript-depth queries, DealMemoryReader for structured deal context.

---

## Session Log

### 2026-02-25 — RAG-001 ✅
**Story**: Create RAG query definitions and parallel execution module
**Files**: `_shared/meeting-prep/types.ts`, `_shared/meeting-prep/ragQueries.ts`
**Gates**: code review ✅
**Notes**: 8 queries defined (6 required, 2 nice-to-have). getHistoricalContext() uses Promise.allSettled for fault tolerance. RAGClient re-exported for caller convenience.

### 2026-02-25 — RAG-002 ✅ (parallel with RAG-003)
**Story**: History detector — first vs return meeting classification
**Files**: `_shared/meeting-prep/historyDetector.ts`
**Gates**: code review ✅
**Notes**: Queries calendar_events, filters attendees in-memory (JSONB containment is complex). Handles both {email,name} and plain string attendee formats.

### 2026-02-25 — RAG-003 ✅ (parallel with RAG-002)
**Story**: Briefing composer with first/return prompts
**Files**: `_shared/meeting-prep/briefingComposer.ts`
**Gates**: code review ✅
**Notes**: Two prompt templates, two Slack block builders, two markdown formatters. Slack sections truncated to 2800 chars, headers to 150 chars. Unicode ellipsis for truncation.

### 2026-02-25 — RAG-004 ✅
**Story**: Integrate RAG pipeline into preMeeting generateBriefingAdapter
**Files**: `_shared/orchestrator/adapters/preMeeting.ts`
**Gates**: code review ✅
**Notes**: Added 3 blocks: (1) imports, (2) history detection + RAG queries after deal memory, (3) conditional prompt builder (return vs first meeting). All wrapped in try/catch for graceful degradation. createRAGClient aliased as createPrepRAGClient to avoid name collision.

### 2026-02-25 — RAG-005 ✅
**Story**: Upgrade Slack delivery adapter for return-meeting format
**Files**: `_shared/orchestrator/adapters/preMeeting.ts`
**Gates**: code review ✅
**Notes**: deliverSlackBriefingAdapter now routes to buildReturnMeetingSlackBlocks when briefing._isReturnMeeting is set. Existing block building preserved as else branch.

### 2026-02-25 — DEMO-001 ✅ (parallel with DEMO-002)
**Story**: demo-prep-briefing edge function with SSE streaming
**Files**: `supabase/functions/demo-prep-briefing/index.ts`
**Gates**: code review ✅
**Notes**: 5-step SSE pipeline (load → history → RAG → compose → deliver). StepTrackerImpl class for real-time progress. Fire-and-forget cost tracking. Method guard returns 405 for non-POST.

### 2026-02-25 — DEMO-002 ✅ (parallel with DEMO-001)
**Story**: demo-recent-meetings API endpoint
**Files**: `supabase/functions/demo-recent-meetings/index.ts`
**Gates**: code review ✅
**Notes**: Returns last 10 external meetings. Limit param clamped 1-20. Handles both JSONB attendee formats.

### 2026-02-25 — DEMO-003 + DEMO-004 ✅
**Story**: Demo briefing page with meeting selector, progress, and preview
**Files**: `src/pages/platform/DemoPrepBriefing.tsx`, `src/App.tsx`, `src/lib/routes/routeConfig.ts`, `src/routes/lazyPages.tsx`
**Gates**: code review ✅
**Notes**: Full page with SSE streaming, step progress, briefing renderer (converts Slack blocks to styled HTML), copy markdown, send to Slack. Platform admin only at /platform/demo/prep-briefing.

### 2026-02-25 — POL-001 ✅
**Story**: Attendee comparison — new/returning/absent detection
**Files**: `_shared/meeting-prep/historyDetector.ts`
**Gates**: code review ✅
**Notes**: compareAttendees() for lightweight version, compareAttendeesWithAbsent() for full version with absent regulars. getAllPriorAttendees() queries all prior meeting attendees.

### 2026-02-25 — POL-002 ✅
**Story**: Mixed meetings — new + returning attendee profiles
**Files**: `_shared/meeting-prep/briefingComposer.ts`
**Gates**: code review ✅
**Notes**: Added per-classification rendering instructions to the return-meeting prompt.

### 2026-02-25 — POL-003 ✅
**Story**: Edge cases — timeouts, attendee limits
**Files**: `_shared/meeting-prep/ragQueries.ts`
**Gates**: code review ✅
**Notes**: 15s per-query timeout, 25s overall phase timeout, max 8 attendees for RAG scoping. queryWithTimeout() wraps individual queries. Overall timeout via Promise.race.

---

---

## Phase 4 — Visual Enhancements + Ask Question + Email Draft Fix

### Stories: VIS-001, VIS-002, ASK-002, ASK-003, FIX-001, FIX-002, FIX-003, DEPLOY-001

#### Key files being modified
| File | Stories | Change |
|------|---------|--------|
| `_shared/meeting-prep/attendeeResearcher.ts` | VIS-001 | Add `profile_image_url` field, extract from Apify |
| `_shared/meeting-prep/briefingComposer.ts` | VIS-002 | Logo.dev accessory, per-attendee image blocks, Ask Question button |
| `slack-interactive/handlers/prepBriefing.ts` | ASK-002, ASK-003, FIX-003 | ask_question case, modal submission handler, model/prompt/draft fixes |
| `slack-interactive/index.ts` | ASK-002, ASK-003 | Pass trigger_id+context, wire view_submission case |
| `email-send-as-rep/index.ts` | FIX-001 | `toBase64Url()`, `draft` param |
| `google-gmail/gmail-actions.ts` | FIX-002 | `toBase64Url()` fix |

#### Patterns
- Logo.dev token: `pk_X-1ZO13GSgeOoUrIuJ6GMQ` (from `src/lib/utils/logoDev.ts`)
- Logo.dev URL: `https://img.logo.dev/{domain}?token=pk_X-1ZO13GSgeOoUrIuJ6GMQ&size=64&format=png`
- Slack image accessory pattern: `{ type: 'image', image_url: '...', alt_text: '...' }` — omit entirely if URL is null (Slack errors on invalid URLs)
- Slack `views.open` requires `trigger_id` (expires after 3s from button click)
- Gmail Drafts API: POST to `.../drafts`, body `{ message: { raw: base64url } }` (unlike send which uses `{ raw: base64url }` directly)
- `toBase64Url` pattern: `new TextEncoder().encode(str)` → byte array → `String.fromCharCode` → `btoa` → URL-safe replace
- Exa API key: `EXA_API_KEY` env var (set in staging & prod)
- Claude Sonnet model ID: `claude-sonnet-4-6`

#### Parallel execution plan
- **Group 11** (start together): VIS-001, ASK-002, FIX-001, FIX-002
- **Group 12** (after group 11): VIS-002 (needs VIS-001), ASK-003 (needs ASK-002), FIX-003 (needs FIX-001)
- **Group 13**: DEPLOY-001

---

### 2026-02-25 — VIS-001 ✅ (parallel group 11)
**Story**: Add profile_image_url to AttendeeResearch, extract from Apify
**Files**: `_shared/meeting-prep/attendeeResearcher.ts`
**Notes**: Field placed after `background`, before `_apifyProfile`. Extraction: `apifyProfiles.get(att.email)?.profileImage ?? imgUrl ?? null` in result builder.

### 2026-02-25 — ASK-002 ✅ (parallel group 11)
**Story**: ask_question case + trigger_id passthrough
**Files**: `slack-interactive/handlers/prepBriefing.ts`, `slack-interactive/index.ts`
**Notes**: handlePrepBriefingAction gets optional triggerId + slackContext params. ask_question case looks up botToken from slack_org_settings, calls views.open with prep_briefing_ask_modal. Call site in index.ts passes trigger_id, channel.id, message.ts, team.id.

### 2026-02-25 — FIX-001 ✅ (parallel group 11)
**Story**: toBase64Url() + draft mode in email-send-as-rep
**Files**: `email-send-as-rep/index.ts`
**Notes**: toBase64Url() uses TextEncoder for UTF-8 safe encoding. draft=true POSTs to /drafts endpoint with { message: { raw } } body. email_send_log insert skipped for drafts. Returns draft: true flag in response.

### 2026-02-25 — FIX-002 ✅ (parallel group 11)
**Story**: toBase64Url() fix in gmail-actions.ts
**Files**: `google-gmail/gmail-actions.ts`
**Notes**: Helper added near top of file. Both replyToEmail and forwardEmail now use toBase64Url().

### 2026-02-25 — VIS-002 ✅ (parallel group 12)
**Story**: Company logo + per-attendee image blocks + Ask Question button
**Files**: `_shared/meeting-prep/briefingComposer.ts`
**Notes**: WHO YOU'RE MEETING header block + one section per attendee (profile_image_url as accessory if present). Company block gets logo.dev image accessory when domain available. Actions block now has 2 buttons: Send Booking Confirmation (primary) + Ask a Question.

### 2026-02-25 — FIX-003 ✅ (parallel group 12)
**Story**: Sonnet model, ASCII prompt, draft flag, success message
**Files**: `slack-interactive/handlers/prepBriefing.ts`
**Notes**: Model: haiku → claude-sonnet-4-6. Prompt adds ASCII-only punctuation requirement. sendEmail() gains draft param (default false), booking_confirm passes true. Success: "Email draft created for {names} — open Gmail drafts to review and send."

### 2026-02-25 — ASK-003 ✅ (group 12b sequential)
**Story**: handlePrepBriefingAskSubmission + view_submission wire
**Files**: `slack-interactive/handlers/prepBriefing.ts`, `slack-interactive/index.ts`
**Notes**: New export function appended to prepBriefing.ts. Parses private_metadata, extracts question from view state. Exa search (5 results, 1200 chars). Claude Sonnet synthesises 2-4 sentence answer. Posts to thread with question header, answer, source links. view_submission case added (fire-and-forget, immediate 200 ack).

### 2026-02-25 — DEPLOY-001 ✅
**Story**: Deploy 3 functions to staging
**Functions deployed**:
- `demo-prep-briefing` — includes new attendeeResearcher + briefingComposer
- `slack-interactive` — includes new prepBriefing.ts handler
- `email-send-as-rep` — draft mode + toBase64Url fix

---

## Deployment Checklist (POL-004)

```bash
# Deploy new edge functions to staging
npx supabase functions deploy demo-prep-briefing --project-ref caerqjzvuerejfrdtygb --no-verify-jwt
npx supabase functions deploy demo-recent-meetings --project-ref caerqjzvuerejfrdtygb --no-verify-jwt

# The proactive-meeting-prep function uses shared modules that are
# bundled at deploy time — redeploy it to pick up the new _shared/ code
npx supabase functions deploy proactive-meeting-prep --project-ref caerqjzvuerejfrdtygb --no-verify-jwt
```
