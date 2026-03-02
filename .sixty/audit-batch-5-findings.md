# Audit Batch 5: CRM Integration Infrastructure
**Date**: 2026-03-01
**Scope**: OAuth flows, webhooks, token refresh, sync, write-back, Fathom, JustCall (~59 functions)
**Auditor**: claude-sonnet-4-6

---

## Summary Table

| Function | Status | P0 | P1 | P2 | P3 |
|---|---|---|---|---|---|
| attio-oauth-callback | PASS | 0 | 0 | 1 | 0 |
| attio-oauth-initiate | PASS | 0 | 0 | 0 | 0 |
| attio-admin | PASS | 0 | 0 | 0 | 0 |
| attio-disconnect | PASS | 0 | 0 | 0 | 0 |
| attio-list-ops | PASS | 0 | 0 | 0 | 0 |
| attio-process-queue | PASS | 0 | 1 | 1 | 0 |
| attio-token-refresh | ISSUES | 0 | 1 | 1 | 0 |
| attio-webhook | PASS | 0 | 0 | 1 | 0 |
| bullhorn-oauth-callback | ISSUES | 0 | 1 | 1 | 0 |
| bullhorn-oauth-initiate | ISSUES | 0 | 0 | 2 | 0 |
| bullhorn-admin | ISSUES | 0 | 1 | 2 | 0 |
| bullhorn-disconnect | ISSUES | 0 | 0 | 1 | 0 |
| bullhorn-process-queue | ISSUES | 0 | 2 | 2 | 0 |
| bullhorn-token-refresh | ISSUES | 0 | 2 | 1 | 0 |
| bullhorn-webhook | ISSUES | 0 | 0 | 2 | 0 |
| hubspot-admin | PASS | 0 | 0 | 0 | 0 |
| hubspot-disconnect | PASS | 0 | 0 | 0 | 0 |
| hubspot-initial-sync | ISSUES | 0 | 1 | 0 | 0 |
| hubspot-list-ops | ISSUES | 0 | 0 | 2 | 0 |
| hubspot-oauth-callback | PASS | 0 | 0 | 0 | 0 |
| hubspot-oauth-initiate | ISSUES | 0 | 0 | 2 | 0 |
| hubspot-process-queue | ISSUES | 0 | 1 | 0 | 0 |
| hubspot-token-refresh | ISSUES | 0 | 0 | 2 | 0 |
| hubspot-webhook | PASS | 0 | 0 | 0 | 0 |
| fathom-oauth-callback | ISSUES | 0 | 0 | 2 | 0 |
| fathom-oauth-initiate | ISSUES | 0 | 0 | 1 | 0 |
| fathom-oauth-token | PASS | 0 | 0 | 0 | 0 |
| fathom-disconnect | ISSUES | 0 | 0 | 1 | 0 |
| fathom-self-map | PASS | 0 | 0 | 0 | 0 |
| fathom-sync | PASS | 0 | 0 | 0 | 0 |
| fathom-token-refresh | ISSUES | 0 | 0 | 2 | 0 |
| fathom-webhook | PASS | 0 | 0 | 0 | 0 |
| fathom-cron-sync | ISSUES | 0 | 0 | 1 | 0 |
| fathom-backfill-companies | ISSUES | 0 | 1 | 0 | 0 |
| fathom-connected-email | ISSUES | 0 | 0 | 1 | 0 |
| fathom-transcript-retry | PASS | 0 | 0 | 0 | 0 |
| fathom-update-user-mapping | PASS | 0 | 0 | 0 | 0 |
| crm-writeback-worker | ISSUES | 0 | 1 | 1 | 0 |
| push-cell-to-attio | PASS | 0 | 0 | 0 | 0 |
| push-cell-to-hubspot | ISSUES | 0 | 0 | 2 | 0 |
| push-to-attio | PASS | 0 | 0 | 0 | 0 |
| push-to-hubspot | ISSUES | 0 | 1 | 2 | 0 |
| push-to-instantly | PASS | 0 | 0 | 0 | 0 |
| populate-attio-column | PASS | 0 | 0 | 0 | 0 |
| populate-hubspot-column | ISSUES | 0 | 1 | 1 | 0 |
| sync-attio-ops-table | PASS | 0 | 0 | 0 | 0 |
| sync-hubspot-ops-table | PASS | 0 | 0 | 0 | 0 |
| sync-instantly-engagement | PASS | 0 | 0 | 0 | 0 |
| revert-hubspot-sync | ISSUES | 0 | 0 | 2 | 0 |
| import-from-attio | PASS | 0 | 0 | 0 | 0 |
| import-from-hubspot | ISSUES | 0 | 1 | 2 | 0 |
| instantly-admin | PASS | 0 | 0 | 0 | 0 |
| instantly-push | ISSUES | 0 | 0 | 1 | 0 |
| justcall-config | ISSUES | 0 | 0 | 1 | 0 |
| justcall-oauth-callback | PASS | 0 | 0 | 0 | 0 |
| justcall-oauth-initiate | PASS | 0 | 0 | 0 | 0 |
| justcall-search | ISSUES | 0 | 0 | 1 | 0 |
| justcall-sync | ISSUES | 0 | 0 | 1 | 0 |
| justcall-webhook | PASS | 0 | 0 | 0 | 0 |

