# PRD: HeyReach + Ops Bidirectional Integration

## Introduction

Full bidirectional integration between HeyReach (LinkedIn outreach automation) and 60's Ops tables. Users connect their HeyReach account, link campaigns to ops tables, push leads to LinkedIn campaigns, and receive real-time engagement data back — connection accepts, message replies, profile views, and more — as live columns in their ops tables. All 9 HeyReach webhook events wire into the Ops Rules engine for cross-system automation.

**The wow moment:** A rep opens their Leads ops table and sees, in real-time, which LinkedIn prospects just accepted their connection request, who replied to their message, and a timeline of every touchpoint — without leaving 60.

## Goals

- Enable push of ops table rows to HeyReach campaigns with field mapping and per-row sender assignment
- Receive all 9 HeyReach webhook events and surface engagement data as live ops table columns
- Wire webhook events into Ops Rules for automated actions (create task, Slack alert, move deal, etc.)
- Support manual bulk push, auto-push rules, and scheduled sync
- Provide LinkedIn Activity timeline per lead in the row detail panel
- Monitor webhook health and alert users if campaigns go silent

## User Stories

### HR-001: Database Schema — HeyReach Integration Tables
**Description:** As a platform engineer, I need the database tables for HeyReach integration so that credentials, campaign links, and sync history are properly stored with correct RLS.

**Acceptance Criteria:**
- [ ] Migration creates `heyreach_org_credentials` table (service-role-only) with columns: `org_id` (UUID PK, FK organizations), `api_key` (TEXT NOT NULL), `updated_at` (TIMESTAMPTZ)
- [ ] Migration creates `heyreach_org_integrations` table with columns: `id` (UUID PK), `org_id` (UUID UNIQUE, FK), `connected_by_user_id` (UUID FK auth.users), `is_active` (BOOLEAN), `is_connected` (BOOLEAN), `connected_at`, `last_sync_at`, `last_webhook_received_at`, `created_at`, `updated_at`
- [ ] Migration creates `heyreach_campaign_links` table with columns: `id` (UUID PK), `table_id` (UUID FK dynamic_tables), `org_id` (UUID FK), `campaign_id` (TEXT), `campaign_name` (TEXT), `field_mapping` (JSONB), `sender_column_key` (TEXT nullable — references ops column for per-row sender), `auto_sync_engagement` (BOOLEAN), `linked_by` (UUID), `linked_at`, `last_push_at`, `last_engagement_sync_at`, UNIQUE on `(table_id, campaign_id)`
- [ ] Migration creates `heyreach_sync_history` table with columns: `id` (UUID PK), `table_id` (UUID FK), `campaign_id` (TEXT), `synced_by` (UUID), `synced_at`, `sync_type` CHECK `('engagement_pull', 'lead_push', 'webhook_event')`, `rows_processed` (INT), `rows_succeeded` (INT), `rows_failed` (INT), `sync_duration_ms` (INT), `error_message` (TEXT), `metadata` (JSONB)
- [ ] Extends `dynamic_table_rows.source_type` CHECK to include `'heyreach'`
- [ ] Adds `dynamic_table_rows.heyreach_lead_id` (TEXT) for row-to-HeyReach mapping
- [ ] RLS: `heyreach_org_credentials` — service-role only (no user policies)
- [ ] RLS: `heyreach_org_integrations` — org members can SELECT, org admins can INSERT/UPDATE/DELETE
- [ ] RLS: `heyreach_campaign_links` — org members can SELECT, org admins can INSERT/UPDATE/DELETE
- [ ] RLS: `heyreach_sync_history` — org members can SELECT, service role can INSERT
- [ ] All policies use `DROP POLICY IF EXISTS` before `CREATE POLICY`
- [ ] Indexes on `org_id` for all tables, `table_id` for campaign_links and sync_history
- [ ] `updated_at` trigger on all tables with timestamps
- [ ] Migration created via `./scripts/new-migration.sh`
- [ ] Typecheck passes

### HR-002: Connection Setup — API Key & Config
**Description:** As an org admin, I want to connect my HeyReach account by entering my API key so that 60 can access my campaigns and receive webhook data.

