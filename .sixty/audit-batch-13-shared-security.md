# Audit Batch 13: _shared Security Modules

**Date**: 2026-03-01
**Scope**: All 25 `_shared/` modules that edge functions import from
**Risk**: P0s here affect 486+ functions platform-wide

---

## CRITICAL FINDINGS

### P0-A — `edgeAuth.ts`: JWT fallback accepts ANY valid-looking JWT (lines 212–220)

**File**: `supabase/functions/_shared/edgeAuth.ts`
**Functions affected**: Every function calling `getAuthContext()` or `authenticateRequest()` (~100+ functions)

When `supabase.auth.getUser()` fails (e.g. ES256 staging issue), the code decodes the JWT locally without cryptographic verification. The fallback at lines 205–219 has two paths:

1. Issuer matches project URL → accepted (reasonable, though still unverified)
2. **Issuer doesn't match, but `payload.sub` and `payload.iss` exist → accepted with only a warning** (lines 213–219)

```typescript
} else if (payload.sub && payload.iss) {
  // If we can't verify issuer but have a valid-looking JWT, log warning and allow
  console.warn('[edgeAuth] Could not verify JWT issuer, but JWT appears valid. iss:', payload.iss);
  user = {
    id: payload.sub,
    ...
  };
}
```

**Impact**: An attacker can forge a JWT signed with any key, set any `sub` (userId) and any `iss`, and get authenticated as that user. The fallback effectively bypasses authentication. This is duplicated in both `getAuthContext()` and `authenticateRequest()`.

**Fix**: Remove the second `else if` branch. Only accept the JWT if the issuer matches the project URL. If issuer check fails, throw Unauthorized.

---

### P0-B — `edgeAuth.ts`: `isServiceRoleAuth()` accepts ANY JWT with `role: "service_role"` claim (lines 118–128)

```typescript
if (token.startsWith('eyJ')) {
  try {
    const payloadB64 = token.split('.')[1];
    if (payloadB64) {
      const payload = JSON.parse(atob(payloadB64));
      if (payload.role === 'service_role') return true;
    }
  }
}
```

**Impact**: Any attacker who crafts a JWT with `role: "service_role"` in the payload (no signature verification required) gains service-role access. JWTs can be constructed and base64-encoded by anyone. This is a critical authentication bypass.

**Fix**: Remove the JWT decode fallback entirely. Only do exact string comparison against the env var (`sb_secret_` format or the full JWT from the Supabase dashboard). If callers use the JWT-format key, compare the full string, don't decode it.

---

### P0-C — `slackAuth.ts`: Signature comparison is NOT timing-safe (line 144)

```typescript
return computedSignature === signature;
```

**Impact**: Direct string equality comparison leaks timing information, enabling timing attacks to forge Slack request signatures. `verifySlackSignature()` is used by all Slack webhook handlers.

**Fix**: Use the `timingSafeEqual()` function already defined in `use60Signing.ts`, or implement constant-time comparison:
```typescript
return timingSafeEqual(computedSignature, signature);
```

---

### P0-D — `slackAuth.ts`: Pinned to `@supabase/supabase-js@2.39.3` (line 4)

All other shared modules use `@2.43.4`, but `slackAuth.ts` imports from `@2.39.3`. Per memory notes, `@2` resolves to `@2.95.1` which returns 500 on esm.sh, so this exact pin may be safe — but it is inconsistent and could introduce subtle compatibility issues with the rest of the codebase.

**Fix**: Update to `@2.43.4` to match all other shared modules.

---

## HIGH SEVERITY FINDINGS

### P1-A — `corsHelper.ts`: Wildcard `*.vercel.app` pattern is overly broad (line 39)

```typescript
'*.vercel.app',
```

**Impact**: Any Vercel deployment — including user-controlled preview deployments, forks, and third-party apps — can make cross-origin requests to the platform. An attacker who deploys any Vercel app can issue CORS requests as if they were the official frontend.

**Note**: The wildcard match logic (`origin.endsWith(domain)`) means `evil.vercel.app` would be allowed. This is a SSRF/CSRF escalation risk.

