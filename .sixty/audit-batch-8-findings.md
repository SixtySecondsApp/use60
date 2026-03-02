# Audit Batch 8: Transcription Pipeline, Recording Infrastructure & Voice System
**Date**: 2026-03-01
**Scope**: Transcription, recording, voice, thumbnails, MeetingBaaS, meeting processing (~47 functions)
**Auditor**: Batch 8 audit agent

---

## Summary Table

| Function | Status | P0 | P1 | P2 | P3 |
|---|---|---|---|---|---|
| poll-gladia-jobs | ISSUES | — | — | CORS, @2 unpinned | — |
| poll-transcription-queue | ISSUES | — | — | jsr: registry | — |
| process-gladia-webhook | **CRITICAL** | No sig verify | — | legacyCorsHeaders, @2 | — |
| process-transcription-callback | PASS | — | — | — | — |
| fetch-transcript | ISSUES | — | single() on meetings | hardcoded CORS, @2.39.3 | — |
| condense-meeting-summary | **CRITICAL** | — | No auth at all | hardcoded CORS | — |
| backfill-notetaker-transcripts | ISSUES | — | — | legacyCorsHeaders, @2 | — |
| backfill-transcripts | ISSUES | — | — | @2 unpinned | — |
| upload-recording-to-s3 | ISSUES | — | No JWT validation | jsr: registry | — |
| get-recording-url | ISSUES | — | — | @2 unpinned, 7d URL | — |
| get-batch-signed-urls | ISSUES | — | — | @2 unpinned, 7d URL | — |
| proxy-fathom-video | **CRITICAL** | Open proxy/SSRF | — | hardcoded CORS | — |
| proxy-justcall-recording | ISSUES | — | — | legacyCorsHeaders, @2, token in query | — |
| deploy-recording-bot | ISSUES | — | — | @2 unpinned | — |
| stop-recording-bot | ISSUES | — | — | legacyCorsHeaders, @2 | — |
| poll-stuck-bots | ISSUES | — | — | @2 unpinned | — |
| poll-s3-upload-queue | ISSUES | — | — | jsr: registry | — |
| process-recording | ISSUES | — | select('*'), no JWT | legacyCorsHeaders, @2 | — |
| process-compress-callback | PASS | — | — | — | — |
| generate-video-thumbnail | ISSUES | — | No auth, SSRF risk | hardcoded CORS, @2 | v1/v2/v3 versions |
| generate-video-thumbnail-v2 | ISSUES | — | No auth | hardcoded CORS, @2 | v1/v2/v3 versions |
| generate-s3-video-thumbnail | ISSUES | — | No auth | corsHeaders export | v1/v2/v3 versions |
| backfill-thumbnails | ISSUES | — | — | hardcoded CORS, @2 | — |
| voice-transcribe | ISSUES | — | 5-min sync poll | hardcoded CORS, @2, select('*') | — |
| voice-transcribe-poll | ISSUES | — | — | hardcoded CORS, @2, select('*') | — |
| voice-upload | ISSUES | — | No org membership check | hardcoded CORS, @2 | — |
| voice-audio-url | ISSUES | — | single() on recordings | hardcoded CORS, @2 | — |
| voice-presigned-url | ISSUES | — | — | hardcoded CORS, @2 | — |
| voice-share | ISSUES | — | — | hardcoded CORS, @2 | — |
| voice-share-playback | ISSUES | — | — | hardcoded CORS, @2 | — |
| fetch-deepgram-usage | ISSUES | — | — | hardcoded CORS, @2.39.3 | — |
| fetch-gladia-usage | ISSUES | — | Wrong column name | hardcoded CORS, @2.39.3, select('*') | — |
| fetch-meetingbaas-usage | ISSUES | — | — | hardcoded CORS, @2.39.3, select('*') | — |
| meeting-limit-warning-email | ISSUES | — | Dev-mode auth bypass | hardcoded CORS, @2 | — |
| meetingbaas-webhook | PASS | — | — | @2 unpinned | — |
| meetingbaas-connect-calendar | ISSUES | — | single() on profiles/orgs | @2 unpinned | — |
| meetingbaas-disconnect-calendar | PASS | — | — | — | — |
| meetingbaas-enable-bot-scheduling | ISSUES | — | No auth at all | @2 unpinned | — |
| meetingbaas-webhook-simulate | ISSUES | — | No auth | @2 unpinned | — |
| meetings-webhook | ISSUES | — | — | hardcoded CORS, @2 | — |
| meeting-process-structured-summary | ISSUES | — | No auth at all | @2.39.3 | — |
| meeting-generate-scorecard | ISSUES | — | No auth at all | @2.39.3 | — |
| meeting-analytics | PASS (partial) | — | — | — | — |

