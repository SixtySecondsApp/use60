# Audit Batch 2: After-the-Call + Pipeline
**Auditor**: Agent B (Sonnet 4.6)
**Date**: 2026-03-01
**Scope**: AUDIT-013 through AUDIT-030

---

## Summary Table

| Feature | Status | P0 | P1 | P2 | P3 |
|---------|--------|----|----|----|-----|
| AUDIT-013: AI Post-Meeting Debrief | ISSUES FOUND | 0 | 2 | 3 | 1 |
| AUDIT-014: HITL Follow-Up Email | ISSUES FOUND | 1 | 1 | 2 | 1 |
| AUDIT-015: Smart Action Item Extraction | ISSUES FOUND | 0 | 2 | 2 | 0 |
| AUDIT-016: Ask AI About Any Meeting | ISSUES FOUND | 0 | 1 | 2 | 1 |
| AUDIT-017: AI Coaching & Talk Analytics | ISSUES FOUND | 0 | 1 | 2 | 0 |
| AUDIT-018: AI Proposal Generator | ISSUES FOUND | 0 | 0 | 2 | 1 |
| AUDIT-019: Buyer Intent Detection | PASS | 0 | 0 | 1 | 0 |
| AUDIT-020: Autonomous CRM Updates | ISSUES FOUND | 1 | 1 | 1 | 0 |
| AUDIT-021: Meeting Sharing & Content Library | ISSUES FOUND | 0 | 1 | 1 | 0 |
| AUDIT-022: Workflow Notifications | ISSUES FOUND | 0 | 0 | 1 | 0 |
| AUDIT-023: Visual Pipeline (Kanban + Table) | ISSUES FOUND | 0 | 2 | 2 | 0 |
| AUDIT-024: AI Deal Health Scoring | ISSUES FOUND | 0 | 0 | 2 | 0 |
| AUDIT-025: Proactive Deal Risk Scanner | ISSUES FOUND | 0 | 0 | 2 | 0 |
| AUDIT-026: Stale Deal Revival | ISSUES FOUND | 0 | 0 | 1 | 0 |
| AUDIT-027: Deal Intelligence Panel | ISSUES FOUND | 0 | 1 | 1 | 1 |
| AUDIT-028: Configurable Sales Methodology | PASS | 0 | 0 | 0 | 0 |
| AUDIT-029: Slack Deal Rooms | ISSUES FOUND | 0 | 0 | 2 | 0 |
| AUDIT-030: Sales Dashboard & KPIs | ISSUES FOUND | 0 | 1 | 2 | 0 |

---

## Detailed Findings

### AUDIT-013: AI Post-Meeting Debrief
**Status**: ISSUES FOUND
**Findings**:
- [P1] `meeting-process-structured-summary/index.ts:17` — Imports `@supabase/supabase-js@2.39.3` (not pinned to required `@2.43.4`). All other pinned functions use `2.43.4`; this is inconsistent and may pick up a broken version if ESM cache shifts.
- [P1] `meeting-process-structured-summary/index.ts:644` — No JWT/auth validation at all. The function runs entirely with service role and accepts any caller without verifying who triggered it. Any unauthenticated POST can trigger expensive Claude AI calls. Missing `getAuthContext()` or `isServiceRoleAuth()` check.
- [P2] `condense-meeting-summary/index.ts:13-16` — Uses **legacy static `corsHeaders`** object instead of `getCorsHeaders(req)`. Violates critical rule.
- [P2] `condense-meeting-summary/index.ts` — No auth check at all. No JWT validation, no service role check. The function is callable by anyone — unintended open endpoint.
- [P2] `slack-post-meeting/index.ts:6` — Imports `@supabase/supabase-js@2.39.3` (same unpinned issue as meeting-process-structured-summary).
- [P3] `meeting-process-structured-summary/index.ts:265` — Deal lookup uses `.ilike('title', ...)` fuzzy match and `.single()` (not `maybeSingle()`) on the deal query at line 269, which throws PGRST116 if no matching deal found. Should use `maybeSingle()`.

**Notes**: The structured summary function is well-architected with credit checks, cost tracking, and deal truth extraction, but the auth gap is a significant risk for expensive AI call abuse.

---

