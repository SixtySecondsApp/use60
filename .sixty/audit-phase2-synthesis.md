# Full Codebase Audit — Complete Synthesis Report

**Date**: 2026-03-01
**Scope**: 486 edge functions + 67 shared modules + 65 user-facing features + architecture diagram
**Phases**: Phase 1 (Batches 1-4), Phase 2 (Batches 5-12), Phase 3 (Batches 13-14 + Architecture Review)

---

## Aggregate Results

| Batch | Scope | Files | P0 | P1 | P2 |
|-------|-------|-------|----|----|-----|
| 1-4 — User Features | 65 features (Phase 1) | ~102 | 7 | ~40 | — |
| 5 — CRM Integration | OAuth, webhooks, sync | 59 | 0 | 14 | 45 |
| 6 — Billing/Onboarding | Stripe, credits, accounts | 50 | 21 | 8 | 12 |
| 7 — Public REST API | REST endpoints, proxy | 35 | 2 | 11 | — |
| 8 — Transcription | Recording, voice, MeetingBaaS | 47 | 2 | 17 | 35 |
| 9 — Enrichment/Email | Providers, email infra | 51 | 4 | — | 32+ |
| 10 — Agents | Fleet, autopilot, workers | 51 | 1 | 14 | 8 |
| 11 — Calendar/Slack | Google, Slack ecosystem | 59 | 4 | 18 | 14 |
| 12 — Remaining | Workflows, analytics, misc | 126 | 4 | 15+ | 10+ |
| **13 — Shared Security** | **edgeAuth, CORS, Stripe, OAuth** | **25** | **3** | **5** | **4** |
| **14 — Shared AI/Agents** | **Agent runtime, skills, models** | **42** | **2** | **5** | **6** |
| **TOTAL** | | **~553 files** | **50** | **147+** | **166+** |

### Architecture Diagram: 7 inaccuracies found (3 High, 2 Medium, 2 Low)

---

## CRITICAL FINDING: Shared Auth Infrastructure Is Broken

**This supersedes all per-function auth findings.**

The `_shared/edgeAuth.ts` module — used by hundreds of functions — has fundamental JWT verification flaws:

1. **P0-A: `getAuthContext()` / `authenticateRequest()` accept forged JWTs** (line 212-220) — The fallback path decodes JWT payload without signature verification. Any attacker who crafts a JWT with a valid-looking `sub` + `iss` field is authenticated as that user.

2. **P0-B: `isServiceRoleAuth()` accepts fake service-role tokens** (line 118-128) — Decodes JWT payload without signature verification and accepts any token with `role: "service_role"` claim. Base64-encode a fake payload = service-role access.

**Impact**: Every function that uses `getAuthContext()`, `authenticateRequest()`, or `isServiceRoleAuth()` is effectively unprotected. This means many functions we marked as "PASS" in batches 1-12 actually have auth bypass vulnerabilities through the shared helper.

**This is the #1 fix priority for the entire codebase.**

---

## Additional Wave 3 Findings

### Shared Security (Batch 13)
- `corsHelper.ts`: `*.vercel.app` wildcard allows ANY Vercel deployment to make CORS requests (P1)
- `security.ts`: `createErrorResponse()` hardcodes `Access-Control-Allow-Origin: *` (P1)
- `rateLimiter.ts`: Fails OPEN on all DB errors — rate limiting is decorative when DB is slow (P1)
- `slackAuth.ts`: Signature comparison uses `===` not timing-safe (P0)
- `googleOAuth.ts`: Marks integration revoked on any HTTP 400, not just `invalid_grant` (P1)
- `cors.ts` (deprecated): Still imported by 18 functions — cannot delete yet

### Shared AI/Agents (Batch 14)
- `agentSkillExecutor.ts`: Skill DB content injected into Claude prompts with no sanitization — prompt injection vector (P0)
- `agentRunner.ts`: `creditsUsed` counter never incremented — per-run budget caps are dead code (P1)
- `agentConfig.ts`: `budget_limit_daily_usd` loaded but never enforced (P1)
- `api-utils.ts`: Uses legacy static `corsHeaders` in all responses (P0 per CLAUDE.md rules)
- `responseCache.ts`: Weak 32-bit hash of auth token as cache key — theoretical cross-user data exposure (P1)
- `conversationMemory.ts`: Uses `npm:` specifier instead of `esm.sh` (P1)