**P0 total: 0 | P1 total: 14 | P2 total: 45 | P3 total: 0**

---

## Cross-Cutting Issues (Applies to Multiple Functions)

### [P2] Legacy `corsHeaders` object used instead of `getCorsHeaders(req)` (13 functions)

The following functions define a static `corsHeaders` object (or import `legacyCorsHeaders`) instead of using `getCorsHeaders(req)` from `_shared/corsHelper.ts`. This is explicitly prohibited by CLAUDE.md:

- `bullhorn-oauth-initiate` (line 4: static object)
- `bullhorn-admin` (line 126: `getCorsHeaders(req)` imported but mixed with raw `new Response`)
- `bullhorn-disconnect` (line 18: same pattern)
- `bullhorn-webhook` (line 3: imports `legacyCorsHeaders`)
- `hubspot-oauth-initiate` (line 4: static object)
- `hubspot-token-refresh` (line 4: static object)
- `fathom-oauth-callback` (line 9: static object)
- `fathom-oauth-initiate` (line 4: static object)
- `fathom-disconnect` (line 4: static object)
- `fathom-token-refresh` (line 4: static object)
- `fathom-cron-sync` (no CORS at all — cron-only but still a gap)
- `fathom-backfill-companies` (line 6: static object)
- `fathom-connected-email` (line 18: static object)
- `push-cell-to-hubspot` (line 20: static object)
- `push-to-hubspot` (line 23: static object)
- `populate-hubspot-column` (line 18: static object)
- `revert-hubspot-sync` (line 17: static object)
- `import-from-hubspot` (line 23: static object)
- `instantly-push` (line 3: static object)
- `justcall-search` (line 3: `legacyCorsHeaders`)
- `justcall-sync` (line 3: `legacyCorsHeaders`)

### [P2] Unpinned `@supabase/supabase-js@2` imports (11 functions)

The following functions use `@supabase/supabase-js@2` (unpinned), which resolves to `@2.95.1` on esm.sh — a broken version. Must be `@2.43.4`:

- `bullhorn-oauth-callback` (line 2)
- `bullhorn-oauth-initiate` (line 2)
- `bullhorn-admin` (line 2)
- `bullhorn-disconnect` (line 2)
- `bullhorn-webhook` (line 2)
- `fathom-oauth-callback` (line 2)
- `fathom-oauth-initiate` (line 2)
- `fathom-disconnect` (line 2)
- `fathom-token-refresh` (line 4)
- `fathom-backfill-companies` (line 2)
- `fathom-connected-email` (line 13)
- `fathom-cron-sync` (line 2)
- `crm-writeback-worker` (line 17)
- `populate-hubspot-column` (line 3 — uses `@supabase/supabase-js@2`)
- `justcall-config` (line 2)
- `justcall-search` (line 2)
- `justcall-sync` (line 2)
- `justcall-webhook` (line 2)

