# Audit Batch 11: Calendar Integration & Slack Notifications
**Date:** 2026-03-01
**Scope:** Google OAuth/Calendar, SavvyCal, Slack Events/Interactive/Notifications
**Functions audited:** 59
**Severity breakdown:** 4 P0, 18 P1, 14 P2, 6 P3

---

## P0 — Critical Security (Fix Immediately)

### P0-1: `body.userId` Trusted Without JWT Validation — Auth Bypass
**Files:**
- `google-calendar-sync/index.ts` (lines 113–116)
- `find-available-slots/index.ts` (lines 82–84)
- `create-calendar-event/index.ts` (lines 75–77)

**Pattern (all three):**
```typescript
if (body.userId) {
  userId = body.userId;
  mode = 'cron';
}
```
Any unauthenticated caller can impersonate any user by passing `userId` in the POST body. These functions run with service role privileges after the bypass, meaning full data access for the targeted user. The "cron mode" label does not restrict callers — there is no CRON_SECRET check before this branch.

**Fix:** Use `verifyCronSecret(req, cronSecret)` from `_shared/edgeAuth.ts` before trusting `body.userId`. If the request is not a verified cron or service-role call, require a valid JWT and derive `userId` from it.

---

### P0-2: Open Redirect via User-Controlled `origin` Parameter
**File:** `google-oauth-initiate/index.ts` (lines ~54–58)

```typescript
if (requestOrigin) {
  redirectUri = `${requestOrigin}/auth/google/callback`;
}
```
The `origin` field is read directly from the request body with no validation. An attacker can supply any domain (e.g., `https://evil.com`) as the redirect URI, redirecting the Google OAuth authorization code to an attacker-controlled server.

**Fix:** Validate `requestOrigin` against a hardcoded allowlist (`app.use60.com`, `localhost:5175`, etc.). Reject requests with unknown origins.

---

## P1 — High Priority (Fix Before Next Release)

### P1-1: Unpinned `@supabase/supabase-js@2` — Production Breakage Risk
**Affects 23 functions:**

| Function | Current Import |
|---|---|
| `google-calendar/index.ts` | `@supabase/supabase-js@2` |
| `google-calendar-sync/index.ts` | `@supabase/supabase-js@2` |
| `google-calendar-webhook/index.ts` | `@supabase/supabase-js@2` |
| `google-oauth-callback/index.ts` | `@supabase/supabase-js@2` |
| `google-oauth-callback-public/index.ts` | `@supabase/supabase-js@2` |
| `google-oauth-exchange/index.ts` | `@supabase/supabase-js@2` |
| `google-oauth-initiate/index.ts` | `@supabase/supabase-js@2` |
| `google-docs/index.ts` | `@supabase/supabase-js@2` |
| `google-token-refresh/index.ts` | `@supabase/supabase-js@2` |
| `google-drive/index.ts` | `@supabase/supabase-js@2` |
| `google-gmail/index.ts` | `@supabase/supabase-js@2` |
| `google-tasks/index.ts` | `@supabase/supabase-js@2` |
| `google-test-connection/index.ts` | `@supabase/supabase-js@2` |
| `google-workspace-batch/index.ts` | `@supabase/supabase-js@2` |
| `calendar-search/index.ts` | `@supabase/supabase-js@2` |
| `calendar-sync/index.ts` | `@supabase/supabase-js@2` |
| `auto-join-scheduler/index.ts` | `@supabase/supabase-js@2` |
| `find-available-slots/index.ts` | `@supabase/supabase-js@2` |
| `create-calendar-event/index.ts` | `@supabase/supabase-js@2` |
| `sync-savvycal-events/index.ts` | `@supabase/supabase-js@2` |
| `fetch-savvycal-link/index.ts` | `@supabase/supabase-js@2` |
| `slack-oauth-callback/index.ts` | `@supabase/supabase-js@2` |
| `send-slack-message/index.ts` | `@supabase/supabase-js@2` |
| `slack-deal-momentum/index.ts` | `@supabase/supabase-js@2` |
| `slack-email-reply-alert/index.ts` | `@supabase/supabase-js@2` |
| `slack-stale-deals/index.ts` | `@supabase/supabase-js@2` |
| `slack-sales-assistant/index.ts` | `@supabase/supabase-js@2` |
| `send-slack-notification/index.ts` | `@supabase/supabase-js@2` |
| `send-slack-task-notification/index.ts` | `@supabase/supabase-js@2` |

