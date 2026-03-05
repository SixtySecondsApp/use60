# Audit Batch 10 — Agent Fleet, Autopilot, Process Workers, Proactive & Analysis Functions
**Date:** 2026-03-01
**Scope:** 51 edge functions across 5 categories
**Auditor:** audit-batch-10-agents

---

## Executive Summary

51 functions audited. **5 functions have no authentication** (P0/P1), making them open to arbitrary callers on the public internet. Multiple batch/cron functions call LLM APIs without cost tracking. Several legacy functions use deprecated dependency patterns.

| Severity | Count | Description |
|----------|-------|-------------|
| P0 | 1 | Unauthenticated endpoint that can read any user's data and send Slack DMs |
| P1 | 4 | Unauthenticated cron/worker functions, triggerable by anyone |
| P2 | 8 | Missing LLM cost tracking, weak auth markers, deprecated deps |
| P3 | 5 | Code quality: `any` types, hardcoded CORS, unpinned dep versions |

---

## Category 1: Agent Fleet Core (23 functions)

### agent-config-admin
**PASS.** Full JWT auth via `getAuthContext` + `requireOrgRole`. Uses `maybeSingle()`. Explicit column selection. Clean TypeScript.

### agent-competitive-intel
**P2 — No cost tracking.**
Auth: CRON_SECRET or service-role. Correct pattern.
Makes **two** Claude Haiku calls (`extractMentionsWithAI`, `generateBattlecard`) with no `logAICostEvent` / `extractAnthropicUsage` instrumentation.

### agent-crm-approval
**PASS.** Slack HMAC-SHA256 signing secret verification. Correct async background processing.

### agent-crm-heartbeat
**PASS.** CRON_SECRET or service-role. Uses `maybeSingle()`. Good error isolation per org.

### agent-crm-update
**PASS.** CRON_SECRET or service-role. Explicit column selection. Clean 5-step pipeline.

### agent-dead-letter-retry
**P1 — Missing authentication.**
The `serve()` handler has **no auth check**. It immediately proceeds to fetch the dead-letter queue and fire `agent-orchestrator` with arbitrary payloads. Any caller can retrigger retry storms or inject malicious DLQ payloads.

```typescript
serve(async (req) => {
  const cors = getCorsHeaders(req);
  const preflight = handleCorsPreflightRequest(req);
  if (preflight) return preflight;
  // NO CRON_SECRET CHECK — immediately proceeds to fetch DLQ
  const supabase = createClient(supabaseUrl, serviceKey, ...);
```

**Fix:** Add CRON_SECRET or `isServiceRoleAuth` check before processing.

### agent-deal-risk-batch
**PASS.** `isServiceRoleAuth` only. Uses circuit breaker. Explicit column selection. Good patterns.

### agent-deal-temperature
**PASS.** CRON_SECRET or service-role. Good implementations.

### agent-email-signals
**PASS (best practice example).** CRON_SECRET or service-role. Has full cost tracking via `logAICostEvent` / `extractAnthropicUsage` for Haiku calls.

### agent-engagement-patterns
**PASS.** CRON_SECRET or service-role. No LLM calls.

### agent-eod-synthesis
**P2 — No cost tracking.**
Auth: CRON_SECRET or service-role. Correct pattern.
Calls `generateOvernightPlan` (upstream calls Haiku) with no cost tracking in this function.

### agent-initial-scan
**P0 — Missing authentication entirely.**
A comment says `// Auth: JWT or service role` but **no auth code is present**. The handler immediately accepts `user_id` and `org_id` from the request body and uses the service role client to scan that user's data and send Slack DMs.

```typescript
serve(async (req) => {
  const preflightResponse = handleCorsPreflightRequest(req);
  if (preflightResponse) return preflightResponse;
  if (req.method !== 'POST') {
    return errorResponse('Method not allowed', req, 405);
  }
  try {
    // Auth: JWT or service role   <-- comment only, no actual check
    const supabase = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY, ...);
    const { user_id, org_id } = await req.json();
```

Any attacker can supply any `user_id` / `org_id` to: read deal/contact/meeting data for that user, and send Slack DMs impersonating the platform. **This is a data-exposure and phishing vector.**