**Acceptance Criteria:**
- [ ] Edge function `heyreach-admin/index.ts` handles actions: `connect`, `disconnect`, `check_status`
- [ ] `connect` action: validates API key by calling HeyReach's `check-api-key` equivalent (list campaigns), stores in `heyreach_org_credentials`, creates `heyreach_org_integrations` record with `is_connected=true`
- [ ] `disconnect` action: deletes credentials, sets `is_connected=false`, removes campaign links
- [ ] `check_status` action: returns connection status + last sync time
- [ ] Edge function uses `getCorsHeaders(req)` from `_shared/corsHelper.ts`
- [ ] Edge function pins `@supabase/supabase-js@2.43.4`
- [ ] Edge function uses `edgeAuth.ts` for auth context
- [ ] Frontend: `HeyReachConfigModal.tsx` wrapping `<ConfigureModal>` with integrationId `"heyreach"`
- [ ] Modal shows API key input field (password type, paste-friendly)
- [ ] Modal shows connection status badge (Connected/Disconnected)
- [ ] Modal shows "Connected by [user] on [date]" when connected
- [ ] Modal has "Disconnect HeyReach" button in DangerZone section with confirmation
- [ ] Toast feedback on connect success/failure and disconnect
- [ ] HeyReach card added to `Integrations.tsx` page with correct brand color and Lucide icon
- [ ] `useHeyReachIntegration` hook created with: `isConnected`, `integration`, `connect(apiKey)`, `disconnect()`, `loading`, `error`
- [ ] Typecheck passes
- [ ] Verify in browser on localhost:5175

### HR-003: Campaign Discovery & Linking
**Description:** As a sales rep, I want to browse my HeyReach campaigns and link one to my ops table so that I can push leads and receive engagement data.

**Acceptance Criteria:**
- [ ] Edge function `heyreach-admin` extended with `list_campaigns` action — calls HeyReach API `GET /campaigns` with pagination
- [ ] Edge function `heyreach-admin` extended with `get_campaign_details` action — returns campaign config, fields, sender accounts
- [ ] `HeyReachCampaignPicker.tsx` component: lists available campaigns with name, status (Active/Paused), sender count
- [ ] Only Active campaigns can be linked (Paused campaigns shown but disabled with tooltip)
- [ ] Field mapping UI: left column = HeyReach fields (first_name, last_name, linkedin_url, email, company, position + custom vars), right column = ops table column picker dropdowns
- [ ] Required fields (first_name, last_name, linkedin_url) must be mapped before linking — validation error if missing
- [ ] "Link Campaign" button creates `heyreach_campaign_links` record with field_mapping JSONB
- [ ] Linked campaign shown in ops table toolbar/header with campaign name + status badge
- [ ] "Unlink" action available to org admins
- [ ] Campaign link visible in HeyReachConfigModal under "Linked Tables" section
- [ ] Toast feedback on link/unlink success
- [ ] Typecheck passes
- [ ] Verify in browser on localhost:5175

### HR-004: Sender Account Management
**Description:** As a sales manager, I want to assign specific LinkedIn sender accounts to individual leads in my ops table so that outreach comes from the right person.

**Acceptance Criteria:**
- [ ] Edge function fetches sender accounts from HeyReach API — returns `sender_id`, `name`, `linkedin_url`, `status`
- [ ] New ops table column type: `heyreach_sender` — renders as a dropdown of available sender accounts
- [ ] Column auto-created when campaign linked (if `sender_column_key` set on campaign link)
- [ ] Sender dropdown shows sender name + LinkedIn profile picture (if available) or initials
- [ ] Only senders assigned to the linked campaign are shown in the dropdown
- [ ] Selected sender stored as cell value (sender_id) with display name in metadata
- [ ] `heyreach_campaign_links.sender_column_key` references the ops column key used for sender assignment
- [ ] When pushing leads, sender assignment from this column overrides HeyReach's default rotation
- [ ] Bulk-assign sender: select multiple rows → "Assign Sender" action → pick sender
- [ ] Typecheck passes
- [ ] Verify in browser on localhost:5175

### HR-005: Webhook Receiver — All Events
**Description:** As a system, I need to receive and process all HeyReach webhook events so that engagement data flows into ops tables in real-time.