### Architecture Diagram Inaccuracies
- **Wrong model**: Diagram says "Claude Haiku 4.5" for copilot — actual is `claude-sonnet-4-6`
- **Wrong transcription**: Shows "AssemblyAI primary" — actual is "Railway WhisperX primary"
- **Credit governance aspirational**: Shows `creditLedger.ts`, `creditBudgetService.ts`, `fleetThrottle.ts`, `credit_ledger` table — none exist as backend; stubs only
- **Skills count**: Shows 30 — actual is 127
- **Response panels**: Shows 48 — actual is 62
- **Security posture**: Implies auth everywhere — 38+ P0 auth bypasses exist

---

## P0 — Must Fix Immediately (38 issues)

### Category 1: Secret Leakage (1 function — DELETE)
- **`debug-auth`** — Leaks first/last 20 chars of `SUPABASE_SERVICE_ROLE_KEY` to unauthenticated callers

### Category 2: Auth Bypass on Sensitive Endpoints (10+ functions)
- **`impersonate-user`** — Uses anon key (public) as auth gate; any user can impersonate anyone
- **`handle-join-request-action`** — admin_user_id from request body, not JWT
- **`generate-magic-link`** — Checks auth header presence but never validates it
- **`execute-migration`** — Checks auth header but never calls `auth.getUser()`
- **`run-migration`** — Zero auth on SQL migration endpoint
- **`agent-initial-scan`** — No auth; caller supplies arbitrary user_id/org_id
- **`google-calendar-sync`**, **`find-available-slots`**, **`create-calendar-event`** — Trust `body.userId` without JWT validation
- **`google-oauth-initiate`** — Open redirect via user-controlled `origin` parameter

### Category 3: Unauthenticated Financial Operations (3 functions)
- **`credit-auto-topup`** — No auth; can trigger Stripe charges for arbitrary orgs
- **`meter-storage`** — No auth; can deduct credits for any org
- **`reconcile-billing`** — No auth; can modify billing state

### Category 4: Unauthenticated Email Sending / Spam Vector (4+ functions)
- **`send-organization-invitation`** — Zero auth
- **`send-rejoin-invitation`** — Zero auth
- **`send-waitlist-invitation`** — Zero auth
- **`send-waitlist-invite`** — Zero auth
- **`send-org-deactivation-email`** — Zero auth
- **`send-org-member-deactivation-email`** — Zero auth

### Category 5: Webhook Spoofing (3 functions)
- **`process-gladia-webhook`** — No signature verification; fake transcriptions injectable
- **`gmail-push-webhook`** — No Google Pub/Sub OIDC verification
- **`apify-run-webhook`** — No webhook secret validation

### Category 6: Open Proxies / SSRF (2 functions)
- **`proxy-fathom-video`** — Unauthenticated open proxy via `?url=` param
- **`freepik-proxy`** — No auth; proxies to Freepik using platform API key
- **`run-apify-actor`** — No auth; triggers Apify runs billed to org's key

### Category 7: Deprecated / Utility Functions Still Deployed (3 functions — DELETE)
- **`clerk-user-sync`** — Deprecated Clerk, no webhook verification, modifies user data
- **`fix-invitation-rls`** — One-time utility, no auth, comment says "delete"
- **`fix-trigger`** — One-time utility, no auth, hardcoded project refs

---

## P1 — Fix This Sprint (97+ issues)

### Systemic: Unauthenticated Cron/Worker Functions (~30 functions)
Functions designed as cron jobs but exposed as HTTP endpoints with no auth:
- All `cc-*` command centre automation (5 functions)
- All `process-*` workers (process-notification-queue, process-reengagement, etc.)
- Agent cron functions (agent-dead-letter-retry, agent-pipeline-snapshot, fleet-health)
- Proactive functions (proactive-pipeline-analysis, proactive-task-analysis, proactive-weekly-scorecard)
- Slack notification senders (send-slack-notification, send-slack-task-notification)
- CRM workers (bullhorn-process-queue, bullhorn-token-refresh, crm-writeback-worker)

**Standard fix**: Add `verifyCronSecret()` or `isServiceRoleAuth()` from `_shared/edgeAuth.ts`

### Systemic: CRUD Endpoints Without Auth (5+ functions)
- `deals/index.ts` — Full CRUD on ALL orgs' deals, no JWT, `select('*')`
- `contacts/index.ts` — Same pattern
- `push-to-hubspot`, `import-from-hubspot`, `populate-hubspot-column` — Service role, no JWT

### Systemic: Test/Debug Functions in Production (9 functions — DELETE)
- `test-hitl`, `test-slack-webhook` (SSRF), `test-fathom-api` (IDOR), `test-auth`, `test-no-auth`, `test-browserless-access`, `test-fathom-token`, `test-email-sequence`
- `run-process-map-test`