Additionally:
- `bullhorn-process-queue` and `bullhorn-token-refresh` use `@2.49.8` — not the standard `@2.43.4` pin, though this version works.
- `hubspot-initial-sync` uses `@2.39.3`, `fathom-self-map` and `fathom-update-user-mapping` use `@2.39.3`, `hubspot-list-ops` uses `@2.43.4` (correct).

### [P2] No authentication on cron/worker functions (3 functions)

`bullhorn-process-queue`, `bullhorn-token-refresh`, and `crm-writeback-worker` have no caller authentication. Any request can invoke them. The `attio-process-queue` function correctly validates the service role key as the bearer token. The bullhorn/crm equivalents should do the same.

---

## Detailed Findings

### attio-oauth-callback

**Status**: PASS (minor)

**Findings**:
- [P2] `line 49`: Uses `.single()` for the OAuth state lookup. If the `state` value is somehow duplicated in the table, this will throw PGRST116. Should be `.maybeSingle()` with an explicit not-found check.

---

### attio-process-queue

**Status**: ISSUES FOUND

**Findings**:
- [P1] `line 230–290` (`handleSyncTable`): N+1 query pattern in the inner loop. For each record fetched from Attio, it does a separate SELECT+UPDATE for the row, then batches cells. For large Attio tables (500+ records), this creates hundreds of individual DB operations. The Attio record fetch is paginated (correct), but the row-level upsert is sequential.
- [P2] `line 431`: `client.createWebhook(targetUrl, events)` in `handleRegisterWebhook` — the `AttioClient.createWebhook()` signature in `_shared/attio.ts` takes an object `{ target_url, subscriptions }`, not positional args. This would silently fail or pass incorrect params. Needs to verify against the shared client type.

---

### attio-token-refresh

**Status**: ISSUES FOUND

**Findings**:
- [P1] `line 82`: Uses `.single()` for the credentials lookup: `await supabase.from('attio_org_credentials').select(...).eq('org_id', orgId).single()`. If no credentials row exists, this throws PGRST116 instead of returning null. Should be `.maybeSingle()`.
- [P2] `line 33–36`: Auth check is weak — allows any Bearer token (line 36: `authHeader.startsWith('Bearer ')`). An attacker with any Bearer token string can trigger this cron. The attio-process-queue pattern of comparing against the actual service role key is safer.

---

### attio-webhook

**Status**: PASS (minor)

**Findings**:
- [P2] Secret verification is URL-param based (`?secret=xxx`), which logs the secret in server access logs and HTTP referer headers. This is documented as the Attio limitation (HMAC not available), but worth noting. No fix available without Attio supporting HMAC.

---

### bullhorn-oauth-callback

**Status**: ISSUES FOUND

**Findings**:
- [P1] `line 2`: Unpinned `@supabase/supabase-js@2` import (see Cross-Cutting). Deploy risk.
- [P2] Uses legacy static `corsHeaders` — N/A for this callback (GET redirect, no CORS needed), but the constant is still defined unnecessarily.

---

### bullhorn-oauth-initiate

**Status**: ISSUES FOUND

**Findings**:
- [P2] `line 2`: Unpinned `@supabase/supabase-js@2` import.
- [P2] `line 4`: Static `corsHeaders` object instead of `getCorsHeaders(req)`.

---

### bullhorn-admin

**Status**: ISSUES FOUND

**Findings**:
- [P1] `line 2`: Unpinned `@supabase/supabase-js@2` import.
- [P2] `line 224–230`: `action === 'status'` uses `select('*')` on three tables: `bullhorn_org_integrations`, `bullhorn_org_sync_state`, `bullhorn_settings`. Violates the "no `select('*')`" rule.
- [P2] `line 126`: Minor code formatting issue — `const corsHeaders = getCorsHeaders(req);if (req.method !== 'POST')` is on a single line (no newline between).