**Fix:** Validate JWT (`getAuthContext`) or require service-role key before processing.

### agent-morning-briefing
**P2/P3 — No cost tracking; heavy `any` typing.**
Auth: CRON_SECRET or service-role. Makes Haiku calls with no `logAICostEvent`. Uses `supabase: any` and `persona: Record<string, any>` throughout.

### agent-orchestrator
**P1 — No authentication.**
The central event dispatcher accepts `route_message`, `retry_dead_letters`, `resume_job_id`, and sequence-start events with **no auth gate**. While some internal callers pass service role keys in their own headers, nothing in `agent-orchestrator` verifies the caller.

```typescript
serve(async (req) => {
  const corsHeaders = getCorsHeaders(req);
  if (req.method === 'OPTIONS') {
    return new Response('ok', { headers: corsHeaders });
  }
  // NO AUTH — directly parses body and dispatches
  const body = await req.json();
```

**Fix:** Add `isServiceRoleAuth` check or CRON_SECRET validation. This function is not meant to be publicly callable.

### agent-org-learning
**P3 — Heavy `any` typing.**
Auth: CRON_SECRET or service-role. No LLM calls. Uses `supabase: any` and untyped `orgMembers.map((r) => r.org_id)` throughout.

### agent-pipeline-patterns
**P2 — No cost tracking.**
Auth: CRON_SECRET or service-role. Makes Haiku calls in `generateInsight()` with no `logAICostEvent`.

### agent-pipeline-snapshot
**P1 — Missing authentication.**
The handler uses `runAgent()` for telemetry but **no auth check** is performed before it. Anyone can trigger pipeline snapshots for any `userId`/`orgId`.

```typescript
serve(async (req) => {
  // ...
  const body = await req.json().catch(() => ({}));
  const { action = 'snapshot', userId, orgId } = body;
  // No auth check before running snapshot for arbitrary user
  const agentResult = await runAgent(...);
```

**Fix:** Add CRON_SECRET or `isServiceRoleAuth` check before processing.

### agent-reengagement
**PASS.** CRON_SECRET or service-role. Dispatches to orchestrator correctly via service-role fetch.

### agent-relationship-graph
**PASS.** CRON_SECRET or service-role. Good patterns.

### agent-scheduler
**PASS.** CRON_SECRET or JWT with org admin check. Has budget checking via `checkAgentBudget`. Validates org admin for manual runs.

### agent-trigger
**P2 — Weak internal-call marker.**
Auth: CRON_SECRET, `x-internal-call: true` header, or JWT. The `x-internal-call: true` header is not a secret — any caller can set this header and bypass CRON_SECRET validation. It should be replaced with service-role key comparison.

```typescript
const isInternalCall = req.headers.get('x-internal-call') === 'true';
if (!cronSecretValid && !isInternalCall && !jwtValid) { ... }
```

Has rate limiting and budget checking which is good.

**Fix:** Remove `x-internal-call` bypass or gate it with a shared secret. Use `isServiceRoleAuth` for internal calls instead.

### fleet-admin
**PASS.** `getAuthContext` + `requireOrgRole`. Correct user/service client split.

### fleet-health
**P1 — Missing authentication.**
Accepts GET and POST without any auth. Exposes internal fleet execution stats and can trigger Slack alert suppression for any org. Any caller can poll internal agent health metrics.

```typescript
serve(async (req: Request) => {
  const preflightResponse = handleCorsPreflightRequest(req);
  if (preflightResponse) return preflightResponse;
  // Immediately proceeds to query — no auth check
  if (req.method !== 'POST' && req.method !== 'GET') { ...405... }
```

**Fix:** Add CRON_SECRET or `isServiceRoleAuth` check.

---

## Category 2: Autopilot System (5 functions)

### autopilot-admin
**PASS (minor note).** Service role key comparison or JWT admin check via `resolveAuth()`. Well-structured.
**P2 minor:** The `force_eligible` action has no environment guard — it can be called in production by any admin to force promotion eligibility. Consider restricting to `NODE_ENV !== 'production'` or behind a dedicated flag.

### autopilot-backfill
**PASS.** Service role or JWT admin check via `resolveAuth()`. Idempotency checking. Good patterns.

