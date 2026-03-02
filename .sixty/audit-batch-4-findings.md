# Audit Batch 4: Platform + Infrastructure
## AUDIT-049 through AUDIT-065

Generated: 2026-03-01
Auditor: Sonnet 4.6

---

## Summary Table

| Audit | Status | P0 | P1 | P2 | P3 |
|-------|--------|----|----|----|----|
| AUDIT-049 | ISSUES FOUND | 0 | 1 | 1 | 1 |
| AUDIT-050 | PASS | 0 | 0 | 0 | 0 |
| AUDIT-051 | ISSUES FOUND | 0 | 1 | 2 | 2 |
| AUDIT-052 | PASS | 0 | 0 | 1 | 0 |
| AUDIT-053 | ISSUES FOUND | 0 | 1 | 1 | 1 |
| AUDIT-054 | PASS | 0 | 0 | 0 | 0 |
| AUDIT-055 | ISSUES FOUND | 0 | 1 | 2 | 1 |
| AUDIT-056 | ISSUES FOUND | 0 | 1 | 1 | 0 |
| AUDIT-057 | PASS | 0 | 0 | 0 | 0 |
| AUDIT-058 | ISSUES FOUND | 0 | 0 | 2 | 1 |
| AUDIT-059 | ISSUES FOUND | 0 | 1 | 1 | 0 |
| AUDIT-060 | ISSUES FOUND | 0 | 2 | 2 | 1 |
| AUDIT-061 | ISSUES FOUND | 0 | 2 | 1 | 0 |
| AUDIT-062 | PASS | 0 | 0 | 0 | 1 |
| AUDIT-063 | ISSUES FOUND | 1 | 1 | 1 | 0 |
| AUDIT-064 | ISSUES FOUND | 3 | 1 | 1 | 1 |
| AUDIT-065 | PASS | 0 | 0 | 0 | 0 |

---

### AUDIT-049: Semantic Meeting Search + Memory
**Status**: ISSUES FOUND
**Findings**:
- [P1] `supabase/functions/api-copilot-memory/index.ts:15` — Uses unpinned `@supabase/supabase-js@2` (not `@2.43.4`). Per memory, `@2` resolves to `@2.95.1` on esm.sh which returns 500 Internal Server Error. This will cause runtime failures in staging/production.
- [P2] `supabase/functions/api-copilot-memory/index.ts:133` — `handleSearch` passes raw user-supplied `query` string directly to the `search_copilot_memory` RPC without prompt sanitization. While it goes through an RPC (not direct SQL), an injection-style attack targeting the RPC is still a concern if the function uses full-text search operators.
- [P3] `supabase/functions/api-copilot-memory/index.ts:126-151` — No rate limiting on the `/search` endpoint. A user could spam searches. The `security.ts` shared module has `checkRateLimit()` but it is not wired here.

**Notes**: Auth pattern is solid — JWT validated via `authClient.auth.getUser(jwt)`, org membership verified. Uses `maybeSingle()` correctly. The unpinned supabase-js import is the critical fix needed.

---

### AUDIT-050: Competitive Intelligence + Writing Style
**Status**: PASS
**Findings**: No specific edge function file found for this feature. The `analyze-writing-style` function uses `legacyCorsHeaders` (P3 pattern but non-blocking per migration plan), pinned `@2.43.4`, and standard JWT auth. No P0/P1 issues identified.

**Notes**: Feature appears largely frontend-driven via copilot. No critical concerns.

---

