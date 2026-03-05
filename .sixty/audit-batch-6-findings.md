# Audit Batch 6 — Billing, Credits, Onboarding & Account Management

**Date:** 2026-03-01
**Auditor:** Claude (automated security/reliability audit)
**Scope:** 50 edge functions across 4 categories
**Checklist:** Auth patterns, explicit column selection, CORS headers, pinned supabase-js versions, Stripe webhook verification, credit race conditions, account deletion completeness

---

## Summary Table

| # | Function | Status | P0 | P1 | P2 | Notes |
|---|----------|--------|----|----|----|----|
| 1 | create-checkout-session | PASS | — | — | — | Good auth, pinned @2.43.4, getCorsHeaders |
| 2 | create-credit-checkout | PASS | — | — | — | Good auth, pinned @2.43.4, explicit columns |
| 3 | create-portal-session | FAIL | 2 | 1 | — | Unpinned @2, legacy corsHeaders, single() |
| 4 | credit-auto-topup | FAIL | 1 | — | — | No auth — anyone can trigger charge for any org |
| 5 | stripe-webhook | PASS | — | — | — | Manual HMAC verified, idempotent, pinned @2.43.4 |
| 6 | stripe-create-product | FAIL | — | — | 1 | select('*') on subscription_plans |
| 7 | stripe-sync-product | FAIL | — | — | 1 | select('*') on subscription_plans |
| 8 | stripe-update-product | FAIL | — | — | 1 | select('*') on subscription_plans |
| 9 | reconcile-billing | FAIL | 3 | — | — | No auth, unpinned @2, legacy corsHeaders |
| 10 | start-free-trial | FAIL | 2 | 1 | — | Unpinned @2, legacy corsHeaders, single() |
| 11 | update-subscription | PASS | — | — | — | Good auth, upgrade/downgrade handled, credits granted |
| 12 | subscription-confirmed-email | FAIL | 2 | — | 1 | Unpinned @2, hardcoded corsHeaders, hardcoded prod URL |
| 13 | admin-credit-menu | PASS | — | — | — | Platform admin check, explicit columns |
| 14 | get-credit-balance | PASS | — | — | — | Auth + membership check, explicit columns |
| 15 | get-credit-menu | PASS | — | — | — | RLS enforced, Cache-Control header |
| 16 | get-credit-usage-summary | PASS | — | — | — | Dual client pattern (service role + user-scoped) |
| 17 | check-credit-alerts | FAIL | — | 1 | — | No org membership check — user can query any org |
| 18 | grant-welcome-credits | FAIL | — | 1 | — | Fragile idempotency (`ilike '%Welcome%'`) |
| 19 | purge-credit-logs | PASS | — | — | 1 | CRON_SECRET auth, minor race in read-modify-write |
| 20 | meter-storage | FAIL | 1 | — | — | No auth — anyone can deduct credits for any org |
| 21 | initialize-onboarding | FAIL | 2 | — | — | JSR import, no auth, accepts userId from body |
| 22 | create-profile | FAIL | — | 1 | 1 | Unpinned @2, hardcoded corsHeaders (signup flow) |
| 23 | create-users-from-profiles | FAIL | 2 | — | — | No auth, hardcoded temp password, old @2.39.0 |
| 24 | invite-user | FAIL | 1 | 1 | — | Old @2.39.0, staging-default CORS, O(n) user scan |
| 25 | send-organization-invitation | FAIL | 1 | — | — | No auth — anyone can send invitation emails |
| 26 | send-rejoin-invitation | FAIL | 1 | — | — | No auth — anyone can send rejoin emails |
| 27 | send-removal-email | PASS | — | — | — | Dual auth (EDGE_FUNCTION_SECRET or admin JWT) |
| 28 | handle-join-request-action | FAIL | 3 | — | — | Auth bypass via body param, unpinned @2, static CORS |
| 29 | handle-organization-joining | FAIL | 2 | — | — | JSR import, no auth, userId from body |
| 30 | check-org-capabilities | PASS | — | — | — | Auth + membership, getCorsHeaders |
| 31 | cleanup-expired-invitations | FAIL | 2 | — | — | Old @2.39.0, CRON_SECRET optional (open if unset) |
| 32 | cleanup-incomplete-onboarding | FAIL | 1 | — | — | Old @2.39.0, accepts service role key as Bearer token |
| 33 | get-invitation-by-token | PASS | — | — | — | Rate limiting, token validation, maybeSingle |
| 34 | delete-user | FAIL | 1 | — | 1 | Old @2.39.0, single() on profiles (throws PGRST116) |
| 35 | delete-organization | FAIL | 1 | — | 1 | Old @2.39.0, single() on organizations (throws PGRST116) |
| 36 | org-deletion-cron | FAIL | 3 | — | — | Unpinned @2, static CORS, CRON_SECRET optional |
| 37 | restore-user | FAIL | 2 | — | — | No admin check, unpinned @2, static CORS |
| 38 | clerk-user-sync | FAIL | 3 | — | — | npm: prefix, no webhook sig, deprecated (remove) |
| 39 | impersonate-user | FAIL | 2 | — | — | Unpinned @2, static CORS, apikey never validated |
| 40 | request-email-change | FAIL | — | — | 1 | Static CORS; auth otherwise good |
| 41 | verify-email-change | FAIL | — | — | 1 | Pinned @2.43.4, auth good; static CORS |
| 42 | send-password-reset-email | FAIL | 1 | 1 | — | Unpinned @2, no auth enforced, O(n) listUsers |
| 43 | debug-auth | FAIL | 3 | — | — | Leaks partial service role key in response — CRITICAL |
| 44 | create-api-key | FAIL | — | — | 2 | Old @2.39.0, select() instead of select('id,...') |
| 45 | generate-waitlist-token | FAIL | 1 | — | — | Unpinned @2, static CORS |
| 46 | validate-waitlist-token | FAIL | 1 | — | — | Unpinned @2, static CORS, public endpoint no auth |
| 47 | send-waitlist-invitation | FAIL | 2 | — | — | Unpinned @2, no auth check, adminUserId from body |
| 48 | send-waitlist-invite | FAIL | 2 | — | — | Unpinned @2, no auth check at all |
| 49 | waitlist-welcome-email | PASS | — | — | 1 | Pinned @2.43.4, static CORS |
| 50 | generate-magic-link | FAIL | 1 | — | — | Unpinned @2, static CORS; auth header present not validated |