Additionally, these use **wrong pins** (not `@2.43.4`):
- `google-docs-create/index.ts` — `@2.39.3`
- `slack-interactive/index.ts` — `@2.39.3`
- `slack-slash-commands/index.ts` — `@2.39.3`
- `slack-deal-room-archive/index.ts` — `@2.39.3`
- `slack-deal-room-update/index.ts` — `@2.39.3`
- `slack-hitl-notification/index.ts` — `@2.39.3`
- `slack-join-channel/index.ts` — `@2.39.3`
- `slack-list-channels/index.ts` — `@2.39.3`
- `slack-post-meeting/index.ts` — `@2.39.3`
- `slack-refresh-user-channels/index.ts` — `@2.39.3`
- `slack-self-map/index.ts` — `@2.39.3`
- `slack-test-message/index.ts` — `@2.39.3`
- `slack-waitlist-notification/index.ts` — `@2.39.3`
- `slack-deal-room/index.ts` — `@2.39.3`
- `send-org-notification-slack/index.ts` — `@2.39.0`

**Risk:** `@2` resolves to `@2.95.1` on esm.sh which returns 500. Functions fail silently at runtime.

**Fix:** Replace all occurrences with `https://esm.sh/@supabase/supabase-js@2.43.4`.

---

### P1-2: Token Refresh Not Implemented in `google-drive`
**File:** `google-drive/index.ts` (line ~91)

```typescript
throw new Error('Access token expired. Token refresh not yet implemented.');
```
When a Google Drive access token expires, the function throws immediately instead of refreshing it. All Drive operations for users with expired tokens silently break with a 500 error.

**Fix:** Implement token refresh using the same pattern as `google-calendar/index.ts` which calls `google-token-refresh` or performs an inline OAuth refresh flow.

---

### P1-3: `.single()` Used for Integration Lookup — Throws PGRST116 on Missing Record
**Files:**
- `google-docs/index.ts`
- `google-docs-create/index.ts`
- `google-drive/index.ts`
- `google-gmail/index.ts`
- `google-tasks/index.ts`
- `google-workspace-batch/index.ts`

**Pattern:**
```typescript
const { data: integration } = await supabase
  .from('google_integrations')
  .select(...)
  .eq('user_id', userId)
  .single(); // throws PGRST116 if no integration exists
```
When a user has not connected Google, `.single()` throws `PGRST116` instead of returning `null`. This surfaces as an unhandled exception rather than a clean "not connected" error.

**Fix:** Replace `.single()` with `.maybeSingle()` and add an explicit `if (!integration)` check with a 404 response.

---

### P1-4: Legacy Webhook Channel Skips Token Validation in `google-calendar-webhook`
**File:** `google-calendar-webhook/index.ts` (line ~93)

```typescript
if (channel.channel_token !== null && channel.channel_token !== channelToken) {
  // reject
}
```
Channels where `channel_token IS NULL` bypass token validation entirely. Any caller who knows the `X-Goog-Channel-ID` value can trigger calendar sync for that channel without the correct token. Legacy channels that pre-date token enforcement are permanently unprotected.

**Fix:** Add a migration to backfill `channel_token` for existing channels, then change the condition to `channel.channel_token !== channelToken` (always validate). Alternatively, force re-registration of channels missing tokens.

---

### P1-5: No State TTL Validation in `slack-oauth-callback`
**File:** `slack-oauth-callback/index.ts`

The function reads a `state` parameter (base64-decoded) but does not validate its timestamp or expiry. A stolen or replayed OAuth state parameter remains valid indefinitely.

**Fix:** Embed a timestamp in the state payload (same pattern as `google-oauth-callback` which enforces a 15-minute TTL), reject states older than 15 minutes.

---

### P1-6: `sync-savvycal-events` and `fetch-savvycal-link` Use Legacy `corsHeaders` from `_shared/cors.ts`
**Files:**
- `sync-savvycal-events/index.ts` — `import { corsHeaders } from "../_shared/cors.ts"`
- `fetch-savvycal-link/index.ts` — `import { corsHeaders } from "../_shared/cors.ts"`