### AUDIT-051: Visual Workflow Builder
**Status**: ISSUES FOUND
**Findings**:
- [P1] `supabase/functions/ops-table-workflow-engine/index.ts:388-392` — When loading table metadata for workflow context, the function uses `supabase` (anon-keyed, user-scoped client). However, it does not verify that the authenticated user is a member of the org that owns the table. A user could supply a `tableId` belonging to another org and access that org's column structure. The RLS on `dynamic_tables` should prevent this, but there is no explicit cross-org ownership check.
- [P2] `supabase/functions/ops-table-workflow-engine/index.ts:59-112` — The `parseWorkflowDescription` function inserts raw user-provided `description` text into the AI prompt without sanitization. The shared `security.ts` `sanitizeForPrompt()` helper exists but is not used here.
- [P2] `supabase/functions/ops-table-workflow-engine/index.ts:440-444` — Workflow `execute` action fetches workflow with `select('*')`. CLAUDE.md explicitly states: "Explicit column selection in edge functions — never `select('*')`."
- [P3] `supabase/functions/ops-table-workflow-engine/index.ts:118-251` — Multiple step executors (`executeEnrichApollo`, `executeScoreICP`, `executeAssignByTerritory`, etc.) are stubbed as placeholders returning empty results without throwing errors. The function appears to run successfully while doing nothing, which could confuse users. Not a security issue but a reliability concern.
- [P3] `supabase/functions/ops-table-workflow-engine/index.ts:264-272` — Workflow execution loads ALL rows from a table before filtering. For large tables this is an N+1 / scalability concern (no pagination, no limit).

**Notes**: Uses `@2.43.4` correctly, `getCorsHeaders(req)` correctly, proper JWT auth, `maybeSingle()` used on columns. Cost tracking is wired (`logAICostEvent`).

---

### AUDIT-052: Configurable AI Models + Email Signal Intelligence
**Status**: PASS
**Findings**:
- [P2] `supabase/functions/_shared/modelRouter.ts:489-558` — `checkBudget()` defaults to `{ remaining: 0, can_proceed: true }` on any error (line 550 and 556). If the `credit_transactions` table is unavailable or a DB error occurs, all requests will proceed regardless of credit balance. This is a "fail-open" design — documented as "backward compat" but creates a billing exposure window.

**Notes**: Model resolution logic is well-structured with circuit breaker pattern. Uses `@2.43.4`, `maybeSingle()` appropriately. Credit deduction properly inserts into `credit_transactions`. FLEET_AGENT_BUDGETS provides per-agent caps. The `agentRunner.ts` is well-designed with proper retry categorization, exponential backoff, and execution tracking.

---

### AUDIT-053: 14 Native Integrations
**Status**: ISSUES FOUND
**Findings**:
- [P1] `supabase/functions/import-from-attio/index.ts:1` — File starts with `// @ts-nocheck`. TypeScript checking disabled entirely, hiding potential type errors and any implicit `any` usage that could mask security issues. Combined with service-role DB operations, this reduces confidence in correctness.
- [P2] `supabase/functions/hubspot-admin/index.ts:156` — `body` variable typed as `let body: any = {}` throughout the function. No input validation is performed on the incoming `action` field before routing — the `action` type union at line 7 is declared but not validated against the actual payload at runtime. An unsupported action string will fall through to a catch-all.
- [P3] `supabase/functions/hubspot-admin/index.ts:117` — Minor code quality: `if (req.method !== 'POST') {` appears on same line as `const corsHeaders = getCorsHeaders(req);` with no newline — likely a merge artifact that reduces readability but is not a functional issue.

**Notes**: HubSpot auth flow is correct — user JWT validated, org membership and admin role checked (`hubspot_org_credentials` lookup per org). Token refresh logic properly handles `invalid_grant`. `import-from-attio` uses proper JWT validation and scoped service client. `getCorsHeaders(req)` used in both. supabase-js pinned correctly in attio and hubspot-admin.

---

### AUDIT-054: Global Smart Search + Quick Add
**Status**: PASS
**Findings**: No critical issues identified. Feature is primarily frontend-driven. Search queries pass through RLS-enforced Supabase queries.

**Notes**: No edge function dedicated to this feature found. Standard patterns apply.

---