**Fix**: Remove the wildcard. Only allow `sixty-sales-dashboard.vercel.app` by exact match, or use the `ALLOWED_ORIGINS` env var with explicit preview URLs.

---

### P1-B — `corsHelper.ts`: OPTIONS preflight always responds 200 with echoed origin, bypassing allowlist (lines 121–132)

```typescript
const allowOrigin = origin || '*';
// ...
return new Response('ok', { status: 200, headers });
```

The comment explains this is intentional (to avoid browser abort on preflight), and enforcement happens on the actual request. However, the actual enforcement in `getCorsHeaders()` sets `Access-Control-Allow-Origin: ''` for blocked origins rather than omitting the header or returning a 4xx — an empty string ACAO header is non-standard and browser behavior may vary.

**Severity**: P1 — the security model relies on the browser enforcing CORS, which it will, but the implementation is fragile.

---

### P1-C — `rateLimiter.ts`: Rate limiter fails OPEN on all errors (lines 82–92, 124–131)

Both `checkRateLimit()` and `rateLimitMiddleware()` return `allowed: true` on any error:

```typescript
if (error) {
  // On error, allow the request to prevent blocking legitimate users
  return { allowed: true, ... };
}
```

**Impact**: If the `rate_limit` table is down, missing, or RLS blocks access, ALL rate limiting is silently bypassed. This is also true for the `rateLimitMiddleware()` catch block. An attacker can trigger errors to bypass rate limiting.

**Consideration**: This is a deliberate design choice (fail-open for availability), but it should be documented and logged loudly when it occurs. Currently the 42P01 (table missing) branch logs nothing.

---

### P1-D — `rateLimiter.ts`: Rate limit table never cleaned up in normal operation

`cleanupRateLimitRecords()` exists but is never called automatically. Rate limit records accumulate indefinitely, growing the table without bound. No index is mentioned. Under high traffic, the SELECT on this table (scanning by `user_id`, `endpoint`, `created_at`) will degrade.

---

### P1-E — `security.ts`: `createErrorResponse()` hardcodes wildcard CORS (lines 488–495)

```typescript
'Access-Control-Allow-Origin': '*',
```

`createErrorResponse()` in `security.ts` returns `*` CORS headers instead of using `getCorsHeaders(req)`. Any function using this for error responses inadvertently opens CORS to all origins on error paths.

**Fix**: Pass `req` to `createErrorResponse()` and use `getCorsHeaders(req)`.

---

### P1-F — `security.ts`: In-memory rate limiter resets on cold start (lines 239–275)

The `rateLimitStore` Map is in-memory and resets on every cold start. Supabase Edge Functions can have many isolates running simultaneously. This means rate limits are per-isolate, not global — a user can exceed limits by hitting different isolates.

**Impact**: Rate limiting is decorative under load. A single user can bypass all limits with parallel requests hitting different isolates.

---

### P1-G — `ses.ts`: AWS credentials captured at module load time (lines 8–11)

```typescript
const AWS_REGION = Deno.env.get("AWS_REGION") || "eu-west-2";
const AWS_ACCESS_KEY_ID = Deno.env.get("AWS_ACCESS_KEY_ID") || "";
const AWS_SECRET_ACCESS_KEY = Deno.env.get("AWS_SECRET_ACCESS_KEY") || "";
```

Module-level credential capture is fine for edge functions (read-once), but if `AWS_SECRET_ACCESS_KEY` is empty string (misconfigured), `isSESConfigured()` returns `false` but the module still exposes the keys as empty strings. No concern here — just note that credentials are module-level globals.

---

### P1-H — `googleOAuth.ts`: Token refresh marks integration revoked on any HTTP 400 (lines 54–75)

```typescript
const isTokenRevoked =
  errorData.error === 'invalid_grant' ||
  ...
  response.status === 400;
```

A `status === 400` from Google could be a malformed request, not necessarily a revoked token. Marking the integration as `is_active: false` on any 400 disables the user's Google integration on transient errors or bugs.