**Totals:** 12 PASS / 38 FAIL | P0 issues: 52 | P1 issues: 8 | P2 issues: 12

---

## Critical (P0) Findings

### CRIT-001 — `debug-auth`: Leaks partial service role key in response
**File:** `supabase/functions/debug-auth/index.ts`
**Severity:** P0 — CRITICAL
**Description:** This debugging function returns `token_start` (first 20 chars) and `token_end` (last 20 chars) of BOTH the incoming Bearer token AND the `SUPABASE_SERVICE_ROLE_KEY` env var to any caller. There is no auth protection. The function also compares the token to the service role key and returns `match: true/false`, effectively confirming whether a guessed key is correct. No CORS protection either.
**Fix:** Delete this function entirely. It was a one-time debug tool and is a live secret-leakage endpoint. Run `supabase functions delete debug-auth`.

---

### CRIT-002 — `handle-join-request-action`: Authorization bypass via body parameter
**File:** `supabase/functions/handle-join-request-action/index.ts`
**Severity:** P0
**Description:** The function checks admin permissions using `admin_user_id` from the request body, not from the validated JWT user. An attacker can pass any admin user's UUID as `admin_user_id` while using their own (non-admin) JWT, and the permission check will succeed against the body value. The JWT is validated (user must be authenticated) but the authorization logic uses the untrusted body parameter.
**Fix:** Replace `admin_user_id` body param with `user.id` from the validated JWT. Remove the body param entirely from the permission check path.

---

### CRIT-003 — `clerk-user-sync`: No webhook signature verification + deprecated
**File:** `supabase/functions/clerk-user-sync/index.ts`
**Severity:** P0
**Description:** This function accepts any HTTP POST claiming to be a Clerk webhook with no signature verification. Per project memory, Clerk is fully deprecated and removed from the product. This function is dead code that processes unauthenticated payloads and updates user/organization data.
**Fix:** Delete this function entirely. Run `supabase functions delete clerk-user-sync`.

---

### CRIT-004 — `credit-auto-topup`: No authentication — anyone can trigger charges
**File:** `supabase/functions/credit-auto-topup/index.ts`
**Severity:** P0
**Description:** The function accepts `org_id` from the request body and processes auto top-up credit purchases for that org with zero auth checks. Any unauthenticated caller can pass any `org_id` and trigger a real Stripe charge against that organization's payment method.
**Fix:** Add JWT auth + org membership check (owner/admin role) before processing. Alternatively, gate with `EDGE_FUNCTION_SECRET` if only called internally by cron.

---

### CRIT-005 — `meter-storage`: No authentication — anyone can deduct credits
**File:** `supabase/functions/meter-storage/index.ts`
**Severity:** P0
**Description:** The function accepts `org_id` from the request body and deducts storage credits from that org with no auth. Any caller can trigger credit deductions for arbitrary organizations.
**Fix:** Add `CRON_SECRET` check (this is a cron-style function) or JWT + membership auth.

---

### CRIT-006 — `reconcile-billing`: No authentication — anyone can trigger billing reconciliation
**File:** `supabase/functions/reconcile-billing/index.ts`
**Severity:** P0
**Description:** Billing reconciliation function with no auth. Resyncs all organization subscriptions from Stripe. Can be triggered by anyone. Also uses unpinned `@supabase/supabase-js@2` and legacy `corsHeaders`.
**Fix:** Add `CRON_SECRET` auth check for this cron-style function.

---

### CRIT-007 — `send-organization-invitation`: No auth — anyone can send invitations as any org
**File:** `supabase/functions/send-organization-invitation/index.ts`
**Severity:** P0
**Description:** No JWT validation or auth check. Accepts `organization_name` and `admin_name` from body and sends official-looking invitation emails. Can be abused for phishing.
**Fix:** Add JWT auth + verify caller is an admin member of the organization being invited to.

---