**Acceptance Criteria:**
- [ ] Edge function `heyreach-webhook/index.ts` receives POST requests
- [ ] Auth: API key validated via URL path parameter (`/heyreach-webhook?key={org_webhook_key}`) matched against `heyreach_org_integrations` record
- [ ] Handles all 9 event types: `connection_request_sent`, `connection_request_accepted`, `message_sent`, `message_reply_received`, `inmail_sent`, `inmail_reply_received`, `follow_sent`, `liked_post`, `viewed_profile`, `lead_tag_updated`
- [ ] Resolves incoming webhook to ops table row by matching LinkedIn URL (primary) or email (fallback) against existing rows
- [ ] If no matching row found: logs event to `heyreach_sync_history` with `metadata.unmatched=true`, does NOT create row
- [ ] Updates `heyreach_org_integrations.last_webhook_received_at` on every event
- [ ] Logs every event to `integration_sync_logs` with `integration_name='heyreach'`, appropriate `operation` and `direction='inbound'`
- [ ] Logs to `heyreach_sync_history` with `sync_type='webhook_event'`
- [ ] Rate limit: 300 req/min per org (in-memory bucket, matching HeyReach's API limit)
- [ ] Returns 200 immediately on valid request (process async if needed)
- [ ] Returns 401 on invalid API key, 429 on rate limit, 400 on malformed payload
- [ ] Edge function uses `getCorsHeaders(req)`, pins `@supabase/supabase-js@2.43.4`
- [ ] `verify_jwt = false` in function config (public webhook endpoint)
- [ ] Webhook URL displayed in HeyReachConfigModal for user to copy and paste into HeyReach settings
- [ ] Typecheck passes

### HR-006: Manual Push — Bulk Action
**Description:** As a sales rep, I want to select rows in my ops table and push them to a linked HeyReach campaign so that leads enter my LinkedIn outreach sequence.

**Acceptance Criteria:**
- [ ] "Push to HeyReach" bulk action appears in ops table toolbar when rows selected AND table has a linked HeyReach campaign
- [ ] Action opens confirmation dialog: "Push {N} leads to {campaign_name}?"
- [ ] Shows field mapping preview: which ops columns map to which HeyReach fields
- [ ] Validates required fields present (first_name, last_name, linkedin_url) — shows error for rows missing required data
- [ ] Edge function `heyreach-sync-outbound/index.ts`: accepts `table_id`, `row_ids[]`, `campaign_link_id`
- [ ] Applies field mapping from `heyreach_campaign_links.field_mapping`
- [ ] Includes sender assignment from sender column (if configured) per row
- [ ] Batches API calls to HeyReach at 100 leads per request (respects 300 req/min)
- [ ] Stores `heyreach_lead_id` on `dynamic_table_rows` for matched/created leads
- [ ] Logs to `heyreach_sync_history` with `sync_type='lead_push'`, counts for processed/succeeded/failed
- [ ] Logs to `integration_sync_logs` with `operation='push'`, `direction='outbound'`
- [ ] Toast shows result: "{N} leads pushed successfully, {M} failed" with error details expandable
- [ ] Rows that already have `heyreach_lead_id` show "Update" instead of "Push" (re-push updates existing lead)
- [ ] Typecheck passes
- [ ] Verify in browser on localhost:5175

### HR-007: Inbound Engagement Sync — Live Columns
**Description:** As a sales rep, I want to see HeyReach engagement data (replies, accepts, views) as columns in my ops table so that I can track LinkedIn outreach without leaving 60.

**Acceptance Criteria:**
- [ ] When first webhook event arrives for a linked table, auto-create engagement columns (if not exist): `heyreach_status` (text), `heyreach_connection_status` (text: pending/accepted/not_sent), `heyreach_reply_count` (number), `heyreach_last_activity` (date), `heyreach_last_activity_type` (text), `heyreach_message_count` (number), `heyreach_inmail_count` (number)
- [ ] Auto-created columns marked `is_system=false`, `is_locked=false` so users can hide/reorder
- [ ] Engagement columns have `source_type='heyreach'` metadata on the column config
- [ ] Webhook events update corresponding cells: `connection_request_accepted` → set `heyreach_connection_status='accepted'`, increment counters, update `heyreach_last_activity`
- [ ] Cell updates use `source_type='heyreach'` on `dynamic_table_rows`
- [ ] `heyreach_status` column computed from latest event: "Connection Sent", "Connected", "Message Sent", "Replied", "InMail Sent", "InMail Replied", "Followed", "Viewed"
- [ ] Users can toggle individual engagement columns visible/hidden from column picker
- [ ] Column headers show HeyReach icon indicator (Lucide `Linkedin` or `Send` icon)
- [ ] Engagement column cells are read-only (no manual edit — data from webhooks only)
- [ ] Typecheck passes
- [ ] Verify in browser on localhost:5175

### HR-008: LinkedIn Activity Timeline
**Description:** As a sales rep, I want to see a chronological timeline of all LinkedIn interactions with a lead so that I have full context before reaching out.

**Acceptance Criteria:**
- [ ] "View LinkedIn Activity" button appears in row detail panel when row has HeyReach data
- [ ] Timeline shows all HeyReach events for that lead in reverse chronological order
- [ ] Each event shows: icon (per event type), event description, timestamp (relative + absolute on hover)
- [ ] Event type icons: Send icon for messages, UserPlus for connection, Eye for profile view, Heart for like, Mail for InMail, Tag for tag update
- [ ] Message events show message preview text (if available in webhook payload)
- [ ] Reply events highlighted with accent color (these are the high-value signals)
- [ ] Timeline loads from `heyreach_sync_history` filtered by lead's `heyreach_lead_id` or LinkedIn URL
- [ ] Empty state: "No LinkedIn activity yet" with suggestion to push lead to a campaign
- [ ] Timeline scrollable with max height, most recent events on top
- [ ] Timeline accessible from both: row detail panel button AND clicking the `heyreach_last_activity` cell
- [ ] Typecheck passes
- [ ] Verify in browser on localhost:5175

### HR-009: Ops Rules — Webhook Event Triggers
**Description:** As a sales manager, I want to create automation rules triggered by HeyReach events so that my team automatically follows up on LinkedIn engagement.

**Acceptance Criteria:**
- [ ] Migration extends `ops_rules.trigger_type` CHECK to include: `'heyreach_connection_accepted'`, `'heyreach_reply_received'`, `'heyreach_inmail_reply_received'`, `'heyreach_message_sent'`, `'heyreach_connection_sent'`, `'heyreach_inmail_sent'`, `'heyreach_follow_sent'`, `'heyreach_liked_post'`, `'heyreach_viewed_profile'`, `'heyreach_tag_updated'`
- [ ] Migration extends `ops_rules.action_type` CHECK to include: `'push_to_heyreach'` (add lead to another campaign)
- [ ] Webhook handler (HR-005) evaluates matching ops rules after processing each event
- [ ] Rule builder UI shows HeyReach triggers grouped under "LinkedIn / HeyReach" category
- [ ] Each trigger shows relevant condition fields (e.g., reply_received can filter by campaign)
- [ ] All existing action types work with HeyReach triggers: `update_cell`, `run_enrichment`, `push_to_hubspot`, `add_tag`, `notify` (Slack), `webhook`, `push_to_heyreach`
- [ ] `push_to_heyreach` action type: picks target campaign + field mapping (reuses campaign link config)
- [ ] Rule execution logged to `ops_rule_executions` with HeyReach event metadata
- [ ] Typecheck passes
- [ ] Verify in browser on localhost:5175

### HR-010: Auto-Push Rules
**Description:** As a sales rep, I want new leads matching my criteria to automatically be pushed to my HeyReach campaign so that outreach starts without manual intervention.

**Acceptance Criteria:**
- [ ] New ops rule trigger type: `'row_created'` + condition `source_table_has_heyreach_link` (or existing `row_created` works if scoped to table)
- [ ] New action: when `row_created` or `cell_updated` matches filter → `push_to_heyreach` with `campaign_link_id`
- [ ] Filter conditions: match on any cell value (e.g., "tag = 'LinkedIn Target'", "status = 'Qualified'")
- [ ] Field mapping inherited from `heyreach_campaign_links.field_mapping`
- [ ] Sender assignment from sender column (if configured)
- [ ] Debounce: if same row pushed to same campaign within 5 minutes, skip duplicate push
- [ ] Auto-push logged to `heyreach_sync_history` with `metadata.trigger='auto_rule'`
- [ ] Rule can be paused/resumed independently of campaign link
- [ ] Typecheck passes
- [ ] Verify in browser on localhost:5175

### HR-011: Scheduled Sync
**Description:** As a sales rep, I want to schedule automatic pushes of new leads to HeyReach so that my campaign always has fresh leads without daily manual work.

**Acceptance Criteria:**
- [ ] Schedule configuration on `heyreach_campaign_links`: `sync_schedule` (JSONB) with `frequency` ('hourly', 'daily', 'custom_cron'), `filter` (ops table filter criteria), `is_enabled` (boolean), `last_scheduled_run_at`
- [ ] Migration adds `sync_schedule` column to `heyreach_campaign_links`
- [ ] Edge function `heyreach-scheduled-sync/index.ts`: queries all enabled schedules, checks if due, pushes matching rows
- [ ] "Only new rows" logic: push rows created/updated after `last_push_at` that match filter
- [ ] Schedule config UI in campaign link settings: frequency picker + filter builder + enable/disable toggle
- [ ] Scheduled sync logged to `heyreach_sync_history` with `metadata.trigger='scheduled'`
- [ ] Edge function callable by Supabase cron (pg_cron) or external scheduler
- [ ] If push fails, retry on next schedule — don't retry immediately
- [ ] Typecheck passes
- [ ] Verify in browser on localhost:5175

### HR-012: Webhook Health Monitoring
**Description:** As an org admin, I want to be alerted if my HeyReach webhooks stop firing so that I can investigate before leads fall through the cracks.

**Acceptance Criteria:**
- [ ] Edge function `heyreach-health-check/index.ts`: runs on schedule (every 6 hours), checks `last_webhook_received_at` for all active integrations
- [ ] If `last_webhook_received_at` is >24h ago AND integration has active campaign links → flag as unhealthy
- [ ] Unhealthy state triggers: Slack notification to connected user, in-app toast on next visit
- [ ] Health status indicator in HeyReachConfigModal: green dot (healthy), yellow dot (>12h silence), red dot (>24h silence)
- [ ] "Last webhook received: {time ago}" displayed next to health indicator
- [ ] Health check skips integrations with no campaign links (no webhooks expected)
- [ ] Health check logged to `integration_sync_logs` with `operation='health_check'`
- [ ] Typecheck passes
- [ ] Verify in browser on localhost:5175

## Functional Requirements

- FR-1: The system must authenticate all HeyReach API calls with `X-API-KEY` header and respect 300 req/min rate limit
- FR-2: The system must store HeyReach API keys in `heyreach_org_credentials` (service-role-only) — never expose to frontend
- FR-3: The system must validate incoming webhooks via API key in URL query parameter
- FR-4: The system must resolve webhook events to ops table rows by LinkedIn URL (primary) or email (fallback)
- FR-5: The system must batch outbound lead pushes at 100 per API call with queuing for large pushes
- FR-6: The system must log all sync operations to both `heyreach_sync_history` and `integration_sync_logs`
- FR-7: The system must auto-create engagement columns on first inbound webhook for a linked table
- FR-8: The system must evaluate ops rules after processing each webhook event
- FR-9: The system must debounce auto-push rules to prevent duplicate pushes within 5 minutes
- FR-10: The system must display webhook URL in config modal for users to copy into HeyReach settings

## Non-Goals (Out of Scope)

- Creating HeyReach campaigns from within 60 (campaigns must exist in HeyReach)
- OAuth flow (HeyReach uses API key auth, not OAuth)
- Per-user API keys (org-level only for v1)
- Real-time message composition from 60 (messages are part of HeyReach sequences)
- LinkedIn profile scraping (already handled by existing Apify integration)
- HeyReach billing/subscription management
- Webhook payload transformation/templating (we accept HeyReach's default payload format)

## Technical Considerations

### Schema Changes
- 4 new tables + 1 column addition to `dynamic_table_rows` + extend CHECK constraints on `ops_rules`
- Single migration file following `./scripts/new-migration.sh` convention
- All policies idempotent: `DROP POLICY IF EXISTS` before `CREATE POLICY`

### Edge Functions (5 new)
1. `heyreach-admin` — multi-action handler (connect, disconnect, status, list campaigns, get senders)
2. `heyreach-webhook` — inbound webhook receiver (public, `verify_jwt=false`)
3. `heyreach-sync-outbound` — push leads to campaigns
4. `heyreach-scheduled-sync` — cron-triggered scheduled pushes
5. `heyreach-health-check` — webhook heartbeat monitor

### Existing Patterns to Follow
- **Instantly integration** (`instantly_org_credentials`, `instantly_campaign_links`) — same credential + campaign link model
- **Ops table webhook handler** (`webhook-leads/handlers/ops-table-inbound.ts`) — rate limiting, AI field mapping, batch processing
- **Integration sync logs** (`useIntegrationSyncLogs.ts`) — extend `IntegrationName` type with `'heyreach'`
- **ConfigureModal** wrapper for settings UI
- **Ops rules engine** for trigger/action extension

### Security
- API keys in service-role-only table with no user RLS
- Webhook endpoint uses URL-based API key (no HMAC from HeyReach)
- Rate limiting on webhook receiver (300 req/min per org)
- Edge functions use `edgeAuth.ts` for authenticated endpoints

### Performance
- Batch outbound pushes at 100 leads per API call
- Webhook handler returns 200 immediately, processes asynchronously if payload is large
- Engagement column updates use single cell upserts (not full row rewrite)
- Scheduled sync uses `last_push_at` to only process new/changed rows

## Success Metrics

- Time from HeyReach event → visible in ops table: <5 seconds
- Push success rate: >95% for leads with valid LinkedIn URLs
- Zero API key exposure to frontend (verified via network tab)
- All 9 webhook event types correctly parsed and displayed
- Scheduled sync reliability: >99% of scheduled runs execute on time

## Open Questions

- HeyReach webhook payload exact field names need to be captured from a real webhook (documentation is sparse — first webhook will be logged raw for mapping verification)
- Custom variable support in HeyReach field mapping — need to test if custom vars are passed through in webhook payloads