---

## Detailed Findings

### poll-gladia-jobs
**Status**: ISSUES FOUND
- [P2] `index.ts:1` Uses `legacyCorsHeaders` — should import `getCorsHeaders(req)` from `_shared/corsHelper.ts`
- [P2] `index.ts:2` Unpinned `@supabase/supabase-js@2` — pin to `@2.43.4`
- [P3] No auth check — acceptable for a cron-invoked function, but should document this

---

### poll-transcription-queue
**Status**: ISSUES FOUND
- [P2] `index.ts:2` Uses `jsr:@supabase/supabase-js@2` registry — inconsistent with rest of codebase, should use `esm.sh/@supabase/supabase-js@2.43.4`
- [P3] No auth check — acceptable for cron, but should be documented

---

### process-gladia-webhook
**Status**: CRITICAL
- [P0] **No webhook signature verification** — Gladia webhooks can be spoofed by any party. Anyone can POST to this endpoint with a fake `recording_id` and arbitrary transcript data, causing false transcription completions to be stored. The `recording_id` is taken from URL params without verifying it matches the Gladia payload.
  - Fix: Implement HMAC-SHA256 verification using `GLADIA_WEBHOOK_SECRET` env var, similar to `process-transcription-callback`
- [P2] `index.ts:1` Uses `legacyCorsHeaders` — replace with `getCorsHeaders(req)`
- [P2] `index.ts:2` Unpinned `@supabase/supabase-js@2` — pin to `@2.43.4`

---

### process-transcription-callback
**Status**: PASS
- Proper HMAC-SHA256 signature verification via `verifySignature()`
- Uses `getCorsHeaders(req)` correctly
- Uses `jsr:@supabase/supabase-js@2` (minor: prefer esm.sh pinned, but JSR is acceptable)

---

### fetch-transcript
**Status**: ISSUES FOUND
- [P1] `index.ts` Uses `.single()` on meetings query — if meeting not found, this throws PGRST116 unhandled. Replace with `.maybeSingle()` and handle null case
- [P2] Hardcoded `corsHeaders` object — replace with `getCorsHeaders(req)`
- [P2] Uses old `@supabase/supabase-js@2.39.3` — pin to `@2.43.4`
- [P3] `select('*')` on `voice_recordings` — use explicit column selection

---

### condense-meeting-summary
**Status**: CRITICAL
- [P1] **No authentication at all** — any unauthenticated caller can POST to this endpoint and trigger Claude API calls (Haiku model), consuming Anthropic API credits. There is no JWT check, no secret check, no IP restriction.
  - Fix: Add `EDGE_FUNCTION_SECRET` header validation or JWT auth before processing
- [P2] Hardcoded `corsHeaders` — replace with `getCorsHeaders(req)`
- [P3] Function has no supabase dependency but still costs money per call — rate limiting should be considered

---

### backfill-notetaker-transcripts
**Status**: ISSUES FOUND
- [P2] Uses `legacyCorsHeaders` — replace with `getCorsHeaders(req)`
- [P2] Unpinned `@supabase/supabase-js@2` — pin to `@2.43.4`
- [P3] Admin/backfill function with no auth — acceptable, but should be restricted to internal calls

---

### backfill-transcripts
**Status**: ISSUES FOUND
- [P2] Unpinned `@supabase/supabase-js@2` — pin to `@2.43.4`
- Auth is otherwise proper (JWT check + org membership)

---

### upload-recording-to-s3
**Status**: ISSUES FOUND
- [P1] **No JWT validation** — creates a service role Supabase client and accepts any `Authorization` header, but never validates that the token represents a real user (no `supabase.auth.getUser(token)` call). Any request with any `Authorization` header is processed.
  - Fix: Call `supabase.auth.getUser(token)` and verify the user exists before processing