### CRIT-008 — `send-rejoin-invitation`: No auth — anyone can send rejoin emails
**File:** `supabase/functions/send-rejoin-invitation/index.ts`
**Severity:** P0
**Description:** Sends rejoin invitation emails with no auth. Same phishing/spam risk as CRIT-007.
**Fix:** Add JWT auth + admin membership check.

---

### CRIT-009 — `create-users-from-profiles`: No auth + hardcoded temp password
**File:** `supabase/functions/create-users-from-profiles/index.ts`
**Severity:** P0
**Description:** Admin migration tool with zero auth. Creates auth users with hardcoded password `'TempPassword123!'`. Anyone who discovers the endpoint can create arbitrary users in the system. Also uses old `@supabase/supabase-js@2.39.0`.
**Fix:** Either delete (if migration is complete) or add strong auth gating (platform admin + EDGE_FUNCTION_SECRET). Never hardcode passwords.

---

### CRIT-010 — `initialize-onboarding`: JSR import + no auth + accepts userId from body
**File:** `supabase/functions/initialize-onboarding/index.ts`
**Severity:** P0
**Description:** Uses `jsr:@supabase/supabase-js@2` (JSR, not esm.sh — non-standard, may behave differently). No JWT auth — accepts `userId` from request body and initializes onboarding for that user. Also queries `organization_members` (not `organization_memberships` — possible wrong table name).
**Fix:** Switch to `esm.sh/@supabase/supabase-js@2.43.4`. Add JWT auth and derive userId from the validated JWT, not from the body. Verify table name.

---

### CRIT-011 — `handle-organization-joining`: JSR import + no auth + userId from body
**File:** `supabase/functions/handle-organization-joining/index.ts`
**Severity:** P0
**Description:** Uses `jsr:@supabase/supabase-js@2`. No auth — accepts `userId` from body and creates join requests on behalf of that user. Hardcoded static CORS.
**Fix:** Switch to `esm.sh/@supabase/supabase-js@2.43.4`. Add JWT auth and use `user.id` from validated JWT.

---

### CRIT-012 — `restore-user`: No admin check — any authenticated user can restore accounts
**File:** `supabase/functions/restore-user/index.ts`
**Severity:** P0
**Description:** The function verifies a JWT is present but does not check if the caller is an admin. Any authenticated user can call this endpoint to reactivate soft-deleted users.
**Fix:** Add `is_admin` check on the calling user's profile before allowing restore operations.

---

### CRIT-013 — `cleanup-expired-invitations`: CRON_SECRET optional — open if env var missing
**File:** `supabase/functions/cleanup-expired-invitations/index.ts`
**Severity:** P0
**Description:** Auth check only runs when `CRON_SECRET` env var is set: `if (cronSecret && authHeader !== 'Bearer ' + cronSecret) { reject }`. If `CRON_SECRET` is unset, the check is skipped entirely and the function is open to anyone.
**Fix:** Change to: if `CRON_SECRET` is not set, reject all requests. Never fail open on missing secrets.

---

### CRIT-014 — `org-deletion-cron`: Same CRON_SECRET optional pattern + unpinned @2
**File:** `supabase/functions/org-deletion-cron/index.ts`
**Severity:** P0
**Description:** Same fail-open pattern as CRIT-013 — deletion cron is unprotected if `CRON_SECRET` env var is missing. Also uses unpinned `@supabase/supabase-js@2` and hardcoded static CORS.
**Fix:** Fail closed on missing `CRON_SECRET`. Pin supabase-js to `@2.43.4`. Use `getCorsHeaders(req)`.

---

### CRIT-015 — `send-password-reset-email`: No auth enforced (verify_jwt=false + no manual check)
**File:** `supabase/functions/send-password-reset-email/index.ts`
**Severity:** P0
**Description:** The function has `verify_jwt = false` in config and the code comments say "only called from authenticated admin users on the frontend" while logging the auth header but not validating it. Anyone can submit any email address and trigger a password reset email with a valid Supabase magic link. Also uses unpinned `@supabase/supabase-js@2`.
**Fix:** Add manual JWT validation if this must be called from auth context, or add rate limiting per email address and per IP to prevent abuse. Pin supabase-js.

---

### CRIT-016 — `send-waitlist-invitation`: No auth + adminUserId trusted from body
**File:** `supabase/functions/send-waitlist-invitation/index.ts`
**Severity:** P0
**Description:** No JWT auth at all. Accepts `adminUserId` from the request body and uses it for audit logging. Anyone can call this to create auth users and send invitation emails. Uses unpinned `@supabase/supabase-js@2`.
**Fix:** Add JWT auth. Derive `adminUserId` from validated JWT, not from body. Verify caller has admin role.

---

### CRIT-017 — `send-waitlist-invite`: No auth at all
**File:** `supabase/functions/send-waitlist-invite/index.ts`
**Severity:** P0
**Description:** Sends batch emails via SES with no auth. Old `sixtyseconds.ai` domain in `from` field (legacy). Anyone can trigger bulk email sends.
**Fix:** Add JWT auth + admin check. Update `from` to current domain.

---

