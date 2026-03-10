# PRD: Nylas Integration Verification & Hardening

## Introduction

The Nylas v3 integration for Google Gmail (restricted scopes) was recently implemented with a two-tier model: free (direct Google — send, labels, calendar) and paid (Nylas — email read + drafts). This PRD covers end-to-end verification, a user-facing test harness, full Google operation coverage through Nylas, and webhook-based sync/monitoring to ensure the integration is production-ready and observable.

## Goals

- Validate every Nylas API operation works correctly against real Google grants
- Give both developers (Platform Admin) and end users (Integrations page) a way to test their connection with structured pass/fail results
- Ensure all Google email operations route correctly through the Nylas proxy path
- Implement webhook-based grant monitoring so stale/revoked grants are detected automatically
- Eliminate silent failures — every integration issue surfaces to the user or admin

## User Stories

### US-001: Nylas Health Check Edge Function
**Description:** As a developer, I want a `nylas-health-check` edge function that runs diagnostic API calls against a user's Nylas grant so that I can verify the integration works end-to-end.

**Acceptance Criteria:**
- [ ] New edge function `nylas-health-check/index.ts` created
- [ ] Accepts `user_id` param (admin mode) or uses JWT auth (user mode)
- [ ] Runs sequential checks: grant exists in DB, grant valid with Nylas API (`GET /v3/grants/{grant_id}`), list messages (`GET /v3/grants/{grant_id}/messages?limit=1`), create draft (`POST /v3/grants/{grant_id}/drafts` with test subject, immediately deleted), verify labels/folders access
- [ ] Returns structured JSON: `{ checks: [{ name, status: 'pass'|'fail'|'skip', latency_ms, error? }], overall: 'pass'|'partial'|'fail' }`
- [ ] Handles missing grant gracefully (returns `skip` for API checks)
- [ ] Uses `getCorsHeaders(req)` from `_shared/corsHelper.ts`
- [ ] Typecheck passes

### US-002: Platform Admin Integration Test Page
**Description:** As a platform admin, I want a test page in the admin area where I can run Nylas health checks against any user so that I can diagnose integration issues.

**Acceptance Criteria:**
- [ ] New admin page or section accessible from Platform Admin menu
- [ ] User search/select input to pick a user to test
- [ ] "Run Tests" button that calls `nylas-health-check` with the selected user_id
- [ ] Results displayed as a checklist with pass/fail icons (Lucide), latency, and error details
- [ ] Shows user's current `scope_tier`, `nylas_integrations` status, and `google_integrations` status
- [ ] Typecheck passes
- [ ] Verify in browser on localhost:5175

### US-003: User-Facing Connection Test on Integrations Page
**Description:** As a user, I want a "Test My Connection" button on the Integrations page so that I can verify my Gmail integration is working correctly.

**Acceptance Criteria:**
- [ ] "Test Connection" button appears on Gmail integration card when connected
- [ ] Calls `nylas-health-check` using the user's own JWT (no user_id param)
- [ ] Shows inline results: green checkmarks for passing checks, red X for failures
- [ ] Failed checks show actionable message (e.g., "Grant expired — please reconnect")
- [ ] Button shows loading state during test execution
- [ ] Only visible when user has an active Google or Nylas integration
- [ ] Typecheck passes
- [ ] Verify in browser on localhost:5175

### US-004: Nylas Message List & Get Verification
**Description:** As a developer, I want the `nylas-email` edge function to handle all message list/get edge cases so that Gmail read operations work reliably through Nylas.

**Acceptance Criteria:**
- [ ] `nylas-email` action=list supports `search_query_native` parameter for search
- [ ] `nylas-email` action=list supports `in` parameter for folder filtering (uses folder ID for Google)
- [ ] `nylas-email` action=get returns full message body, attachments metadata, and thread context
- [ ] Response mapping covers all Gmail v1 fields: `id`, `threadId`, `snippet`, `from`, `to`, `cc`, `bcc`, `date`, `labels`, `read`, `starred`, `has_attachments`, `body`
- [ ] Pagination via `next_cursor` mapped to `nextPageToken` in response
- [ ] Empty results return `{ messages: [], nextPageToken: null }` (not error)
- [ ] Typecheck passes

### US-005: Nylas Draft Create & Send Operations
**Description:** As a developer, I want the `nylas-email` edge function to support full draft lifecycle (create, send, delete) so that users can compose and send drafts through Nylas.

**Acceptance Criteria:**
- [ ] `nylas-email` action=draft creates draft with `subject`, `body`, `to`, `cc`, `bcc`, `reply_to`
- [ ] New action `send-draft` sends an existing draft via `POST /v3/grants/{grant_id}/drafts/{draft_id}`
- [ ] New action `send` sends a message directly via `POST /v3/grants/{grant_id}/messages/send`
- [ ] New action `delete-draft` removes a draft via `DELETE /v3/grants/{grant_id}/drafts/{draft_id}`
- [ ] Response format matches Gmail API v1 shape for frontend compatibility
- [ ] Error responses include Nylas error details (status code, message)
- [ ] Typecheck passes

### US-006: Google-Gmail Proxy Full Coverage
**Description:** As a developer, I want the `google-gmail` proxy to route all supported actions through Nylas for free-tier users so that there are no dead-end operations.

**Acceptance Criteria:**
- [ ] Proxy routes for free-tier users: `list`, `get`, `draft`, `send-draft`, `delete-draft`, `search`
- [ ] `action=sync` returns clear "not supported" message with upgrade path (not silent failure)
- [ ] Proxy adds `X-Provider: nylas` response header for debugging
- [ ] Failed Nylas proxy calls return the original Nylas error, not a generic 500
- [ ] When Nylas grant is expired/revoked, returns 401 with `grant_expired` error code and reconnect URL
- [ ] Typecheck passes

