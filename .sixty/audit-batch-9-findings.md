# Audit Batch 9 — Enrichment Pipeline & Email Infrastructure

**Audited:** 2026-03-01
**Scope:** 50 edge functions across enrichment providers, email infrastructure, transactional emails, email sync, and research/content functions.

---

## Summary Table

| ID | Function | Severity | Issues |
|----|----------|----------|--------|
| B9-01 | `apollo-credits` | P2 | Legacy `corsHeaders` (hardcoded), not `getCorsHeaders(req)` |
| B9-02 | `apollo-enrich` | P2 | Legacy `corsHeaders` (hardcoded), not `getCorsHeaders(req)` |
| B9-03 | `apollo-org-enrich` | P2 | Legacy `corsHeaders` (hardcoded), not `getCorsHeaders(req)` |
| B9-04 | `apollo-search` | P2 | Legacy `corsHeaders` (hardcoded), not `getCorsHeaders(req)` |
| B9-05 | `enrich-crm-record` | **P0** | Unpinned `@supabase/supabase-js@2` + legacy `corsHeaders` from `_shared/cors.ts` (broken import) |
| B9-06 | `auto-verify-email` | P1 | Unpinned `@supabase/supabase-js@2.39.0` — older pinned version, not `2.43.4` |
| B9-07 | `auto-re-enrich` | P1 | Unpinned `@supabase/supabase-js@2` — will break on esm.sh |
| B9-08 | `run-reoon-verification` | **P0** | No JWT auth — uses service role directly, no user validation |
| B9-09 | `run-reoon-verification` | P2 | Unpinned `@supabase/supabase-js@2` + legacy `corsHeaders` |
| B9-10 | `email-send-as-rep` | P1 | Unpinned `@supabase/supabase-js@2` |
| B9-11 | `gmail-push-webhook` | **P0** | No webhook signature verification — any caller can trigger email_received events |
| B9-12 | `categorize-email` | P2 | Pinned to `@2.39.3` not `2.43.4` |
| B9-13 | `analyze-email` | P2 | Pinned to `@2.39.3` not `2.43.4`, legacy `corsHeaders` (hardcoded) |
| B9-14 | `gmail-apply-labels` | P1 | Unpinned `@supabase/supabase-js@2` |
| B9-15 | `encharge-email` | P1 | Unpinned `@supabase/supabase-js@2` + legacy `corsHeaders` (hardcoded) |
| B9-16 | `first-meeting-synced-email` | P1 | Unpinned `@supabase/supabase-js@2` + legacy `corsHeaders` (hardcoded) |
| B9-17 | `org-approval-email` | P1 | Unpinned `@supabase/supabase-js@2` + legacy `corsHeaders` (hardcoded) |
| B9-18 | `permission-to-close-email` | P1 | Unpinned `@supabase/supabase-js@2` + legacy `corsHeaders` (hardcoded) |
| B9-19 | `send-feedback-requests` | P1 | Unpinned `@supabase/supabase-js@2` + legacy `corsHeaders` from `_shared/cors.ts` |
| B9-20 | `send-recording-notification` | P1 | Unpinned `@supabase/supabase-js@2` + legacy `corsHeaders` from `_shared/corsHelper.ts` named export |
| B9-21 | `send-org-deactivation-email` | **P0** | No auth check at all — any caller can trigger bulk org deactivation emails |
| B9-22 | `send-org-member-deactivation-email` | **P0** | No auth check at all — any caller can trigger bulk member deactivation emails; unpinned `@2` |
| B9-23 | `scheduled-email-sync` | P1 | Unpinned `@supabase/supabase-js@2` |
| B9-24 | `scheduled-encharge-emails` | P1 | Unpinned `@supabase/supabase-js@2` + no auth check (relies on cron-only invocation) |
| B9-25 | `scheduled-google-context-sync` | P1 | Unpinned `@supabase/supabase-js@2` |
| B9-26 | `research-comparison` | P2 | Legacy `corsHeaders` (hardcoded) |
| B9-27 | `gemini-research` | P2 | Legacy `corsHeaders` (hardcoded) |
| B9-28 | `ai-ark-similarity` | P2 | `INSUFFICIENT_CREDITS` returns 400, should be 402 (consistent with other functions) |
| B9-29 | `apollo-reveal` | P2 | Credits deducted even if `apollo_ids.length > 10` (sliced silently to 10) — user charged for 10 reveals regardless |
| B9-30 | `enrich-cascade` | P1 | No credit check before calling both AI Ark and Apollo — could double-spend credits if balance check is stale |
| B9-31 | `send-scheduled-emails` | P2 | No auth check — any caller with network access can trigger scheduled email processing |
| B9-32 | `demo-enrichment-comparison` | P2 | Auth is optional (`Demo mode`) — unauthenticated callers can consume AI resources; no rate limiting |