- [P2] Uses `jsr:@supabase/supabase-js@2` registry — prefer `esm.sh/@supabase/supabase-js@2.43.4`

---

### get-recording-url
**Status**: ISSUES FOUND
- [P2] Unpinned `@supabase/supabase-js@2` — pin to `@2.43.4`
- [P2] `URL_EXPIRY_SECONDS = 60*60*24*7` — 7-day presigned URL expiry is overly broad. Leaked URLs remain valid for a week. Recommend reducing to 1-4 hours for on-demand access
- Auth via RLS is correctly implemented

---

### get-batch-signed-urls
**Status**: ISSUES FOUND
- [P2] Unpinned `@supabase/supabase-js@2` — pin to `@2.43.4`
- [P2] Same 7-day URL expiry concern as `get-recording-url` above
- Auth is correctly implemented

---

### proxy-fathom-video
**Status**: CRITICAL
- [P0] **Unauthenticated open proxy with SSRF risk** — this function proxies any URL passed via `?url=` query parameter with zero authentication. No JWT check, no secret check. The function:
  1. Fetches the arbitrary URL server-side (SSRF vector — can reach internal Supabase metadata endpoints, AWS IMDS, etc.)
  2. Injects JavaScript into HTML responses
  3. Is accessible by anyone on the internet
  - Fix: Add authentication (at minimum `EDGE_FUNCTION_SECRET` header check), validate that the URL is a Fathom domain (allowlist), and remove HTML injection
- [P2] Hardcoded `corsHeaders` — replace with `getCorsHeaders(req)`

---

### proxy-justcall-recording
**Status**: ISSUES FOUND
- [P2] Uses `legacyCorsHeaders` — replace with `getCorsHeaders(req)`
- [P2] Unpinned `@supabase/supabase-js@2` — pin to `@2.43.4`
- [P2] Accepts `?token=` and `?access_token=` query parameters for auth — query strings are logged in most web servers/proxies and may appear in browser history. Tokens should only be passed in headers, not query params
- Auth (JWT + org membership check) is otherwise correct

---

### deploy-recording-bot
**Status**: ISSUES FOUND
- [P2] Unpinned `@supabase/supabase-js@2` — pin to `@2.43.4`
- Auth, quota check, and cost tracking are correctly implemented

---

### stop-recording-bot
**Status**: ISSUES FOUND
- [P2] Uses `legacyCorsHeaders` — replace with `getCorsHeaders(req)`
- [P2] Unpinned `@supabase/supabase-js@2` — pin to `@2.43.4`
- Auth with org membership fallback is correctly implemented

---

### poll-stuck-bots
**Status**: ISSUES FOUND
- [P2] Unpinned `@supabase/supabase-js@2` — pin to `@2.43.4`
- [P3] Checks for `Authorization` header presence but uses service role for all operations (acceptable for cron pattern)
- `getCorsHeaders` is used correctly via `jsonResponse`/`errorResponse`

---

### poll-s3-upload-queue
**Status**: ISSUES FOUND
- [P2] Uses `jsr:@supabase/supabase-js@2` — prefer `esm.sh/@supabase/supabase-js@2.43.4`
- No auth check — acceptable for cron function

---

### process-recording
**Status**: ISSUES FOUND
- [P1] `index.ts` Uses `select('*')` with a join on `recordings` + `organizations` tables — use explicit column selection
- [P1] No explicit JWT validation — accepts any `Authorization` header without calling `auth.getUser()`. Processes through expensive AI pipeline (AssemblyAI, OpenAI, Claude) without verifying the caller is a real authenticated user
  - Fix: Validate the JWT token against `supabase.auth.getUser()` before processing
- [P2] Uses `legacyCorsHeaders` — replace with `getCorsHeaders(req)`
- [P2] Unpinned `@supabase/supabase-js@2` — pin to `@2.43.4`

---

### process-compress-callback
**Status**: PASS
- Proper HMAC-SHA256 callback signature verification
- Uses `getCorsHeaders(req)` correctly
- `jsr:` Supabase registry (minor preference: esm.sh pinned)

