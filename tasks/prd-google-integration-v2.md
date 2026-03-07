# PRD: Google & Microsoft Integration V2 — Agent-Grade Workspace Intelligence

## Introduction

Complete overhaul of the Google Workspace integration and net-new Microsoft 365 integration. Replaces the current fragmented, per-function REST implementation with a centralized, provider-abstracted client that handles token management, pagination, error classification, and Nylas routing. Adds 5 AI-powered background jobs that transform raw email/calendar/drive data into actionable sales intelligence.

The free trial delivers the full Pro experience. After trial, Basic plan users get reliable sync on a 4-hour cadence. Pro users get the AI teammate: email classification, proactive meeting prep with Slack alerts, reply gap detection, communication health tracking, and proposal-to-Drive storage.

## Goals

- Zero token-related errors in production (centralized refresh, proactive background renewal)
- Single provider interface (`google | microsoft`) — all background jobs and agent skills work identically across both
- Email classification pipeline (Haiku 4.5 + prompt caching) surfaces buying signals, objections, and OOO replies within 1 hour
- Pre-meeting Slack alerts with full attendee enrichment for every upcoming meeting (Pro)
- Proposals stored in user's Google Drive / OneDrive instead of S3
- Clear Basic vs Pro tier gating with free trial = Pro experience

## Subscription Tier Gating

### Basic Plan
| Feature | Spec |
|---------|------|
| Providers | 1 provider (Google OR Microsoft) |
| Email | Send, labels, basic compose |
| Calendar | View, create, list events, auto-renewing watches |
| Drive/OneDrive | App-created files only |
| Email sync | Every 4 hours during working hours |
| Reply gap detection | 72h + 7d, checked every 12 hours |
| Contact sync | Auto-create from calendar invites |
| Token refresh | Proactive (background) |
| Error handling | Typed (401/403/400/429) |
| History depth | 90 days |
| Email classification | None |
| Meeting prep / Slack alerts | None |
| Sent/received ratio | None |
| Document linking | None |
| Proposal storage | S3 (legacy) |

### Pro Plan (and Free Trial)
| Feature | Spec |
|---------|------|
| Providers | Both Google AND Microsoft simultaneously |
| Email | Full read, compose, drafts, send, reply, forward (Nylas for restricted scopes) |
| Calendar | + Attendee enrichment + pre-meeting research + Slack alerts |
| Drive/OneDrive | Full read + proposals stored in user's Drive |
| Email sync | Every 30 minutes during working hours |
| Reply gap detection | 48h / 72h / 7d with urgency scoring |
| Contact sync | Auto-create from calendar + email |
| Token refresh | Proactive (background) |
| Email classification | Haiku 4.5 + prompt caching, hourly during working hours |
| Meeting prep / Slack alerts | Automatic for every meeting |
| Sent/received ratio | Per-contact, daily rollup |
| Document linking | Auto-link proposals/decks to deals |
| Proposal storage | User's Google Drive / OneDrive |
| History depth | Full history |

## User Stories

### Phase 1: Centralized Client & Infrastructure

### US-001: Provider-Abstracted Client Interface
**Description:** As a developer, I want a single `WorkspaceClient` interface that abstracts Google and Microsoft so that all edge functions and background jobs work identically across providers.

**Acceptance Criteria:**
- [ ] `_shared/workspaceClient.ts` created with provider interface: `google | microsoft`
- [ ] Exports `createWorkspaceClient(provider, userId, supabase)` factory function
- [ ] Interface covers: `email`, `calendar`, `drive`, `contacts` namespaces
- [ ] Each namespace has typed methods (e.g., `email.list()`, `email.send()`, `calendar.listEvents()`)
- [ ] Provider-specific implementations in `_shared/providers/google.ts` and `_shared/providers/microsoft.ts`
- [ ] Microsoft provider stubs return `not_implemented` errors (implemented in later stories)
- [ ] Typecheck passes

### US-002: Centralized Token Refresh
**Description:** As a user, I want my Google/Microsoft tokens to never expire mid-action so that API calls always succeed.