### Specific P1s
- `voice-transcribe` — Synchronous 5-minute polling loop (will timeout edge runtime)
- `voice-upload` — No org membership check
- `fetch-gladia-usage` — Wrong column name; always returns zero
- `google-drive` — Token refresh throws instead of refreshing
- `slack-oauth-callback` — No state TTL; indefinite replay window
- `agent-trigger` — `x-internal-call: true` header as auth bypass
- 6+ functions use `.single()` where `maybeSingle()` is needed

---

## P2 — Infrastructure Debt (156+ issues)

### Unpinned SDK (Cross-cutting — ~60+ functions)
`@supabase/supabase-js@2` resolves to broken `@2.95.1` on esm.sh. Affected functions will 500 on cold starts.

**Fix**: Global find-and-replace `@supabase/supabase-js@2"` → `@supabase/supabase-js@2.43.4"` across all edge functions.

### Legacy CORS (Cross-cutting — ~50+ functions)
Using static `corsHeaders` or importing from deprecated `_shared/cors.ts` instead of `getCorsHeaders(req)`.

### IDOR After Auth (~5 functions)
JWT validated but no ownership check on the resource:
- `cc-action-sync`, `cc-undo` — Any authenticated user can act on any org's items
- `ops-table-ai-query`, `ops-table-transform-column`, `ops-table-insights-engine` — Any authenticated user can access any org's tables
- `route-message` — Uses body `user_id` after JWT instead of validated identity

### Overly Permissive S3 URLs
- `get-recording-url`, `get-batch-signed-urls` — 7-day expiry (recommend 1-4 hours)

### Fail-Open Auth
- `meeting-limit-warning-email` — Auth bypassed if `EDGE_FUNCTION_SECRET` not configured
- `slack-snooze-check`, `slack-expire-actions` — If CRON_SECRET not set, auth skipped

### Cost Tracking Gaps
- 11 agent functions make LLM calls without `logAICostEvent` instrumentation
- `google-docs-create` selects `*` from `google_integrations` (includes OAuth tokens in response)

---

## Positive Patterns Found

- `slack-events` — Excellent HMAC-SHA256 signature verification with 5-minute replay prevention
- `slack-slash-commands` — Uses shared `verifySlackSignature`
- Google OAuth — PKCE + 15-minute state TTL
- Slack notifications — `shouldSendNotification` + `recordNotificationSent` for dedup/spam prevention
- Attio functions — Well-structured auth and error handling throughout
- `_shared/stripe.ts` — Correct HMAC webhook verification, timing-safe, replays blocked
- `_shared/use60Signing.ts` — Correct HMAC + timingSafeEqual
- `verifyCronSecret()` — Fail-closed, constant-time comparison
- HubSpot/Attio/Instantly shared clients — Proper retry/backoff

---

## Recommended Fix Sprints (Updated with Wave 3 findings)

### Sprint 0: EMERGENCY — Fix Shared Auth (< 2 hours)
**This is the #1 priority. Everything else is secondary.**
1. **Fix `_shared/edgeAuth.ts`** — Remove JWT fallback that skips signature verification. Use `supabase.auth.getUser()` as the ONLY auth path. This fixes auth for every function that uses the shared helper.
2. **Fix `isServiceRoleAuth()`** — Validate JWT signature before trusting `role` claim.
3. **Delete `debug-auth`** — Actively leaking service role key.
4. **Fix `impersonate-user`** — Replace anon key check with admin role + org membership.
5. **Delete** `clerk-user-sync`, `fix-invitation-rls`, `fix-trigger` (deprecated/dangerous).
6. **Delete** all `test-*` functions from production (9 functions).

### Sprint 1: Per-Function Auth Gaps (2-4 hours)
1. Add `verifyCronSecret()` to ~30 cron/worker functions (cc-*, process-*, agent cron, slack senders)
2. Add JWT validation to `deals`, `contacts` CRUD endpoints
3. Fix `handle-join-request-action` — use JWT identity not body
4. Fix `generate-magic-link` — validate JWT not just check presence
5. Fix `execute-migration` / `run-migration` — add real auth
6. Fix `google-calendar-sync`, `find-available-slots`, `create-calendar-event` — validate JWT, don't trust body.userId
7. Add auth to financial functions: `credit-auto-topup`, `meter-storage`, `reconcile-billing`
8. Fix `agent-trigger` — remove `x-internal-call: true` header bypass