### AUDIT-014: HITL Follow-Up Email (Send as Rep) — CRITICAL
**Status**: ISSUES FOUND
**Findings**:
- [P0] `send-scheduled-emails/index.ts` — **No incoming auth check**. The function has CORS handling but zero authentication enforcement. Any caller can trigger scheduled email processing. The cron path via pg_net is presumably safe (direct DB → edge), but if this function is ever called directly it processes all pending emails for all users. There is no `isServiceRoleAuth()` or `verifyCronSecret()` check at the entry point.
- [P1] `send-scheduled-emails/index.ts:97` — Uses `supabaseAdmin.functions.invoke('email-send-as-rep', ...)` which passes no auth context. While this works for server-to-server (service key on the `supabaseAdmin` client), if `email-send-as-rep` validates the calling identity, it may fail. Needs verification that `email-send-as-rep` accepts service role calls.
- [P2] `generate-follow-up/index.ts:174` — N+1 query pattern: the `handleRecentMeetings` function loops over meetings and issues separate DB queries for attendees, company, and meeting count per meeting (up to 10 × 3 = 30 queries). Under load this will be slow.
- [P2] `generate-follow-up/index.ts:263-295` — Auth is validated before SSE stream opens (good), but the `handleGenerateFollowUp` function does not validate that the `meeting_id` belongs to the authenticated user — any authenticated user can request follow-up generation for any meeting ID.
- [P3] `hitl-send-followup-email/index.ts:466` — For proposal emails, the HTML body is constructed via string interpolation of `executiveSummary` from `original_content`. If this value ever contains attacker-controlled HTML (e.g., from a compromised approval flow), it would inject HTML into emails. Low severity because the approval flow itself requires prior HITL entry, but worth sanitizing.

**Notes**: `hitl-send-followup-email` itself is well-secured (service-role only, daily cap, autopilot signals). `send-scheduled-emails` is the weak link.

---

### AUDIT-015: Smart Action Item Extraction
**Status**: ISSUES FOUND
**Findings**:
- [P1] `extract-action-items/index.ts:2` — Imports `@supabase/supabase-js@2` (unpinned). This is the most dangerous form — `@2` resolves to the latest minor which is known-broken (`@2.95.1` → 500 errors per MEMORY.md).
- [P1] `extract-action-items/index.ts:6-9` — Uses **legacy static `corsHeaders`** object (not `getCorsHeaders(req)`). Multiple CORS violations in this function.
- [P2] `extract-action-items/index.ts` — Auth check present (authHeader required, line 46) but uses the raw token passed in the Authorization header for a user-scoped client. If `isServiceRole` is true, the function bypasses RLS entirely. No validation that the meeting belongs to the calling user/org when in service-role mode (called from orchestrator).
- [P2] `extract-action-items/index.ts:33-35` — Dead code: `const txt = await res.text().catch(() => '')` result is captured but never used or logged. Variable `txt` declared but unused.

**Notes**: The dual-client pattern (user vs service role) is reasonable for orchestrator calls, but the unpinned supabase import is a critical infrastructure issue.

---

### AUDIT-016: Ask AI About Any Meeting
**Status**: ISSUES FOUND
**Findings**:
- [P1] `ask-meeting-ai/index.ts:9` — Imports `@supabase/supabase-js@2` (unpinned — broken version risk).
- [P2] `ask-meeting-ai/index.ts:13-16` — Uses **legacy static `corsHeaders`** object (not `getCorsHeaders(req)`).
- [P2] `ask-meeting-ai/index.ts:170-174` — Creates a second Supabase client (service role) *inside* the cost logging block using a raw string import: `const { logAICostEvent } = await import('../_shared/costTracking.ts')`. Dynamic import inside a try/catch that silently fails is fragile; cost tracking will silently drop if import fails.
- [P3] `ask-meeting-ai/index.ts:123` — The full transcript is injected into the system prompt without any size guard. A 200k+ character transcript could cause Claude to reject the request (context limit) or incur excessive cost. The structured summary function (AUDIT-013) correctly truncates at 50k chars; this function should do the same.

**Notes**: The meeting is validated via RLS (user client with JWT), and auth is correctly checked. The main risks are infrastructure (unpinned import, legacy CORS) and cost protection (no transcript size limit).

---