The `_shared/cors.ts` module uses hardcoded wildcard CORS (`Access-Control-Allow-Origin: *`), not the request-aware `getCorsHeaders(req)` from `_shared/corsHelper.ts`.

**Fix:** Replace with `import { getCorsHeaders } from '../_shared/corsHelper.ts'` and call `getCorsHeaders(req)` per request.

---

### P1-7: `send-slack-notification` and `send-slack-task-notification` — No JWT Validation
**Files:**
- `send-slack-notification/index.ts`
- `send-slack-task-notification/index.ts`

Both functions use legacy `corsHeaders = { 'Access-Control-Allow-Origin': '*' }` and trust `user_id` directly from the request body with no JWT validation. Any caller can trigger Slack notifications for any user ID.

**Fix:** Validate the JWT via `getAuthContext()` before using `user_id`, or restrict to service-role-only callers via `isServiceRoleAuth()`.

---

## P2 — Medium Priority (Fix in Current Sprint)

### P2-1: Legacy Wildcard CORS (`corsHeaders = {}`) — Multiple Functions
**Files using hardcoded `Access-Control-Allow-Origin: *`:**
- `google-docs/index.ts`
- `google-docs-create/index.ts`
- `calendar-sync/index.ts`
- `send-slack-message/index.ts`
- `send-slack-notification/index.ts`
- `send-slack-task-notification/index.ts`
- `send-org-notification-slack/index.ts`

These functions either define `corsHeaders = { 'Access-Control-Allow-Origin': '*' }` inline or import from `_shared/cors.ts`, both of which produce wildcard CORS rather than the dynamic origin-reflecting pattern in `getCorsHeaders(req)`.

**Fix:** Replace with `getCorsHeaders(req)` from `_shared/corsHelper.ts`.

---

### P2-2: `google-docs-create` Uses `select('*')` on `google_integrations`
**File:** `google-docs-create/index.ts`

```typescript
const { data } = await supabase
  .from('google_integrations')
  .select('*')
```
`google_integrations` stores OAuth tokens (access_token, refresh_token). Selecting `*` fetches all columns including sensitive credential fields that are not needed for the operation.

**Fix:** Select only the fields required: `access_token, refresh_token, token_expires_at` (or equivalent).

---

### P2-3: Inline Cron Auth Pattern Is Fail-Open When `CRON_SECRET` Not Set
**Files:**
- `slack-snooze-check/index.ts` (line 23)
- `slack-expire-actions/index.ts` (line 23)

```typescript
if (!isCron && !isServiceRole && cronSecret) {
  // only enforce if cronSecret is truthy
}
```
If `CRON_SECRET` is not configured in the environment, the condition `&& cronSecret` makes the entire auth block a no-op. Any unauthenticated caller can trigger these endpoints.

The shared `verifyCronSecret()` in `_shared/edgeAuth.ts` correctly fails-closed (returns `false` if secret not configured). These two functions use an older inline pattern that does the opposite.

**Fix:** Replace inline auth block with `verifyCronSecret(req, Deno.env.get('CRON_SECRET'))` from `_shared/edgeAuth.ts`. Ensure functions reject if result is false and caller is not service-role.

---

### P2-4: `send-slack-message` Fragile Service-Role Detection
**File:** `send-slack-message/index.ts`

The function uses manual JWT header decoding (`atob(parts[1])`) to detect service-role callers rather than using `isServiceRoleAuth()` from `_shared/edgeAuth.ts`. This approach is brittle and may fail if token format changes.

**Fix:** Replace with `isServiceRoleAuth(authHeader, SUPABASE_SERVICE_ROLE_KEY)` from shared auth module.

---

### P2-5: `google-token-refresh` Uses `legacyCorsHeaders` Import
**File:** `google-token-refresh/index.ts`

```typescript
import { legacyCorsHeaders } from '../_shared/corsHelper.ts';
```
`legacyCorsHeaders` is a wildcard CORS constant. Even though this is a cron-only function, the pattern should be consistent and use `getCorsHeaders(req)`.