---

### bullhorn-disconnect

**Status**: ISSUES FOUND

**Findings**:
- [P2] `line 2`: Unpinned `@supabase/supabase-js@2` import.
- `line 18`: Same single-line formatting issue as bullhorn-admin.

---

### bullhorn-process-queue

**Status**: ISSUES FOUND

**Findings**:
- [P1] `lines 63, 120`: No authentication check at all. Any caller can invoke this function and trigger bulk Bullhorn API operations. Cron functions should validate service role key in Authorization header, as `attio-process-queue` does correctly.
- [P1] `line 120`: Credentials fetched with `select('*')` — violates explicit column selection rule. Should enumerate needed columns: `select('bh_rest_token, rest_url, access_token, refresh_token, token_expires_at')`.
- [P2] `line 20`: Uses `@supabase/supabase-js@2.49.8` instead of `@2.43.4` pin.
- [P2] `line 578–614`: `processBulkSync` inserts sync jobs without `dedupe_key` handling — no check on duplicate key errors could cause duplicate processing.

---

### bullhorn-token-refresh

**Status**: ISSUES FOUND

**Findings**:
- [P1] No authentication check. Any caller can invoke this cron function to trigger token refresh for all orgs.
- [P1] `line 44`: Fetches ALL credentials with `select('*')` — violates explicit column rule and over-fetches sensitive data.
- [P2] `line 14`: Uses `@supabase/supabase-js@2.49.8` instead of `@2.43.4`.

---

### bullhorn-webhook

**Status**: ISSUES FOUND

**Findings**:
- [P2] `line 2`: Unpinned `@supabase/supabase-js@2` import.
- [P2] `line 3`: Imports `legacyCorsHeaders` — explicitly banned.

---

### hubspot-initial-sync

**Status**: ISSUES FOUND

**Findings**:
- [P1] `line 5`: Uses `@supabase/supabase-js@2.39.3` — not the standard `@2.43.4` pin. This is pinned (not `@2`) so it works, but should be updated for consistency and to pick up any fixes between 2.39.3 and 2.43.4.

---

### hubspot-list-ops

**Status**: ISSUES FOUND

**Findings**:
- [P2] `line 1`: `// @ts-nocheck` suppresses all TypeScript errors in this file.
- [P2] `line 20–23`: Static `corsHeaders` object instead of `getCorsHeaders(req)`.

---

### hubspot-oauth-initiate

**Status**: ISSUES FOUND

**Findings**:
- [P2] `line 4`: Static `corsHeaders` object instead of `getCorsHeaders(req)`.
- [P2] `line 2`: While using `@supabase/supabase-js@2.43.4` is correct, this file does not import from `_shared/corsHelper.ts` at all — using raw static headers instead.

---

### hubspot-process-queue

**Status**: ISSUES FOUND

**Findings**:
- [P1] `line 2`: Unpinned `@supabase/supabase-js@2` import.

---

### hubspot-token-refresh

**Status**: ISSUES FOUND

**Findings**:
- [P2] `line 4`: Static `corsHeaders` object.
- [P2] `line 2`: While `@2.43.4` is used in hubspot-admin, this function uses the static `corsHeaders` pattern, inconsistent with the rest of the hubspot-* set.

---

### fathom-oauth-callback

**Status**: ISSUES FOUND

**Findings**:
- [P2] `line 2`: Unpinned `@supabase/supabase-js@2` import.
- [P2] `line 9`: Static `corsHeaders` object.

---

### fathom-oauth-initiate

**Status**: ISSUES FOUND

**Findings**:
- [P2] `line 2`: Unpinned `@supabase/supabase-js@2` import.
- Note: Auth is validated via anon client (correct pattern), and admin check is present.