### Sprint 2: Webhook Verification + Proxy Lockdown (1-2 hours)
1. Add signature verification to `process-gladia-webhook`, `gmail-push-webhook`, `apify-run-webhook`
2. Add auth to `proxy-fathom-video`, `freepik-proxy`, `run-apify-actor`
3. Add auth to email-sending functions (or restrict to service role)
4. Fix `google-oauth-initiate` open redirect
5. Fix `slackAuth.ts` — use `timingSafeEqual` for signature comparison
6. Fix `corsHelper.ts` — restrict `*.vercel.app` wildcard to specific deployment URLs

### Sprint 3: SDK Pinning + CORS (1 hour, batch script)
1. Pin all `@supabase/supabase-js@2` → `@2.43.4` (~60 functions + 4 shared modules)
2. Replace legacy `corsHeaders` with `getCorsHeaders(req)` (~50 functions)
3. Fix `security.ts` `createErrorResponse()` — remove hardcoded `Access-Control-Allow-Origin: *`
4. Fix `api-utils.ts` — use `getCorsHeaders(req)` instead of legacy `corsHeaders`
5. Redeploy all affected functions

### Sprint 4: Cost Controls + Budget Enforcement (2 hours)
1. **Fix `agentRunner.ts`** — implement `creditsUsed` counter increment on each LLM call
2. **Wire up `agentConfig.ts` `budget_limit_daily_usd`** — enforce the budget caps that are loaded but ignored
3. Add `logAICostEvent` to 11 agent functions making untracked LLM calls
4. Fix `rateLimiter.ts` — fail CLOSED on DB errors, not open
5. Sanitize skill content in `agentSkillExecutor.ts` before injecting into prompts

### Sprint 5: IDOR + Data Safety (2 hours)
1. Add org ownership checks to cc-* and ops-table-* functions
2. Fix `.single()` → `.maybeSingle()` (6+ locations across shared + functions)
3. Reduce S3 URL expiry from 7 days to 4 hours
4. Fix `responseCache.ts` — use stronger hash for cache keys (not 32-bit)
5. Fix `materializationService.ts` — add `org_id` filter to contact dedup query
6. Fix fail-open auth patterns (`meeting-limit-warning-email`, `slack-snooze-check`, `slack-expire-actions`)

### Sprint 6: Architecture Diagram Corrections (1 hour)
1. Fix model reference: "Claude Haiku 4.5" → "Claude Sonnet 4.6"
2. Fix transcription provider: "AssemblyAI" → "Railway WhisperX"
3. Mark Credit Governance V2 as "planned/aspirational" (not deployed)
4. Update skills count: 30 → 127
5. Update response panels count: 48 → 62
6. Add security notes reflecting actual auth posture

---

## Coverage Summary

| Phase | Scope | Files | Findings |
|-------|-------|-------|----------|
| Phase 1 (Batches 1-4) | 65 user-facing features | ~102 | 7 P0, ~40 P1 |
| Phase 2 (Batches 5-12) | Remaining edge functions | ~380 | 38 P0, 97+ P1 |
| Phase 3 (Batches 13-14) | 67 shared modules | 67 | 5 P0, 10 P1 |
| Architecture Review | Diagram accuracy | 1 | 7 inaccuracies |
| **TOTAL** | **Full codebase** | **~553** | **50 P0, 147+ P1, 166+ P2** |

**Complete audit finished.** All 486 edge functions, 67 shared modules, 65 user-facing features, and the architecture diagram have been reviewed.

---

**Findings files**:
- `.sixty/audit-batch-1-findings.md` through `audit-batch-4-findings.md` (Phase 1)
- `.sixty/audit-batch-5-findings.md` — CRM Integration
- `.sixty/audit-batch-6-findings.md` — Billing/Onboarding
- `.sixty/audit-batch-7-findings.md` — Public REST API
- `.sixty/audit-batch-8-findings.md` — Transcription
- `.sixty/audit-batch-9-findings.md` — Enrichment/Email
- `.sixty/audit-batch-10-findings.md` — Agents
- `.sixty/audit-batch-11-findings.md` — Calendar/Slack
- `.sixty/audit-batch-12-findings.md` — Remaining
- `.sixty/audit-batch-13-shared-security.md` — Shared Security Modules
- `.sixty/audit-batch-14-shared-ai-utils.md` — Shared AI/Agent Modules
- `.sixty/architecture-diagram-review.md` — Architecture Diagram Review
- `.sixty/audit-phase2-synthesis.md` — This complete synthesis
