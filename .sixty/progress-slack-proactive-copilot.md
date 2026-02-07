# Progress Log — @60 in Slack: Proactive Copilot

## Architecture Decision

**PRD proposed:** Cloudflare Workers + D1 for webhook handling and state management.

**Decision:** Build on existing Supabase Edge Functions + Vercel cron infrastructure.

**Rationale:**
- 20+ Slack edge functions already in production
- 66,600-line `slack-interactive` handler with working HITL approval flow, action routing, modal patterns
- 2,781-line Block Kit builder library with safe truncation
- Complete proactive delivery layer (`_shared/proactive/`) with dedupe, settings, recipients
- Full OAuth flow, user mapping, signature verification
- Introducing Cloudflare would create split-brain architecture with no benefit

## Existing Infrastructure (What We Build On)

| Component | Status | Location |
|-----------|--------|----------|
| Interactive handler | Production | `slack-interactive/index.ts` (66k lines) |
| HITL approval flow | Production | `approve::/reject::/edit::` action routing |
| Block Kit builders | Production | `_shared/slackBlocks.ts` (2,781 lines) |
| Morning brief | Production | `slack-morning-brief/` (basic, needs enhancement) |
| Daily digest | Production | `slack-daily-digest/` (org + per-user) |
| Slash commands | Production | `slack-slash-commands/` (11 handlers) |
| Meeting prep | Production | `slack-meeting-prep/` (cron every 5min) |
| Post-meeting debrief | Production | `slack-post-meeting/` (with HITL follow-up) |
| Stale deal alerts | Production | `slack-stale-deals/` (daily cron) |
| Deal momentum | Built, no cron | `slack-deal-momentum/` (handlers exist) |
| Proactive delivery | Production | `_shared/proactive/` (dedupe, delivery, settings) |
| User mapping | Production | `slack_user_mappings` table |
| Notification settings | Production | `slack_notification_settings` table |

## What Needs Building (28 Stories)

### Sprint 1: Foundation — Make Buttons Work (7 stories)
- Snooze handler + re-notification cron
- Draft follow-up action with HITL approval
- Wire morning brief buttons to interactive handlers
- Action expiry daemon
- Standardized confirmation pattern
- Dismiss handler with engagement tracking

### Sprint 2: Smart Morning Briefing (7 stories)
- Delta detection (only show what changed)
- Priority scoring algorithm
- "All clear" logic
- Instantly campaign section
- Redesigned Block Kit layout per PRD
- Per-user briefing time preference
- Deal movement detection

### Sprint 3: Proactive Event-Driven Messages (8 stories)
- Deal risk monitoring + real-time alerts
- Instantly campaign event monitoring
- Task reminder notifications
- Per-user notification preferences (schema + UI)
- Quiet hours + rate limiting in delivery layer
- Cross-briefing deduplication
- Activate deal momentum cron

### Sprint 4: @60 Command Input (6 stories)
- Wire app_mention to skill router
- Natural language intent parser
- "Add to campaign" command
- "Find contacts like X" command
- Fallback handler with capability list
- Command analytics + rate limiting

---

## Codebase Patterns

- Action ID convention: `{action}::{resource_type}::{resource_id}` (established in HITL system)
- Message updates via `response_url` (Slack 3-second acknowledgement pattern)
- State in Slack `private_metadata` (no backend persistence for modal state)
- Dedupe via `slack_notifications_sent` table with cooldown windows
- Smart Engagement tracking via `record_notification_interaction()` RPC
- Safe Block Kit truncation: `safeHeaderText(150)`, `safeMrkdwn(2800)`, `safeButtonText(75)`

---

## Session Log

### Session 1 (Sprint 1) — Completed
- SLACK-001: Snooze action handler in `slack-interactive/index.ts`
- SLACK-002: Snooze cron + re-notification
- SLACK-003: Wire morning brief buttons
- SLACK-004: Draft follow-up handler with HITL
- SLACK-005: Action expiry daemon
- SLACK-006: Standardized confirmation pattern
- SLACK-007: Dismiss handler with engagement tracking

### Session 2 (Sprint 2) — Completed
- SLACK-008 through SLACK-014: Smart Morning Briefing
- Delta detection via `daily_digest_analyses` snapshot comparison
- Per-user briefing time (cron changed to `*/15 * * * *`)
- Instantly campaign section in morning brief
- `MorningBriefPreferences` component in SlackSettings
- Migration: `20260208000002_user_briefing_preferences.sql`

### Session 3 (Sprint 3) — Completed
- SLACK-015: Deal risk monitoring (`slack-deal-risk-alert/index.ts`)
- SLACK-016: Campaign alerts (`slack-campaign-alerts/index.ts`)
- SLACK-017: Task reminders (`slack-task-reminders/index.ts`)
- SLACK-018: Notification preferences schema (`20260208000003_slack_user_preferences.sql`)
- SLACK-019: `NotificationPreferences` component in SlackSettings
- SLACK-020: Quiet hours + rate limiting in `deliverySlack.ts`
- SLACK-021: Cross-briefing deduplication in task reminders
- SLACK-022: Deal momentum cron activation
- 3 new Vercel cron entries in `vercel.json`

### Session 4 (Sprint 4) — Completed
- SLACK-023: Wire `app_mention` event to intent parser in `slack-events/index.ts`
- SLACK-024: Natural language intent parser (`_shared/slackIntentParser.ts`)
- SLACK-025: "Add to campaign" command — resolves contact (email or CRM name search), finds Instantly campaign by name, adds lead via `lead/add` API
- SLACK-026: "Find contacts" command — parses NL query to Apollo params, calls `mixed_people/api_search`, formats results for Slack with LinkedIn links
- SLACK-027: Fallback handler with capability list (`buildCapabilityList()`)
- SLACK-028: Command analytics + rate limiting (20 commands/user/hour) via `slack_command_analytics` table
- Migration: `20260208000004_slack_command_analytics.sql`
- Fixed: `deals` table uses `owner_id` (not `user_id`)