---

### generate-video-thumbnail
**Status**: ISSUES FOUND (v1 - Browserless)
- [P1] **No authentication** — any caller can trigger Browserless screenshots of arbitrary URLs, consuming API credits and creating SSRF-adjacent risk via the screenshot service
  - Fix: Add `EDGE_FUNCTION_SECRET` header validation
- [P2] Hardcoded `corsHeaders` — replace with `getCorsHeaders(req)`
- [P2] Unpinned `@supabase/supabase-js@2` — pin to `@2.43.4`
- [P2] Uses deprecated `deno.land/x/s3_lite_client` — should use `npm:@aws-sdk/client-s3@3`
- [P3] S3 path uses `{meeting_id}` without org prefix — potential for cross-org key collision in edge cases. Prefer `{org_id}/{meeting_id}/thumbnail.jpg`
- [P3] Three versions exist (v1 Browserless, v2 Lambda, v3 S3 ffmpeg) — architectural debt, should consolidate

---

### generate-video-thumbnail-v2
**Status**: ISSUES FOUND (v2 - Custom Lambda)
- [P1] **No authentication** — same as v1, triggers external Lambda without verifying caller
  - Fix: Add `EDGE_FUNCTION_SECRET` header validation
- [P2] Hardcoded `corsHeaders` — replace with `getCorsHeaders(req)`
- [P2] Unpinned `@supabase/supabase-js@2` — pin to `@2.43.4`
- [P3] Part of the three-version architecture that should be consolidated

---

### generate-s3-video-thumbnail
**Status**: ISSUES FOUND (v3 - S3 ffmpeg Lambda)
- [P1] **No user auth validation** — accepts requests without verifying JWT, any caller can trigger thumbnail generation and write to S3
  - Fix: Add user JWT validation before processing
- [P2] Imports `corsHeaders` as a static export from `corsHelper.ts` rather than calling `getCorsHeaders(req)` — loses dynamic origin handling
- [P2] Unpinned `@supabase/supabase-js@2` — pin to `@2.43.4`
- [P3] Part of the three-version architecture that should be consolidated

---

### backfill-thumbnails
**Status**: ISSUES FOUND
- [P2] Hardcoded `corsHeaders` — replace with `getCorsHeaders(req)`
- [P2] Unpinned `@supabase/supabase-js@2` — pin to `@2.43.4`
- Auth (JWT + org membership check) is correctly implemented

---

### voice-transcribe
**Status**: ISSUES FOUND
- [P1] **Synchronous 5-minute polling loop** — polls Gladia for completion within the same request, sleeping in a loop up to 300 seconds. Supabase edge functions time out at ~150 seconds. This will fail for any transcription job that takes more than 2-3 minutes.
  - Fix: Convert to async pattern: submit to Gladia, return job ID, let client poll via `voice-transcribe-poll`
- [P2] Hardcoded `corsHeaders` — replace with `getCorsHeaders(req)`
- [P2] Unpinned `@supabase/supabase-js@2` — pin to `@2.43.4`
- [P2] `select('*')` on `voice_recordings` — use explicit column selection
- Auth (JWT + ownership check) is correctly implemented

---

### voice-transcribe-poll
**Status**: ISSUES FOUND
- [P2] Hardcoded `corsHeaders` — replace with `getCorsHeaders(req)`
- [P2] Unpinned `@supabase/supabase-js@2` — pin to `@2.43.4`
- [P2] `select('*')` on `voice_recordings` — use explicit column selection
- Auth (JWT + ownership check) is correctly implemented

---

### voice-upload
**Status**: ISSUES FOUND
- [P1] **No org membership verification** — the `org_id` is taken from the request body, but the function never checks that the authenticated user is actually a member of that org. A user could upload voice recordings to any org's S3 bucket path.
  - Fix: After user auth, query `org_memberships` or `organization_memberships` to verify `user.id` belongs to the supplied `org_id`
- [P2] Hardcoded `corsHeaders` — replace with `getCorsHeaders(req)`
- [P2] Unpinned `@supabase/supabase-js@2` — pin to `@2.43.4`

---