---

## Detailed Findings

### B9-01, B9-02, B9-03, B9-04 — Legacy `corsHeaders` in Apollo functions

**Severity:** P2
**Functions:** `apollo-credits`, `apollo-enrich`, `apollo-org-enrich`, `apollo-search`

All four functions use a hardcoded `corsHeaders` object at the top of the file:

```typescript
const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
}
```

**Rule violation:** `CLAUDE.md` explicitly prohibits legacy `corsHeaders` — use `getCorsHeaders(req)` from `_shared/corsHelper.ts`.

**Fix:** Import `getCorsHeaders, handleCorsPreflightRequest` from `_shared/corsHelper.ts` and use them throughout.

---

### B9-05 — `enrich-crm-record`: Unpinned supabase client + broken CORS import

**Severity:** P0
**File:** `supabase/functions/enrich-crm-record/index.ts:2`

```typescript
import { createClient, SupabaseClient } from "https://esm.sh/@supabase/supabase-js@2";
import { corsHeaders } from "../_shared/cors.ts";
```

Two critical issues:
1. `@supabase/supabase-js@2` is unpinned — esm.sh resolves `@2` to `@2.95.1` which returns HTTP 500. The function will fail to import and crash on cold start.
2. Imports `corsHeaders` from `_shared/cors.ts` which is the deprecated shared module. This is legacy pattern per `CLAUDE.md`.

**Fix:** Pin to `@2.43.4` and switch to `getCorsHeaders(req)` from `_shared/corsHelper.ts`.

---

### B9-06 — `auto-verify-email`: Wrong version pin

**Severity:** P1
**File:** `supabase/functions/auto-verify-email/index.ts:2`

```typescript
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2.39.0'
```

Pinned to `2.39.0` — not the required `2.43.4`. May have missing features or bugs fixed in later versions. Should be updated to the project standard.

---

### B9-07 — `auto-re-enrich`: Unpinned supabase client

**Severity:** P1
**File:** `supabase/functions/auto-re-enrich/index.ts:15`

```typescript
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';
```

Unpinned `@2` will resolve to broken `@2.95.1` on esm.sh. Also has no auth check — the function accepts any POST request and runs with service role. This is a cron-only function but lacks CRON_SECRET or service role validation.

---

### B9-08 — `run-reoon-verification`: No JWT auth (P0)

**Severity:** P0
**File:** `supabase/functions/run-reoon-verification/index.ts:24-35`

```typescript
serve(async (req: Request) => {
  if (req.method === 'OPTIONS') {
    return new Response('ok', { headers: corsHeaders })
  }
  try {
    const supabase = createClient(supabaseUrl, serviceRoleKey)
    const { table_id, column_id, row_ids } = await req.json()
    ...
```

**Critical issue:** The function skips all JWT validation entirely. It creates a service-role Supabase client and immediately reads the request body without verifying the caller's identity. Any unauthenticated actor with network access can trigger email verification for any table/column/rows by calling this function — they only need to know the function URL.

The function then looks up the org's Reoon API key (using the table's `organization_id` from `dynamic_tables`) and uses it without any org membership check.

**Fix:** Add JWT validation using `userClient.auth.getUser()` and verify the user has access to the requested table via `organization_id` check, before proceeding with enrichment.

---

### B9-09 — `run-reoon-verification`: Unpinned supabase + legacy CORS

**Severity:** P2
**File:** `supabase/functions/run-reoon-verification/index.ts:3-19`

```typescript
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2'
const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  ...
}
```

Both unpinned dependency AND legacy `corsHeaders` pattern. Compound issue on top of the auth bypass in B9-08.

---

### B9-11 — `gmail-push-webhook`: No webhook signature verification (P0)

**Severity:** P0
**File:** `supabase/functions/gmail-push-webhook/index.ts`

The webhook is public (`verify_jwt = false`) and handles Google Pub/Sub push notifications. However, it performs **no validation that the request actually came from Google Pub/Sub**.

```typescript
// Default: Handle Pub/Sub push notification
const body = await req.json() as PubSubMessage;
// ... immediately processes body.message.data
```

Any actor can craft a fake Pub/Sub message with a valid-looking base64 payload containing any `emailAddress` and `historyId`. This would:
1. Look up the user for that email address
2. Fire an `email_received` event to `agent-orchestrator` with an attacker-controlled `history_id`

Google Pub/Sub supports **OIDC token verification** for push subscriptions. The incoming request should include an `Authorization: Bearer <google-signed-jwt>` header that can be verified against Google's public keys.