**Fix**: Only mark as revoked on `errorData.error === 'invalid_grant'` or specific revocation messages, not blanket 400.

---

### P1-I — `enqueueWriteback.ts` and `conflictResolver.ts` and `standardTableSync.ts`: Pinned to `@2.39.3`

Three shared modules pin `@supabase/supabase-js@2.39.3` instead of `@2.43.4`:
- `enqueueWriteback.ts` line 4
- `conflictResolver.ts` line 5
- `standardTableSync.ts` line 5

These are the older version. All should be `@2.43.4`.

---

### P1-J — `stripe.ts`: `timingSafeEqual()` short-circuits on length mismatch (line 94)

```typescript
if (a.length !== b.length) return false;
```

This is correct — standard constant-time implementations also bail on length mismatch, as length leaks no useful info about the actual signature. This is acceptable.

**Verdict**: stripe.ts HMAC verification is correct and timing-safe. No issue here.

---

## MEDIUM SEVERITY FINDINGS

### P2-A — `corsHelper.ts`: `cors.ts` re-export file is still imported by 18 functions

`cors.ts` imports from `corsHelper.ts` and re-exports `corsHeaders` for backwards compatibility. 18 functions still import directly from `_shared/cors.ts`. This module should not be deleted — it is still needed. The CLAUDE.md rule "Legacy `corsHeaders` — use `getCorsHeaders(req)`" is partially enforced: 18 older functions still use static `corsHeaders`.

**Recommendation**: Do not delete `cors.ts`. Continue migration plan to move remaining 18 functions to `getCorsHeaders(req)`.

---

### P2-B — `corsHelper.ts`: `corsHeaders` getter calls `getPrimaryOrigin()` at access time, but functions may cache it

```typescript
export const corsHeaders = {
  get 'Access-Control-Allow-Origin'() { return getPrimaryOrigin(); },
  ...
};
```

This dynamic getter ensures `FRONTEND_URL` is read at runtime, not at import time. However, if a caller does `const h = { ...corsHeaders }`, the spread will invoke the getter once and freeze the value. This is a subtle correctness issue for callers doing object spread.

---

### P2-C — `edgeAuth.ts`: `requireOrgRole()` uses `.single()` (line 341)

```typescript
.single()
```

If the user has zero or multiple membership rows with the same `org_id`/`user_id`, `.single()` will throw `PGRST116`. Should use `.maybeSingle()` and handle the null case explicitly.

---

### P2-D — `materializationService.ts`: Contact dedup uses email case-insensitive comparison inconsistently

Line 354: `eq('email', (email || '').toLowerCase())` — forces lowercase for the lookup.
Line 387: `email: email || null` — inserts with original casing.

If the CRM sends email in uppercase and another contact was inserted with lowercase, dedup works. But the inserted value keeps original CRM casing. Inconsistent email normalization.

---

### P2-E — `materializationService.ts`: No org-level isolation on contact dedup lookup (line 351-356)

```typescript
const { data: existingContact } = await svc
  .from('contacts')
  .select('id')
  .eq('email', (email || '').toLowerCase())
  .maybeSingle();
```

No `.eq('clerk_org_id', orgId)` filter — a contact email that exists in org A will prevent materialization for the same email in org B. This is incorrect for a multi-tenant platform.

**Fix**: Add `.eq('clerk_org_id', orgId)` to the dedup query.

---

### P2-F — `standardTableSync.ts`: In-memory rate limiter has same isolate problem as `security.ts`

`rateLimitMap` is module-level. Same issue as P1-F — rate limiting is per-isolate, not global.

---

### P2-G — `upsertCrmIndex.ts`: `raw_properties` stores entire CRM payload

Every upsert stores the full CRM `properties` object as `raw_properties`. For a HubSpot contact with all properties, this can be large (50-100+ fields). Over time, these blobs grow the database significantly. No size cap or sanitization.

---

### P2-H — `bullhorn.ts`: Static class state for concurrency tracking is shared across all instances

