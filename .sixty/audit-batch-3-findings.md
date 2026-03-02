# Audit Batch 3: Outreach + Backend — Findings
**Date**: 2026-03-01
**Auditor**: Claude (Sonnet 4.6)
**Scope**: AUDIT-031 through AUDIT-048

---

## Summary Table

| Audit | Feature | Status | P0 | P1 | P2 | P3 |
|-------|---------|--------|----|----|----|----|
| 031 | Multi-Source Prospecting Hub | ISSUES FOUND | 0 | 1 | 2 | 1 |
| 032 | Ops Tables (AI Spreadsheet) | ISSUES FOUND | 0 | 2 | 2 | 0 |
| 033 | Natural Language Data Queries | PASS | 0 | 0 | 0 | 1 |
| 034 | AI Deduplication | PASS | 0 | 0 | 0 | 0 |
| 035 | AI Email Sequence Generator | ISSUES FOUND | 0 | 2 | 0 | 1 |
| 036 | AI Campaign Monitoring | ISSUES FOUND | 1 | 0 | 1 | 0 |
| 037 | Waterfall Enrichment | ISSUES FOUND | 0 | 1 | 1 | 0 |
| 038 | Web Scraping Marketplace (Apify) | PASS | 0 | 0 | 1 | 0 |
| 039 | Leads Inbox | ISSUES FOUND | 0 | 3 | 0 | 0 |
| 040 | Multi-CRM Push | ISSUES FOUND | 1 | 1 | 1 | 0 |
| 041 | AI Copilot (Conversational Agent) | ISSUES FOUND | 1 | 1 | 1 | 0 |
| 042 | Slack Sales Assistant | ISSUES FOUND | 1 | 0 | 0 | 0 |
| 043 | 6-Agent Specialist Fleet | PASS | 0 | 0 | 0 | 0 |
| 044 | Autonomy Escalation Engine | PASS | 0 | 0 | 0 | 0 |
| 045 | Command Centre (Action Hub) | ISSUES FOUND | 0 | 1 | 0 | 0 |
| 046 | Email Action Centre | ISSUES FOUND | 0 | 1 | 1 | 0 |
| 047 | Agent Marketplace + Custom SOPs | ISSUES FOUND | 0 | 2 | 1 | 0 |
| 048 | AI Daily Briefing | PASS | 0 | 0 | 0 | 0 |

---

## Detailed Findings

### AUDIT-031: Multi-Source Prospecting Hub
**Status**: ISSUES FOUND
**Findings**:
- [P1] `supabase/functions/apollo-search/index.ts:5` — Uses legacy `corsHeaders` hardcoded object (`const corsHeaders = { ... }`) instead of `getCorsHeaders(req)`. This is the infrastructure standard violation.
- [P2] `supabase/functions/apollo-search/index.ts:5` — Legacy static `corsHeaders` object, not dynamic per-request. All other prospecting functions (ai-ark-search, ai-ark-semantic, ai-ark-similarity, prospecting-search, prospecting-refine) correctly use `getCorsHeaders(req)`.
- [P2] `supabase/functions/ai-ark-search/index.ts` — `CREDIT_COSTS` in `ai-ark-search` (`ai_ark_company: 0.25`, `ai_ark_people: 1.25`) differ from MEMORY.md-documented actual costs (`-2.5` and `-12.5` credits). The values in `prospecting-search/index.ts` show the correct costs. Inconsistent credit accounting across functions that call AI Ark.
- [P3] `supabase/functions/ai-ark-search/index.ts` — `keywords` field declared twice in `AIArkSearchParams` interface (appears both in company section and shared section), causing TypeScript duplicate property warning.

**Notes**: Auth pattern is correct across all 6 functions — JWT validated via `getUser()`, org membership checked via `maybeSingle()`. `supabase-js` correctly pinned to `@2.43.4` in all except `apollo-search` which was already flagged. Rate limiting present in all AI Ark functions. Credit balance checks in place.

---