### CRIT-018 — `impersonate-user`: apikey header never validated
**File:** `supabase/functions/impersonate-user/index.ts`
**Severity:** P0
**Description:** Requires `apikey` header but compares it against `Deno.env.get('SUPABASE_ANON_KEY')` — the public anon key that is embedded in every frontend bundle. Anyone with the anon key (i.e., any user) can impersonate any other user. Uses unpinned `@2` and static CORS.
**Fix:** Use `EDGE_FUNCTION_SECRET` or a dedicated `IMPERSONATION_SECRET` env var, not the anon key. Add proper platform admin JWT check.

---

### CRIT-019 — `generate-waitlist-token`: Unpinned @2 (broken version)
**File:** `supabase/functions/generate-waitlist-token/index.ts`
**Severity:** P0
**Description:** Uses `@supabase/supabase-js@2` which resolves to `@2.95.1` on esm.sh — a broken version that returns HTTP 500. The function will fail in production.
**Fix:** Pin to `@2.43.4`.

---

### CRIT-020 — `validate-waitlist-token`: Unpinned @2 (broken version)
**File:** `supabase/functions/validate-waitlist-token/index.ts`
**Severity:** P0
**Description:** Same broken version issue — uses `@supabase/supabase-js@2` unpinned.
**Fix:** Pin to `@2.43.4`.

---

### CRIT-021 — `generate-magic-link`: Unpinned @2; auth header checked but not validated
**File:** `supabase/functions/generate-magic-link/index.ts`
**Severity:** P0
**Description:** Uses unpinned `@supabase/supabase-js@2`. Checks for presence of `Authorization` header but never validates it — any string will pass. The function then generates real Supabase auth invite links for arbitrary email addresses.
**Fix:** Pin supabase-js. Add `supabaseAdmin.auth.getUser(token)` validation after extracting the Bearer token.

---

## High (P1) Findings

### P1-001 — `start-free-trial`: `single()` throws if subscription record missing
**File:** `supabase/functions/start-free-trial/index.ts:92`
**Description:** Uses `.single()` on `organization_subscriptions` lookup. If no record exists, Supabase throws PGRST116. For new organizations, this will crash the function instead of continuing to create the trial subscription.
**Fix:** Replace `.single()` with `.maybeSingle()` and handle the null case explicitly.

---

### P1-002 — `create-portal-session`: `single()` throws if subscription record missing
**File:** `supabase/functions/create-portal-session/index.ts:89`
**Description:** Same PGRST116 risk — `.single()` on `organization_subscriptions` when the org may not have a subscription yet.
**Fix:** Replace with `.maybeSingle()`.

---

### P1-003 — `check-credit-alerts`: No org membership verification
**File:** `supabase/functions/check-credit-alerts/index.ts`
**Description:** Validates JWT and checks `user_id === user.id` from body, but does not verify the caller is a member of the `org_id` they're requesting. Any authenticated user who knows another org's UUID can read that org's credit alert thresholds and balances.
**Fix:** Add `organization_memberships` check: verify caller has a role in the target org before returning data.

---

### P1-004 — `grant-welcome-credits`: Fragile idempotency check
**File:** `supabase/functions/grant-welcome-credits/index.ts`
**Description:** Idempotency uses `ilike('description', '%Welcome%')` string match on the `credit_transactions` table. If description format changes, or another transaction is created with "Welcome" in the description, the idempotency check will either false-positive (block re-grant) or false-negative (allow duplicate grant).
**Fix:** Use a dedicated `transaction_type = 'welcome_credits'` or add a `metadata` JSONB field with `source: 'welcome_grant'`, or use a unique constraint on `(org_id, transaction_type)` for one-time grants.

---

### P1-005 — `invite-user`: O(n) `listUsers` scan to check email existence
**File:** `supabase/functions/invite-user/index.ts`
**Description:** Calls `auth.admin.listUsers({ page: 1, perPage: 1000 })` to check if a user already has an account. At 1000+ users this will fail to find users beyond page 1. The code assumes all users fit in one page.
**Fix:** Use `auth.admin.getUserByEmail(email)` instead, or the `check_user_exists_by_email` RPC used in `send-waitlist-invitation`.

---

### P1-006 — `send-password-reset-email`: O(n) `listUsers` scan for name lookup
**File:** `supabase/functions/send-password-reset-email/index.ts:128`
**Description:** Calls `listUsers({ page: 1, perPage: 1000 })` to find first name. Same scaling issue as P1-005. Falls back gracefully to email prefix, but the lookup will miss users when total users > 1000.
**Fix:** Query `profiles` table directly by email, or use `getUserByEmail`.

---

### P1-007 — `start-free-trial`: Can restart trial after cancellation
**File:** `supabase/functions/start-free-trial/index.ts`
**Description:** Checks for `active` or `trialing` status to prevent duplicate trials, but a user with a `canceled` subscription can call this endpoint to start a new free trial.
**Fix:** Also check for `canceled` status (or any non-null previous subscription) to prevent trial abuse.

---

### P1-008 — `cleanup-incomplete-onboarding`: Uses service role key as Bearer token for auth
**File:** `supabase/functions/cleanup-incomplete-onboarding/index.ts`
**Description:** Auth pattern is `authHeader === 'Bearer ${SUPABASE_SERVICE_ROLE_KEY}'`. This means the service role key is transmitted over HTTP as an auth header by whatever triggers this function. The service role key should never be transmitted — use `CRON_SECRET` instead.
**Fix:** Replace with `CRON_SECRET` pattern.