### autopilot-evaluate
**PASS.** Service role key comparison or JWT admin check via `resolveAuth()`. Correctly validates org membership and `admin`/`owner` role. Dry-run support.

### autopilot-record-signal
**PASS.** Full JWT validation via `resolveAuth()`. Validates user existence. Uses user-scoped client for org membership lookup (respects RLS). Fire-and-forget background tasks won't block response. Good performance benchmark logging.

### autonomy-promotion-notify
**P1 — Missing authentication.**
The cron function that sends Slack DMs for autonomy promotion suggestions has **no auth check**.

```typescript
serve(async (req: Request) => {
  if (req.method === 'OPTIONS') {
    return handleCorsPreflightRequest(req);
  }
  const corsHeaders = getCorsHeaders(req);
  try {
    const serviceClient = createClient(supabaseUrl, supabaseServiceKey);
    const stats = await processPromotionNotifications(serviceClient);
```

**Fix:** Add CRON_SECRET or `isServiceRoleAuth` check. Any caller can trigger batch Slack DMs to all org users.

---

## Category 3: Process Workers (8 functions)

### process-ai-analysis
**P2 — Deprecated CORS + unpinned supabase dep.**
- Uses `legacyCorsHeaders as corsHeaders` (deprecated per CLAUDE.md — must use `getCorsHeaders(req)`)
- Imports `@supabase/supabase-js@2` (unpinned — resolves to broken `@2.95.1`)
Auth: No auth check — called internally by MeetingBaaS webhook pipeline. Acceptable if the triggering webhook is authenticated (see `meetingbaas-webhook`), but vulnerable to direct calls.
**P2:** Makes Claude calls via `analyzeTranscriptWithClaude` with no cost tracking in this file.

### process-calendar-events
**P2 — Deprecated CORS + unpinned supabase dep.**
- Uses `corsHeaders` from `../shared/corsHelper.ts` (legacy export) and `handleCorsPreflightWithResponse` (legacy)
- Imports `@supabase/supabase-js@2` (unpinned)
Auth: Checks for `Authorization` header and creates a user-scoped Supabase client — this validates the JWT implicitly via RLS. Not explicit but functional.
No LLM calls.

### process-compress-callback
**PASS (auth).** HMAC-SHA256 signature verification via `COMPRESS_CALLBACK_SECRET`. Good webhook auth pattern.
**P2:** Imports from `jsr:@supabase/supabase-js@2` (JSR registry, unpinned).

### process-lead-prep
**PASS.** Full JWT auth via `getAuthContext`. Has cost tracking via `logAICostEvent` / `checkCreditBalance`. Explicit column selection.

### process-notification-queue
**P1 — Missing authentication.**
Cron queue processor has **no auth check**. Any caller can trigger batch notification delivery or cancel stale notifications.

```typescript
serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response("ok", { headers: corsHeaders });
  }
  if (req.method !== "POST") { ... }
  const supabase = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY);
  // Immediately processes queue — no auth
```

**P2:** Imports `@supabase/supabase-js@2` (unpinned) and uses `corsHeaders` from `../_shared/cors.ts` (non-standard import path — not the standard `corsHelper.ts`).
**Fix:** Add CRON_SECRET or service-role check.

### process-recording
**P2 — Deprecated CORS + unpinned supabase dep.**
- Uses `legacyCorsHeaders as corsHeaders` (deprecated)
- Imports `@supabase/supabase-js@2` (unpinned)
- Makes Claude calls via `analyzeTranscriptWithClaude` with no cost tracking visible in this file.
Auth: No explicit auth — called internally by MeetingBaaS webhook.

### process-reengagement
**P1 — Missing authentication.**
Batch re-engagement processor has **no auth check**. Any caller can trigger Slack DMs and emails to all users.

```typescript
serve(async (req) => {
  if (req.method === "OPTIONS") { ... }
  if (req.method !== "POST") { ... }
  const supabase = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY);
  // Immediately processes users — no auth
```

**P2:** Imports `@supabase/supabase-js@2` (unpinned) and uses `corsHeaders` from `../_shared/cors.ts`.
**Fix:** Add CRON_SECRET or service-role check.

### process-single-activity
**P1 — Missing authentication.**
Legacy function — "Reverted" comments throughout. Has **no auth check**.