**Fix:** Verify the Google Pub/Sub OIDC token on incoming webhook requests. At minimum, validate that the `subscription` field in the body matches the expected `GMAIL_PUBSUB_TOPIC` / known subscription name.

---

### B9-21, B9-22 — `send-org-deactivation-email` / `send-org-member-deactivation-email`: No auth (P0)

**Severity:** P0
**Files:** `supabase/functions/send-org-deactivation-email/index.ts`, `send-org-member-deactivation-email/index.ts`

Both functions have **zero authentication**. They accept any POST request with a JSON payload and immediately send bulk emails to all provided addresses:

`send-org-deactivation-email`:
```typescript
serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response('ok', { headers: corsHeaders });
  }
  try {
    const supabase = createClient(...)
    const payload: DeactivationEmailPayload = await req.json();
    // immediately sends emails to payload.member_emails
```

`send-org-member-deactivation-email`:
```typescript
serve(async (req) => {
  if (req.method === 'OPTIONS') { ... }
  try {
    const payload: MemberDeactivationEmailPayload = await req.json();
    // immediately sends emails to payload.recipient_emails
```

**Attack vector:** An attacker can send arbitrary email content to any email address they supply, using the platform's email infrastructure (AWS SES / Encharge). This is a significant spam/phishing vector.

Additionally, `send-org-member-deactivation-email` uses raw `fetch()` with the service role key exposed in the Authorization header to call `encharge-send-email`:

```typescript
headers: {
  'Authorization': `Bearer ${Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')}`
}
```

**Fix:** Add service-role auth check (or EDGE_FUNCTION_SECRET matching the pattern used by `first-meeting-synced-email`). Consider using the `isServiceRoleAuth()` helper from `_shared/edgeAuth.ts`.

---

### B9-28 — `ai-ark-similarity`: Wrong HTTP status for insufficient credits

**Severity:** P2
**File:** `supabase/functions/ai-ark-similarity/index.ts:188`

```typescript
const balanceCheck = await checkCreditBalance(serviceClient, membership.org_id)
if (!balanceCheck.allowed) {
  return new Response(
    JSON.stringify({ error: 'Insufficient credits', code: 'INSUFFICIENT_CREDITS' }),
    { status: 400, ...}  // Should be 402
  )
}
```

Other functions (`ai-ark-enrich`, `ai-ark-search`, `apollo-collect-more`, `apollo-reveal`, etc.) correctly return 402 for insufficient credits. `ai-ark-similarity` returns 400. Inconsistent — breaks any frontend error handling that maps 402 → "upgrade prompt".

---

### B9-29 — `apollo-reveal`: Credits deducted for silently truncated batch

**Severity:** P2
**File:** `supabase/functions/apollo-reveal/index.ts:102`

```typescript
const details = apollo_ids.slice(0, 10).map(id => ({ id }))
// ... makes one bulk_match call ...
await logFlatRateCostEvent(..., 0.3, ...)  // Fixed flat rate
```

The function silently truncates any input larger than 10 IDs to 10. The caller receives data for only 10 contacts even if they sent more, but the cost tracking logs a flat `0.3` regardless of actual enrichment count. This means:
- If caller sends 10 IDs and all 10 match, cost is `0.3` (correct)
- If caller sends 3 IDs and 3 match, cost is still `0.3` (overcharges)
- If Apollo API returns a miss on some, cost is still `0.3` (charges for failed enrichments)

**Fix:** Either charge per-enriched contact (like `ai-ark-enrich` does) or document the flat-rate behavior and validate `apollo_ids.length <= 10`.

---

### B9-30 — `enrich-cascade`: Potential double credit spend

**Severity:** P1
**File:** `supabase/functions/enrich-cascade/index.ts`

The cascade function calls both AI Ark and Apollo APIs in sequence. The credit balance is checked once at the start, but each provider call independently deducts credits. If the AI Ark call succeeds and deducts credits, then the Apollo fallback also deducts credits, the org could drop below zero balance between the two checks. The pre-flight balance check only runs once; there is no re-check between provider calls.

This is a latent issue — more of a design concern than an active bug — but in high-concurrency scenarios (multiple bulk enrichments firing simultaneously) the balance could go significantly negative.

---

### B9-31 — `send-scheduled-emails`: No auth check

**Severity:** P2
**File:** `supabase/functions/send-scheduled-emails/index.ts`

The function has no authentication — any caller can trigger processing of all pending scheduled emails. While it only processes emails already in the `scheduled_emails` table (reducing the blast radius), an attacker could use this to force premature delivery of all pending emails at any time.

Given it's described as a "manual trigger / fallback" for a pg_cron job, it should require CRON_SECRET or service role auth (similar to `scheduled-email-sync`).

---

### B9-32 — `demo-enrichment-comparison`: Unauthenticated AI resource consumption

**Severity:** P2
**File:** `supabase/functions/demo-enrichment-comparison/index.ts:41-60`

```typescript
// Demo mode: make auth optional for testing
let userId = 'demo-user-' + Date.now();
// Try to get user if auth present
if (authHeader) {
  // ...
} else {
  console.log('[demo] No auth, running in demo mode');
}
```

Unauthenticated callers can trigger enrichment lookups (Gemini, possibly Exa or Apollo) without any credit tracking or rate limiting. This is a cost exposure vector.

The function does not implement rate limiting (unlike `demo-research` which has IP-based rate limiting at 10 req/min).

---

## Patterns by Category

### Unpinned `@supabase/supabase-js@2` (will break on esm.sh)

These functions will crash with HTTP 500 from esm.sh on cold starts:

| Function | Line | Current |
|----------|------|---------|
| `enrich-crm-record` | 2 | `@2` |
| `auto-re-enrich` | 15 | `@2` |
| `run-reoon-verification` | 3 | `@2` |
| `email-send-as-rep` | 25 | `@2` |
| `gmail-apply-labels` | 15 | `@2` |
| `encharge-email` | 18 | `@2` |
| `first-meeting-synced-email` | 13 | `@2` |
| `org-approval-email` | 13 | `@2` |
| `permission-to-close-email` | 13 | `@2` |
| `send-feedback-requests` | 14 | `@2` |
| `send-recording-notification` | 15 | `@2` |
| `send-org-deactivation-email` | 2 | `@2` |
| `scheduled-email-sync` | 15 | `@2` |
| `scheduled-encharge-emails` | 13 | `@2` |
| `scheduled-google-context-sync` | 17 | `@2` |

**Fix all:** Replace `@2` with `@2.43.4`.

### Legacy `corsHeaders` (hardcoded object instead of `getCorsHeaders(req)`)

| Function | Pattern |
|----------|---------|
| `apollo-credits` | local `const corsHeaders = {...}` |
| `apollo-enrich` | local `const corsHeaders = {...}` |
| `apollo-org-enrich` | local `const corsHeaders = {...}` |
| `apollo-search` | local `const corsHeaders = {...}` |
| `run-reoon-verification` | local `const corsHeaders = {...}` |
| `analyze-email` | local `const corsHeaders = {...}` |
| `gemini-research` | local `const corsHeaders = {...}` |
| `research-comparison` | local `const corsHeaders = {...}` |
| `encharge-email` | local `const corsHeaders = {...}` |
| `encharge-send-email` | local `const corsHeaders = {...}` |
| `first-meeting-synced-email` | local `const corsHeaders = {...}` |
| `org-approval-email` | local `const corsHeaders = {...}` |
| `permission-to-close-email` | local `const corsHeaders = {...}` |
| `send-org-deactivation-email` | local `const corsHeaders = {...}` |
| `send-org-member-deactivation-email` | local `const corsHeaders = {...}` |
| `enrich-crm-record` | imports from `_shared/cors.ts` (deprecated) |
| `send-feedback-requests` | imports from `_shared/cors.ts` (deprecated) |
| `send-recording-notification` | imports named `corsHeaders` from `_shared/corsHelper.ts` (wrong export) |

---

## Priority Fix List

### Immediate (P0) — Security vulnerabilities

1. **`run-reoon-verification`** — Add JWT auth + org ownership check before processing
2. **`gmail-push-webhook`** — Add Google Pub/Sub OIDC token verification
3. **`send-org-deactivation-email`** — Add service-role or EDGE_FUNCTION_SECRET auth check
4. **`send-org-member-deactivation-email`** — Add service-role or EDGE_FUNCTION_SECRET auth check
5. **`enrich-crm-record`** — Fix unpinned `@2` (causes 500 crashes) + fix CORS import

### Short-term (P1) — Reliability

6. All functions with unpinned `@supabase/supabase-js@2` — pin to `@2.43.4`
7. **`auto-verify-email`** — Update from `@2.39.0` to `@2.43.4`
8. **`enrich-cascade`** — Add per-provider credit re-check or document expected behavior
9. **`send-scheduled-emails`** — Add CRON_SECRET or service-role auth guard

### Medium-term (P2) — Code quality

10. All functions with legacy `corsHeaders` — migrate to `getCorsHeaders(req)`
11. **`ai-ark-similarity`** — Change 400 to 402 for `INSUFFICIENT_CREDITS`
12. **`apollo-reveal`** — Fix per-contact credit deduction or validate batch size
13. **`demo-enrichment-comparison`** — Add IP-based rate limiting (same as `demo-research`)