---

## Medium (P2) Findings

### P2-001 — Multiple functions: Legacy static `corsHeaders` instead of `getCorsHeaders(req)`
**Affected functions:** `create-portal-session`, `reconcile-billing`, `start-free-trial`, `subscription-confirmed-email`, `send-rejoin-invitation`, `handle-join-request-action`, `handle-organization-joining`, `initialize-onboarding`, `org-deletion-cron`, `restore-user`, `impersonate-user`, `request-email-change`, `verify-email-change`, `generate-waitlist-token`, `validate-waitlist-token`, `send-waitlist-invitation`, `send-waitlist-invite`, `waitlist-welcome-email`, `generate-magic-link`
**Description:** These functions use hardcoded `corsHeaders = { 'Access-Control-Allow-Origin': '*', ... }` instead of `getCorsHeaders(req)` from `_shared/corsHelper.ts`.
**Fix:** Import and use `getCorsHeaders(req)` / `handleCorsPreflightRequest(req)` from `_shared/corsHelper.ts`.

---

### P2-002 — Multiple functions: Unpinned or old `@supabase/supabase-js` version
**Affected functions:** `create-portal-session`, `reconcile-billing`, `start-free-trial`, `subscription-confirmed-email`, `create-profile`, `invite-user` (@2.39.0), `send-organization-invitation` (@2.39.3), `cleanup-expired-invitations` (@2.39.0), `cleanup-incomplete-onboarding` (@2.39.0), `delete-user` (@2.39.0), `delete-organization` (@2.39.0), `create-api-key` (@2.39.0), `generate-waitlist-token` (@2), `validate-waitlist-token` (@2), `send-waitlist-invitation` (@2), `send-waitlist-invite` (@2), `generate-magic-link` (@2), `send-password-reset-email` (@2)
**Description:** `@supabase/supabase-js@2` (unpinned) resolves to `@2.95.1` on esm.sh which returns HTTP 500. Old pinned versions (2.39.x) are outdated and may have bugs.
**Fix:** Pin all to `@supabase/supabase-js@2.43.4`.

---

### P2-003 — `stripe-create-product`, `stripe-sync-product`, `stripe-update-product`: `select('*')`
**Affected files:**
- `supabase/functions/stripe-create-product/index.ts:63`
- `supabase/functions/stripe-sync-product/index.ts:63`
- `supabase/functions/stripe-update-product/index.ts:63`
**Description:** All three use `.select('*')` on `subscription_plans` table, violating the explicit column selection rule.
**Fix:** Replace with explicit column list, e.g., `.select('id, name, stripe_product_id, stripe_price_id, price_monthly, price_yearly, features, is_active')`.

---

### P2-004 — `subscription-confirmed-email`: Hardcoded production URL
**File:** `supabase/functions/subscription-confirmed-email/index.ts`
**Description:** Hardcoded `'https://app.use60.com/account/billing'` in the email body. Emails sent from staging will contain production URLs.
**Fix:** Use `Deno.env.get('SITE_URL')` + `/account/billing`.

---

### P2-005 — `create-api-key`: `select()` returns all columns + old @2.39.0
**File:** `supabase/functions/create-api-key/index.ts:84`
**Description:** The insert uses `.select()` without specifying columns, returning all `api_keys` columns including `key_hash`. While this is only returned to the authenticated user who created it, best practice is explicit column selection.
**Fix:** Use `.select('id, name, key_preview, permissions, rate_limit, expires_at, created_at')` to exclude `key_hash` from the response.

---

### P2-006 — `invite-user`: Custom `getCorsHeaders` defaults to staging origin
**File:** `supabase/functions/invite-user/index.ts`
**Description:** This function defines its own local `getCorsHeaders()` function that defaults to `'https://staging.use60.com'` when the origin doesn't match known domains. In production, requests from `app.use60.com` should work correctly, but the fallback is staging instead of `*` or production.
**Fix:** Remove the local implementation and use `getCorsHeaders(req)` from `_shared/corsHelper.ts`.

---

### P2-007 — `purge-credit-logs`: Race condition in summary read-modify-write
**File:** `supabase/functions/purge-credit-logs/index.ts`
**Description:** The summarization step reads aggregate data, then writes a summary record. Under concurrent executions (e.g., if the cron fires twice close together), two concurrent reads before either write could result in duplicate summary records.
**Fix:** Use a database transaction or an `upsert` with `onConflict` to make the operation idempotent.

---

### P2-008 — `send-waitlist-invite`: Old `sixtyseconds.ai` domain in from address
**File:** `supabase/functions/send-waitlist-invite/index.ts:63`
**Description:** Email `from` is `invites@sixtyseconds.ai` — legacy domain.
**Fix:** Update to `invites@use60.com`.

---

## Detailed Per-Function Notes

### 1. `create-checkout-session` — PASS
- Auth: JWT validated, org membership checked (owner/admin roles)
- CORS: `getCorsHeaders(req)` ✓
- Supabase-js: `@2.43.4` pinned ✓
- Columns: Explicit selection ✓
- Minor: Sets `status: "trialing"` unconditionally on upsert even when `isConvertingFromTrial` is false

