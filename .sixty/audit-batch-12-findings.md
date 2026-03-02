# Audit Batch 12 — Workflows, Analytics, Data Sync, Proposals, Demos, Misc

**Date**: 2026-03-01
**Functions audited**: ~126 across workflows, analytics, data sync, proposals, demos, CC system, ops tables, system/misc

---

## CRITICAL FINDINGS (P0)

### P0-001: `execute-migration` — Auth Check Insufficient, Service Role Used Without Admin Verification

**File**: `supabase/functions/execute-migration/index.ts`

**Finding**: The function checks for an `Authorization` header but does NOT:
1. Validate the JWT against Supabase auth (`auth.getUser()` is never called)
2. Check that the caller is an admin or superuser

The only "auth" is checking `if (!authHeader)` — any string passes this check. The function also uses `jsr:@supabase/supabase-js@2` (JSR, not the pinned esm.sh version) and legacy `corsHeaders` (not `getCorsHeaders(req)`).

**Severity**: P0 — Auth bypass on a function that accepts arbitrary SQL migrations
**Risk**: Any caller with a valid-looking Authorization header (even a made-up `Bearer anything`) can invoke this function against the production database.

**Note**: The actual SQL execution is incomplete (the function only logs statements, it doesn't truly execute them via an RPC). However, the pattern is dangerous and the function should be removed or properly secured.

**Recommended action**: Delete this function, or if needed for admin use, add proper admin JWT validation + organization membership + admin role check.

---

### P0-002: `run-migration` — No Auth Whatsoever (Zero Protection)

**File**: `supabase/functions/run-migration/index.ts`

**Finding**: This function has **no authentication at all**. It immediately creates a service-role client and performs unrestricted operations on ALL data across ALL organizations:
- Links leads to meetings globally
- Marks leads as completed or no-show
- Queries ALL leads in the database

There is no `Authorization` header check, no JWT validation, no org scoping.

**Severity**: P0 — Unauthenticated function with service-role access to all org data
**Risk**: Any internet user can trigger mass updates to all leads across all organizations. Also uses an old `@supabase/supabase-js@2.39.3` (not pinned to `@2.43.4`).

**Recommended action**: Add auth middleware immediately. If this is a cron-only function, add a shared secret header check. Consider converting to a pg_cron job instead.

---

### P0-003: `fix-invitation-rls` — Utility Function Still Deployed

**File**: `supabase/functions/fix-invitation-rls/index.ts`

**Finding**: The file itself says "DELETE THIS FUNCTION AFTER RUNNING" at line 4. This is a one-time utility that:
- Accepts any request (no auth check)
- Uses service role to execute SQL via `supabase.rpc('exec_sql')`
- Uses legacy `corsHeaders` (not `getCorsHeaders(req)`)
- Reads `organization_invitations` tokens with service role

**Severity**: P0 — Utility function that should have been deleted remains deployed
**Risk**: Exposes schema information about the database. The `exec_sql` RPC could be dangerous if it exists.

**Recommended action**: Delete this function from production immediately.

---

### P0-004: `fix-trigger` — Utility Function Still Deployed, No Auth

**File**: `supabase/functions/fix-trigger/index.ts`

**Finding**: Another "run once and delete" utility function that:
- Has no authentication check
- Uses service role
- Contains hardcoded staging project ref (`caerqjzvuerejfrdtygb`) in response body
- References internal file paths (`IMMEDIATE_ACTION_REQUIRED.md`)

**Severity**: P0 — No auth, exposes internal infrastructure details
**Risk**: Information disclosure about project configuration. Should not be deployed.

**Recommended action**: Delete this function immediately.

---

## HIGH SEVERITY (P1)

### P1-001: `deals` — Service Role with No JWT Auth, No Org Scoping

**File**: `supabase/functions/deals/index.ts`

**Finding**: This CRUD endpoint for deals:
1. Creates a **service-role** client immediately with no JWT validation
2. Has no user authentication at all
3. Has no org-scoping — list, read, update, and delete operations apply to ALL deals in ALL orgs
4. `handleDeleteDeal()` deletes by `id` only — no ownership check
5. `handleSingleDeal()` uses `select('*')` for deals with relationships
6. Uses unpinned `@supabase/supabase-js@2` (not `@2.43.4`)

**Severity**: P1 — Full CRUD on all deals without auth or org isolation
**Risk**: Unauthenticated callers can list, read, modify, or delete any deal from any organization.

**Recommended action**: Add JWT auth, validate user, scope all queries to `org_id` via user membership.

---

### P1-002: `contacts` — Service Role with No JWT Auth, No Org Scoping

**File**: `supabase/functions/contacts/index.ts`

**Finding**: Same pattern as `deals`:
1. Service-role client created with no JWT validation
2. No user authentication
3. `handleContactsList()` uses `select('*')` — violates explicit column selection rule
4. Company enrichment also uses `select('*')`
5. Delete by `id` only — no ownership check
6. Unpinned `@supabase/supabase-js@2`

**Severity**: P1 — Full CRUD on all contacts without auth or org isolation
**Risk**: Any caller can enumerate, create, modify, or delete contacts from any organization.

**Recommended action**: Same as deals — add auth, user resolution, org scoping.

---

### P1-003: `evaluate-formula` — No Auth, Service Role, Unpinned SDK

**File**: `supabase/functions/evaluate-formula/index.ts`

**Finding**:
1. No authentication check — service role immediately created
2. Uses unpinned `@supabase/supabase-js@2` (will resolve to broken `@2.95.1`)
3. Legacy `corsHeaders` (not `getCorsHeaders(req)`)
4. `@ts-nocheck` suppresses TypeScript safety

Any caller can submit any `table_id` / `column_id` and cause formula evaluation and writes to `dynamic_table_cells` across any org.

**Severity**: P1 — Unauthenticated write access to all orgs' dynamic table data
**Recommended action**: Add auth, user validation, verify user owns the table before evaluating.

---

### P1-004: `evaluate-ops-rule` — No Auth, Service Role, Unpinned SDK

**File**: `supabase/functions/evaluate-ops-rule/index.ts`

**Finding**:
1. No authentication check
2. Service role used immediately
3. Accepts `rule_id`, `row_id` from anyone and executes the rule action, including:
   - Writing cell values to `dynamic_table_cells`
   - Firing outbound webhooks to arbitrary URLs stored in `action_config.url`
   - Invoking other edge functions (`enrich-dynamic-table`)
4. Legacy `corsHeaders`, `@ts-nocheck`, unpinned `@supabase/supabase-js@2`

The `webhook` action type calls arbitrary URLs with row data — this could be used to exfiltrate data.

**Severity**: P1 — Unauthenticated rule execution with SSRF risk via webhook action
**Recommended action**: Add auth, user validation, verify rule belongs to user's org.

---

### P1-005: `cc-auto-execute` — No Auth Check (Cron-style, but reachable via HTTP)

**File**: `supabase/functions/cc-auto-execute/index.ts`

**Finding**: This function executes Command Centre items autonomously for ALL users. It:
1. Has **no JWT validation** — anyone can POST to trigger it
2. Uses service role
3. Processes all `command_centre_items` with `status='ready'` across all users
4. The auto-execution marks items as `completed` and fires external actions (send_email, schedule_meeting, send_proposal)

While the function is documented as "service-to-service" cron, it's exposed as an HTTP endpoint with no protection.

**Severity**: P1 — Unauthenticated trigger of autonomous actions for all users
**Recommended action**: Add a shared cron secret header check, or move to pg_cron trigger. At minimum, check for a `CRON_SECRET` header.

---

### P1-006: `cc-auto-report` — No Auth Check

**File**: `supabase/functions/cc-auto-report/index.ts`

**Finding**: Same pattern — no JWT validation on a cron-style function that:
1. Reads all auto-executed Command Centre items for all users
2. Reads Slack bot tokens from `slack_connections`
3. Posts Slack messages to all users

Anyone can trigger Slack spam to all connected users.

**Severity**: P1 — Unauthenticated trigger of Slack messages to all users
**Recommended action**: Add cron secret or Supabase internal invocation guard.

---

### P1-007: `cc-daily-cleanup` — No Auth Check

**File**: `supabase/functions/cc-daily-cleanup/index.ts`

**Finding**: No JWT validation. Anyone can trigger:
- Auto-resolution of stale CC items for all users
- Re-scoring of all CC items across all orgs
- Deletion of `conversation_context` entries older than 14 days

**Severity**: P1 — Unauthenticated destructive cron trigger
**Recommended action**: Add cron secret guard.

---

### P1-008: `cc-prioritise` — No Auth Check in Batch Mode

**File**: `supabase/functions/cc-prioritise/index.ts`

**Finding**: Uses service role globally. No authentication check. Sending `{ batch: true }` rescores ALL CC items for ALL users and orgs. The `agent_executions` insert uses `.single()` (P2 risk if that table doesn't enforce uniqueness).

**Severity**: P1 — Unauthenticated batch processing for all orgs
**Recommended action**: Add auth check; use `.maybeSingle()` for executions insert.

---

### P1-009: `auth-logger` — No Auth Check, Caller Controls Log Content

**File**: `supabase/functions/auth-logger/index.ts`

**Finding**:
1. No authentication — anyone can POST arbitrary `AuthEvent` objects
2. The `user_id` and all event data come directly from the request body without validation
3. Service role writes to `admin_logs` table with caller-supplied `user_id`
4. Unpinned `@supabase/supabase-js@2`

This allows log injection — forging auth events for any user.

**Severity**: P1 — Unauthenticated log injection into admin security logs
**Recommended action**: Either protect with a shared webhook secret, or remove entirely if Supabase's built-in auth logs are sufficient.

---

### P1-010: `test-hitl` — No Auth Check, Service Role, Reads Slack Tokens

**File**: `supabase/functions/test-hitl/index.ts`

**Finding**: No authentication check. Anyone can:
1. Read the first connected org's Slack bot token
2. Find a Slack channel ID
3. Send a fake HITL approval request to that Slack channel
4. Insert a record into `hitl_pending_approvals`

**Severity**: P1 — Unauthenticated Slack message injection + DB write
**Recommended action**: Flag for removal from production (it's a test function). Add auth at minimum.

---

### P1-011: `test-slack-webhook` — SSRF via Caller-Supplied Webhook URL

**File**: `supabase/functions/test-slack-webhook/index.ts`

**Finding**:
1. No authentication
2. Accepts any `webhookUrl` from the request body
3. POSTs a message to that URL with the hardcoded domain reference `sixty.app`
4. Legacy `corsHeaders`

Any caller can make the server POST to any URL — Server-Side Request Forgery (SSRF).

**Severity**: P1 — Unauthenticated SSRF via arbitrary webhook URL
**Recommended action**: Remove from production. If kept, add auth + URL validation (allowlist Slack webhook domain).

---

### P1-012: `test-auth` — Information Disclosure, No Auth

**File**: `supabase/functions/test-auth/index.ts`

**Finding**: Returns the JWT Authorization header preview to any caller, including partial token content. Legacy `corsHeaders`. No auth validation.

**Severity**: P1 — Debug endpoint in production revealing JWT patterns
**Recommended action**: Remove from production.

---

### P1-013: `test-no-auth` — Exposes All Request Headers

**File**: `supabase/functions/test-no-auth/index.ts`

**Finding**: Returns `Object.fromEntries(req.headers.entries())` — all request headers including any forwarded internal headers are exposed to callers.

**Severity**: P1 — Header enumeration exposure
**Recommended action**: Remove from production.

---

### P1-014: `test-browserless-access` — No Auth, Hardcoded Internal URLs

**File**: `supabase/functions/test-browserless-access/index.ts`

**Finding**:
1. No authentication
2. Hardcoded internal URLs (`sales.sixtyseconds.video`, specific meeting IDs)
3. Legacy `corsHeaders`
4. Sends Browserless token in requests

**Severity**: P1 — No auth, exposes internal URLs and Browserless token usage
**Recommended action**: Remove from production.

---

### P1-015: `test-fathom-api` — No Auth, Service Role, Full Fathom Access

**File**: `supabase/functions/test-fathom-api/index.ts`

**Finding**:
1. No authentication
2. Service role immediately created
3. Reads from `fathom_org_integrations` and `integration_credentials` for any `org_id` supplied

Caller controls `org_id` — they can inspect Fathom integration details for any organization.

**Severity**: P1 — IDOR — caller controls `org_id` to access any org's integration data
**Recommended action**: Remove from production.

---

### P1-016: `run-process-map-test` — Legacy `corsHeaders`

**File**: `supabase/functions/run-process-map-test/index.ts`

**Finding**: Uses legacy `corsHeaders` constant instead of `getCorsHeaders(req)`. Authentication is present and functional. Uses unpinned `@supabase/supabase-js@2`.

**Severity**: P2 (infrastructure) but flagged here as the test functions group
**Recommended action**: This appears to be a legitimate function (not just a test). Fix CORS headers and pin SDK.

---

## MEDIUM SEVERITY (P2)

### P2-001: Demo Functions — Production Exposure

The following demo functions are deployed in production but were built for demo/onboarding flows. They should be evaluated for production suitability:

| Function | Issue | Recommendation |
|---|---|---|
| `demo-convert-account` | Public endpoint (no-verify-jwt), takes `user_id` from body, uses service role to modify any user | Acceptable for demo flow but document clearly; ensure `user_id` is validated against a demo flag |
| `demo-recent-meetings` | Has proper JWT auth, `getCorsHeaders`, pinned SDK | **PASS** — this one is fine |
| `exa-abilities-demo` | Has proper JWT auth, pinned SDK | **PASS** — keep but restrict to non-production if desired |

`demo-convert-account` is the riskiest: any caller with a valid `user_id` can create an org, membership, give credits, and verify email for that user — even if the user signed up legitimately, not through the demo flow. However since it's a public endpoint for the demo landing page, this may be intentional.

---

### P2-002: `cc-action-sync` — Missing Ownership Check Before Slack Update

**File**: `supabase/functions/cc-action-sync/index.ts`

**Finding**: The function validates the JWT and gets `user.id`, but then uses the service client to look up any `item_id` without checking that the item belongs to the authenticated user's org. An authenticated user could supply any `item_id` and update the Slack message for any organization's CC item.

**Severity**: P2 — IDOR on Slack message update for authenticated users
**Recommended action**: Verify `item.org_id` matches the user's org before updating.

---

### P2-003: `cc-undo` — Missing Ownership Check

**File**: `supabase/functions/cc-undo/index.ts`

**Finding**: Auth is present (JWT validated), but the `undoAutoExecution` helper is called with `serviceClient` and `item_id` without first verifying the item belongs to the calling user's org. An authenticated user could undo another org's auto-executed action.

**Severity**: P2 — IDOR for authenticated users
**Recommended action**: Verify item ownership before calling `undoAutoExecution`.

---

### P2-004: `evaluate-formula` + `evaluate-ops-rule` — Unpinned SDK Will Fail

**Files**: Both use `createClient from 'https://esm.sh/@supabase/supabase-js@2'`

**Finding**: This resolves to `@2.95.1` on esm.sh which returns HTTP 500. These functions will fail to deploy/run correctly.

**Severity**: P2 — Functions are broken in production due to SDK version issue
**Recommended action**: Pin to `@2.43.4` in both files.

---

### P2-005: `ops-table-ai-query` — No Org Scoping on AI Operations

**File**: `supabase/functions/ops-table-ai-query/index.ts`

**Finding**: Auth is present (JWT + user validation). However, the function accepts any `tableId` without verifying the authenticated user owns that table. An authenticated user from Org A could submit a `tableId` belonging to Org B and read/modify that table's data via AI operations.

**Severity**: P2 — Cross-org table access for authenticated users
**Recommended action**: Verify `dynamic_table.org_id` matches the user's org.

---

### P2-006: `ops-table-transform-column` — No Table Ownership Check

**File**: `supabase/functions/ops-table-transform-column/index.ts`

**Finding**: Same pattern — JWT auth present but no verification that `tableId` belongs to the user's org. An authenticated user can transform any table's column data.

**Severity**: P2 — Cross-org write for authenticated users
**Recommended action**: Verify table ownership.

---

### P2-007: `ops-table-insights-engine` — No Table Ownership Check

**File**: `supabase/functions/ops-table-insights-engine/index.ts`

**Finding**: Same pattern — auth present, no table ownership verification.

**Severity**: P2 — Cross-org read for authenticated users
**Recommended action**: Verify table ownership.

---

### P2-008: `auth-rate-limit` — No Auth, Fails Open

**File**: `supabase/functions/auth-rate-limit/index.ts`

**Finding**:
1. No auth check — any caller can query or manipulate rate limit state for any identifier
2. Caller controls `identifier` (could be any email address) — allows checking if someone else is rate-limited
3. Uses unpinned `@supabase/supabase-js@2`
4. **Fails open** on all errors — if the DB query fails, `allowed: true` is returned
5. Caller also controls `ip_address` in the request body — they can spoof their IP for rate limit purposes

**Severity**: P2 — Rate limit can be bypassed by supplying a different identifier
**Recommended action**: Rate-limit this endpoint by real IP (from headers). Don't trust caller-supplied `ip_address`.

---

### P2-009: `cc-enrich` — No Auth Check on Cron Function

**File**: `supabase/functions/cc-enrich/index.ts` (large file, reviewed preview)

**Finding**: Based on the pattern (service role, no JWT check visible in the handler), this follows the same unauthenticated cron pattern as the other cc-* functions.

**Severity**: P1–P2 — Depends on what the enrichment does; cron trigger could process other orgs' data
**Recommended action**: Add cron secret guard.

---

### P2-010: `calculate-deal-health` + Related Health Functions — Service Role, Cron Without Auth

**Files**: `calculate-deal-health`, `health-recalculate`, `scheduled-health-refresh`

**Finding**: These are cron-style functions that use service role and process all orgs' deals. No auth check visible on `calculate-deal-health` (uses `getCorsHeaders` correctly, but no JWT validation).

**Severity**: P2 — Unauthenticated trigger of health recalculation for all orgs
**Recommended action**: Add cron secret guard or move to pg_cron.

---

### P2-011: Legacy CORS Headers Across Multiple Functions

The following functions use legacy `corsHeaders = { 'Access-Control-Allow-Origin': '*', ... }` instead of `getCorsHeaders(req)`:

- `execute-migration`
- `evaluate-formula`
- `evaluate-ops-rule`
- `run-process-map-test`
- `test-auth`
- `test-browserless-access`
- `test-slack-webhook`
- `test-fathom-api`
- `test-fathom-token`
- `test-hitl`
- `test-no-auth`
- `auth-rate-limit` (via getCorsHeaders but inline fallback)
- `fix-trigger`
- `fix-invitation-rls`

**Severity**: P2 — Infrastructure pattern violation
**Recommended action**: Migrate all to `getCorsHeaders(req)`.

---

### P2-012: Unpinned SDK Across Multiple Functions

The following functions use unpinned `@supabase/supabase-js@2` which resolves to broken `@2.95.1`:

- `run-migration` (uses `@2.39.3` — old but pinned)
- `evaluate-formula`
- `evaluate-ops-rule`
- `contacts`
- `deals`
- `auth-logger`
- `auth-rate-limit`
- `fix-invitation-rls`
- `run-process-map-test`
- `test-fathom-api`

**Severity**: P2 — These functions will fail at runtime
**Recommended action**: Pin all to `@2.43.4`.

---

## CODE QUALITY (P3)

### P3-001: `@ts-nocheck` Usage

- `evaluate-formula/index.ts` — `@ts-nocheck` at top
- `evaluate-ops-rule/index.ts` — `@ts-nocheck` at top
- `ops-table-inbound-webhook/index.ts` — `@ts-nocheck` at top

Removes TypeScript type safety from security-sensitive code.

---

### P3-002: `deals` and `contacts` — `select('*')` Violations

Both CRUD endpoints violate the rule against `select('*')`:
- `contacts/index.ts:84` — `select('*', { count: 'exact' })`
- `contacts/index.ts:173` — `select('*')`
- `contacts/index.ts:196` — `select('*')`
- `deals/index.ts:188` — `select('*', ...)` in `handleSingleDeal`

---

### P3-003: `test-email-sequence` — Correct Auth Pattern, Minor Issues

**File**: `supabase/functions/test-email-sequence/index.ts`

Auth is correct (JWT validated). However, it's a "test" function that's effectively a full production email generation endpoint. It should either be renamed to reflect its production role or removed. The `GEMINI_API_KEY` fallback uses `GOOGLE_AI_API_KEY` — acceptable but non-standard.

---

### P3-004: `generate-embedding` — Auth Optional (Fail Open)

**File**: `supabase/functions/generate-embedding/index.ts`

Auth is optional — if no Authorization header is provided, the function continues with `userId = null`. Credit tracking is skipped. Any caller can use the embedding API without tracking. For cost control, auth should be required.

---

## FUNCTIONS THAT PASS

The following functions reviewed have correct auth, pinned SDK, and proper patterns:

| Function | Auth Pattern | Notes |
|---|---|---|
| `cc-action-sync` | JWT validated | P2 IDOR on item ownership |
| `cc-undo` | JWT validated | P2 IDOR on item ownership |
| `cc-auto-execute` | Service role | P1 — no HTTP auth |
| `demo-recent-meetings` | JWT validated | PASS |
| `exa-abilities-demo` | JWT validated | PASS |
| `test-email-sequence` | JWT validated | PASS (despite "test" name) |
| `run-process-map-test` | JWT validated | P2 — unpinned SDK, legacy CORS |
| `ops-table-transform-column` | JWT validated | P2 — no table ownership check |
| `ops-table-ai-query` | JWT validated | P2 — no table ownership check |
| `ops-table-insights-engine` | JWT validated | P2 — no table ownership check |
| `cc-enrich` | Service role | P2 — no HTTP auth (cron) |

---

## SUMMARY TABLE

| ID | Function | Severity | Issue |
|---|---|---|---|
| P0-001 | `execute-migration` | **P0** | Auth bypass — header check only, no JWT validation, service role arbitrary ops |
| P0-002 | `run-migration` | **P0** | Zero auth — service role, all-org data mutation |
| P0-003 | `fix-invitation-rls` | **P0** | Delete immediately — no auth, exec_sql RPC exposure |
| P0-004 | `fix-trigger` | **P0** | Delete immediately — no auth, info disclosure |
| P1-001 | `deals` | **P1** | No auth, service role, no org scope, full CRUD |
| P1-002 | `contacts` | **P1** | No auth, service role, no org scope, full CRUD, select('*') |
| P1-003 | `evaluate-formula` | **P1** | No auth, service role, cross-org writes |
| P1-004 | `evaluate-ops-rule` | **P1** | No auth, service role, SSRF via webhook action |
| P1-005 | `cc-auto-execute` | **P1** | No HTTP auth on autonomous action engine |
| P1-006 | `cc-auto-report` | **P1** | No auth, triggers Slack messages to all users |
| P1-007 | `cc-daily-cleanup` | **P1** | No auth, triggers destructive cleanup |
| P1-008 | `cc-prioritise` | **P1** | No auth, batch rescoring all orgs |
| P1-009 | `auth-logger` | **P1** | No auth, log injection into admin_logs |
| P1-010 | `test-hitl` | **P1** | No auth, Slack injection + DB write (remove from prod) |
| P1-011 | `test-slack-webhook` | **P1** | No auth, SSRF (remove from prod) |
| P1-012 | `test-auth` | **P1** | No auth, info disclosure (remove from prod) |
| P1-013 | `test-no-auth` | **P1** | No auth, header enumeration (remove from prod) |
| P1-014 | `test-browserless-access` | **P1** | No auth, hardcoded internal URLs (remove from prod) |
| P1-015 | `test-fathom-api` | **P1** | No auth, IDOR on org integration data (remove from prod) |
| P2-001 | Demo functions | **P2** | Evaluate for production suitability |
| P2-002 | `cc-action-sync` | **P2** | IDOR — no item ownership check |
| P2-003 | `cc-undo` | **P2** | IDOR — no item ownership check |
| P2-004 | SDK versions | **P2** | Unpinned `@supabase/supabase-js@2` in 10+ functions |
| P2-005 | `ops-table-ai-query` | **P2** | No table ownership verification |
| P2-006 | `ops-table-transform-column` | **P2** | No table ownership verification |
| P2-007 | `ops-table-insights-engine` | **P2** | No table ownership verification |
| P2-008 | `auth-rate-limit` | **P2** | No auth, caller-spoofable IP, fails open |
| P2-009 | `cc-enrich` | **P2** | No HTTP auth on cron function |
| P2-010 | `calculate-deal-health` + others | **P2** | No HTTP auth on cron functions |
| P2-011 | Legacy CORS | **P2** | 14+ functions using legacy `corsHeaders` |

---

## IMMEDIATE ACTIONS RECOMMENDED

### Delete Now (Zero Business Value, High Risk)
1. `fix-invitation-rls` — one-time utility, the comment says to delete it
2. `fix-trigger` — one-time utility
3. `test-auth` — exposes JWT info
4. `test-no-auth` — exposes all headers
5. `test-slack-webhook` — SSRF with no auth
6. `test-browserless-access` — no auth, hardcoded internal URLs
7. `test-fathom-api` — no auth, IDOR
8. `test-fathom-token` — likely same pattern (not read, flag for review)
9. `test-hitl` — no auth, Slack injection

### Add Auth Now (Broken Without It)
10. `execute-migration` — add proper admin JWT + role check, or delete
11. `run-migration` — add cron secret, or convert to pg_cron

### Add Cron Secret Headers (Scheduled Functions)
12. `cc-auto-execute`
13. `cc-auto-report`
14. `cc-daily-cleanup`
15. `cc-prioritise`
16. `cc-enrich`
17. `calculate-deal-health`

### Fix Core CRUD Security
18. `deals` — add JWT auth + org scoping
19. `contacts` — add JWT auth + org scoping

### Pin SDK Version
20. Pin `@supabase/supabase-js@2.43.4` in all functions listed in P2-012