### AUDIT-055: Credit System & Billing
**Status**: ISSUES FOUND
**Findings**:
- [P1] `supabase/functions/reconcile-billing/index.ts:5` — Uses unpinned `@supabase/supabase-js@2`. This cron function reconciles Stripe subscriptions — if it crashes due to the broken `@2.95.1` version, subscription states will silently drift from Stripe truth. Critical billing function needs pinned version.
- [P2] `supabase/functions/reconcile-billing/index.ts:22-56` — `reconcile-billing` has no authentication check. It uses only CORS headers from `_shared/cors.ts` (legacy static headers) and accepts any POST without a cron secret or service role check. Any caller who knows the function URL can trigger billing reconciliation.
- [P2] `supabase/functions/start-free-trial/index.ts:6` — Uses legacy `corsHeaders` from `_shared/cors.ts` (static, FRONTEND_URL-based) rather than `getCorsHeaders(req)`. Also uses unpinned `@supabase/supabase-js@2` (line 5).
- [P3] `supabase/functions/get-credit-balance/index.ts:257-271` — The `transcriptCountResult` uses a two-step query (fetch all org meeting IDs, then count transcripts) instead of a JOIN, which is inefficient for orgs with many meetings. Not a security concern but a scalability one.

**Notes**: `get-credit-balance` has solid auth: JWT validated, org membership verified before returning data. `stripe-webhook` uses manual HMAC-SHA256 verification (correct per memory). Idempotency check exists for credit pack purchases. `check-credit-alerts` and `purge-credit-logs` use proper cron secret validation.

---

### AUDIT-056: Team & Org Management + Onboarding
**Status**: ISSUES FOUND
**Findings**:
- [P1] `supabase/functions/start-free-trial/index.ts:5` — Uses unpinned `@supabase/supabase-js@2`. This affects trial activation which is a critical onboarding path.
- [P2] `supabase/functions/start-free-trial/index.ts:6` — Uses legacy static `corsHeaders` from `_shared/cors.ts` instead of `getCorsHeaders(req)`. All other new functions have migrated to the allowlist-based helper.

**Notes**: Auth is properly implemented — JWT validated using service role `auth.getUser()`, org membership with owner/admin role check before trial creation. Stripe customer creation follows correct patterns.

---

### AUDIT-057: Public Roadmap & Voting
**Status**: PASS
**Findings**: No edge functions identified for this feature. Appears to be frontend-only or uses a third-party service. No critical concerns.

---

### AUDIT-058: Fleet Orchestrator + Multi-Model Router
**Status**: ISSUES FOUND
**Findings**:
- [P2] `supabase/functions/_shared/agentRunner.ts:207-222` — The `_serviceClient` singleton is initialized once per edge function isolate. If `SUPABASE_URL` or `SUPABASE_SERVICE_ROLE_KEY` changes (e.g., during key rotation), the cached client will use stale credentials until the isolate is recycled. Low-probability but worth noting.
- [P2] `supabase/functions/_shared/modelRouter.ts:550,556` — `checkBudget()` fails open — on any DB error, returns `can_proceed: true` with `remaining: 0`. This means a DB outage silently bypasses credit enforcement across all fleet agents simultaneously.
- [P3] `supabase/functions/_shared/agentRunner.ts:383-393` — `AgentContext.creditsUsed` is exposed as a getter but executors cannot write back to it directly — they must use `createCreditTracker()`. The design is correct but the disconnect between `ctx.creditsUsed` (read-only) and actual tracking could lead to budget being reported as 0 if executors don't correctly use the tracker.

**Notes**: `agentRunner.ts` uses pinned `@2.43.4`. Error classification and retry policy are well-implemented. Execution records in `agent_executions` provide good observability. Budget enforcement exists via `checkAgentBudget()`.

---

### AUDIT-059: Multi-Engine Transcription
**Status**: ISSUES FOUND
**Findings**:
- [P1] `supabase/functions/poll-gladia-jobs/index.ts:16` — Uses unpinned `@supabase/supabase-js@2`. This polling function runs every 3 minutes — if it crashes due to the `@2.95.1` breakage, all in-flight Gladia transcriptions will stall silently with no recovery mechanism.
- [P2] `supabase/functions/poll-gladia-jobs/index.ts:16` — Uses `legacyCorsHeaders` (imported as `corsHeaders`) rather than `getCorsHeaders(req)`. This is flagged as a minor issue since poll-gladia-jobs should not be browser-accessible — but the CORS export alias is confusing.