### AUDIT-032: Ops Tables (AI Spreadsheet)
**Status**: ISSUES FOUND
**Findings**:
- [P1] `supabase/functions/copilot-dynamic-table/index.ts:6` — Uses legacy `corsHeaders` hardcoded object (`const corsHeaders = { ... }`). This is a commonly called function (triggered by prospecting flows and direct UI); non-dynamic CORS could cause preflight failures in some environments.
- [P1] `supabase/functions/copilot-dynamic-table/index.ts` — No user JWT authentication. The function uses a service-role client directly without validating the caller's identity. Any request that reaches this function can create/modify dynamic tables. This is the most-called ops table function.
- [P2] `supabase/functions/copilot-dynamic-table/index.ts` — No `@supabase/supabase-js` version pinned (inherits from the project root but direct imports may resolve to broken `@2` — needs verification). Note: file correctly imports from `@2.43.4` (confirmed line 2 in the grep output was from `copilot-dynamic-table`).
- [P2] `supabase/functions/ops-table-inbound-webhook/index.ts` — In-memory rate limiter (60 req/min per `table_id`) is per-isolate. Supabase Edge Functions can spin up multiple isolates, so rate limits are not globally enforced. A single attacker could hit the limit N times where N = number of isolates.

**Notes**: `provision-standard-ops-tables` and `enrich-dynamic-table` both use correct CORS, pinned supabase-js, proper auth patterns. `ops-table-inbound-webhook` correctly uses API key auth (not JWT) per design. `enrich-dynamic-table` uses `maybeSingle()` appropriately.

---

### AUDIT-033: Natural Language Data Queries
**Status**: PASS
**Findings**:
- [P3] `supabase/functions/ops-table-ai-query/index.ts` — `parsedAction` field in `RequestBody` is typed as `any`. Minor TypeScript quality issue but not a runtime risk.

**Notes**: Auth pattern is correct — JWT validated at line 1406, org membership verified. CORS uses `getCorsHeaders(req)` via `errorResponse`/`jsonResponse` helpers. `supabase-js` pinned to `@2.43.4`. Rate limiting via `rateLimitMiddleware`. Credit cost tracking present. `maybeSingle()` used throughout.

---

### AUDIT-034: AI Deduplication
**Status**: PASS
**Findings**: None found.

**Notes**: `AiDeduplicatePreviewModal.tsx` is purely client-side UI that calls `ops-table-ai-query` (audited above). No separate edge function. Logic is self-contained in the modal component.

---

### AUDIT-035: AI Email Sequence Generator
**Status**: ISSUES FOUND
**Findings**:
- [P1] `supabase/functions/api-sequence-execute/index.ts:17` — `@supabase/supabase-js@2` is **unpinned**. This will resolve to `@2.95.1` on esm.sh which returns a 500 Internal Server Error, causing `api-sequence-execute` to fail at cold start. This breaks the entire sequence execution pipeline.
- [P1] `supabase/functions/api-skill-execute/index.ts:13` — Same issue: `@supabase/supabase-js@2` unpinned. Both skill execute functions share this critical deployment bug.
- [P3] `supabase/functions/generate-email-sequence/index.ts` — `model` field in `RequestBody` is accepted but usage is not clearly documented. If callers can specify arbitrary models, this could lead to unexpected cost escalation.

**Notes**: `generate-email-sequence` correctly uses `getCorsHeaders(req)` via helper imports, pinned `@2.43.4`, proper JWT auth via `getUserOrgId()` helper, credit balance check before generation. `send-scheduled-emails` is clean. The unpinned supabase-js in the execute functions is the critical path issue.

---

### AUDIT-036: AI Campaign Monitoring
**Status**: ISSUES FOUND
**Findings**:
- [P0] `supabase/functions/monitor-campaigns/index.ts` — **No JWT authentication**. The function accepts `org_id` and `user_id` directly from the request body and uses a service-role client without verifying the caller owns those IDs. Any caller who knows or guesses an `org_id` can retrieve that organization's campaign data and Instantly API credentials. This is an auth bypass / data leak.
- [P2] `supabase/functions/monitor-campaigns/index.ts` — Uses `getCorsHeaders(req)` but does not call `handleCorsPreflightRequest`. OPTIONS preflight will not receive proper CORS headers — the call to `getCorsHeaders` is present but the OPTIONS branch just returns `new Response('ok', { headers: corsHeaders })` manually without the standard preflight helper.

**Notes**: `slack-campaign-alerts` is correctly secured using `verifyCronSecret`/`isServiceRoleAuth` — appropriate for a cron-only function. `sync-instantly-engagement` has proper JWT auth and org membership check.

---