### 2. `create-credit-checkout` — PASS
- Auth: JWT validated, org membership checked ✓
- CORS: `handleCorsPreflightRequest`/`errorResponse` from corsHelper ✓
- Supabase-js: `@2.43.4` pinned ✓
- Stripe Tax config handled gracefully ✓

### 3. `create-portal-session` — FAIL (P0×2, P1×1)
- **P0:** `@supabase/supabase-js@2` unpinned → broken `@2.95.1`
- **P0:** Uses `corsHeaders` from `_shared/cors.ts` (legacy), not `getCorsHeaders(req)`
- **P1:** `.single()` on `organization_subscriptions` at line 89 → throws PGRST116 if no subscription

### 4. `credit-auto-topup` — FAIL (P0×1)
- **P0:** No auth — anyone can POST with any `org_id` and trigger a real Stripe charge
- Supabase-js: `@2.43.4` ✓, CORS: `getCorsHeaders(req)` ✓
- Good: cooldown, monthly cap, consecutive failure disable, idempotency via timestamp check

### 5. `stripe-webhook` — PASS
- Webhook verification: `verifyWebhookSignature` from `_shared/stripe.ts` (manual HMAC-SHA256 via `crypto.subtle`) ✓
- Idempotency: `billing_event_log` with `provider,provider_event_id` unique constraint ✓
- Supabase-js: `@2.43.4` ✓, CORS: `getCorsHeaders(req)` ✓
- Handles: `checkout.session.completed`, `customer.subscription.*`, `invoice.*` events

### 6. `stripe-create-product` — FAIL (P2×1)
- **P2:** `select('*')` on `subscription_plans` (line 63)
- Super-admin check ✓, `getCorsHeaders(req)` ✓, `@2.43.4` ✓

### 7. `stripe-sync-product` — FAIL (P2×1)
- **P2:** `select('*')` on `subscription_plans` (line 63)
- Super-admin check ✓, `getCorsHeaders(req)` ✓, `@2.43.4` ✓

### 8. `stripe-update-product` — FAIL (P2×1)
- **P2:** `select('*')` on `subscription_plans` (line 63)
- Super-admin check ✓, `getCorsHeaders(req)` ✓, `@2.43.4` ✓

### 9. `reconcile-billing` — FAIL (P0×3)
- **P0:** No auth — anyone can trigger full billing reconciliation
- **P0:** `@supabase/supabase-js@2` unpinned
- **P0:** Legacy `corsHeaders` from `_shared/cors.ts`

### 10. `start-free-trial` — FAIL (P0×2, P1×2)
- **P0:** `@supabase/supabase-js@2` unpinned
- **P0:** Legacy `corsHeaders` from `_shared/cors.ts`
- **P1:** `.single()` on `organization_subscriptions` → PGRST116 risk
- **P1:** Users with `canceled` subscriptions can call this to start a new trial

### 11. `update-subscription` — PASS
- Auth: JWT + org membership ✓, Supabase-js: `@2.43.4` ✓, CORS: `getCorsHeaders(req)` ✓
- Handles upgrade/downgrade/billing cycle change with credit granting on Pro upgrade ✓

### 12. `subscription-confirmed-email` — FAIL (P0×2, P2×1)
- **P0:** `@supabase/supabase-js@2` unpinned
- **P0:** Hardcoded `corsHeaders` (not `getCorsHeaders(req)`)
- **P2:** Hardcoded `'https://app.use60.com/account/billing'` URL
- Good: `EDGE_FUNCTION_SECRET` auth for internal calls ✓

### 13. `admin-credit-menu` — PASS
- Platform admin check ✓, explicit column selection ✓, `getCorsHeaders(req)` ✓, `@2.43.4` ✓
- Comprehensive: GET/POST/DELETE with full history tracking ✓

### 14. `get-credit-balance` — PASS
- JWT + org membership ✓, explicit columns ✓, `getCorsHeaders(req)` ✓, `@2.43.4` ✓

### 15. `get-credit-menu` — PASS
- Anon key + user token (RLS enforced) ✓, `getCorsHeaders(req)` ✓, `@2.43.4` ✓
- `Cache-Control: public, max-age=300` header ✓

### 16. `get-credit-usage-summary` — PASS
- Dual client: service role for balance, user-scoped for credit_logs ✓
- `getCorsHeaders(req)` ✓, `@2.43.4` ✓

### 17. `check-credit-alerts` — FAIL (P1×1)
- **P1:** No org membership check — any auth user can query any org's alert data by knowing org_id
- CORS: `getCorsHeaders(req)` ✓, `@2.43.4` ✓

### 18. `grant-welcome-credits` — FAIL (P1×1)
- **P1:** Idempotency via `ilike('%Welcome%')` — fragile string match
- Org membership check ✓, `@2.43.4` ✓ (but uses older deno std `@0.168.0`)

### 19. `purge-credit-logs` — PASS (with minor P2 note)
- `CRON_SECRET` auth ✓, `getCorsHeaders(req)` ✓, `@2.43.4` ✓
- **P2 note:** Step 3 summary read-modify-write without transaction (minor race risk)