**Acceptance Criteria:**
- [ ] `_shared/tokenManager.ts` created with `getValidToken(provider, userId, supabase)` function
- [ ] Checks `expires_at` with 5-minute buffer before expiry
- [ ] Refreshes token if within buffer, returns cached token otherwise
- [ ] Uses database row-level lock (`FOR UPDATE SKIP LOCKED`) to prevent race conditions on concurrent refresh
- [ ] Updates `access_token` and `expires_at` in `google_integrations` / `microsoft_integrations` table
- [ ] All 5 existing Google edge functions (gmail, calendar, drive, docs, tasks) refactored to use `getValidToken()` instead of inline refresh
- [ ] Duplicated `refreshAccessToken()` functions removed from all edge functions
- [ ] Drive token refresh now works (was TODO)
- [ ] Typecheck passes

### US-003: Auto-Pagination Helper
**Description:** As a developer, I want pagination handled automatically so that sync operations fetch complete datasets.

**Acceptance Criteria:**
- [ ] `_shared/pagination.ts` created with `paginateAll(fetchPage, options)` helper
- [ ] Supports Google's `nextPageToken` pattern and Microsoft's `@odata.nextLink` pattern
- [ ] Configurable `maxPages` limit (default 50) to prevent runaway fetches
- [ ] Configurable `delay` between pages (default 100ms) for rate limiting
- [ ] Gmail sync refactored to use `paginateAll()` — no longer capped at 10 messages
- [ ] Calendar list refactored to use `paginateAll()`
- [ ] Returns complete result set with total count
- [ ] Typecheck passes

### US-004: Typed Error Classification
**Description:** As an agent, I want typed error responses so I know whether to retry, re-authenticate, or escalate.

**Acceptance Criteria:**
- [ ] `_shared/workspaceErrors.ts` created with error classes: `TokenExpiredError`, `InsufficientScopeError`, `RateLimitError`, `NotFoundError`, `ProviderError`
- [ ] Each error class includes `retryable: boolean`, `statusCode: number`, `provider: string`
- [ ] Edge functions return correct HTTP status codes: 401 (token), 403 (scope), 429 (rate limit), 404 (not found), 500 (provider error)
- [ ] Error response body includes `{ error: string, code: string, retryable: boolean, provider: string }`
- [ ] All 5 Google edge functions refactored to use typed errors instead of generic 400
- [ ] Typecheck passes

### US-005: Nylas Routing in Centralized Client
**Description:** As a user on the free plan, I want Gmail read operations to automatically route through Nylas when connected, so I get inbox access without CASA-restricted scopes.

**Acceptance Criteria:**
- [ ] `WorkspaceClient.email.list()` checks Nylas connection status before routing
- [ ] If Nylas connected: routes read operations (list, get, search) through Nylas API
- [ ] If paid tier (direct): routes through Gmail API directly
- [ ] If free tier + no Nylas: returns `upgrade_required` error with upgrade URL
- [ ] Send, reply, forward operations expanded through Nylas for paid users (previously only list/get/draft)
- [ ] `nylas-email` edge function updated with `send`, `reply`, `forward` actions
- [ ] Response format identical regardless of routing (Nylas responses mapped to Gmail format)
- [ ] Typecheck passes

### US-006: Subscription Tier Gating
**Description:** As a product owner, I want features gated by subscription tier so that Basic and Pro plans deliver different value.

**Acceptance Criteria:**
- [ ] `_shared/tierGating.ts` created with `getUserTier(userId, supabase): 'trial' | 'basic' | 'pro'`
- [ ] `canAccess(userId, feature, supabase): boolean` checks tier against feature matrix
- [ ] Feature matrix defined as config: `{ emailClassification: 'pro', replyGap: 'basic', meetingPrep: 'pro', ... }`
- [ ] Trial users get full Pro access
- [ ] Sync frequency resolved per tier: Basic = 4h, Pro = 30min
- [ ] History depth resolved per tier: Basic = 90 days, Pro = unlimited
- [ ] Gating applied in background job dispatcher (not in individual edge functions)
- [ ] Typecheck passes

### Phase 2: Microsoft 365 Integration

### US-007: Microsoft OAuth Flow
**Description:** As a user, I want to connect my Microsoft 365 account so that 60 can access my Outlook, Calendar, and OneDrive.