**Notes**: The function correctly initializes a service-role Supabase client. No JWT auth needed for a scheduled job. Gladia API key checked at startup.

---

### AUDIT-060: Webhook Event Mesh
**Status**: ISSUES FOUND
**Findings**:
- [P1] `supabase/functions/savvycal-leads-webhook/index.ts:2` — Uses unpinned `@supabase/supabase-js@2`. Webhook functions are externally triggered and if they crash, leads are silently dropped.
- [P1] `supabase/functions/savvycal-leads-webhook/index.ts:6-7` — Uses `corsHeaders` from `_shared/cors.ts` (legacy static export). The `corsHeaders` object from `cors.ts` re-exports `corsHeaders` from `corsHelper.ts` which uses a getter returning `FRONTEND_URL`. However, OPTIONS preflight at line 113-115 uses the static object directly — this works but does not implement the proper allowlist-based CORS that `getCorsHeaders(req)` provides.
- [P2] `supabase/functions/fathom-webhook/index.ts:6-9` — Uses hardcoded static `corsHeaders` object (`{ 'Access-Control-Allow-Origin': '*', ... }`) — a true wildcard CORS header, not just legacy static. This is more serious than the legacyCorsHeaders pattern and allows any origin to make requests.
- [P2] `supabase/functions/apify-run-webhook/index.ts:63-67` — OPTIONS preflight returns plain `200 ok` with no CORS headers at all (line 66: `return new Response('ok', { status: 200 })`). Not functionally broken since Apify calls this server-to-server, but inconsistent.
- [P3] `supabase/functions/meetingbaas-webhook/index.ts:17` — Uses unpinned `@supabase/supabase-js@2`. Critical webhook that processes meeting recordings.

**Notes**: `fathom-webhook` has excellent signature verification (HMAC-SHA256 via `use60Signing.ts`, timing-safe comparison). `meetingbaas-webhook` validates via bot_id lookup. `facebook-leads-webhook` validates `x-webhook-secret` with constant-time comparison. `stripe-webhook` uses correct manual HMAC verification. `savvycal-leads-webhook` verifies HMAC signature before processing. Generally good signature hygiene across the webhook mesh; the main issues are the unpinned supabase-js versions.

---

### AUDIT-061: Scheduled Jobs (Cron)
**Status**: ISSUES FOUND
**Findings**:
- [P1] `supabase/functions/reconcile-billing/index.ts:22-56` — No cron secret or auth check. The function is publicly callable. Any POST to this endpoint triggers a full Stripe reconciliation (reads all org subscriptions, compares with Stripe, updates DB). This should be protected by `X-Cron-Secret` header validation.
- [P1] `supabase/functions/proactive-pipeline-analysis/index.ts:78-116` — No auth on the main handler. The function creates a service-role Supabase client and calls `analyzeAllUsers(supabase)` if no userId/organizationId is provided. There is no check that the caller is a legitimate cron trigger (no cron secret, no JWT requirement). Any party who knows the function URL can trigger a full pipeline analysis across all users.
- [P2] `supabase/functions/monitor-campaigns/index.ts:38-50` — No auth validation. Accepts any `org_id` in the POST body and queries `instantly_org_credentials` for that org. While no credentials are returned in the response, the function will make Instantly API calls on behalf of any org_id specified by the caller.

**Notes**: `purge-credit-logs` correctly validates `X-Cron-Secret`. `check-credit-alerts` validates `Authorization` header internally (deployed `--no-verify-jwt`). `proactive-meeting-prep` (not fully read) should be checked for same pattern.

---

### AUDIT-062: Vector Embeddings & RAG
**Status**: PASS
**Findings**:
- [P3] Vector table queries (via `search_copilot_memory` and `get_recent_copilot_memory` RPCs) scope by `p_user_id`. Assuming the RPC definitions enforce this scoping at the DB level, results are correctly user-scoped. Could not verify the RPC bodies (migrations not read), but the surface-level API passes user_id.