### voice-audio-url
**Status**: ISSUES FOUND
- [P1] Authenticated path uses `.single()` on `voice_recordings` query — if the recording doesn't exist, this throws PGRST116. Replace with `.maybeSingle()` and return 404
- [P2] Hardcoded `corsHeaders` — replace with `getCorsHeaders(req)`
- [P2] Unpinned `@supabase/supabase-js@2` — pin to `@2.43.4`
- Dual auth path (JWT or share_token) is correctly implemented

---

### voice-presigned-url
**Status**: ISSUES FOUND
- [P2] Hardcoded `corsHeaders` — replace with `getCorsHeaders(req)`
- [P2] Unpinned `@supabase/supabase-js@2` — pin to `@2.43.4`
- Auth (JWT + org membership check via `org_memberships` table) is correctly implemented
- Note: uses `org_memberships` table (different from `organization_memberships` — verify correct table name)

---

### voice-share
**Status**: ISSUES FOUND
- [P2] Hardcoded `corsHeaders` — replace with `getCorsHeaders(req)`
- [P2] Unpinned `@supabase/supabase-js@2` — pin to `@2.43.4`
- Auth (JWT + ownership check) is correctly implemented

---

### voice-share-playback
**Status**: ISSUES FOUND
- [P2] Hardcoded `corsHeaders` — replace with `getCorsHeaders(req)`
- [P2] Unpinned `@supabase/supabase-js@2` — pin to `@2.43.4`
- Public endpoint by design — `share_token + is_public` validation is correctly implemented

---

### fetch-deepgram-usage
**Status**: ISSUES FOUND
- [P2] Hardcoded `corsHeaders` — replace with `getCorsHeaders(req)`
- [P2] Uses old `@supabase/supabase-js@2.39.3` — pin to `@2.43.4`
- [P3] No auth check — should be restricted to internal/admin calls

---

### fetch-gladia-usage
**Status**: ISSUES FOUND
- [P1] **Wrong column name** — queries `meetings.transcript` column, but the actual column is `transcript_text`. This query likely returns 0 results, making the Gladia usage stats meaningless
  - Fix: Change `.not('transcript', 'is', null)` to `.not('transcript_text', 'is', null)`
- [P2] Hardcoded `corsHeaders` — replace with `getCorsHeaders(req)`
- [P2] Uses old `@supabase/supabase-js@2.39.3` — pin to `@2.43.4`
- [P2] `select('*')` on `meetings` — use explicit column selection
- [P3] Counts all meetings with a transcript, not just Gladia-transcribed ones — add a `source_type` or `transcription_provider` filter for accuracy

---

### fetch-meetingbaas-usage
**Status**: ISSUES FOUND
- [P2] Hardcoded `corsHeaders` — replace with `getCorsHeaders(req)`
- [P2] Uses old `@supabase/supabase-js@2.39.3` — pin to `@2.43.4`
- [P2] `select('*')` on `meetings` — use explicit column selection
- [P3] No auth check — should be restricted to internal/admin calls

---

### meeting-limit-warning-email
**Status**: ISSUES FOUND
- [P1] **Dev-mode auth bypass** — `EDGE_FUNCTION_SECRET` auth check returns `true` (allows all) if the secret env var is not configured. This is unsafe in any environment where the secret isn't explicitly set
  - Fix: Fail closed — if secret is not configured, reject the request rather than allowing it
- [P2] Hardcoded `corsHeaders` — replace with `getCorsHeaders(req)`
- [P2] Unpinned `@supabase/supabase-js@2` — pin to `@2.43.4`
- [P2] Passes service role key in `apikey` header to dispatcher function — service role key in request headers is a concern

---

### meetingbaas-webhook
**Status**: PASS
- Proper HMAC-SHA256 + SVIX format signature verification with replay protection (5-minute window)
- Multiple payload format support (SVIX base64, legacy hex)
- Uses `getCorsHeaders(req)` correctly
- Sentry integration for error tracking
- [P2] Uses unpinned `@supabase/supabase-js@2` — pin to `@2.43.4`

---