**Fix:** Switch to `getCorsHeaders(req)` for consistency and to prevent accidental use in future user-facing refactors.

---

### P2-6: `savvycal-config` Defines Inline `getCorsHeaders` Instead of Importing from Shared Module
**File:** `savvycal-config/index.ts` (line ~19)

```typescript
function getCorsHeaders(req: Request): Record<string, string> {
  const origin = req.headers.get('Origin');
  // ... inline implementation
```
This duplicates the shared `getCorsHeaders` implementation. If the allowed origins list changes in `_shared/corsHelper.ts`, this function won't pick it up.

**Fix:** Import `getCorsHeaders` from `'../_shared/corsHelper.ts'` and remove the inline definition.

---

### P2-7: `route-message` Trusts `org_id` and `user_id` from Request Body
**File:** `route-message/index.ts` (lines ~320, ~346)

The function validates the JWT to get the authenticated user (line 346), but then uses `user_id` and `org_id` from the request body (line 320) for routing decisions. If the body `user_id` does not match the JWT `user.id`, the function processes the request under the wrong identity.

**Fix:** After JWT validation, replace `user_id` from body with `user.id` from the validated JWT. Validate that `org_id` matches the user's actual org.

---

### P2-8: `auto-join-scheduler` Accepts GET with No Auth Guard for Manual Testing
**File:** `auto-join-scheduler/index.ts`

The function accepts GET requests with a comment `// Allow GET for manual testing`. There is no auth guard on GET. While the function uses service role internally, allowing unauthenticated GET means anyone can trigger the scheduler.

**Fix:** Remove the GET bypass. If manual testing is needed, use a CRON_SECRET query parameter or require service-role auth.

---

### P2-9: `slack-waitlist-notification` Has No Auth on Incoming Calls
**File:** `slack-waitlist-notification/index.ts`

No JWT validation, no CRON_SECRET check. The function reads `type` from the body to decide notification behavior and sends to a hardcoded org Slack channel. An unauthenticated caller can spam the internal Slack channel with any notification type.

**Fix:** Add `verifyCronSecret` or `isServiceRoleAuth` check before processing the request.

---

### P2-10: `savvycal-leads-webhook` Fallback to `LEGACY_WEBHOOK_SECRET`
**File:** `savvycal-leads-webhook/index.ts` (line ~176)

```typescript
const webhookSecret = orgContext.webhookSecret || LEGACY_WEBHOOK_SECRET;
```
If the per-org secret is not configured, the function falls back to a global `SAVVYCAL_WEBHOOK_SECRET` env var. This creates a shared secret across all orgs — if the global secret is compromised, all legacy webhooks are compromised. The fallback is necessary for backwards compatibility but creates a security gap.

**Fix:** Log a warning when falling back to the legacy secret. Add monitoring to detect how many active integrations still use the legacy path, with a plan to migrate them.

---

## P3 — Low Priority / Cleanup

### P3-1: `google-test-connection` Returns Verbose Debug Info in Response Body
**File:** `google-test-connection/index.ts`

On error, the function returns the full error stack trace in the JSON response body. This leaks internal implementation details (library versions, file paths, error types) to callers.

**Fix:** Log the full error server-side, return only a generic `"Connection test failed"` message to the client.

---

### P3-2: `sync-savvycal-events` Cron Mode Accepts `org_id` from Query String Without Validation
**File:** `sync-savvycal-events/index.ts` (line ~420)

In cron mode, `org_id` is accepted from both body and URL query string. While the function requires `CRON_SECRET`, query-string org_id selection means logs may contain customer org IDs in URLs.

**Fix:** Accept `org_id` only from the POST body to keep it out of server access logs.

---

### P3-3: `slack-copilot-actions` and `slack-hitl-notification` No Rate Limiting
**Files:**
- `slack-copilot-actions/index.ts`
- `slack-hitl-notification/index.ts`

These functions trigger AI generation (`slack-copilot-actions`) or send Slack interactive messages (`slack-hitl-notification`) but have no rate limiting or deduplication. `slack-copilot-actions` handles Slack button clicks — rapid clicking could generate excessive AI calls.