**Acceptance Criteria:**
- [ ] `microsoft_integrations` table created via migration (mirrors `google_integrations` schema)
- [ ] `microsoft_oauth_states` table created via migration
- [ ] `oauth-initiate/providers/microsoft.ts` created with PKCE flow to Microsoft identity platform
- [ ] Scopes requested: `Mail.ReadWrite`, `Mail.Send`, `Calendars.ReadWrite`, `Files.ReadWrite`, `Contacts.Read`, `User.Read`, `offline_access`
- [ ] `microsoft-oauth-callback` edge function created (exchanges code, stores tokens)
- [ ] Redirect URI allowlist matches Google pattern (localhost, app.use60.com, Vercel)
- [ ] Integration stored in `microsoft_integrations` with same column structure as Google
- [ ] Typecheck passes
- [ ] Verify in browser on localhost:5175

### US-008: Microsoft Token Refresh
**Description:** As a user, I want my Microsoft tokens to refresh automatically using the centralized token manager.

**Acceptance Criteria:**
- [ ] `tokenManager.ts` extended with Microsoft refresh logic (`https://login.microsoftonline.com/common/oauth2/v2.0/token`)
- [ ] Microsoft tokens refreshed with same race-condition protection (row-level lock)
- [ ] Token expiry buffer same as Google (5 minutes)
- [ ] `microsoft_integrations.access_token` and `expires_at` updated on refresh
- [ ] Typecheck passes

### US-009: Microsoft Email Provider (Outlook / Graph API)
**Description:** As a user with Microsoft connected, I want to send, read, and manage emails through Outlook so the agent works with my Microsoft account.