### meetingbaas-connect-calendar
**Status**: ISSUES FOUND
- [P1] Uses `.single()` on `profiles` table (line ~539) — if profile not found, throws PGRST116. Replace with `.maybeSingle()` and handle null `orgId`
- [P1] Uses `.single()` on `organizations` table (line ~548) — same issue. Replace with `.maybeSingle()`
- [P2] Unpinned `@supabase/supabase-js@2` — pin to `@2.43.4`
- Auth (JWT validation + user_id match check) is correctly implemented
- Calendar connect logic is thorough with good fallback handling

---

### meetingbaas-disconnect-calendar
**Status**: PASS
- Uses pinned `@supabase/supabase-js@2.43.4` — correct
- Uses `getCorsHeaders(req)` via `handleCorsPreflightRequest`
- JWT user validation is correctly implemented
- Graceful handling of all cleanup steps (API call, DB update, webhook channels, notetaker settings)

---

### meetingbaas-enable-bot-scheduling
**Status**: ISSUES FOUND
- [P1] **No authentication at all** — accepts any POST request and enables bot scheduling for the supplied `calendar_id`. Anyone who knows a calendar UUID can enable bot scheduling for it.
  - Fix: Add JWT validation and verify the authenticated user owns the calendar
- [P2] Unpinned `@supabase/supabase-js@2` — pin to `@2.43.4`

---

### meetingbaas-webhook-simulate
**Status**: ISSUES FOUND
- [P1] **No authentication** — accepts any POST request and directly modifies `bot_deployments`, `recordings`, and `meetingbaas_calendars` tables using service role key. This is a testing utility that is exposed as a production endpoint.
  - Fix: Add `EDGE_FUNCTION_SECRET` header validation, or restrict to non-production environments, or add JWT check
- [P2] Unpinned `@supabase/supabase-js@2` — pin to `@2.43.4`
- [P3] `callActualWebhook()` sends `x-simulate-test: true` header to bypass signature verification on the real webhook handler — this bypass mechanism needs to be guarded so it can't be called from outside test contexts

---

### meetings-webhook (Fathom)
**Status**: ISSUES FOUND
- [P2] Hardcoded `corsHeaders` object — replace with `getCorsHeaders(req)`
- [P2] Unpinned `@supabase/supabase-js@2` — pin to `@2.43.4`
- [P2] No webhook signature verification for Fathom webhooks — similar to `process-gladia-webhook`, anyone can POST fake Fathom data. Check if Fathom supports webhook signing
- [P3] Uses `any` type extensively — add proper TypeScript types for Fathom webhook payload

---

### meeting-process-structured-summary
**Status**: ISSUES FOUND
- [P1] **No authentication at all** — any caller can POST any `meetingId` and trigger a Claude AI call (claude-sonnet-4 model, up to 4096 output tokens), consuming Anthropic API credits
  - Fix: Add JWT validation and verify the authenticated user has access to the requested meeting
- [P2] Uses old `@supabase/supabase-js@2.39.3` — pin to `@2.43.4`
- [P2] Uses `.single()` on organizations/deals queries (lines 255, 268) — replace with `.maybeSingle()`
- [P3] `deals.user_id` column used in query (line 264) — note that per CLAUDE.md, `deals` uses `owner_id`, not `user_id`. Verify this query is correct

---

### meeting-generate-scorecard
**Status**: ISSUES FOUND
- [P1] **No authentication at all** — same as `meeting-process-structured-summary`, any caller can trigger Claude AI scoring calls
  - Fix: Add JWT validation and verify the authenticated user has access to the meeting
- [P2] Uses old `@supabase/supabase-js@2.39.3` — pin to `@2.43.4`
- [P2] Uses `.single()` on `organization_memberships` query (line 724) — replace with `.maybeSingle()`

---

### meeting-analytics
**Status**: PASS (partial audit — large multi-file function)
- Entry point `index.ts` delegates to `router.ts` and `helpers.ts`
- Uses `handleCorsPreflightRequest` from `corsHelper.ts` correctly
- Auth verification deferred to router layer (not reviewed in this audit pass)

---

## Priority Summary

### P0 — Fix Immediately (Security Critical)
1. **`process-gladia-webhook`** — No webhook signature verification. Fake transcription data can be injected.
2. **`proxy-fathom-video`** — Unauthenticated open proxy. SSRF risk. Proxy any URL on the internet.