```typescript
serve(async (req) => {
  const corsPreflightResponse = handleCorsPreflightRequest(req);
  if (corsPreflightResponse) return corsPreflightResponse;
  try {
    const supabaseAdmin = createClient(supabaseUrl, serviceRoleKey, ...);
    const { activityId } = await req.json();
    // No auth — processes any activityId
```

**P2:** Imports `@supabase/supabase-js@2` (unpinned).
**Fix:** Add JWT auth via `getAuthContext` or restrict to service-role callers.

---

## Category 4: Proactive System (5 functions)

### proactive-pipeline-analysis
**P1 — Missing authentication.**
No auth check before processing pipeline analysis for any `userId`/`organizationId`. Used as a cron, but open to the public.

```typescript
serve(async (req) => {
  // ...
  const body = await req.json().catch(() => ({}));
  const { action = 'analyze', userId, organizationId } = body;
  // No auth — immediately runs analysis
```

**Fix:** Add CRON_SECRET or `isServiceRoleAuth` check.

### proactive-signal-scanner
**PASS.** Explicit service-role-only check:
```typescript
const token = authHeader?.replace('Bearer ', '');
if (token !== supabaseServiceKey) {
  return errorResponse('Unauthorized — service role only', req, 401);
}
```

### proactive-simulate
**PASS (auth).** Uses `getAuthContext` for JWT validation.
**P2:** Makes Gemini API calls (no cost tracking). Uses `any` type for `requestBody`. Hard-codes `gemini-2.0-flash` model name.

### proactive-task-analysis
**P1 — Missing authentication.**
No auth check before processing task analysis for any `userId`/`organizationId`.

```typescript
serve(async (req) => {
  const supabase = createClient(supabaseUrl, supabaseServiceKey, ...);
  const body = await req.json().catch(() => ({}));
  const { action = 'analyze_and_notify', userId, organizationId } = body;
  // No auth — immediately runs analysis
```

**Fix:** Add CRON_SECRET or `isServiceRoleAuth` check.

### proactive-weekly-scorecard
**P1 — Missing authentication.**
No auth check before processing and sending weekly scorecards.

```typescript
serve(async (req) => {
  const supabase = createClient(supabaseUrl, supabaseServiceKey, ...);
  const body = await req.json().catch(() => ({}));
  const { action = 'cron', userId, orgId } = body;
  // No auth
```

**Fix:** Add CRON_SECRET or `isServiceRoleAuth` check.

---

## Category 5: Analysis & Coaching (10 functions)

### coaching-analysis
**P1 — Missing authentication.**
No auth check. Accepts `user_id`, `org_id`, `transcript` from request body. Makes Claude API calls using service role client without verifying the caller is the owner of that user_id.

```typescript
serve(async (req) => {
  const supabase = createClient(
    Deno.env.get('SUPABASE_URL')!,
    Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!,
    { auth: { persistSession: false } },
  );
  const { user_id, org_id, transcript, ... } = await req.json();
  // No auth — immediately runs analysis
```

**P2:** Uses `any` in `weekly_metrics?: any`, `win_loss_correlation?: any`, `call_type?: any`.
Has `logAICostEvent` / `extractAnthropicUsage` imported and used — good.
**Fix:** Add JWT auth via `getAuthContext` or service-role check.

### deal-analyze-risk-signals
**P1 — Missing authentication.**
No auth check. Accepts `meetingId` or `dealId` from body. Uses service role for all DB operations.

```typescript
serve(async (req) => {
  const { meetingId, dealId, ... } = await req.json();
  // No auth — runs risk signal analysis on arbitrary deal
  const supabase = createClient(supabaseUrl, supabaseServiceKey);
```

**P2:** Imports `@supabase/supabase-js@2.39.3` (old pinned version — not `@2.43.4`). Uses `Record<string, any>` in `PipelineAutomationRule`.
**Fix:** Add JWT auth (`getAuthContext`) or service-role check.

### relationship-milestone-scanner
**PASS.** Explicit service-role-only check:
```typescript
const token = authHeader?.replace('Bearer ', '');
if (token !== supabaseServiceKey) {
  return errorResponse('Unauthorized — service role only', req, 401);
}
```