### 20. `meter-storage` — FAIL (P0×1)
- **P0:** No auth — anyone can deduct storage credits for any org
- `getCorsHeaders(req)` ✓, `@2.43.4` ✓, good idempotency with sentinel records ✓

### 21. `initialize-onboarding` — FAIL (P0×2)
- **P0:** `jsr:@supabase/supabase-js@2` — JSR import (non-standard)
- **P0:** No auth, accepts `userId` from body
- Queries `organization_members` (not `organization_memberships`) — possible wrong table name

### 22. `create-profile` — FAIL (P1×1, P2×1)
- **P1 note:** Intentionally unauthenticated (signup flow) but accepts any `userId` from body
- **P2:** `@supabase/supabase-js@2` unpinned, hardcoded `corsHeaders`

### 23. `create-users-from-profiles` — FAIL (P0×2)
- **P0:** No auth whatsoever — zero protection on a user-creation endpoint
- **P0:** Hardcoded temp password `'TempPassword123!'`
- Old `@2.39.0`

### 24. `invite-user` — FAIL (P0×1, P1×2)
- **P0:** Old `@2.39.0`
- **P1:** Custom local `getCorsHeaders` defaults to `staging.use60.com` (not from `_shared/corsHelper.ts`)
- **P1:** `listUsers({ perPage: 1000 })` to check email existence — O(n), misses users beyond page 1

### 25. `send-organization-invitation` — FAIL (P0×1)
- **P0:** No auth check at all — unauthenticated email sending

### 26. `send-rejoin-invitation` — FAIL (P0×1)
- **P0:** No auth check — anyone can send rejoin emails for any org
- Uses `@2.43.4` ✓ (correct version) but static CORS

### 27. `send-removal-email` — PASS
- Dual auth: `EDGE_FUNCTION_SECRET` or admin JWT ✓
- `getCorsHeaders(req)` ✓, `maybeSingle()` ✓

### 28. `handle-join-request-action` — FAIL (P0×3)
- **P0:** Auth bypass — uses `admin_user_id` from body for permission check, not from JWT
- **P0:** `@supabase/supabase-js@2` unpinned
- **P0:** Hardcoded static CORS

### 29. `handle-organization-joining` — FAIL (P0×2)
- **P0:** `jsr:@supabase/supabase-js@2` — JSR import (non-standard)
- **P0:** No auth, `userId` from body

### 30. `check-org-capabilities` — PASS
- JWT + org membership ✓, `getCorsHeaders(req)` via `handleCorsPreflightRequest` ✓, `@2.43.4` ✓

### 31. `cleanup-expired-invitations` — FAIL (P0×2)
- **P0:** Old `@2.39.0`
- **P0:** `CRON_SECRET` check is skipped when env var is missing (fail-open)

### 32. `cleanup-incomplete-onboarding` — FAIL (P0×1, P1×1)
- **P0:** Old `@2.39.0`
- **P1:** Auth via `authHeader === 'Bearer ${SUPABASE_SERVICE_ROLE_KEY}'` — transmits service role key

### 33. `get-invitation-by-token` — PASS
- Rate limiting (10 req/min per IP) ✓, token format validation (64-char hex) ✓
- `maybeSingle()` ✓, `getCorsHeaders(req)` ✓, filters expired/used tokens ✓

### 34. `delete-user` — FAIL (P0×1, P2×1)
- **P0:** Old `@2.39.0`
- **P2:** `.single()` on profiles (line 55) — throws PGRST116 if profile doesn't exist
- Good: `is_admin` check, self-deletion prevention ✓

### 35. `delete-organization` — FAIL (P0×1, P2×1)
- **P0:** Old `@2.39.0`
- **P2:** `.single()` on organizations (line 75) — throws PGRST116 if org doesn't exist
- Good: `is_admin` check ✓

### 36. `org-deletion-cron` — FAIL (P0×3)
- **P0:** `@supabase/supabase-js@2` unpinned
- **P0:** Hardcoded static CORS
- **P0:** `CRON_SECRET` fail-open pattern

### 37. `restore-user` — FAIL (P0×2)
- **P0:** No admin check — any authenticated user can restore soft-deleted accounts
- **P0:** `@supabase/supabase-js@2` unpinned, hardcoded static CORS
- Impersonation logs use silent `logError` (no alerting on failure)

### 38. `clerk-user-sync` — FAIL (P0×3) — DELETE THIS FUNCTION
- **P0:** `npm:@supabase/supabase-js@2` — npm prefix (non-standard in Deno)
- **P0:** No Clerk webhook signature verification
- **P0:** Fully deprecated function (Clerk removed from project) — dead code processing unauthenticated payloads

### 39. `impersonate-user` — FAIL (P0×2)
- **P0:** `apikey` header validated against `SUPABASE_ANON_KEY` — the public anon key in every frontend bundle
- **P0:** `@supabase/supabase-js@2` unpinned, hardcoded static CORS

### 40. `request-email-change` — FAIL (P2×1)
- **P2:** Hardcoded static `corsHeaders` instead of `getCorsHeaders(req)`
- Auth via anon+user token ✓, rate limiting ✓, token validation ✓