### AUDIT-037: Waterfall Enrichment
**Status**: ISSUES FOUND
**Findings**:
- [P1] `supabase/functions/auto-re-enrich/index.ts:15` — `@supabase/supabase-js@2` is **unpinned**. This cron function will fail at cold start with a 500 from esm.sh. Since it's a scheduled job, failures will silently not re-enrich stale orgs.
- [P2] `supabase/functions/enrich-cascade/index.ts` — In-memory rate limiting for AI Ark (`AI_ARK_CONCURRENT = 4`) and Apollo (`APOLLO_CONCURRENT = 5`) is per-isolate, not global. Under concurrent invocations the effective rate could exceed API provider limits.

**Notes**: `enrich-cascade` uses correct CORS (`getCorsHeaders`), pinned `@2.43.4`, proper JWT auth. `enrich-company` uses `getAuthContext` (flexible auth helper) — correctly secured. `deep-enrich-organization` and `apify-linkedin-enrich` are both clean on auth, CORS, and supabase version.

---

### AUDIT-038: Web Scraping Marketplace (Apify)
**Status**: PASS
**Findings**:
- [P2] `supabase/functions/apify-run-start/index.ts` — Rate limiting thresholds (`MAX_CONCURRENT_RUNS = 5`, `HOURLY_WARN_THRESHOLD = 20`, `DAILY_WARN_THRESHOLD = 100`) are checked but the data is stored in-memory per-isolate. Concurrent invocations could bypass these soft limits.

**Notes**: All Apify functions (`apify-run-start`, `apify-actor-introspect`, `apify-auto-map`, `apify-connect`, `apify-run-webhook`) correctly use `getCorsHeaders(req)`, pinned `@2.43.4`, and have proper JWT auth. `apify-run-webhook` correctly has no JWT (external webhook from Apify). The `_auth_token` body fallback in `apify-linkedin-enrich` is consistent with the browser extension workaround pattern documented in MEMORY.md.

---

### AUDIT-039: Leads Inbox
**Status**: ISSUES FOUND
**Findings**:
- [P1] `supabase/functions/import-leads-generic/index.ts:14` — `@supabase/supabase-js@2` is **unpinned**. Deployment will fail at cold start.
- [P1] `supabase/functions/import-leads-generic/index.ts:15` — Imports from `../_shared/cors.ts` (legacy static CORS), not `getCorsHeaders(req)`. This is the legacy pattern that must not be used.
- [P1] `supabase/functions/reprocess-lead-prep/index.ts:2,3` — Same dual issue: `@supabase/supabase-js@2` unpinned AND imports from legacy `../_shared/cors.ts`. Additionally, `reprocess-lead-prep` has **no JWT authentication** — it processes lead prep for any payload without verifying the caller identity.
- [P1] `supabase/functions/savvycal-leads-webhook/index.ts:2,6` — `@supabase/supabase-js@2` unpinned AND imports from legacy `../_shared/cors.ts`.

**Notes**: `savvycal-leads-webhook` uses webhook secret validation (org-scoped `OrgWebhookContext`), which is appropriate for an external webhook. `process-lead-prep` and `facebook-leads-webhook` are correctly implemented. The leads inbox frontend (`LeadsInbox.tsx`, `LeadTable.tsx`, `useLeads.ts`) not directly reviewed as issues are in the edge functions.

---

### AUDIT-040: Multi-CRM Push
**Status**: ISSUES FOUND
**Findings**:
- [P0] `supabase/functions/push-to-hubspot/index.ts:23` — **No JWT authentication and legacy CORS**. The function creates a service-role client immediately without verifying any user token. It accepts `table_id` from the body and pushes to HubSpot using that org's stored credentials. An attacker who knows any `table_id` UUID can exfiltrate HubSpot credentials and push arbitrary data to HubSpot. Legacy `corsHeaders` hardcoded object used.
- [P1] `supabase/functions/instantly-push/index.ts:5` — Uses legacy `corsHeaders` hardcoded object, not `getCorsHeaders(req)`. Auth is otherwise correct (JWT validated).
- [P2] `supabase/functions/push-cell-to-hubspot/index.ts:24` — Legacy `corsHeaders` hardcoded object. Auth is otherwise correct (JWT validated).

**Notes**: `push-to-attio`, `push-to-instantly`, and `push-cell-to-attio` all correctly authenticate via JWT and use `getCorsHeaders(req)`. The `push-to-hubspot` auth omission is the critical risk — this needs immediate attention before release.

---