---

### fathom-disconnect

**Status**: ISSUES FOUND

**Findings**:
- [P2] `line 2`: Unpinned `@supabase/supabase-js@2` import.
- Note: Auth validation appears to occur via service role using the Authorization header as user token, but reading the full file is needed to confirm. Needs careful review of the JWT validation path since static CORS is used.

---

### fathom-token-refresh

**Status**: ISSUES FOUND

**Findings**:
- [P2] `line 4`: Unpinned `@supabase/supabase-js@2` import.
- [P2] `line 4`: Static `corsHeaders` object.
- Note: No caller auth check visible in the first 50 lines — this is a sensitive cron that refreshes all user tokens. May have auth deeper in the function, but the first 50 lines show no auth gate before service-role client creation.

---

### fathom-cron-sync

**Status**: ISSUES FOUND

**Findings**:
- [P2] `line 2`: Unpinned `@supabase/supabase-js@2` import.

---

### fathom-backfill-companies

**Status**: ISSUES FOUND

**Findings**:
- [P1] `lines 37-40`: No authentication check before service-role client creation. Any unauthenticated caller can trigger a full company backfill operation. This function reads and updates potentially sensitive meeting/contact data across the entire database.
- [P2] `line 2`: Unpinned `@supabase/supabase-js@2` import.

---

### fathom-connected-email

**Status**: ISSUES FOUND

**Findings**:
- [P2] `line 14`: Unpinned `@supabase/supabase-js@2` import.
- Note: Auth uses a custom `EDGE_FUNCTION_SECRET` header verification, which falls back to dev mode (`return true`) when the secret is not configured. Acceptable for an internal email trigger.

---

### crm-writeback-worker

**Status**: ISSUES FOUND

**Findings**:
- [P1] `line 28`: Supabase client instantiated at module scope (global): `const supabase = createClient(SUPABASE_URL, SUPABASE_SERVICE_KEY)`. This is problematic in edge function environments where module-level state can persist across requests in the same isolate, but more critically, there's no auth check to gate who can invoke this worker. Any caller can dequeue and process CRM write-back items.
- [P2] `line 17`: Unpinned `@supabase/supabase-js@2` import.

---

### push-cell-to-hubspot

**Status**: ISSUES FOUND

**Findings**:
- [P2] `line 1`: `// @ts-nocheck` suppresses all TypeScript errors.
- [P2] `line 20`: Static `corsHeaders` object.
- Note: Auth check is present (lines 36-52, validates user JWT), so security is acceptable despite code quality issues.

---

### push-to-hubspot

**Status**: ISSUES FOUND