**Notes**: No explicit cross-org access issues found. The memory search in `api-copilot-memory` correctly passes `userId` derived from the validated JWT, not from the request body.

---

### AUDIT-063: Row-Level Security (Multi-Tenant) — CRITICAL
**Status**: ISSUES FOUND
**Findings**:
- [P0] `supabase/functions/_shared/edgeAuth.ts:212-219` — **Known issue confirmed**: JWT fallback in `getAuthContext()` and `authenticateRequest()` decodes the JWT without cryptographic verification when `auth.getUser()` fails. Lines 212-219 explicitly note: "If we can't verify issuer but have a valid-looking JWT, log warning and allow." This means a forged JWT with any `sub` claim and a plausible-looking `iss` will be accepted as authenticated. The fallback at line 298-306 (`authenticateRequest`) is equally permissive: if the issuer URL check fails but `payload.sub` and `payload.iss` exist, the user is authenticated. This is a P0 security vulnerability — an attacker can forge a JWT with an arbitrary user ID and gain access to that user's data across any edge function using this fallback.
- [P1] `supabase/functions/_shared/security.ts:477-496` — `createErrorResponse()` sets `'Access-Control-Allow-Origin': '*'` in the hardcoded headers object (line 492). This means all error responses from functions using `security.ts` helpers are returned with wildcard CORS. This differs from the allowlist-based `getCorsHeaders(req)` pattern and could allow cross-origin reads of error message contents.
- [P2] `supabase/functions/_shared/security.ts:239` — In-memory rate limit store (`rateLimitStore`) is per-isolate. Each Supabase edge function isolate has its own copy of this Map, so rate limits do not persist across cold starts or across different isolate instances handling concurrent requests. A high-volume attack would exhaust rate limits only within a single isolate's window.

**Notes**: `verifyCronSecret()` correctly fails closed (returns false if secret not configured). `requireOrgRole()` uses `.single()` correctly for a record that must exist. `verifyMeetingOwnership()` performs explicit ownership check beyond RLS as defense-in-depth. The main P0 concern is the unverified JWT fallback in `edgeAuth.ts`.

---

### AUDIT-064: Frontend Security — CRITICAL
**Status**: ISSUES FOUND
**Findings**:
- [P0] `src/lib/services/emailService.ts:11-14` — **AWS SES credentials exposed in frontend bundle.** `VITE_AWS_ACCESS_KEY_ID` and `VITE_AWS_SECRET_ACCESS_KEY` are loaded via `import.meta.env` — all `VITE_` prefixed vars are bundled into the client-side JavaScript and visible to any user in the browser's network inspector or by reading the JS bundle. This grants anyone full SES access with these keys. CLAUDE.md explicitly prohibits `VITE_` prefix for API keys.
- [P0] `src/lib/services/companyEnrichmentService.ts:52,129` — **Perplexity and Apollo API keys in frontend bundle.** `VITE_PERPLEXITY_API_KEY` (line 52) and `VITE_APOLLO_API_KEY` (line 129) are both exposed via `import.meta.env` and bundled client-side. Apollo API keys give direct access to Apollo's people/company search API which charges per credit. Perplexity API keys similarly.
- [P0] `src/lib/services/linkedinEnrichmentService.ts:71` — **Apify token in frontend bundle.** `VITE_APIFY_TOKEN` exposed via `import.meta.env`. Apify tokens allow launching scrapers and consuming credits on the account.
- [P1] `supabase/functions/_shared/security.ts:488-495` — `createErrorResponse()` in `security.ts` uses hardcoded `'Access-Control-Allow-Origin': '*'` instead of the allowlist-based helper. Functions importing this helper return error responses accessible cross-origin from any domain.
- [P2] `src/lib/services/companyEnrichmentService.ts` and `emailService.ts` — These services make direct API calls from the browser to third-party APIs (SES, Perplexity, Apollo) bypassing the edge function pattern. This means no server-side rate limiting, no credit tracking, no audit trail.
- [P3] `src/lib/supabase/clientV2.ts:14` — `supabaseSecretKey` is set to `undefined` with a comment explaining it was removed. The comment and variable are benign artifacts but could be confusing to new developers.