### US-007: Nylas Webhook Receiver Edge Function
**Description:** As a developer, I want a webhook receiver that processes Nylas grant lifecycle events so that stale grants are detected automatically.

**Acceptance Criteria:**
- [ ] New edge function `nylas-webhook/index.ts` with `verify_jwt = false` in config.toml
- [ ] Handles challenge verification: returns `challenge` param on GET request with 200 OK
- [ ] Validates `x-nylas-signature` HMAC-SHA256 header against webhook secret
- [ ] Processes `grant.expired` event: sets `nylas_integrations.is_active = false`, updates `google_integrations.scope_tier = 'free'`
- [ ] Processes `grant.deleted` event: removes row from `nylas_integrations`, resets scope_tier
- [ ] Processes `grant.created` event: logs for observability (no-op if grant already stored)
- [ ] Stores webhook secret in environment variable `NYLAS_WEBHOOK_SECRET`
- [ ] Returns 200 OK for all processed events (prevents Nylas retry/failure marking)
- [ ] Typecheck passes

### US-008: Grant Status Sync & User Notification
**Description:** As a user, I want to be notified when my Gmail integration loses access so that I can reconnect before it affects my workflow.

**Acceptance Criteria:**
- [ ] When webhook marks grant as expired, user's `integrationStore` reflects `nylasConnected = false` on next load
- [ ] Integrations page shows "Connection expired — Reconnect" banner when `nylas_integrations.is_active = false`
- [ ] `GmailUpgradeGate` component respects `is_active` flag (shows gate even if row exists but inactive)
- [ ] Toast notification shown on first page load after grant expiration: "Your Gmail read access has expired. Please reconnect."
- [ ] Reconnecting via Nylas OAuth reuses existing row (upsert on user_id + provider)
- [ ] Typecheck passes
- [ ] Verify in browser on localhost:5175

### US-009: Nylas Webhook Registration & Management
**Description:** As a developer, I want a setup script and admin UI to register/manage Nylas webhooks so that webhook configuration is reproducible and visible.

**Acceptance Criteria:**
- [ ] Script `scripts/setup-nylas-webhook.ts` that registers webhook via Nylas API (`POST /v3/webhooks`) with triggers: `grant.created`, `grant.expired`, `grant.deleted`
- [ ] Script outputs webhook secret for environment variable storage
- [ ] Script supports `--dry-run` flag to preview without creating
- [ ] Platform Admin shows active webhook status (registered, failing, failed) by querying Nylas API
- [ ] Admin can trigger Nylas "Send Test Event" from the UI to validate webhook endpoint
- [ ] Typecheck passes

### US-010: Integration Status Dashboard in Platform Admin
**Description:** As a platform admin, I want an overview dashboard showing all users' Nylas integration health so that I can proactively identify issues.

**Acceptance Criteria:**
- [ ] Admin page shows table: user email, provider, grant status (active/expired/missing), scope_tier, last verified timestamp
- [ ] Filterable by status (active, expired, disconnected)
- [ ] "Test All" button runs health checks for all connected users (batched, with progress indicator)
- [ ] Summary stats at top: total connected, active, expired, never connected
- [ ] Click on a user row navigates to their individual test results (US-002)
- [ ] Typecheck passes
- [ ] Verify in browser on localhost:5175

## Functional Requirements

- FR-1: The `nylas-health-check` edge function must complete all checks within 10 seconds
- FR-2: Webhook signature validation must reject invalid signatures with 401 (never process unverified payloads)
- FR-3: All Nylas API calls must use `NYLAS_API_KEY` from server environment, never exposed to frontend
- FR-4: Response mapping from Nylas to Gmail v1 format must be lossless for fields the frontend consumes
- FR-5: Grant expiration must cascade: `nylas_integrations.is_active = false` AND `google_integrations.scope_tier = 'free'`
- FR-6: All edge functions must use `getCorsHeaders(req)` from `_shared/corsHelper.ts`
- FR-7: All edge functions must pin `@supabase/supabase-js@2.43.4` on esm.sh

## Non-Goals (Out of Scope)

- Microsoft/Outlook integration via Nylas (separate integration exists)
- Nylas calendar or contacts API integration (email only for now)
- Real-time message sync via `message.created` webhook (future phase)
- Nylas Smart Compose / AI draft features
- Message tracking (opens, clicks) via Nylas
- Migration of existing Google direct tokens to Nylas

## Technical Considerations

- **Existing patterns:** Follow `nylasClient.ts` for API calls, `workspaceErrors.ts` for error classification
- **Edge function config:** Webhook endpoint needs `verify_jwt = false` in config.toml
- **Nylas API base:** `https://api.us.nylas.com` (US region)
- **Webhook verification:** GET challenge response + HMAC-SHA256 on POST payloads
- **Nylas retry behavior:** Retries on 408, 429, 502, 503, 504, 507; marks endpoint as `failing` after 95% non-200 over 15 min
- **Database:** No new tables needed; adds `last_verified_at` column to `nylas_integrations`
- **Staging deploy:** Use `--no-verify-jwt` flag, project ref `caerqjzvuerejfrdtygb`

## Success Metrics

- All 5 health check operations pass for connected users
- Webhook processes grant.expired events within 60 seconds of Nylas sending them
- Zero silent grant failures — every expiration surfaces in UI within one page load
- Admin dashboard shows 100% of connected users' status accurately

## Open Questions

- What Nylas plan tier is active? (Webhook availability varies by plan)
- Should webhook secret be stored in Supabase Vault or environment variable?
- Rate limit for batch "Test All" on admin dashboard — how many concurrent Nylas API calls?