```typescript
private static concurrentCalls = 0
private static concurrencyQueue: Array<() => void> = []
```

Static class fields are shared across all `BullhornClient` instances within the same isolate. If multiple BullhornClient instances exist in one edge function invocation, they share a single concurrency pool. This is intentional (Bullhorn limit is per-user, not per-instance) but could cause starvation if multiple org syncs run concurrently.

---

## LOW SEVERITY / CODE QUALITY

### P3-A — `rateLimiter.ts`: Empty catch blocks (lines 83-84, 111-113)

```typescript
if (error.code === '42P01') {
}  // ← empty block, no log
```

Missing `console.warn` for table-not-found errors. Silent failures make debugging very hard.

---

### P3-B — `use60Signing.ts`: No exports for caller to use timing-safe comparison with Slack

The module exports `timingSafeEqual()` but `slackAuth.ts` doesn't import it (causing P0-C). These utilities should be co-located or the import path made obvious.

---

### P3-C — `meetingbaas.ts`: Response body log in `request()` (lines 211-213)

```typescript
if (body) {
  console.log(`[MeetingBaaS] Request body:`, JSON.stringify(body, null, 2));
}
```

This logs the entire request body for every MeetingBaaS API call. If the body includes sensitive data (webhook tokens, API keys in config), they'll appear in logs. Should be removed or redacted.

---

### P3-D — `creditPacks.ts`/`costTracking.ts`: `deductCreditsOrdered` returns `newBalance: -1` for failure, callers check `newBalance >= 0`

This is a magic number pattern. A balance of exactly 0 is valid and distinct from failure. The current check `if (newBalance >= 0)` treats -1 as failure. This is correct but fragile — document the convention.

---

### P3-E — `costTracking.ts`: Budget cap check is advisory, not transactional

The flow is: check budget cap → deduct credits. Between check and deduction, another request could exhaust the budget. This is a TOCTOU (time-of-check/time-of-use) race condition. For billing integrity, the cap enforcement should be atomic in the DB RPC.

---

## SUMMARY TABLE

| ID | Severity | Module | Issue |
|----|----------|--------|-------|
| P0-A | **CRITICAL** | `edgeAuth.ts` | JWT fallback accepts any JWT with valid-looking `sub`+`iss` |
| P0-B | **CRITICAL** | `edgeAuth.ts` | `isServiceRoleAuth()` accepts unsigned JWTs with `role: service_role` |
| P0-C | **CRITICAL** | `slackAuth.ts` | Slack signature comparison is NOT timing-safe |
| P0-D | HIGH | `slackAuth.ts` | Pinned to `@2.39.3` instead of `@2.43.4` |
| P1-A | HIGH | `corsHelper.ts` | `*.vercel.app` wildcard allows any Vercel app |
| P1-B | HIGH | `corsHelper.ts` | OPTIONS preflight bypasses CORS allowlist |
| P1-C | HIGH | `rateLimiter.ts` | Rate limiter fails OPEN on all DB errors |
| P1-D | HIGH | `rateLimiter.ts` | No automatic cleanup of rate_limit table |
| P1-E | HIGH | `security.ts` | `createErrorResponse()` hardcodes `*` CORS |
| P1-F | HIGH | `security.ts` | In-memory rate limiter is per-isolate, not global |
| P1-G | MEDIUM | `ses.ts` | Credentials captured at module level (acceptable) |
| P1-H | HIGH | `googleOAuth.ts` | Marks integration revoked on any HTTP 400 |
| P1-I | MEDIUM | 3 files | `@2.39.3` pin mismatch |
| P2-A | MEDIUM | `cors.ts` | Still imported by 18 functions — do NOT delete yet |
| P2-B | MEDIUM | `corsHelper.ts` | Getter may be frozen by object spread |
| P2-C | MEDIUM | `edgeAuth.ts` | `requireOrgRole()` uses `.single()` not `.maybeSingle()` |
| P2-D | MEDIUM | `materializationService.ts` | Email case normalization inconsistency |
| P2-E | **HIGH** | `materializationService.ts` | Contact dedup missing org isolation filter |
| P2-F | MEDIUM | `standardTableSync.ts` | In-memory rate limiter per-isolate |
| P2-G | MEDIUM | `upsertCrmIndex.ts` | `raw_properties` unsize-capped blob storage |
| P2-H | LOW | `bullhorn.ts` | Static concurrency state shared across instances |
| P3-A | LOW | `rateLimiter.ts` | Silent empty catch blocks |
| P3-B | LOW | `use60Signing.ts` | `timingSafeEqual` not referenced by `slackAuth.ts` |
| P3-C | MEDIUM | `meetingbaas.ts` | Request body logged in full (may contain secrets) |
| P3-D | LOW | `creditPacks.ts` | Magic number -1 for failure balance |
| P3-E | MEDIUM | `costTracking.ts` | TOCTOU race in budget cap check/deduct flow |