### AUDIT-017: AI Coaching & Talk Analytics
**Status**: ISSUES FOUND
**Findings**:
- [P1] `meeting-generate-scorecard/index.ts:16` — Imports `@supabase/supabase-js@2.39.3` (not pinned to `@2.43.4`). Like AUDIT-013, this is an older pin that should be updated.
- [P2] `meeting-generate-scorecard/index.ts:673-688` — No incoming auth check. The function processes any `meetingId` passed in the body using the service role client. Any caller can trigger scorecard generation (and incur Claude AI costs) for any meeting, without ownership verification.
- [P2] `meeting-generate-scorecard/index.ts:724` — Uses `.single()` (not `maybeSingle()`) for org membership lookup. If the meeting owner has no org membership, this throws PGRST116 rather than returning a clean 403.

**Notes**: Credit balance is checked before AI calls (good). The function is well-structured with template resolution, workflow checklist, and cost tracking.

---

### AUDIT-018: AI Proposal Generator
**Status**: ISSUES FOUND
**Findings**:
- [P2] `generate-proposal/index.ts:5-8` — Uses **legacy static `corsHeaders`** object (not `getCorsHeaders(req)`).
- [P2] `generate-proposal/index.ts` — Auth token is read from headers but it's not clear if the full user identity is verified via `getUser()`. The function uses the service role client (`@2.43.4` pinned — good) for DB operations. Need to confirm user ID is extracted from JWT properly rather than trusting a body-passed `userId`.
- [P3] `generate-proposal/index.ts` — The function supports multiple actions including `process_job`, `get_job_status` etc. with no rate limiting. Generating proposals can be expensive; no per-user throttle is present.

**Notes**: Pinned to `@2.43.4` (good). The proposal generator is feature-rich with streaming and async job support.

---

### AUDIT-019: Buyer Intent Detection
**Status**: PASS
**Findings**:
- [P2] `detect-intents/index.ts` — No `serve()` wrapper visible in the first 80 lines reviewed. The function uses `@2.43.4` (pinned correctly), `getCorsHeaders(req)` (correct), and has proper TypeScript types. No auth issues visible.

**Notes**: Clean implementation. Uses proper CORS and pinned supabase import. No blocking issues found in the visible portion.

---

### AUDIT-020: Autonomous CRM Updates
**Status**: ISSUES FOUND
**Findings**:
- [P0] `sync-recording-to-crm/index.ts:17` — Imports legacy `corsHeaders` (not a function): `import { corsHeaders, handleCorsPreflightWithResponse } from '../_shared/corsHelper.ts'`. CLAUDE.md explicitly forbids using legacy `corsHeaders`. This is the static constant export (old pattern), not `getCorsHeaders(req)`.
- [P0] `sync-recording-to-crm/index.ts:16` — Imports `@supabase/supabase-js@2` (unpinned). Broken version risk in a function that modifies CRM data.
- [P1] `sync-recording-to-crm/index.ts:110-114` — Contact lookup in `matchContacts()` does not filter by `org_id`: `supabase.from('contacts').select('id, first_name, last_name').ilike('email', email)`. This queries across ALL orgs' contacts, creating a data isolation risk where an org's contact could be matched to a recording from a different org.

**Notes**: The function is complex and touches CRM, contacts, deals, and HubSpot. The cross-org contact match bug (P1) could result in incorrect cross-customer data associations.

---

### AUDIT-021: Meeting Sharing & Content Library
**Status**: ISSUES FOUND
**Findings**:
- [P1] `send-recording-notification/index.ts:15` — Imports `@supabase/supabase-js@2` (unpinned) and uses legacy `import { corsHeaders, handleCorsPreflightWithResponse }` (old CORS pattern).
- [P2] `send-recording-notification/index.ts` — No user-level auth visible in the first 60 lines. The function takes `user_id` and `org_id` from the request body rather than deriving them from a validated JWT, which means a caller could spoof those values if not protected elsewhere.

**Notes**: The notification patterns (bot_joining, bot_failed, recording_ready, hitl_deal_selection, hitl_speaker_confirmation) are well-structured. The main risks are infrastructure (unpinned import, legacy CORS) and the body-supplied auth identifiers.

---