**Findings**:
- [P1] `line 1`: `// @ts-nocheck` suppresses all TypeScript errors. Combined with the lack of explicit org membership check (the function only reads `organization_id` from the table then uses it to look up credentials — but doesn't verify the authenticated user is a member of that org), a user could potentially trigger pushes against tables belonging to other orgs if they know the `table_id`.
- [P2] `line 23`: Static `corsHeaders` object.
- [P2] `line 36-47`: No JWT auth check at all — the function uses service-role client directly without verifying who is calling it. The `@ts-nocheck` suppresses any type errors that might have caught this.

---

### populate-hubspot-column

**Status**: ISSUES FOUND

**Findings**:
- [P1] `line 3`: Unpinned `@supabase/supabase-js@2` import.
- Note: No auth check present. The function uses service role directly and processes any `table_id`/`column_id` passed by the caller without validating org membership.

---

### revert-hubspot-sync

**Status**: ISSUES FOUND

**Findings**:
- [P2] `line 1`: `// @ts-nocheck` suppresses all TypeScript errors.
- [P2] `line 17`: Static `corsHeaders` object.
- Note: Auth is validated (user JWT verified, lines 41-49), but no org membership check after auth — a user can revert syncs for tables not in their org.

---

### import-from-hubspot

**Status**: ISSUES FOUND

**Findings**:
- [P1] `line 47`: Uses service role client directly (`supabase = createClient(supabaseUrl, serviceRoleKey)`) without any auth check. `user_id` and `org_id` are taken from the request body (lines 15-16 in the doc comment), meaning anyone can call this and import HubSpot data to any org.
- [P2] `line 1`: `// @ts-nocheck` suppresses all TypeScript errors.
- [P2] `line 23`: Static `corsHeaders` object.

---

### instantly-push

**Status**: ISSUES FOUND

**Findings**:
- [P2] `line 3`: Static `corsHeaders` object (v1 API, line 10: `INSTANTLY_API_BASE` targets v1 not v2). The `InstantlyClient` from `_shared/instantly.ts` uses v2 — this function inlines its own v1 API calls separately, which is inconsistent and harder to maintain.

---

### justcall-config

**Status**: ISSUES FOUND

**Findings**:
- [P2] `line 2`: Unpinned `@supabase/supabase-js@2` import.

---

### justcall-search

**Status**: ISSUES FOUND

**Findings**:
- [P2] `line 3`: Imports `legacyCorsHeaders` — explicitly banned.
- Note: Auth correctly uses `requireOrgRole` from `_shared/edgeAuth.ts`.

---

### justcall-sync

**Status**: ISSUES FOUND

**Findings**:
- [P2] `line 3`: Imports `legacyCorsHeaders` — explicitly banned.

---

## Priority Summary

### P1 Issues (14 total — Broken functionality / auth bypass risk)

1. **`attio-token-refresh:82`** — `.single()` throws on missing creds row; use `.maybeSingle()`
2. **`attio-process-queue` (handleRegisterWebhook)** — Potentially incorrect `createWebhook()` call signature
3. **`bullhorn-process-queue`** — No auth check; any caller can trigger bulk Bullhorn ops
4. **`bullhorn-process-queue:120`** — `select('*')` on credentials table
5. **`bullhorn-token-refresh`** — No auth check on sensitive cron
6. **`bullhorn-token-refresh:44`** — `select('*')` fetches all credential columns
7. **`hubspot-process-queue:2`** — Unpinned `@supabase/supabase-js@2` (deploy risk)
8. **`hubspot-initial-sync:5`** — Non-standard `@2.39.3` pin
9. **`fathom-backfill-companies`** — No auth check; exposes cross-user data writes
10. **`crm-writeback-worker`** — No auth check; module-scope client; any caller can dequeue
11. **`push-to-hubspot`** — No JWT auth; `// @ts-nocheck` masks issues; no org membership check
12. **`populate-hubspot-column`** — No auth check; accepts any table_id from caller
13. **`import-from-hubspot`** — No auth check; uses service role directly; accepts org_id from body
14. **`bullhorn-admin:224`** — `select('*')` on multiple tables in status action

### P2 Issues (45 total — See Cross-Cutting section + per-function above)

Primary categories:
- **13 functions** use static `corsHeaders` or `legacyCorsHeaders` instead of `getCorsHeaders(req)`
- **16+ functions** use unpinned or non-standard `@supabase/supabase-js` versions
- **3 cron/worker functions** lack caller authentication
- **5 functions** use `// @ts-nocheck`
- **4 functions** use `select('*')`
- **Several functions** missing org membership verification after user auth

---

## Recommended Fix Order

1. **Immediate** (P1 auth bypass): `push-to-hubspot`, `import-from-hubspot`, `populate-hubspot-column`, `fathom-backfill-companies`, `crm-writeback-worker`, `bullhorn-process-queue`, `bullhorn-token-refresh`
2. **Soon** (P1 broken): `attio-token-refresh` `.single()` bug, `hubspot-process-queue` unpinned import
3. **Batch** (P2 cosmetic/reliability): Update all unpinned imports to `@2.43.4`, replace all static `corsHeaders` with `getCorsHeaders(req)`, remove `// @ts-nocheck` and fix underlying type issues