---

## WHAT LOOKS GOOD

- **`stripe.ts`**: Manual HMAC-SHA256 webhook verification is correct. Timestamp tolerance enforced. `timingSafeEqual()` used. Correctly avoids SDK's broken Node.js crypto polyfills.
- **`verifyCronSecret()`** in `edgeAuth.ts`: Fail-closed (returns false if no secret configured). Constant-time comparison. Correct.
- **`verifySecret()`** in `edgeAuth.ts`: Correctly fails closed when `EDGE_FUNCTION_SECRET` is set and tokens don't match. Dev mode (no secret) is explicit and logged.
- **`use60Signing.ts`**: Correct HMAC-SHA256 implementation. `timingSafeEqual` is correct.
- **`slackAuth.ts` replay protection**: Timestamp check (`>300` seconds) is correct.
- **`slackAuth.ts` signing secret fail-closed**: Returns false if `SLACK_SIGNING_SECRET` not set (unless opt-in dev override).
- **`googleOAuth.ts`**: Token expiry with 2-minute buffer, marks revoked on `invalid_grant`. Clean pattern.
- **`hubspot.ts` / `attio.ts` / `instantly.ts`**: All have proper exponential backoff with jitter, `Retry-After` header parsing, and 429/5xx retry only.
- **`corsHelper.ts`**: Allowlist architecture is correct. Specific production domains only. No `*` wildcard on real responses.
- **`s3Client.ts` / `s3StreamUpload.ts`**: Clean, correct. Multipart abort on failure. No credential exposure.
- **`materializationService.ts`**: Token refresh logic is solid. Null guards on CRM responses. Non-fatal sync errors.
- **`costTracking.ts`**: Budget cap, credit balance, and AR budget checks all fail-open (backward compat) with clear comments.
- **`conflictResolver.ts`**: Last-writer-wins with timestamp comparison. Conflict audit log. Clean.

---

## PRIORITY FIXES (Ordered)

1. **IMMEDIATE**: Fix `edgeAuth.ts` P0-A — remove the "allow any JWT with sub+iss" fallback branch
2. **IMMEDIATE**: Fix `edgeAuth.ts` P0-B — remove the JWT decode path in `isServiceRoleAuth()`
3. **IMMEDIATE**: Fix `slackAuth.ts` P0-C — use `timingSafeEqual()` for signature comparison
4. **HIGH**: Fix `materializationService.ts` P2-E — add `org_id` filter to contact dedup query
5. **HIGH**: Fix `corsHelper.ts` P1-A — remove `*.vercel.app` wildcard, use explicit origin
6. **HIGH**: Fix `googleOAuth.ts` P1-H — only mark revoked on `invalid_grant`, not all 400s
7. **MEDIUM**: Fix `security.ts` P1-E — pass `req` to `createErrorResponse()` for proper CORS
8. **MEDIUM**: Fix `edgeAuth.ts` P2-C — use `.maybeSingle()` in `requireOrgRole()`
9. **MEDIUM**: Update `slackAuth.ts`, `enqueueWriteback.ts`, `conflictResolver.ts`, `standardTableSync.ts` to `@2.43.4`