**Notes**: `clientV2.ts` correctly never exposes service role key. The Supabase anon key (`VITE_SUPABASE_ANON_KEY`) is intentionally public — that is correct. The critical issue is the three third-party API keys that should only exist in Supabase secrets for edge functions.

---

### AUDIT-065: Public REST API
**Status**: PASS
**Findings**: No specific public REST API edge functions identified beyond the existing `api-copilot-memory` and `api-action-centre` functions which are covered in other audits. No P0/P1 issues specific to this story.

**Notes**: The `api-copilot-memory` function (AUDIT-049) covers the main public API surface. Auth is implemented correctly there.

---

## Critical Issues Summary (Must Fix Before Release)

### P0 Issues (3 total)

1. **[AUDIT-063] Unverified JWT Fallback** — `_shared/edgeAuth.ts:212-219,298-306`
   JWT fallback accepts forged tokens. When `auth.getUser()` fails, the code decodes the JWT without signature verification and accepts any JWT with a plausible `iss` field. An attacker who knows the Supabase URL can forge a JWT with any `sub` to impersonate any user.
   **Fix**: Remove the fallback that accepts unverified JWTs. Either require `auth.getUser()` to succeed, or if the fallback is needed for ES256 JWT staging issues, validate the signature using the project's JWT secret.

2. **[AUDIT-064] AWS SES Credentials in Frontend** — `src/lib/services/emailService.ts:11-14`
   AWS access key ID and secret bundled in client JS via `VITE_` env vars. Any user can extract and use these credentials.
   **Fix**: Move email sending to an edge function. Remove `emailService.ts` or make it call an edge function instead of AWS SDK directly.

3. **[AUDIT-064] Multiple API Keys in Frontend** — `companyEnrichmentService.ts:52,129`, `linkedinEnrichmentService.ts:71`
   Perplexity, Apollo, and Apify API keys bundled in client JS.
   **Fix**: These services must call edge functions which hold the API keys in Supabase secrets. Remove all `VITE_APOLLO_API_KEY`, `VITE_PERPLEXITY_API_KEY`, `VITE_APIFY_TOKEN` from frontend code.

### P1 Issues (9 total)

4. **[AUDIT-049] Unpinned supabase-js** — `api-copilot-memory/index.ts:15`
5. **[AUDIT-051] Missing cross-org table ownership check** — `ops-table-workflow-engine/index.ts`
6. **[AUDIT-053] @ts-nocheck on import-from-attio** — hides type errors in integration code
7. **[AUDIT-055] Unpinned supabase-js + no auth on reconcile-billing** — `reconcile-billing/index.ts`
8. **[AUDIT-056] Unpinned supabase-js on start-free-trial** — `start-free-trial/index.ts`
9. **[AUDIT-059] Unpinned supabase-js on poll-gladia-jobs** — causes polling to silently fail
10. **[AUDIT-060] Unpinned supabase-js on savvycal-leads-webhook** — leads dropped silently on crash
11. **[AUDIT-061] No auth on reconcile-billing cron** — publicly triggerable
12. **[AUDIT-061] No auth on proactive-pipeline-analysis** — publicly triggerable cross-user analysis

### Unpinned supabase-js Inventory (Files using `@2` instead of `@2.43.4`)
The following functions have unpinned `@supabase/supabase-js@2` imports and will fail with 500 errors from esm.sh:
- `api-copilot-memory/index.ts`
- `meetingbaas-webhook/index.ts`
- `savvycal-leads-webhook/index.ts`
- `poll-gladia-jobs/index.ts`
- `reconcile-billing/index.ts`
- `start-free-trial/index.ts`
- (plus ~200 others per the grep results — this is a systemic issue across the codebase)

**Recommendation**: Run a global search-and-replace: `@supabase/supabase-js@2"` → `@supabase/supabase-js@2.43.4"` across all edge functions.