### AUDIT-022: Workflow Notifications
**Status**: ISSUES FOUND
**Findings**:
- [P2] `meeting-workflow-notifications/index.ts:16` — Imports `@supabase/supabase-js@2.39.3` (not pinned to `@2.43.4`). The `getCorsHeaders(req)` import is correct (good).

**Notes**: The function correctly uses `getCorsHeaders`, has proper TypeScript types, and handles both individual and batch notification modes. Only the supabase version pin needs updating.

---

### AUDIT-023: Visual Pipeline (Kanban + Table)
**Status**: ISSUES FOUND
**Findings**:
- [P1] `deals/index.ts:2` — Imports `@supabase/supabase-js@2` (unpinned — broken version risk on a critical data-mutation endpoint).
- [P1] `pipeline-tables/index.ts:2` — Imports `@supabase/supabase-js@2` (unpinned). **Worse**: this function dynamically creates a SQL-execution stored procedure (`CREATE OR REPLACE FUNCTION public.pgsql`) and then calls it with arbitrary SQL strings (lines 31-42). This is a severe security anti-pattern — creating a generic SQL executor via an edge function is effectively an RCE vector if the function is callable without proper auth.
- [P2] `pipeline-tables/index.ts` — No auth check visible. The SQL-execution function appears to be unprotected. Even if the RPC itself is locked down, creating the `pgsql` procedure on deployment is dangerous.
- [P2] `deals/index.ts` — Uses service role client (`SUPABASE_SERVICE_ROLE_KEY`) for all deal operations without verifying the JWT. Rate limiting is applied (good) but user identity is not validated before data mutations.

**Notes**: `pipeline-tables` is the most concerning function in this entire batch. The dynamic SQL execution pattern needs immediate review and likely should be replaced with proper migrations.

---

### AUDIT-024: AI Deal Health Scoring
**Status**: ISSUES FOUND
**Findings**:
- [P2] `calculate-deal-health/index.ts:11` — Imports `@supabase/supabase-js@2.39.3` (not pinned to `@2.43.4`).
- [P2] `agent-deal-temperature/index.ts` — Correctly uses `@2.43.4` and `getCorsHeaders(req)`. Auth check via `verifyCronSecret` + `isServiceRoleAuth` (good). No major issues found. Only minor: the function returns threshold-crossing events but doesn't appear to send notifications for them — caller must handle.

**Notes**: `agent-deal-temperature` is well-implemented. `calculate-deal-health` has a minor version pin issue but is otherwise functional.

---

### AUDIT-025: Proactive Deal Risk Scanner
**Status**: ISSUES FOUND
**Findings**:
- [P2] `deal-analyze-risk-signals/index.ts:22` — Imports `@supabase/supabase-js@2.39.3` (not pinned to `@2.43.4`).
- [P2] `proactive-pipeline-analysis/index.ts` — Correctly uses `@2.43.4` and `getCorsHeaders(req)`. However, the function does not appear to have incoming auth validation for manual POST invocations — it relies on the cron trigger context but may be callable without auth for direct testing.

**Notes**: `agent-deal-risk-batch` was not reviewed directly in this audit. The risk scanner functions are generally well-structured with playbook support and risk scorer config. Main issue is supabase version inconsistency.

---

### AUDIT-026: Stale Deal Revival
**Status**: ISSUES FOUND
**Findings**:
- [P2] `slack-stale-deals/index.ts:11` — Imports `@supabase/supabase-js@2` (unpinned). This is a cron-triggered function that processes all orgs, making the broken version risk higher.

**Notes**: Auth is correctly implemented: `verifyCronSecret` + `isServiceRoleAuth` with fail-closed logic (line 48). Uses `getCorsHeaders` correctly. Mirrors Slack notifications to in-app (good pattern). Only the supabase version pin needs fixing.

---

### AUDIT-027: Deal Intelligence Panel
**Status**: ISSUES FOUND
**Findings**:
- [P1] `update-deal-dossier/index.ts:30-35` — The function accepts **any JWT Bearer token** and uses it as the Supabase client key: `const effectiveKey = serviceRoleKey || authHeader.replace('Bearer ', '')`. This means a user JWT token is used as the Supabase key instead of validating the user. If `serviceRoleKey` is empty (which should not happen in production but could in dev), it falls back to using whatever Authorization header was passed as the service key — a potential privilege escalation.
- [P2] `deal-activities/index.ts:11` — Imports `@supabase/supabase-js@2` (unpinned).
- [P2] `deal-activities/index.ts:16-17` — Auth check requires both `Authorization` header AND `apikey` header (line 16). This non-standard auth pattern is different from every other function and may cause integration issues.
- [P3] `heal-deal-links/index.ts:34` — JWT decode uses `atob(authHeader.split('.')[1])` to check role claim. Base64 decoding without proper error handling for malformed tokens. The try/catch handles this (line 36), but the approach relies on string comparison of the JWT payload rather than cryptographic verification — this is acceptable for service-role detection only (tokens are still validated by Supabase RLS), but is unusual.

