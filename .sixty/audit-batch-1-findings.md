# Audit Batch 1 Findings — Before + During the Call
**Audited**: 2026-03-01
**Scope**: AUDIT-001 through AUDIT-012

---

## AUDIT-001: AI Pre-Meeting Briefing

**Status**: ISSUES FOUND

**Findings**:

- [P2] `proactive-meeting-prep/index.ts:814` Uses `.single()` inside `generateMeetingPrep()` for org membership lookup — will throw PGRST116 if user has no org membership. All other membership lookups in the same file correctly use `.maybeSingle()` (line 386).
- [P2] `proactive-meeting-prep/index.ts:183` Function accepts `action=check_and_prep` with no auth whatsoever — this endpoint uses service role key but has no mechanism to prevent arbitrary callers from triggering prep for all users. It's a cron function but lacks a cron secret check (contrast with `slack-meeting-prep` which uses `verifyCronSecret`).
- [P3] `proactive-meeting-prep/index.ts:524` `useOrchestrator` flag is hardcoded to `true` with a TODO comment referencing `notification_feature_settings` — dead code path.
- [P3] `proactive-meeting-prep/index.ts:793` `checkPrepExists()` uses `content.ilike.%${meetingId}%` which could produce false positives (any message that mentions the UUID string triggers a skip).
- [P4] `slack-meeting-prep/index.ts` imports `corsHeaders` from services/index.ts (a legacy export), though the main CORS is handled via `getCorsHeaders`. Confirm that `corsHeaders` imported from `./services/index.ts` is not the prohibited wildcard variant.

**Notes**: `demo-prep-briefing` is well-structured (correct CORS, pinned `@2.43.4`, dual user+service clients, JWT validated). The admin bypass at line 260 (`sixty-staging-bypass-2026`) is hardcoded — acceptable for staging, but verify it cannot be reached in production builds.

---

## AUDIT-002: AI Company Research

**Status**: ISSUES FOUND

**Findings**:

- [P2] `demo-prep-briefing/index.ts:259–260` Admin bypass is a hardcoded literal string `'sixty-staging-bypass-2026'` — if this function is deployed to production (as it is, since it's a feature function), any caller who knows the secret can impersonate any user. Should be gated behind an environment check (`Deno.env.get('ENVIRONMENT') !== 'production'`).
- [P3] `_shared/meeting-prep/attendeeResearcher.ts:131` Gemini API URL uses `gemini-2.5-flash` without a pinned version path — model version is embedded in URL and may silently shift.
- [P3] `_shared/meeting-prep/attendeeResearcher.ts:108–123` Apify scraper calls `run-sync-get-dataset-items` endpoint — synchronous mode can take 15–30s. No timeout is set on this fetch call. If Apify stalls, the entire pipeline hangs until Supabase's 30s edge function limit.
- [P4] `CompanyResearchResponse.tsx` — file does not exist (404 when read). Either the component was renamed or the audit spec has an incorrect path. Actual research display is handled inside `MeetingBriefingResponse.tsx` and `NextMeetingCommandCenterResponse.tsx`.

**Notes**: `_shared/exaSearch.ts` and `_shared/geminiSearch.ts` are shared utilities. No direct `select('*')` found. Cost tracking is fire-and-forget (correct pattern).

---

## AUDIT-003: Shareable Fact Profiles

**Status**: ISSUES FOUND

**Findings**:

- [P1] `FactProfileResponse.tsx` — file does not exist at the listed path `src/components/copilot/responses/FactProfileResponse.tsx`. Fact profile components live in `src/components/fact-profiles/`. If there is a copilot response type for fact profiles it may be unrouted or using a generic renderer.
- [P3] `src/pages/public/PublicFactProfile.tsx` exists — public shareable page. Need to verify it does not expose private org data via RLS bypass (could not read in this pass, flag for follow-up).

**Notes**: Fact profile components (`FactProfileGrid.tsx`, `FactProfileView.tsx`, etc.) exist and appear feature-complete. The `ShareFactProfileDialog.tsx` component exists. Actual sharing logic needs RLS audit to confirm public views are properly scoped.

---

## AUDIT-004: Product Profile Builder

**Status**: ISSUES FOUND

**Findings**:

- [P3] `productProfileService.ts:37` Uses `throw new Error(error.message || ...)` without toast feedback at the service layer — consuming hooks in `useProductProfiles.ts` do not add error toast in the mutation error handler (only in useICPProfilesCRUD.ts which has proper toast). Confirm product profile mutations also surface toasts.
- [P3] `research-product-profile/index.ts` Uses pinned `@supabase/supabase-js@2.43.4` and `getCorsHeaders` — correct. No issue with infra.
- [P4] `productProfileService.ts:60` `getProfile()` does not validate org ownership before returning — relies on RLS. Confirm `product_profiles` table has RLS that scopes to `organization_id`.

**Notes**: Feature exists and is well-structured. Explicit column selection enforced via `PROFILE_COLUMNS` constant (good). React Query pattern with proper `enabled: !!orgId` guard.

---

## AUDIT-005: ICP Builder & Scoring

**Status**: ISSUES FOUND

**Findings**:

- [P1] `useICPProfiles.ts` (line 44) and `useICPProfilesCRUD.ts` (line 35) both export a function named `useICPProfiles` — this is a naming collision between two hooks files. The AI-generated profiles hook (`useICPProfiles` in `useICPProfiles.ts`) calls `generate-icp-profiles` edge function. The CRUD hook (`useICPProfiles` in `useICPProfilesCRUD.ts`) reads from `icp_profiles` table via `icpProfileService`. Callers importing from different files get different behaviours under the same name, which is a reliability risk.
- [P2] `icpProfileService.ts` — `createLinkedOpsTable()` uses `.single()` at line 53 when inserting a `dynamic_tables` row. On insertion conflict this would throw PGRST116.
- [P3] `ICPProfileForm.tsx` was listed but could not be read in this audit pass (confirmed it exists). Flag for UX review — verify empty/loading states.
- [P4] `useICPProfiles.ts:58` calls `generate-icp-profiles` edge function — verify that function uses pinned `@2.43.4` and `getCorsHeaders`.

**Notes**: `useICPProfilesCRUD.ts` has proper toast feedback for all mutations. Query cache invalidation is consistent across all CRUD ops. `enabled: !!orgId` guards are correct.

---

## AUDIT-006: Meeting Prep Command Centre

**Status**: ISSUES FOUND

**Findings**:

- [P2] `proactive-meeting-prep/index.ts:183` (see AUDIT-001) — same issue applies here. `check_and_prep` action triggers for all users and is unauthenticated.
- [P3] `NextMeetingCommandCenterResponse.tsx:23` `onActionClick` prop is typed as `any` instead of the standard `QuickActionResponse` type.
- [P3] `NextMeetingCommandCenterResponse.tsx:33–47` Uses multiple fallback field lookups (`meeting?.startTime || meeting?.start_time || meeting?.meeting_start`) — this is a sign of inconsistent data shape coming from the backend. The response type should be normalised before the component receives it.
- [P4] `MeetingWorkflowChecklist.tsx` appears well-structured. Uses Lucide icons, no emoji. Loading/error states handled via `useWorkflowResults` hook.

**Notes**: Command centre is a composed UI — most data integrity depends on the orchestrator output. Frontend rendering is defensive with multiple fallback field checks.

---

## AUDIT-007: AI Calendar Scheduling

**Status**: ISSUES FOUND

**Findings**:

- [P0] `meetingbaas-connect-calendar/index.ts:9` Imports `@supabase/supabase-js@2` (unpinned). Per CLAUDE.md this resolves to `@2.95.1` on esm.sh which returns **500 Internal Server Error** at runtime. This will cause every calendar connection attempt to fail.
- [P2] `meetingbaas-connect-calendar/index.ts:317` Calls `supabase.auth.getUser(token)` using a service-role client (`createClient(url, serviceRoleKey)`) — auth.getUser with service role client validates the JWT correctly, but callers who pass an expired token will get a 401. This pattern works but is non-standard.
- [P3] `CalendarResponse.tsx:13` `onActionClick` typed as `any` instead of `QuickActionResponse`.

**Notes**: The auth pattern in `meetingbaas-connect-calendar` is correct (user_id cross-check, 403 on mismatch). The unpinned supabase import is the critical issue — this function will be broken on staging/production until fixed.

---

## AUDIT-008: Smart Listening & Account Signals

**Status**: PASS

**Findings**:
- [P4] `AccountSignalTimeline.tsx` is a pure display component — no direct DB queries, all data passed via props from `useAccountWatchlist` hook. No security concerns.
- [P4] `WatchlistPanel.tsx:45` Imports `supabase` from `clientV2` — used only for real-time subscriptions (not direct queries visible in first 60 lines). Full hook logic is in `useAccountWatchlist`. Pattern is standard.

**Notes**: Components use Lucide icons exclusively. No emoji. Cost warning UI is a nice UX touch. Would need to audit `useAccountWatchlist` hook and `account-monitor` edge function for deeper signal intelligence pipeline audit — out of scope for this batch.

---

## AUDIT-009: 60 Notetaker (Auto-Record)

**Status**: ISSUES FOUND

**Findings**:

- [P0] `meetingbaas-connect-calendar/index.ts:9` Same unpinned `@supabase/supabase-js@2` as AUDIT-007 — this is the primary setup function for the Notetaker feature. Broken at deploy.
- [P2] `meetingbaas-webhook/index.ts:17` Also imports `@supabase/supabase-js@2` (unpinned). The webhook handler will crash on initialization.
- [P3] `meetingbaas-webhook/index.ts:265–278` Webhook signature verification: if `MEETINGBAAS_WEBHOOK_SECRET` env var is not set, verification is skipped entirely (`return { ok: true }`). In production this means unauthenticated callers can send arbitrary bot events.
- [P3] `useNotetakerIntegration.ts` — hook appears well-structured (toast feedback, React Query, proper guards). No issues identified in the first 50 lines.
- [P4] `deploy-recording-bot` and `stop-recording-bot` — not audited in this pass. Flag for batch 2.

**Notes**: The `@2` unpinned import in both `meetingbaas-connect-calendar` and `meetingbaas-webhook` is a critical infrastructure issue affecting the entire Notetaker pipeline.

---

## AUDIT-010: Voice Recorder & Notes

**Status**: ISSUES FOUND

**Findings**:

- [P1] `voice-upload/index.ts:3` Imports `@supabase/supabase-js@2` (unpinned) — same esm.sh 500 error risk. Function will fail at cold start.
- [P1] `voice-upload/index.ts:5–8` Uses legacy hardcoded `corsHeaders` object with wildcard `'Access-Control-Allow-Origin': '*'`. Per CLAUDE.md, this is prohibited — must use `getCorsHeaders(req)` from `_shared/corsHelper.ts`.
- [P2] `voice-upload/index.ts:136` `.select()` call after insert with no column list — effectively `select('*')`. Per CLAUDE.md this is prohibited.
- [P2] `voice-upload/index.ts:101` S3 path uses `org_id` from the request body without validation that the authenticated user belongs to that org. A user could upload files to a different org's S3 prefix by sending a foreign `org_id`.
- [P2] `upload-recording-to-s3` and `get-recording-url` — not read in this pass. Flag for follow-up.

**Notes**: `voice-upload` is an older function (no TypeScript generics, JS-style code) that predates the current coding standards. Needs a significant update.

---

## AUDIT-011: Multi-Notetaker Aggregation (Fathom)

**Status**: ISSUES FOUND

**Findings**:

- [P1] `fathom-oauth-callback/index.ts:2` Imports `@supabase/supabase-js@2` (unpinned). OAuth callback will fail.
- [P1] `fathom-oauth-callback/index.ts:9–12` Uses hardcoded wildcard CORS object `'Access-Control-Allow-Origin': '*'` instead of `getCorsHeaders(req)`.
- [P2] `fathom-transcript-retry/index.ts:6–8` Uses legacy hardcoded `corsHeaders` object with wildcard `'*'`. Should use `getCorsHeaders`.
- [P3] `fathom-webhook/index.ts:6–9` Uses hardcoded wildcard CORS object. While the function validates a proxy signature or service role token (good security), the CORS pattern is still non-standard.
- [P4] `fathom-sync/index.ts` — pinned `@2.43.4` (correct). Imports `corsHeaders` from `./services/index.ts` — need to verify this is not the wildcard variant.

**Notes**: `fathom-webhook` has solid auth (HMAC proxy signature + service role fallback). `fathom-sync` has good batch logic. The main issues are unpinned supabase imports in OAuth callback and legacy CORS in several functions.

---

## AUDIT-012: Call Recording & Transcription

**Status**: ISSUES FOUND

**Findings**:

- [P1] `process-recording/index.ts:18` Imports `@supabase/supabase-js@2` (unpinned) — will fail at cold start on esm.sh.
- [P1] `process-recording/index.ts:21` Uses `legacyCorsHeaders` from corsHelper — this is the deprecated static CORS pattern (not `getCorsHeaders(req)`), though it now reads from `FRONTEND_URL` instead of wildcard. Still non-standard per CLAUDE.md rules.
- [P1] `poll-gladia-jobs/index.ts:15` Imports `@supabase/supabase-js@2` (unpinned) — same cold start failure risk.
- [P2] `poll-gladia-jobs/index.ts:16` Uses `legacyCorsHeaders` (deprecated).
- [P2] `backfill-notetaker-transcripts/index.ts:20` Imports `@supabase/supabase-js@2` (unpinned).
- [P2] `process-gladia-webhook/index.ts:17` Imports `@supabase/supabase-js@2` (unpinned).
- [P3] `_shared/recordingCompleteSync.ts:28` Uses `.single()` when fetching recording — will throw PGRST116 if recording is deleted between job dispatch and poll. Should be `.maybeSingle()` with null guard.
- [P3] `process-recording/index.ts:142–146` AssemblyAI polling loop (`while attempts < maxAttempts`) with 5s intervals — 10 minute maximum. Edge functions time out at 60 seconds by default. This pattern only works if the function is configured with extended timeout. Confirm timeout setting, or switch to async/webhook pattern.

**Notes**: `_shared/recordingCompleteSync.ts` is pinned correctly (`@2.43.4`). `_shared/fathomTranscript.ts` was not read in this pass — flag for batch 2.

---

## Cross-Cutting Summary

| Issue | Affected Functions |
|-------|-------------------|
| Unpinned `@supabase/supabase-js@2` (P0/P1) | `meetingbaas-connect-calendar`, `meetingbaas-webhook`, `voice-upload`, `fathom-oauth-callback`, `process-recording`, `poll-gladia-jobs`, `backfill-notetaker-transcripts`, `process-gladia-webhook` |
| Legacy wildcard CORS (P1/P2) | `voice-upload`, `fathom-oauth-callback`, `fathom-transcript-retry`, `fathom-webhook` |
| `legacyCorsHeaders` (deprecated, P2) | `process-recording`, `poll-gladia-jobs`, `backfill-notetaker-transcripts` |
| `.single()` instead of `.maybeSingle()` (P2/P3) | `proactive-meeting-prep:814`, `icpProfileService.ts:53`, `recordingCompleteSync.ts:28` |
| `onActionClick` typed as `any` (P3) | `NextMeetingCommandCenterResponse.tsx`, `CalendarResponse.tsx` |
| Missing/weak auth on cron endpoint (P2) | `proactive-meeting-prep` (no cron secret) |
| Admin bypass in production function (P2) | `demo-prep-briefing` |

### Priority Fix Order
1. **P0 — Fix all unpinned `@supabase/supabase-js@2` imports** in the 8 functions above. Change to `@2.43.4`.
2. **P1 — Fix wildcard CORS** in `voice-upload`, `fathom-oauth-callback`, `fathom-transcript-retry`, `fathom-webhook`. Replace with `getCorsHeaders(req)`.
3. **P1 — Gate admin bypass** in `demo-prep-briefing` behind environment check or remove from production deploys.
4. **P2 — Fix `.single()` → `.maybeSingle()`** in three locations.
5. **P2 — Add cron secret** to `proactive-meeting-prep` `check_and_prep` action.
6. **P2 — Fix org_id ownership validation** in `voice-upload` (user could write to another org's S3 prefix).
7. **P3 — Type `onActionClick`** correctly in `NextMeetingCommandCenterResponse` and `CalendarResponse`.