### P1 — Fix This Sprint
3. **`condense-meeting-summary`** — No auth. Claude API credits exposed to the internet.
4. **`meeting-process-structured-summary`** — No auth. Claude API credits exposed to the internet.
5. **`meeting-generate-scorecard`** — No auth. Claude API credits exposed to the internet.
6. **`meetingbaas-enable-bot-scheduling`** — No auth. Anyone can enable bot scheduling.
7. **`meetingbaas-webhook-simulate`** — No auth. Direct DB manipulation endpoint open to the internet.
8. **`voice-transcribe`** — Synchronous 5-minute poll will timeout edge function runtime.
9. **`voice-upload`** — No org membership check, user can upload to any org.
10. **`upload-recording-to-s3`** — No JWT validation.
11. **`process-recording`** — `select('*')` with join + no JWT validation.
12. **`fetch-transcript`** — `.single()` throws on missing meeting.
13. **`voice-audio-url`** — `.single()` throws on missing recording.
14. **`meetingbaas-connect-calendar`** — `.single()` on profiles/orgs throws.
15. **`fetch-gladia-usage`** — Wrong column name (`transcript` vs `transcript_text`) — usage stats broken.
16. **`meeting-limit-warning-email`** — Auth bypass when secret not configured.
17. `generate-video-thumbnail` (all 3 versions) — No auth on thumbnail generation.

### P2 — Fix Next Sprint (Widespread Infrastructure)
- ~25 functions using hardcoded `corsHeaders` — migrate to `getCorsHeaders(req)`
- ~30 functions using unpinned `@supabase/supabase-js@2` — pin to `@2.43.4`
- ~4 functions using old `@2.39.3` — update to `@2.43.4`
- `get-recording-url` and `get-batch-signed-urls` — reduce S3 URL expiry from 7 days to 1-4 hours
- `proxy-justcall-recording` — remove token from query params

### P3 — Technical Debt
- Three versions of thumbnail generation (v1 Browserless, v2 Lambda, v3 S3 ffmpeg) — consolidate
- Usage tracking functions count all meetings instead of provider-specific ones
- `deals.user_id` usage in `meeting-process-structured-summary` — verify vs `owner_id`

---

## Patterns to Address Globally

### 1. Missing Auth on AI-Cost Functions
`condense-meeting-summary`, `meeting-process-structured-summary`, and `meeting-generate-scorecard` all expose Claude API endpoints with zero authentication. This is a direct cost exposure attack surface. Any of these functions can be called thousands of times to drain Anthropic credits.

**Pattern fix**: Add at minimum an `EDGE_FUNCTION_SECRET` header check or JWT validation as the first thing in the handler.

### 2. CORS Header Migration
~25 functions still use one of three legacy patterns:
- Hardcoded `corsHeaders = { 'Access-Control-Allow-Origin': '*', ... }` object
- `legacyCorsHeaders` imported from old helper
- `corsHeaders` static export from `corsHelper.ts`

All should be migrated to `getCorsHeaders(req)` which provides dynamic origin handling.

### 3. Supabase Client Version Pinning
The correct import is:
```ts
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2.43.4';
```
`@2` (unpinned) resolves to `@2.95.1` which returns 500 errors from esm.sh CDN. `jsr:` registry is non-standard. `@2.39.3` is outdated.

### 4. `single()` vs `maybeSingle()` Violations
Five functions use `.single()` where the record might legitimately not exist:
- `fetch-transcript` (meetings)
- `voice-audio-url` (voice_recordings)
- `meetingbaas-connect-calendar` (profiles, organizations)
- `meeting-process-structured-summary` (companies, deals)
- `meeting-generate-scorecard` (organization_memberships)

These will throw PGRST116 and return unhandled 500 errors.

### 5. Webhook Signature Verification Gap
`process-gladia-webhook` and `meetings-webhook` accept unauthenticated webhook payloads. Compare to the correct patterns already established in:
- `process-transcription-callback` — HMAC-SHA256 via Railway shared secret
- `meetingbaas-webhook` — SVIX/HMAC with replay protection
- `process-compress-callback` — HMAC-SHA256 via Lambda shared secret