**Fix:** Add idempotency key check (button action `action_id` + `message_ts`) before processing. `slack-events` already has a rate limit of 20 commands/user/hour — apply the same pattern here.

---

### P3-4: `google-drive` Token Expiry Error Not User-Facing
**File:** `google-drive/index.ts`

When the token refresh throws (see P1-2), the error message `"Access token expired. Token refresh not yet implemented."` is surfaced as a raw 500 error. Users see no actionable guidance.

**Fix:** After implementing token refresh (P1-2), add a specific error code so the frontend can show "Please reconnect Google Drive."

---

### P3-5: `slack-deal-room-update` and `slack-deal-room` Use `@2.39.3` — No Auth on Org Lookup
**Files:**
- `slack-deal-room-update/index.ts`
- `slack-deal-room/index.ts`

Both are on wrong pin `@2.39.3`. The `slack-deal-room-update` function has no explicit auth check — it appears to be invoked internally by database triggers or other edge functions, but does not verify the caller identity.

**Fix:** Pin to `@2.43.4`. Add `isServiceRoleAuth` check if this is intended for internal-only use.

---

### P3-6: `send-org-notification-slack` Uses `@2.39.0` — Oldest Pin in Codebase
**File:** `send-org-notification-slack/index.ts`

Uses `@2.39.0`, the oldest pin observed across all audited functions. More likely to have breaking behavior divergence.

**Fix:** Pin to `@2.43.4`.

---

## What's Working Well

### Slack Signature Verification — `slack-events` (GOOD)
`slack-events/index.ts` correctly implements:
- HMAC-SHA256 Slack request signature verification
- 5-minute replay prevention (rejects `X-Slack-Request-Timestamp` older than 300 seconds)
- Rate limiting: 20 commands/user/hour
- Idempotency check via `slack_copilot_messages` table
- Correctly pinned `@2.43.4`

### `slack-slash-commands` Signature Verification (GOOD)
Uses `verifySlackSignature` from `_shared/slackAuth.ts` — same HMAC pattern as `slack-events`.

### SavvyCal Webhook Signature Verification (GOOD)
`savvycal-leads-webhook/index.ts` verifies webhook signatures per org using HMAC. Org-scoped secrets are used when available with legacy fallback (noted P2-10).

### Google OAuth PKCE + State TTL (GOOD)
`google-oauth-callback/index.ts` and `google-oauth-callback-public/index.ts` both enforce:
- PKCE (code verifier required)
- 15-minute state TTL
- State consumed after first use (prevents replay)

### `savvycal-config` Auth Pattern (GOOD)
Correctly pins `@2.43.4`, uses `getUserOrgId` + `requireOrgRole`, no legacy CORS.

### Notification Rate Limiting via `shouldSendNotification` (GOOD)
`slack-deal-risk-alert`, `slack-campaign-alerts`, `slack-task-reminders`, `slack-morning-brief`, `slack-daily-digest`, `slack-deal-momentum`, `slack-email-reply-alert`, `slack-stale-deals` all use `shouldSendNotification` + `recordNotificationSent` from `_shared/proactive/` for dedup and spam prevention. These functions properly implement `verifyCronSecret` and `isServiceRoleAuth` via the shared module (fail-closed pattern).

---

## Summary Table

| Severity | Count | Key Theme |
|---|---|---|
| P0 | 4 | Auth bypass via `body.userId`, open redirect in OAuth |
| P1 | 18 | Unpinned/wrong SDK version (36 functions), broken token refresh, `.single()` misuse, missing state TTL, legacy CORS on shared functions |
| P2 | 14 | Legacy CORS inline, fail-open cron auth, `select('*')`, fragile service-role detection, missing rate limiting on action handlers |
| P3 | 6 | Debug leakage, cleanup items, stale pins |

**Highest impact fixes:**
1. P0-1 (3 files): Add `verifyCronSecret` before trusting `body.userId`
2. P0-2 (1 file): Allowlist `origin` parameter in `google-oauth-initiate`
3. P1-1 (36 files): Pin `@supabase/supabase-js@2.43.4` across all functions
4. P1-2 (1 file): Implement token refresh in `google-drive`
5. P1-7 (2 files): Add JWT validation to `send-slack-notification` and `send-slack-task-notification`