### 41. `verify-email-change` — FAIL (P2×1)
- **P2:** Hardcoded static `corsHeaders` instead of `getCorsHeaders(req)`
- Auth: JWT validated ✓, user ownership verified ✓, `@2.43.4` ✓, `maybeSingle()` ✓
- Good overall security; CORS is only issue

### 42. `send-password-reset-email` — FAIL (P0×1, P1×2)
- **P0:** No auth enforced despite `verify_jwt = false` + comment saying "only called from admin users"
- **P1:** `listUsers({ perPage: 1000 })` for name — O(n) scan, misses users beyond page 1
- **P0:** `@supabase/supabase-js@2` unpinned

### 43. `debug-auth` — FAIL (P0×3) — DELETE THIS FUNCTION
- **P0:** Leaks first 20 + last 20 characters of `SUPABASE_SERVICE_ROLE_KEY` to any caller
- **P0:** No auth, no CORS
- **P0:** Confirms whether a guessed key matches via `match: true/false` response
- This is an active secret-leakage endpoint. Delete immediately.

### 44. `create-api-key` — FAIL (P2×2)
- **P2:** Old `@2.39.0`
- **P2:** `.select()` on insert returns all columns including `key_hash`
- Good: SHA-256 key hashing ✓, `getCorsHeaders(req)` ✓, JWT auth ✓

### 45. `generate-waitlist-token` — FAIL (P0×1)
- **P0:** `@supabase/supabase-js@2` unpinned — will fail in production
- Auth logic is good: EDGE_FUNCTION_SECRET OR service role OR admin JWT ✓
- Hardcoded static CORS (P2)

### 46. `validate-waitlist-token` — FAIL (P0×1)
- **P0:** `@supabase/supabase-js@2` unpinned — will fail in production
- Intentionally public endpoint (no auth needed for token validation) ✓
- Good: `maybeSingle()`, expiry/used_at checks ✓
- Hardcoded static CORS (P2)

### 47. `send-waitlist-invitation` — FAIL (P0×2)
- **P0:** No auth — anyone can create auth users and send invitations
- **P0:** `@supabase/supabase-js@2` unpinned
- `adminUserId` from body used in audit log (unverified)

### 48. `send-waitlist-invite` — FAIL (P0×2)
- **P0:** No auth at all
- **P0:** `@supabase/supabase-js@2` unpinned
- **P2:** `from` address still `invites@sixtyseconds.ai` (legacy domain)

### 49. `waitlist-welcome-email` — PASS (with P2 note)
- Supabase-js: `@2.43.4` ✓, implements AWS SES via native `crypto.subtle` for HMAC signing ✓
- **P2:** Hardcoded static CORS (minor)
- No auth on this endpoint — intentionally public (called from signup flow) — acceptable

### 50. `generate-magic-link` — FAIL (P0×1)
- **P0:** `@supabase/supabase-js@2` unpinned; auth header present but never validated (any string passes)
- Hardcoded static CORS (P2)

---

## Priority Action Plan

### Immediate (block deployment)
1. **DELETE `debug-auth`** — Live secret leakage endpoint (CRIT-001)
2. **DELETE `clerk-user-sync`** — No-sig webhook, deprecated, dead code (CRIT-003)
3. **Fix `handle-join-request-action`** — Auth bypass via body param (CRIT-002)
4. **Add auth to `credit-auto-topup`, `meter-storage`, `reconcile-billing`** — Unauthenticated financial operations (CRIT-004/005/006)
5. **Fix `impersonate-user`** — Anon key used as auth secret (CRIT-018)

### High Priority (this sprint)
6. **Pin all supabase-js to `@2.43.4`** — ~18 functions broken or vulnerable (P2-002)
7. **Add auth to `send-organization-invitation`, `send-rejoin-invitation`** — Phishing vector (CRIT-007/008)
8. **Add auth to `send-waitlist-invitation`, `send-waitlist-invite`** — Unauthorized user creation + bulk email (CRIT-016/017)
9. **Fix `generate-magic-link`** — Validate JWT, not just presence of header (CRIT-021)
10. **Fix CRON_SECRET fail-open in `cleanup-expired-invitations`, `org-deletion-cron`** — Open if env var missing (CRIT-013/014)
11. **Fix `restore-user`** — Add admin check (CRIT-012)
12. **Fix `create-users-from-profiles`** — Add auth + remove hardcoded password, or delete if migration complete (CRIT-009)

### Medium Priority (next sprint)
13. Replace all legacy `corsHeaders` with `getCorsHeaders(req)` (P2-001)
14. Fix `single()` → `maybeSingle()` in `create-portal-session`, `start-free-trial`, `delete-user`, `delete-organization` (P1-001/002)
15. Fix `check-credit-alerts` org membership bypass (P1-003)
16. Fix `grant-welcome-credits` idempotency (P1-004)
17. Fix O(n) `listUsers` in `invite-user` and `send-password-reset-email` (P1-005/006)
18. Replace `select('*')` in stripe product management functions (P2-003)
19. Fix `cleanup-incomplete-onboarding` service role key transmission (P1-008)