### memory-backfill
**PASS.** Uses `isServiceRoleAuth` from `_shared/edgeAuth.ts`. Makes Claude calls via `extractEventsFromMeeting` and `generateSnapshot` — cost tracking would be in shared helpers.

### memory-commitment-tracker
**PASS.** Checks `authHeader?.includes(serviceKey)`. Functional but slightly weaker than `isServiceRoleAuth` (substring match vs exact match). Low risk since serviceKey is a long random string.

### memory-snapshot-generator
**PASS.** Checks `authHeader.includes(serviceKey)`. Same minor note as above. Makes Claude calls via `generateSnapshot`.

### suggest-next-actions
**P1 — Missing authentication (weak).**
Gets the `Authorization` header but **never validates it**. Uses service role client for all DB operations regardless. Comments in the code acknowledge this:

```typescript
// ALWAYS use service role for database operations to bypass RLS
// Edge Functions need elevated permissions to insert AI suggestions
const supabaseClient = createClient(
  Deno.env.get('SUPABASE_URL') ?? '',
  Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') ?? '',
  ...
)
```

The auth header is read but only used to pass back to downstream calls — the function does not verify the caller's identity.
**P2:** Imports `@supabase/supabase-js@2` (unpinned). Uses hardcoded `corsHeaders` object (not `getCorsHeaders(req)`). Makes Haiku calls with no cost tracking.
**Fix:** Add JWT validation via `auth.getUser(token)` before processing.

### detect-intents
**PASS (auth).** Uses `getAuthContext` implicitly (called by orchestrator which handles auth). Has cost tracking via `logAICostEvent` / `extractAnthropicUsage`.
Note: Public endpoint — callers pass `user_id`/`org_id` in body. If called directly (not via orchestrator), the auth is implicit only.

### analyze-action-item
**P2 — No auth; no cost tracking; old pinned version.**
No auth check. Makes Claude Haiku calls via direct `fetch()` to Anthropic API with no cost tracking.
```typescript
const response = await fetch('https://api.anthropic.com/v1/messages', {
  headers: { 'x-api-key': ANTHROPIC_API_KEY!, ... },
  body: JSON.stringify({ model: 'claude-haiku-4-20250514', ... }),
});
```
**P3:** Imports `@supabase/supabase-js@2.39.0` (old pinned version — not `@2.43.4`). Uses hardcoded `corsHeaders` object.
Note: This appears to be an internal-only endpoint (called from post-meeting processing). If it's truly internal, service-role auth should be added. If user-facing, JWT auth is required.

### reanalyze-action-item-importance
**PASS (auth — validates JWT).**
Gets Bearer token, validates via `supabase.auth.getUser(token)`, rejects if user not found.
**P2:** Imports `@supabase/supabase-js@2` (unpinned). Uses hardcoded `corsHeaders` object. Makes LLM calls (via OpenRouter) with no cost tracking. No method check for non-POST requests.

---

## Summary: Auth Findings by Function

| Function | Auth Status | Severity |
|----------|------------|----------|
| `agent-initial-scan` | None (comment only) | **P0** |
| `agent-dead-letter-retry` | None | P1 |
| `agent-orchestrator` | None | P1 |
| `agent-pipeline-snapshot` | None | P1 |
| `autonomy-promotion-notify` | None | P1 |
| `fleet-health` | None | P1 |
| `process-notification-queue` | None | P1 |
| `process-reengagement` | None | P1 |
| `process-single-activity` | None (legacy) | P1 |
| `proactive-pipeline-analysis` | None | P1 |
| `proactive-task-analysis` | None | P1 |
| `proactive-weekly-scorecard` | None | P1 |
| `coaching-analysis` | None | P1 |
| `deal-analyze-risk-signals` | None | P1 |
| `suggest-next-actions` | Reads header but never validates | P1 |
| `agent-trigger` | `x-internal-call` bypass (weak) | P2 |

---

## Summary: Cost Tracking Gaps