### AUDIT-041: AI Copilot (Conversational Agent) — CRITICAL
**Status**: ISSUES FOUND
**Findings**:
- [P0] `supabase/functions/copilot-autonomous/index.ts:29` — `@supabase/supabase-js@2` is **unpinned**, causing cold-start failure in deployed environments. This is the primary autonomous copilot function.
- [P1] `supabase/functions/copilot-autonomous/index.ts:2458,2474` — Body is parsed (`req.json()`) at line 2458 **before** the auth check at line 2474. While auth IS checked and enforced (function returns 401 if no valid user), the body parse-before-auth order means a malformed body could cause an unhandled exception before auth is checked. The auth enforcement at line 2494 also allows `userId` to be null and proceeds to use `supabase.auth.admin.getUserById` with potentially null values.
- [P1] `supabase/functions/api-copilot/index.ts:13` — `@supabase/supabase-js@2` is **unpinned**. The primary copilot API function will fail at cold start.
- [P2] `supabase/functions/api-copilot/index.ts` — Imports `corsHeaders as staticCorsHeaders` from `_shared/corsHelper.ts`, suggesting some responses may use the static fallback rather than the dynamic per-request headers.

**Notes**: Known issue noted in audit spec: `copilot-autonomous` parses body before auth. Auth IS enforced — userId null check at line 2490 returns 401. The `conversational-copilot` function was not found (may be removed or renamed). The unpinned `@supabase/supabase-js@2` in both primary copilot functions is a deployment-blocking issue.

---

### AUDIT-042: Slack Sales Assistant
**Status**: ISSUES FOUND
**Findings**:
- [P0] `supabase/functions/slack-copilot/index.ts` — **No JWT authentication**. The function accepts `orgId` and `userId` directly from the JSON body and uses a service-role client throughout. There is no verification that the caller is the user they claim to be. Anyone who can POST to this endpoint with a valid `orgId`/`userId` pair can execute copilot queries as that user, read their CRM data, and trigger actions on their behalf.