**Acceptance Criteria:**
- [ ] `_shared/providers/microsoft.ts` email namespace implemented using Microsoft Graph API (`graph.microsoft.com/v1.0`)
- [ ] Actions: `list`, `get`, `send`, `reply`, `forward`, `draft`, `archive`, `trash`, `star`, `mark-as-read`
- [ ] Response format mapped to same interface as Google (frontend doesn't know which provider)
- [ ] `microsoft-email` edge function created, delegates to WorkspaceClient
- [ ] Pagination uses Graph's `@odata.nextLink` pattern via `paginateAll()`
- [ ] Typecheck passes

### US-010: Microsoft Calendar Provider
**Description:** As a user with Microsoft connected, I want calendar events synced from Outlook Calendar so the agent can prep for meetings regardless of provider.

**Acceptance Criteria:**
- [ ] `_shared/providers/microsoft.ts` calendar namespace implemented using Graph API
- [ ] Actions: `list-events`, `create-event`, `update-event`, `delete-event`, `list-calendars`, `availability`
- [ ] Webhook subscriptions via Graph `subscriptions` endpoint (replaces Google's `watch`)
- [ ] `microsoft-calendar` edge function created
- [ ] Response format mapped to same interface as Google
- [ ] Typecheck passes

### US-011: Microsoft Drive Provider (OneDrive)
**Description:** As a user with Microsoft connected, I want OneDrive access so proposals and documents can be stored and linked from OneDrive.

**Acceptance Criteria:**
- [ ] `_shared/providers/microsoft.ts` drive namespace implemented using Graph API
- [ ] Actions: `list-files`, `create-folder`, `upload-file`, `share-file`, `get-file`, `delete-file`, `search`
- [ ] `microsoft-drive` edge function created
- [ ] Response format mapped to same interface as Google
- [ ] Typecheck passes

### US-012: Microsoft Integration UI
**Description:** As a user, I want to connect Microsoft 365 from the Integrations page with the same UX as Google.

**Acceptance Criteria:**
- [ ] Microsoft card added to Integrations page with Outlook logo
- [ ] Same status badges: active, limited, inactive, error
- [ ] Connect/disconnect flow mirrors Google
- [ ] `integrationStore.ts` extended with `microsoft` state (isConnected, email, services, scopeTier)
- [ ] `checkMicrosoftConnection()` and `connectMicrosoft()` actions added
- [ ] Service toggles for email, calendar, drive
- [ ] Typecheck passes
- [ ] Verify in browser on localhost:5175

### Phase 3: Background Jobs & pg_cron

### US-013: Background Job Dispatcher
**Description:** As a system, I want a central dispatcher that runs background jobs on schedule, respecting user working hours and subscription tiers.

**Acceptance Criteria:**
- [ ] `supabase/functions/workspace-background-jobs/index.ts` created
- [ ] Accepts `job_type` parameter: `token_refresh`, `email_sync`, `email_classify`, `reply_gap`, `calendar_watch`, `ratio_calc`, `doc_link`, `attendee_enrich`
- [ ] Resolves user's working hours from `user_settings` (default 8am-6pm in user's timezone)
- [ ] Skips execution if outside working hours (except `token_refresh` and `calendar_watch` which run always)
- [ ] Checks subscription tier before executing tier-gated jobs
- [ ] Processes users in batches (50 per invocation) to stay within edge function timeout
- [ ] Logs execution to `background_job_logs` table
- [ ] Typecheck passes

### US-014: Background Job Scheduling Migration
**Description:** As a system, I want pg_cron jobs configured to trigger the dispatcher on the correct schedules.

**Acceptance Criteria:**
- [ ] Migration creates `background_job_logs` table (job_type, user_id, status, started_at, completed_at, error, metadata JSONB)
- [ ] pg_cron extension enabled (`CREATE EXTENSION IF NOT EXISTS pg_cron`)
- [ ] pg_net extension enabled for HTTP calls to edge functions
- [ ] Cron jobs created:
  - `workspace_token_refresh`: every 10 minutes
  - `workspace_email_sync_pro`: every 30 minutes
  - `workspace_email_sync_basic`: every 4 hours
  - `workspace_email_classify`: every 1 hour
  - `workspace_reply_gap_pro`: every 4 hours
  - `workspace_reply_gap_basic`: every 12 hours
  - `workspace_calendar_watch`: daily at 3am UTC
  - `workspace_ratio_calc`: daily at 2am UTC
  - `workspace_doc_link`: every 2 hours
  - `workspace_attendee_enrich`: every 15 minutes
- [ ] Each cron calls `workspace-background-jobs` edge function via `pg_net`
- [ ] Typecheck passes

### US-015: Proactive Token Refresh Job
**Description:** As a user, I want my tokens refreshed before they expire so that no API call ever fails due to an expired token.

**Acceptance Criteria:**
- [ ] Job queries all integrations (Google + Microsoft) where `expires_at < NOW() + interval '30 minutes'`
- [ ] Refreshes each token using `tokenManager.getValidToken()`
- [ ] Logs success/failure per user to `background_job_logs`
- [ ] Handles revoked tokens gracefully (marks integration as `needs_reauth`, notifies user)
- [ ] Runs every 10 minutes regardless of working hours
- [ ] Typecheck passes

### US-016: Calendar Watch Auto-Renewal
**Description:** As a user, I want my Google Calendar watches and Microsoft Calendar subscriptions auto-renewed so I never miss meeting notifications.

**Acceptance Criteria:**
- [ ] `calendar_watches` table created via migration (user_id, provider, resource_id, channel_id, expiration, created_at)
- [ ] Job queries watches expiring within 48 hours
- [ ] Renews Google watches via Calendar API `watch` endpoint
- [ ] Renews Microsoft subscriptions via Graph `subscriptions` endpoint
- [ ] Updates `expiration` in `calendar_watches` table
- [ ] Logs renewal success/failure
- [ ] Runs daily at 3am UTC regardless of working hours
- [ ] Typecheck passes

### Phase 4: Email Intelligence Pipeline

### US-017: Email Sync V2 (Full Paginated)
**Description:** As a user, I want my full email history synced so the agent has complete context on every contact relationship.

**Acceptance Criteria:**
- [ ] Email sync uses `paginateAll()` for complete inbox traversal
- [ ] Stores sync cursor (`historyId` for Google, `deltaLink` for Microsoft) for incremental sync
- [ ] On first sync: fetches last 90 days (Basic) or full history (Pro)
- [ ] On subsequent syncs: fetches only new/changed messages since last cursor
- [ ] Batch upserts to `email_messages` table (create if not exists via migration)
- [ ] `email_messages` schema: id, user_id, provider, message_id, thread_id, from_email, to_emails, cc_emails, subject, snippet, labels, read, starred, has_attachments, received_at, raw_metadata JSONB
- [ ] RLS: users can only read own messages
- [ ] Pro: every 30 min during working hours. Basic: every 4 hours
- [ ] Typecheck passes

### US-018: Email Classification Pipeline
**Description:** As a Pro user, I want incoming emails automatically classified so the agent surfaces buying signals, objections, and urgent items without me checking my inbox.

**Acceptance Criteria:**
- [ ] `supabase/functions/email-classify/index.ts` created
- [ ] Uses Haiku 4.5 (`claude-haiku-4-5-20251001`) with prompt caching for classification
- [ ] Classifies unprocessed emails from `email_messages` where `classification IS NULL`
- [ ] Classification schema: `{ intent: string, sentiment: string, urgency: 'low'|'medium'|'high', deal_relevance: number, tags: string[], summary: string }`
- [ ] Intent categories: `buying_signal`, `objection`, `question`, `scheduling`, `follow_up_needed`, `ooo_auto_reply`, `newsletter`, `notification`, `personal`, `other`
- [ ] Prompt cached with system prompt containing classification rules and examples
- [ ] Results stored in `email_messages.classification` JSONB column
- [ ] Links classified emails to contacts via `from_email` matching
- [ ] Links to deals via contact-deal relationships
- [ ] Pro only — gated by tier check
- [ ] Hourly during working hours
- [ ] Typecheck passes

### US-019: Reply Gap Detection
**Description:** As a user, I want to know which sent emails haven't received a reply so the agent can draft follow-ups proactively.

**Acceptance Criteria:**
- [ ] `supabase/functions/reply-gap-detect/index.ts` created
- [ ] Queries sent emails from `email_messages` where `from_email = user's email`
- [ ] For each sent email, checks if a reply exists in same thread within configured windows
- [ ] Gap windows: 48h (Pro only), 72h (Basic + Pro), 7d (Basic + Pro)
- [ ] Results stored in `reply_gaps` table: user_id, provider, thread_id, contact_email, sent_at, gap_hours, urgency, deal_id (nullable)
- [ ] Urgency scoring: 48h gap on active deal = high, 72h gap = medium, 7d gap = low
- [ ] Clears gap when reply detected
- [ ] Pro: every 4 hours. Basic: every 12 hours
- [ ] Typecheck passes

### US-020: Sent-vs-Received Ratio Tracking
**Description:** As a Pro user, I want per-contact communication health metrics so the agent can flag one-directional relationships.

**Acceptance Criteria:**
- [ ] `contact_communication_health` table created via migration: user_id, contact_email, provider, sent_count, received_count, ratio, last_sent_at, last_received_at, avg_response_time_hours, streak_type ('sending'|'receiving'|'balanced'), updated_at
- [ ] Daily rollup job calculates metrics from `email_messages`
- [ ] Ratio = sent_count / (received_count || 1)
- [ ] Streak detection: 3+ consecutive sends with no reply = `sending` streak
- [ ] Links to contact record if exists
- [ ] Pro only — gated by tier check
- [ ] Daily at 2am UTC
- [ ] Typecheck passes

### Phase 5: Calendar Intelligence

### US-021: Calendar Attendee Enrichment
**Description:** As a Pro user, I want meeting attendees automatically enriched with company and role data so the agent can prep comprehensive meeting briefs.

**Acceptance Criteria:**
- [ ] `supabase/functions/attendee-enrich/index.ts` created
- [ ] Triggers on new calendar events (detected via sync or webhook)
- [ ] For each attendee email not already in `contacts` table: creates contact record
- [ ] Runs lead enrichment pipeline on new contacts (reuses existing `sales-enrich` / `lead-research` skill logic)
- [ ] Stores enrichment in contact record: name, title, company, LinkedIn URL, company size, industry
- [ ] Works for both Google Calendar and Microsoft Calendar events
- [ ] Pro only — gated by tier check
- [ ] Every 15 minutes during working hours
- [ ] Typecheck passes

### US-022: Pre-Meeting Research & Slack Alert
**Description:** As a Pro user, I want a Slack notification 2 hours before every meeting with a full research brief so I'm always prepared.

**Acceptance Criteria:**
- [ ] Extends attendee enrichment to trigger pre-meeting research when meeting is within 2 hours
- [ ] Research brief includes: attendee profiles, company intel, deal status (if linked), last email exchange, open action items
- [ ] Brief formatted as Slack Block Kit message (matches existing meeting-prep-brief Slack notification pattern)
- [ ] Sent to user's connected Slack DM
- [ ] Includes quick-action buttons: "View Deal", "Draft Agenda", "Reschedule"
- [ ] Only triggers once per meeting (dedup via `meeting_prep_sent` flag on calendar event)
- [ ] Works for both Google and Microsoft calendar events
- [ ] Pro only
- [ ] Typecheck passes

### Phase 6: Document Intelligence

### US-023: Proposal Storage to User's Drive
**Description:** As a user, I want proposals stored in my Google Drive or OneDrive instead of S3 so I can share them directly and the agent has context.

**Acceptance Criteria:**
- [ ] Proposal generation pipeline updated to upload to user's Drive/OneDrive
- [ ] Creates `60 Proposals` folder in user's Drive if it doesn't exist
- [ ] File named: `{Company} - Proposal - {Date}.pdf`
- [ ] File shared with proposal recipients automatically
- [ ] Drive file URL stored in `proposals` table (replaces S3 URL)
- [ ] Falls back to S3 if user has no Drive/OneDrive connected
- [ ] Existing S3 proposals remain accessible (no migration of historical data)
- [ ] Works for both Google Drive and OneDrive
- [ ] Typecheck passes

### US-024: Drive Document Linking
**Description:** As a Pro user, I want recently shared documents auto-linked to deals so the agent can reference "the proposal you sent them last week."

**Acceptance Criteria:**
- [ ] `deal_documents` table created via migration: deal_id, user_id, provider, file_id, file_name, file_url, file_type, linked_by ('auto'|'manual'), linked_at
- [ ] Background job scans recent Drive/OneDrive activity (last 2 hours)
- [ ] Matches documents to deals by: recipient email matches deal contact, file name contains company name, or file was created during/after a meeting with deal contacts
- [ ] Stores link in `deal_documents` table
- [ ] Agent can query: "What documents have been shared with {contact/company}?"
- [ ] Pro only
- [ ] Every 2 hours during working hours
- [ ] Typecheck passes

### Phase 7: Frontend & Deprecations

### US-025: Integration Dashboard Updates
**Description:** As a user, I want the Integrations page to show both Google and Microsoft with clear tier-based feature visibility.

**Acceptance Criteria:**
- [ ] Microsoft 365 card added alongside Google card
- [ ] Both cards show per-service status (email, calendar, drive)
- [ ] Pro features show lock icon with "Upgrade to Pro" for Basic users
- [ ] Background job status visible: "Last synced 15 min ago", "Classification: 3 new insights"
- [ ] Communication health summary: "5 contacts need follow-up"
- [ ] Connected provider count shown (Basic: "1 of 1", Pro: "2 of 2")
- [ ] Typecheck passes
- [ ] Verify in browser on localhost:5175

### US-026: Email Intelligence UI
**Description:** As a user, I want classified emails surfaced in the app with intent tags and urgency indicators.

**Acceptance Criteria:**
- [ ] Email list view shows classification badges (buying signal, objection, question, etc.)
- [ ] Urgency indicator (red/amber/green dot) on classified emails
- [ ] Filter by classification intent
- [ ] Reply gap warnings shown inline: "No reply in 3 days" with draft follow-up CTA
- [ ] Communication health badge on contact cards (ratio + streak)
- [ ] Basic users see "Upgrade to Pro for email intelligence" placeholder
- [ ] Typecheck passes
- [ ] Verify in browser on localhost:5175

### US-027: Deprecate Legacy Google Functions
**Description:** As a developer, I want legacy inline token refresh and per-function pagination removed so there's one way to do things.

**Acceptance Criteria:**
- [ ] All inline `refreshAccessToken()` functions removed from google-gmail, google-calendar, google-drive, google-docs, google-tasks
- [ ] All manual pagination loops replaced with `paginateAll()` calls
- [ ] All generic `catch { return 400 }` replaced with typed error responses
- [ ] Gmail sync 10-message cap removed
- [ ] Legacy `corsHeaders` const usage replaced with `getCorsHeaders(req)` if any remain
- [ ] No functional behavior change — existing API contracts preserved
- [ ] Typecheck passes

### US-028: Deprecate S3-Only Proposal Storage
**Description:** As a developer, I want the proposal pipeline to default to Drive/OneDrive storage with S3 as fallback only.

**Acceptance Criteria:**
- [ ] Proposal generation checks for connected Drive/OneDrive first
- [ ] If connected: uploads to `60 Proposals` folder in user's Drive
- [ ] If not connected: falls back to S3 (existing behavior)
- [ ] `proposals` table updated with `storage_provider` column ('drive'|'onedrive'|'s3') and `drive_file_id`
- [ ] Existing S3 URLs continue to work (backward compatible)
- [ ] Typecheck passes

## Functional Requirements

- FR-1: All Google API calls must go through `WorkspaceClient` — no direct `fetch()` to googleapis.com in edge functions
- FR-2: All Microsoft API calls must go through `WorkspaceClient` — no direct `fetch()` to graph.microsoft.com in edge functions
- FR-3: Token refresh must use row-level locking to prevent race conditions
- FR-4: Background jobs must respect user working hours (configurable, default 8am-6pm user timezone)
- FR-5: Background jobs must check subscription tier before executing gated features
- FR-6: Email classification must use prompt caching to minimize Haiku 4.5 costs
- FR-7: All error responses must include `{ error, code, retryable, provider }` structure
- FR-8: Nylas routing must be transparent — frontend never knows whether Gmail or Nylas served the request
- FR-9: Free trial must deliver full Pro experience with no feature gates
- FR-10: Proposal storage must fall back to S3 if no Drive/OneDrive connected

## Non-Goals (Out of Scope)

- Google Chat / Microsoft Teams integration (messaging platforms — separate PRD)
- Google Sheets / Excel manipulation beyond basic file storage
- Admin-level Workspace management (user provisioning, domain settings)
- Migrating historical S3 proposals to Drive (new proposals go to Drive, old stay in S3)
- Google Workspace CLI (`gws`) integration (architecture mismatch with edge functions)
- Real-time email streaming (webhooks for email — defer to future PRD)
- Multi-org Microsoft tenancy (single tenant per user for V2)

## Technical Considerations

### Schema Changes
- `microsoft_integrations` table (mirrors `google_integrations`)
- `microsoft_oauth_states` table
- `email_messages` table (provider-agnostic email store)
- `reply_gaps` table
- `contact_communication_health` table
- `calendar_watches` table
- `deal_documents` table
- `background_job_logs` table
- `proposals` table: add `storage_provider`, `drive_file_id` columns
- `email_messages`: add `classification` JSONB column
- pg_cron and pg_net extensions enabled

### Integrations Affected
- Google OAuth (scope tier gating preserved)
- Nylas (expanded: send, reply, forward added)
- Microsoft Identity Platform (new)
- Microsoft Graph API (new)
- Slack (pre-meeting alerts)
- S3 (proposal fallback)
- Haiku 4.5 API (email classification)

### Performance Requirements
- Token refresh: < 2 seconds
- Email classification: < 500ms per email (Haiku 4.5)
- Background job batch: process 50 users within 60s edge function timeout
- Pagination: configurable delay to respect Google/Microsoft rate limits (default 100ms between pages)

### Existing Patterns to Follow
- Edge function structure: `getCorsHeaders(req)` from `_shared/corsHelper.ts`
- Supabase client: `@supabase/supabase-js@2.43.4` (pinned on esm.sh)
- Frontend state: Zustand stores in `src/lib/stores/`
- Server state: React Query hooks
- UI components: Radix primitives in `src/components/ui/`

### Microsoft-Specific Notes
- Azure AD app registration required (client ID + secret)
- Microsoft Graph API v1.0 (`https://graph.microsoft.com/v1.0/`)
- Token endpoint: `https://login.microsoftonline.com/common/oauth2/v2.0/token`
- Webhook subscriptions expire (max 3 days for mail, 3 days for calendar) — more frequent renewal than Google
- OneDrive uses same Graph API as Outlook

## Success Metrics

- Zero token-expired errors in production (currently ~5/day estimated)
- Email classification accuracy > 85% on intent detection
- Pre-meeting Slack alert delivery > 99% (sent 2h before meeting)
- Reply gap detection catches 100% of gaps > 72h
- Pro conversion rate from trial > 15%
- Background job success rate > 99%
- Provider parity: identical feature set for Google and Microsoft

## Open Questions

- Microsoft Azure AD app registration: do we use multi-tenant app or per-customer app registration?
- Haiku 4.5 prompt caching: should we cache per-user (personalized classification) or global (cheaper)?
- Reply gap detection: should we exclude automated/newsletter emails from gap tracking?
- Calendar webhook frequency: Microsoft subscriptions expire every 3 days — is pg_cron daily renewal frequent enough?
- Proposal sharing: should we auto-share the Drive file with the recipient, or just store it?