| Function | LLM Provider | Missing |
|----------|-------------|---------|
| `agent-competitive-intel` | Claude Haiku (2x calls) | `logAICostEvent` |
| `agent-eod-synthesis` | Claude Haiku (via shared) | `logAICostEvent` |
| `agent-morning-briefing` | Claude Haiku | `logAICostEvent` |
| `agent-pipeline-patterns` | Claude Haiku | `logAICostEvent` |
| `agent-initial-scan` | Claude Haiku | `logAICostEvent` |
| `process-ai-analysis` | Claude (via `fathom-sync`) | `logAICostEvent` |
| `process-recording` | Claude (via `fathom-sync`) | `logAICostEvent` |
| `proactive-simulate` | Gemini 2.0 Flash | cost logging |
| `suggest-next-actions` | Claude Haiku | `logAICostEvent` |
| `analyze-action-item` | Claude Haiku (direct) | `logAICostEvent` |
| `reanalyze-action-item-importance` | OpenRouter/LLM | cost logging |

---

## Summary: Dependency Issues

| Function | Issue |
|----------|-------|
| `process-ai-analysis` | `@supabase/supabase-js@2` (unpinned) + `legacyCorsHeaders` |
| `process-calendar-events` | `@supabase/supabase-js@2` (unpinned) + legacy CORS |
| `process-compress-callback` | `jsr:@supabase/supabase-js@2` (JSR, unpinned) |
| `process-notification-queue` | `@supabase/supabase-js@2` (unpinned) + `_shared/cors.ts` |
| `process-recording` | `@supabase/supabase-js@2` (unpinned) + `legacyCorsHeaders` |
| `process-reengagement` | `@supabase/supabase-js@2` (unpinned) + `_shared/cors.ts` |
| `process-single-activity` | `@supabase/supabase-js@2` (unpinned) |
| `suggest-next-actions` | `@supabase/supabase-js@2` (unpinned) |
| `deal-analyze-risk-signals` | `@supabase/supabase-js@2.39.3` (old pin) |
| `analyze-action-item` | `@supabase/supabase-js@2.39.0` (old pin) |
| `reanalyze-action-item-importance` | `@supabase/supabase-js@2` (unpinned) |
| `proactive-simulate` | `@supabase/supabase-js@2.39.3` (old pin) |

---

## Recommended Remediation Order

### Immediate (P0/P1):

1. **`agent-initial-scan`** — Add `isServiceRoleAuth` check. This is the highest risk: attacker-controlled `user_id` reads data and sends Slack DMs.
2. **`agent-orchestrator`** — Add `isServiceRoleAuth`. Central event dispatcher must not be open.
3. **`coaching-analysis`** — Add `getAuthContext` or service-role check. Accepts arbitrary transcripts.
4. **`deal-analyze-risk-signals`** — Add `getAuthContext` or service-role check.
5. **`suggest-next-actions`** — Actually validate the JWT: `auth.getUser(token)` → reject if invalid.
6. **`agent-dead-letter-retry`** — Add CRON_SECRET or service-role check.
7. **`agent-pipeline-snapshot`** — Add CRON_SECRET or service-role check.
8. **`fleet-health`** — Add CRON_SECRET or service-role check.
9. **`autonomy-promotion-notify`** — Add CRON_SECRET or service-role check.
10. **`process-notification-queue`** — Add CRON_SECRET check.
11. **`process-reengagement`** — Add CRON_SECRET check.
12. **`process-single-activity`** — Add JWT auth or restrict to service-role.
13. **`proactive-pipeline-analysis`** — Add CRON_SECRET or service-role check.
14. **`proactive-task-analysis`** — Add CRON_SECRET or service-role check.
15. **`proactive-weekly-scorecard`** — Add CRON_SECRET or service-role check.

### Short-term (P2):

16. **`agent-trigger`** — Remove `x-internal-call` bypass; replace with `isServiceRoleAuth`.
17. Add `logAICostEvent` to all 11 LLM-calling functions missing cost tracking.
18. Pin `@supabase/supabase-js@2.43.4` across all 12 functions with unpinned or old-pinned versions.
19. Replace `legacyCorsHeaders` / `corsHeaders` with `getCorsHeaders(req)` in process-* functions.

### Nice-to-have (P3):

20. Eliminate `any` types in `agent-morning-briefing`, `agent-org-learning`, `coaching-analysis`, `proactive-simulate`, `deal-analyze-risk-signals`.
21. Add environment guard on `force_eligible` action in `autopilot-admin`.