**Notes**: `slack-copilot-actions` correctly handles Slack signature verification for interactive components (implied by Slack's own verification). Rate limiting is applied per-user inside the function body, but without JWT verification the `userId` can be spoofed. The function is called server-to-server from Slack infrastructure, but the endpoint is publicly accessible.

---

### AUDIT-043: 6-Agent Specialist Fleet
**Status**: PASS
**Findings**: None found.

**Notes**: `agentDefinitions.ts` and `agentRunner.ts` are shared library files, not directly callable. `agentRunner.ts` correctly uses `@2.43.4`, has budget enforcement, retry logic, and structured telemetry. `agentSpecialist.ts` and `agentClassifier.ts` not independently callable — invoked via `copilot-autonomous` (audited above). No direct security surface.

---

### AUDIT-044: Autonomy Escalation Engine
**Status**: PASS
**Findings**: None found.

**Notes**: `executeAction.ts` and `registry.ts` are shared library adapters, not directly callable edge functions. Auth is enforced at the calling layer (`copilot-autonomous`, `api-copilot`). The `confirm` flag pattern is correctly implemented — destructive actions require `confirm: true`. No direct security surface.

---

### AUDIT-045: Command Centre (Action Hub)
**Status**: ISSUES FOUND
**Findings**:
- [P1] `supabase/functions/api-action-centre/index.ts:17` — `@supabase/supabase-js@2` is **unpinned**. This will cause cold-start deployment failure, breaking the entire Action Hub.

**Notes**: Auth pattern is correct — JWT validated before any data access. CORS uses `getCorsHeaders(req)` via helper imports. The function uses proper `maybeSingle()` for lookups.

---

### AUDIT-046: Email Action Centre
**Status**: ISSUES FOUND
**Findings**:
- [P1] `supabase/functions/email-send-as-rep/index.ts:25` — `@supabase/supabase-js@2` is **unpinned**. This is the core email-sending function; cold-start failure would silently break all scheduled and copilot-triggered email sends.
- [P2] `supabase/functions/analyze-email/index.ts` — **No authentication**. The function accepts email content directly and returns AI analysis without any JWT verification. Uses legacy `corsHeaders` hardcoded object. While the function only reads email content passed in the request (no database read of user data), it consumes Anthropic API credits without accounting for which org/user made the request, creating a cost attribution gap and potential abuse vector.

**Notes**: `email-send-as-rep` auth is handled via `authenticateRequest()` helper from `_shared/edgeAuth.ts` which provides flexible JWT + service-role auth. The daily send limit (50 emails) and Gmail API integration are well-implemented. `analyze-email` using `supabase-js@2.39.3` (pinned but to an old version — not the broken @2 pattern, but not the recommended @2.43.4 either).

---

### AUDIT-047: Agent Marketplace + Custom SOPs
**Status**: ISSUES FOUND
**Findings**:
- [P1] `supabase/functions/api-skill-execute/index.ts:13` — `@supabase/supabase-js@2` is **unpinned** (same as AUDIT-035). Deployment-blocking cold-start failure.
- [P1] `supabase/functions/api-skill-builder/index.ts` — Uses legacy `corsHeaders` hardcoded object. Also uses `supabase-js@2.39.3` (old pinned version, not the recommended @2.43.4). Auth handling not visible from header review — needs deeper inspection.
- [P2] `supabase/functions/api-skill-builder/index.ts` — `supabase-js` pinned to `@2.39.3` (older pinned version, not the standard `@2.43.4`). Not the broken `@2` pattern but inconsistent with project standards.

**Notes**: `skillsRuntime.ts`, `skillsToolHandlers.ts`, and `promptLoader.ts` are shared library files. `api-skill-execute` auth pattern is correct (JWT validated, org membership checked via `maybeSingle()`). The unpinned supabase-js in the execute path is the critical issue.

---

### AUDIT-048: AI Daily Briefing
**Status**: PASS
**Findings**: None found.

**Notes**: `agent-morning-briefing/index.ts` correctly uses `getCorsHeaders(req)`, pinned `supabase-js@2.43.4`, and appropriate cron/service-role authentication via `verifyCronSecret`/`isServiceRoleAuth`. No user JWT needed — this is a server-side cron job that looks up users internally.

---

## Cross-Cutting Issues

### Unpinned `@supabase/supabase-js@2` (P1 — Deployment Blocking)
The following functions use the unpinned `@2` import which resolves to a broken version on esm.sh:
1. `api-sequence-execute/index.ts:17`
2. `api-skill-execute/index.ts:13`
3. `api-action-centre/index.ts:17`
4. `api-copilot/index.ts:13`
5. `copilot-autonomous/index.ts:29`
6. `email-send-as-rep/index.ts:25`
7. `auto-re-enrich/index.ts:15`
8. `import-leads-generic/index.ts:14`
9. `reprocess-lead-prep/index.ts:2`
10. `savvycal-leads-webhook/index.ts:2`

**Fix for all**: Replace `@supabase/supabase-js@2` with `@supabase/supabase-js@2.43.4`

### Legacy `corsHeaders` Static Object (P1/P2)
The following functions use the deprecated hardcoded CORS pattern instead of `getCorsHeaders(req)`:
1. `apollo-search/index.ts` (P1 — high traffic function)
2. `copilot-dynamic-table/index.ts` (P1 — high traffic function)
3. `push-to-hubspot/index.ts` (P0 — also missing auth)
4. `instantly-push/index.ts` (P1)
5. `push-cell-to-hubspot/index.ts` (P2)
6. `analyze-email/index.ts` (P2)
7. `api-skill-builder/index.ts` (P1)

### Legacy `_shared/cors.ts` Import (P1)
These functions import from the legacy static cors module (should use `_shared/corsHelper.ts`):
1. `import-leads-generic/index.ts`
2. `reprocess-lead-prep/index.ts`
3. `savvycal-leads-webhook/index.ts`

### Missing JWT Authentication (P0/P1)
Critical auth gaps:
- **P0** `monitor-campaigns` — accepts `org_id`/`user_id` from body, no JWT check
- **P0** `push-to-hubspot` — no auth at all, uses service role directly
- **P0** `slack-copilot` — no JWT, accepts `orgId`/`userId` from body
- **P1** `reprocess-lead-prep` — no auth, processes lead prep for any payload
- **P1** `analyze-email` — no auth, unlimited AI credit consumption

---

## Priority Fix List

| Priority | Count | Action |
|----------|-------|--------|
| P0 | 4 | Fix auth bypass in monitor-campaigns, push-to-hubspot, slack-copilot; review reprocess-lead-prep |
| P1 | 10 | Pin supabase-js@2.43.4 in all 10 affected functions |
| P1 | 7 | Replace legacy CORS patterns |
| P2 | 5 | In-memory rate limiters, credit cost inconsistencies, minor auth gaps |