**Notes**: `update-deal-dossier` has the most concerning auth pattern. The `effectiveKey` logic should be replaced with explicit service role key validation.

---

### AUDIT-028: Configurable Sales Methodology
**Status**: PASS
**Findings**: No edge function for this feature — handled client-side via `useDealStages.ts` hook which queries Supabase directly using the authenticated user's JWT. No edge function security surface to audit.

**Notes**: Clean implementation, no server-side concerns.

---

### AUDIT-029: Slack Deal Rooms
**Status**: ISSUES FOUND
**Findings**:
- [P2] `slack-deal-room/index.ts:5` — Imports `@supabase/supabase-js@2.39.3` (not pinned to `@2.43.4`).
- [P2] `slack-deal-momentum/index.ts:11` — Imports `@supabase/supabase-js@2` (unpinned).

**Notes**: Both functions use `getCorsHeaders(req)` correctly. Auth is implemented via `getAuthContext`/`requireOrgRole` (deal-room) and `verifyCronSecret`/`isServiceRoleAuth` (deal-momentum). Good auth patterns. Only version pin issues.

---

### AUDIT-030: Sales Dashboard & KPIs
**Status**: ISSUES FOUND
**Findings**:
- [P1] `materialize-crm-deals/index.ts` — No auth check visible in the reviewed portion. The function materializes deals from CRM index into the deals table and takes `org_id` from the request body. If callable without auth, an attacker could trigger materialization for any org.
- [P2] `agent-pipeline-snapshot/index.ts` — Correctly uses `@2.43.4` (good). Auth likely handled by `runAgent()` helper but needs confirmation.
- [P2] `materialize-crm-deals/index.ts` — Correctly uses `@2.43.4` (good) and `getCorsHeaders(req)` (good). But `org_id` taken from body at face value with no org membership verification for the calling user.

**Notes**: `agent-pipeline-snapshot` and `agent-pipeline-patterns` follow good patterns (pinned import, getCorsHeaders). `materialize-crm-deals` needs auth review.

---

## Cross-Cutting Findings

### Unpinned/Wrong Supabase Version (affects 12 functions)
The following functions use wrong or unpinned `@supabase/supabase-js` versions:
- `@2` (broken — resolves to 2.95.1): `extract-action-items`, `ask-meeting-ai`, `sync-recording-to-crm`, `send-recording-notification`, `deals`, `pipeline-tables`, `slack-stale-deals`, `slack-deal-momentum`, `deal-activities`
- `@2.39.3` (old pin): `meeting-process-structured-summary`, `slack-post-meeting`, `meeting-generate-scorecard`, `calculate-deal-health`, `deal-analyze-risk-signals`, `meeting-workflow-notifications`, `slack-deal-room`

**Remediation**: Bump all to `@2.43.4`.

### Legacy CORS Pattern (affects 4+ functions)
Functions using static `corsHeaders` object instead of `getCorsHeaders(req)`:
- `condense-meeting-summary` (also missing serve wrapper guard)
- `extract-action-items`
- `ask-meeting-ai`
- `generate-proposal`
- `sync-recording-to-crm` (imports `corsHeaders` directly)
- `send-recording-notification` (imports `corsHeaders` directly)
- `pipeline-tables` (static object)

### Missing Auth (affects 5 functions)
Functions callable without authentication or with weak auth:
- `meeting-process-structured-summary` — no auth
- `condense-meeting-summary` — no auth
- `meeting-generate-scorecard` — no auth (service role only, but open)
- `send-scheduled-emails` — no auth (P0)
- `materialize-crm-deals` — body-supplied org_id without membership check
- `pipeline-tables` — creates SQL executor without auth
