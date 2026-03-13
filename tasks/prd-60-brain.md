# PRD: 60 Brain — Event-Driven AI Teammate

## Introduction

60 Brain transforms the copilot from a reactive tool into a proactive AI teammate. The system detects every event either side of the sales call — new meetings, completed calls, deal changes, stale follow-ups — chains them through the orchestrator, surfaces results in a new intelligence inbox, and alerts via Slack DM when things need attention or break.

**The core problem:** The infrastructure exists (50+ cron jobs, 27+ agent edge functions, 25 abilities, full `command_centre_items` schema, fleet routing tables) but the pieces aren't wired end-to-end. Events happen in the database and nothing tells the orchestrator. The Command Center is a chat interface, not an inbox. Abilities don't explain themselves. Broken integrations go unnoticed.

**The fix:** Wire the nervous system. DB triggers → orchestrator → event chains → CC inbox + Slack DM. Make the brain visible, reliable, and self-healing.

## Goals

- Every meeting gets a prep brief before and a follow-up draft after — without the user lifting a finger
- The CC inbox shows 5-10 actionable items per day that can be approved in one click
- The brain detects broken integrations and alerts the user via Slack DM before they notice
- Ability cards show exactly when/how each ability fires and let users tune thresholds inline
- The system learns from user edits and graduates autonomy over time
- One consolidated morning Slack DM replaces scattered notifications

## User Stories

---

### Phase 1: Foundation (Schema + DB Triggers)

### US-001: Ensure agent_trigger_runs Table + Fix Rate Limiting
**Description:** As a platform engineer, I want the `agent_trigger_runs` table to exist and rate limiting to work correctly, so that trigger execution is observable and bounded.

**Acceptance Criteria:**
- [ ] Migration creates `agent_trigger_runs` table if not exists (id, trigger_id, organization_id, agent_name, user_id, trigger_event, event_payload JSONB, success BOOLEAN, response_text TEXT, delivered BOOLEAN, duration_ms INT, error_message TEXT, created_at TIMESTAMPTZ)
- [ ] Index on `(organization_id, created_at)` for rate limit queries
- [ ] Rate limit check in `agent-trigger/index.ts` handles missing table gracefully (returns error, not silent bypass)
- [ ] Typecheck passes

---

### US-002: DB Triggers for Deal Events → agent-trigger
**Description:** As a sales rep, I want deal creation and stage changes to automatically trigger agent workflows, so that my pipeline stays active without manual intervention.

**Acceptance Criteria:**
- [ ] PostgreSQL trigger on `deals` INSERT calls `agent-trigger` via `pg_net.http_post()` with event `deal_created`
- [ ] PostgreSQL trigger on `deals` UPDATE (when `stage` column changes) calls `agent-trigger` with event `deal_stage_changed`
- [ ] Trigger payload includes `deal_id`, `organization_id`, `owner_id`, `stage` (old and new for stage changes), `value`
- [ ] Follows existing pattern from `ops_rule_event_triggers` migration (debounce, service role auth)
- [ ] Auth uses Vault-secured service role key (not hardcoded)
- [ ] Typecheck passes

---

### US-003: DB Triggers for Calendar + Meeting Events → agent-trigger
**Description:** As a sales rep, I want new calendar events and completed meetings to automatically trigger prep and follow-up workflows.

**Acceptance Criteria:**
- [ ] PostgreSQL trigger on `calendar_events` INSERT (where attendees include external domains) calls `agent-trigger` with event type `calendar_event_created`
- [ ] PostgreSQL trigger on `meetings` UPDATE (when `status` changes to 'completed' or `recording_url` is set) calls `agent-trigger` with event `meeting_completed`
- [ ] Calendar trigger payload includes `event_id`, `user_id`, `organization_id`, `start_time`, `attendees`, `title`
- [ ] Meeting trigger payload includes `meeting_id`, `owner_user_id`, `organization_id`, `deal_id`, `recording_url`
- [ ] Triggers respect `agent_triggers` table — only fire if org has matching enabled triggers
- [ ] Typecheck passes

---

### US-004: DB Triggers for Contact + Task Events → agent-trigger
**Description:** As a sales rep, I want new contacts to be auto-enriched and overdue tasks to trigger escalation without me checking manually.

**Acceptance Criteria:**
- [ ] PostgreSQL trigger on `contacts` INSERT calls `agent-trigger` with event `contact_created`
- [ ] PostgreSQL trigger on `tasks` UPDATE (when `due_date` < now() AND `completed` = false) calls `agent-trigger` with event `task_overdue`
- [ ] Contact payload includes `contact_id`, `owner_id`, `organization_id`, `email`, `company_id`
- [ ] Task payload includes `task_id`, `assigned_to`, `organization_id`, `deal_id`, `title`, `due_date`
- [ ] Task trigger has debounce (max once per task per 24h) to prevent spam
- [ ] Typecheck passes

---

### US-005: Fleet Handoff Routes for Pre-Call Chain
**Description:** As a platform engineer, I want the pre-call event chain defined in `fleet_handoff_routes` so that calendar events automatically cascade through research → dossier → notification.

**Acceptance Criteria:**
- [ ] Insert fleet_event_route: `calendar_event_created` → sequence key `pre-meeting-prep`
- [ ] Insert fleet_sequence_definition for pre-call chain: lead_research → company_analysis → pre_meeting_dossier → talking_points → notify_user
- [ ] Insert fleet_handoff_routes: `lead_research.complete` → `pre_meeting_dossier`, `pre_meeting_dossier.complete` → `notify_user`
- [ ] Context mapping passes `contact_id`, `company_id`, `meeting_id`, `start_time` through the chain
- [ ] Typecheck passes

---

### US-006: Fleet Handoff Routes for Post-Call Chain
**Description:** As a platform engineer, I want the post-call event chain defined so that completed meetings cascade through transcript → actions → follow-up → CRM update.

**Acceptance Criteria:**
- [ ] Insert fleet_event_route: `meeting_completed` → sequence key `post-meeting-followup-pack`
- [ ] Insert fleet_sequence_definition for post-call chain: transcript_extraction → action_items → followup_email_draft → crm_update → deal_create_or_update → cc_items
- [ ] Insert fleet_handoff_routes for each step completion → next step
- [ ] Context mapping passes `meeting_id`, `recording_url`, `deal_id`, `contact_ids` through the chain
- [ ] Typecheck passes

---

### Phase 2: Event Chains (Edge Functions)

### US-007: Pre-Call — Calendar Event → Lead Research
**Description:** As a sales rep, I want lead and company research to start automatically when a new meeting with an external attendee appears on my calendar.

**Acceptance Criteria:**
- [ ] `agent-trigger` handler for `calendar_event_created` identifies external attendees (different email domain)
- [ ] Triggers `lead-research` or `company-research` skill via orchestrator for each external attendee/company
- [ ] Stores research results linked to the `calendar_event_id` and `contact_id`
- [ ] Fires handoff event `lead_research.complete` with results payload
- [ ] Skips if research already exists for this contact within last 30 days
- [ ] Typecheck passes

---

### US-008: Pre-Call — Research Complete → Pre-Meeting Dossier
**Description:** As a sales rep, I want a meeting dossier auto-generated from research so I walk into calls prepared.

**Acceptance Criteria:**
- [ ] Handoff from `lead_research.complete` triggers `pre-meeting-dossier` skill
- [ ] Dossier includes: company summary, attendee profiles, deal context (if exists), talking points, potential objections
- [ ] Dossier stored as `command_centre_item` with `item_type: 'meeting_prep'` and `urgency` based on time until meeting
- [ ] Fires handoff event `pre_meeting_dossier.complete`
- [ ] Typecheck passes

---

### US-009: Pre-Call — Dossier Ready → CC Item + Slack DM
**Description:** As a sales rep, I want to be notified when my meeting prep is ready — via CC inbox and Slack DM at a configurable time before the call.

**Acceptance Criteria:**
- [ ] Creates `command_centre_item` with status `ready`, priority based on meeting imminence
- [ ] Sends Slack DM using `_shared/proactive/deliverySlack.ts` with Block Kit format
- [ ] Slack message includes: meeting title, time, attendee names, key talking points, "View full brief" button
- [ ] Default timing: 30 minutes before meeting start (configurable per-ability via threshold editing)
- [ ] Respects user's quiet hours and Slack rate limits
- [ ] Typecheck passes

---

### US-010: Post-Call — Meeting Completed → Transcript + Action Items
**Description:** As a sales rep, I want meeting transcripts processed and action items extracted automatically after every call.

**Acceptance Criteria:**
- [ ] `agent-trigger` handler for `meeting_completed` triggers transcript extraction if recording_url exists
- [ ] Extracted action items stored in `command_centre_items` with `item_type: 'follow_up'`
- [ ] Each action item includes: description, assignee (if identifiable), deadline (if mentioned), linked deal/contact
- [ ] Fires handoff event `action_items.complete` with extracted items payload
- [ ] Typecheck passes

---

### US-011: Post-Call — Actions → Follow-Up Draft + CRM Update
**Description:** As a sales rep, I want follow-up emails drafted and CRM updated automatically after calls, ready for my approval.

**Acceptance Criteria:**
- [ ] Handoff from `action_items.complete` triggers `draft-followup-email` skill
- [ ] Follow-up email draft stored as `command_centre_item` with `item_type: 'follow_up'`, `drafted_action` containing email subject/body/recipients
- [ ] CRM update (deal stage, activity log, contact notes) prepared as separate CC item with `hasApproval: true`
- [ ] If no deal exists for this meeting's company, creates CC item suggesting deal creation with pre-filled data
- [ ] All items require approval (initial autonomy tier = `approve`)
- [ ] Typecheck passes

---

### US-012: Pipeline — Deal Stage Change → Risk Rescore + Next Actions
**Description:** As a sales rep, I want deal risk automatically reassessed and next best actions suggested when a deal moves stages.

**Acceptance Criteria:**
- [ ] `agent-trigger` handler for `deal_stage_changed` triggers risk rescore via `agent-deal-risk-batch`
- [ ] Risk rescore result creates/updates CC item with `item_type: 'risk_alert'` if risk is elevated
- [ ] Next best actions generated via `suggest-next-actions` skill and added as CC items
- [ ] CC items linked to `deal_id` for grouping in inbox
- [ ] Typecheck passes

---

### US-013: Pipeline — Task Overdue, Proposal Sent, Cold Deal Triggers
**Description:** As a sales rep, I want escalation reminders for overdue tasks, follow-up timers for sent proposals, and re-engagement sequences for cold deals.

**Acceptance Criteria:**
- [ ] Task overdue → CC item with `urgency: 'high'` + Slack DM escalation
- [ ] Proposal sent event (deal stage → 'proposal') → creates follow-up timer CC item (3 days default)
- [ ] Cold deal detection (no activity > 14 days, deal still open) → CC item suggesting re-engagement + triggers `stale-deal-revival` sequence if enabled
- [ ] Each trigger respects per-org ability enablement settings
- [ ] Typecheck passes

---

### Phase 3: Command Center Intelligence Inbox

### US-014: CC Inbox Feed Component
**Description:** As a sales rep, I want to see a feed of AI-generated action items in my Command Center, prioritized by urgency and relevance.

**Acceptance Criteria:**
- [ ] New `CommandCenterInbox` component queries `command_centre_items` where status IN ('open', 'ready') for current user
- [ ] Items sorted by `priority_score` DESC, `urgency` (critical > high > normal > low), `created_at` DESC
- [ ] Supabase realtime subscription on `command_centre_items` for live updates (INSERT, UPDATE)
- [ ] Realtime subscription tracked via `realtimeMonitor`
- [ ] Empty state: "Your AI is watching — items will appear as events happen"
- [ ] Typecheck passes
- [ ] Verify in browser on localhost:5175

---

### US-015: CC Item Action Cards
**Description:** As a sales rep, I want each CC item to have approve/dismiss/snooze actions so I can act quickly.

**Acceptance Criteria:**
- [ ] Each CC item card shows: icon (by item_type), title, summary (truncated), urgency badge, source agent badge, time ago
- [ ] "Approve" button executes `drafted_action` (calls appropriate edge function)
- [ ] "Dismiss" button sets status to `dismissed` with optional reason
- [ ] "Snooze" dropdown: 1 hour, 4 hours, tomorrow, next week — sets `due_date` and status back to `open`
- [ ] Approve/dismiss triggers `autopilot-record-signal` with appropriate signal type
- [ ] Expanding a card shows full context, drafted action preview, and linked entity (deal/contact)
- [ ] Typecheck passes
- [ ] Verify in browser on localhost:5175

---

### US-016: CC Primary View Swap — Inbox First, Chat Second
**Description:** As a sales rep, I want the Command Center to show my intelligence inbox by default, with copilot chat as a secondary tab.

**Acceptance Criteria:**
- [ ] `CommandCenter` component restructured with tabs: "Inbox" (default) and "Chat"
- [ ] Inbox tab renders `CommandCenterInbox` component
- [ ] Chat tab renders existing copilot conversational interface
- [ ] Unread/pending count badge on Inbox tab showing items needing attention
- [ ] Tab state persists in Zustand store (survives navigation)
- [ ] SheetContent uses `!top-16 !h-[calc(100vh-4rem)]` pattern
- [ ] Typecheck passes
- [ ] Verify in browser on localhost:5175

---

### US-017: Approval Counter + Auto-Execute Progress
**Description:** As a sales rep, I want to see how many times I've approved each action type and how close I am to auto-execute, so I understand the AI's growing autonomy.

**Acceptance Criteria:**
- [ ] Each CC item card shows subtle badge: "Approved 8 of these · 7 more to auto-execute" (reads from `autopilot_confidence` table)
- [ ] Progress bar or counter uses `total_signals`, `clean_approval_rate`, and promotion threshold from `autopilot_thresholds`
- [ ] When `promotion_eligible = true`, shows highlighted nudge: "Want me to handle these automatically?"
- [ ] Clicking nudge calls `autopilot-evaluate` to propose tier promotion
- [ ] Badge hidden for items where `never_promote = true`
- [ ] Typecheck passes
- [ ] Verify in browser on localhost:5175

---

### Phase 4: Ability Card Interactive Popovers

### US-018: Ability Card Trigger Flow Visualization
**Description:** As a sales rep, I want to see a visual flow of how each ability works — what triggers it, what it does, and how it delivers results.

**Acceptance Criteria:**
- [ ] New `AbilityTriggerFlow` component renders a mini vertical timeline/flow diagram
- [ ] Flow shows: Trigger (e.g., "New calendar event with external attendee") → Processing steps (e.g., "Lead research → Company analysis → Dossier") → Delivery (e.g., "Slack DM 30 min before + CC inbox item")
- [ ] Data sourced from `abilityRegistry.ts` — triggerType, stepCount, eventType, defaultChannels
- [ ] Different visual treatment for cron (clock icon), event (lightning), chain (link) trigger types
- [ ] Renders inside `AbilityDetailSheet` popover
- [ ] Typecheck passes
- [ ] Verify in browser on localhost:5175

---

### US-019: Ability Card Live Stats Panel
**Description:** As a sales rep, I want to see when an ability last ran, how often it succeeds, and how many times it's fired.

**Acceptance Criteria:**
- [ ] New RPC or query fetches stats from `agent_trigger_runs` + `agent_schedule_runs` for each ability
- [ ] Stats panel shows: last run timestamp (relative, e.g., "2 hours ago"), total runs (last 30 days), success rate (%), average duration
- [ ] Success rate color-coded: green ≥90%, yellow 70-89%, red <70%
- [ ] "Never run" state if no executions found
- [ ] Stats refresh on sheet open (not realtime — one-time fetch)
- [ ] Typecheck passes
- [ ] Verify in browser on localhost:5175

---

### US-020: Ability Card Inline Threshold Editing + Channel Toggles
**Description:** As a sales rep, I want to adjust when abilities fire (e.g., "30 min before" → "1 hour before") and toggle delivery channels right from the ability card.

**Acceptance Criteria:**
- [ ] Timing threshold input (number + unit dropdown: minutes/hours) for time-based abilities
- [ ] Changes saved to `user_sequence_preferences` or `agent_triggers` table per user/org
- [ ] Delivery channel toggles (Slack, Email, In-App) using Switch components
- [ ] Channel toggles read/write from `useAgentAbilityPreferences` hook (existing)
- [ ] Changes take effect on next trigger (no restart needed)
- [ ] Disabled state for channels requiring unconnected integrations (e.g., Slack toggle disabled if Slack not connected)
- [ ] Typecheck passes
- [ ] Verify in browser on localhost:5175

---

### Phase 5: Reliability

### US-021: Integration Health Heartbeat Edge Function
**Description:** As a sales rep, I want the system to check my integrations every 2 hours and alert me via Slack DM if something breaks, before I discover it myself.

**Acceptance Criteria:**
- [ ] New `integration-health-heartbeat` edge function, deployed with `--no-verify-jwt`
- [ ] Cron schedule: every 2 hours via `pg_cron`
- [ ] Checks: Google Calendar sync freshness (alert if >6h since last sync), Slack bot token validity, HubSpot connection status, Fathom token expiry
- [ ] For each failing integration: creates CC item via `emitCCItem()` with `item_type: 'integration_alert'`, `urgency: 'high'`
- [ ] Sends Slack DM to affected user: "[Integration] needs attention — [action to fix]"
- [ ] Deduplicates: max 1 alert per integration per 24h (check `command_centre_items` for recent matching alert)
- [ ] Typecheck passes

---

### US-022: Slack Delivery Audit Trail
**Description:** As an admin, I want every Slack message attempt logged so I can diagnose "why didn't I get that notification?"

**Acceptance Criteria:**
- [ ] Migration creates `slack_delivery_log` table (id, user_id, org_id, message_type, channel_id, success BOOLEAN, error_message TEXT, blocked_reason TEXT, created_at)
- [ ] `_shared/proactive/deliverySlack.ts` logs every send attempt (success and failure) with reason (quiet_hours, rate_limited, token_expired, channel_not_found, sent)
- [ ] Index on `(user_id, created_at)` for quick lookups
- [ ] Queryable from brain health dashboard (S10)
- [ ] Typecheck passes

---

### US-023: Circuit Breakers for Cron Jobs
**Description:** As a sales rep, I want failing heartbeats to auto-disable and alert me via Slack DM instead of silently failing forever.

**Acceptance Criteria:**
- [ ] Track consecutive failures per cron job in `cron_job_logs` or new `cron_circuit_breaker` table
- [ ] After 5 consecutive failures: disable the cron job, send Slack DM to affected users: "Your [ability name] has been paused due to repeated failures. We'll retry in 1 hour."
- [ ] Auto-retry after 1 hour cooldown: re-enable and attempt one run
- [ ] If retry succeeds: resume normal schedule, send recovery DM: "[ability name] is back online"
- [ ] If retry fails: extend cooldown to 4 hours, then 24 hours (exponential backoff)
- [ ] Typecheck passes

---

### Phase 6: Intelligence

### US-024: Event Replay Trail on CC Items
**Description:** As a sales rep, I want to see a visual trace of how each CC item was created — what event triggered it, what steps ran, and where anything failed.

**Acceptance Criteria:**
- [ ] New `EventReplayTrail` component renders a horizontal breadcrumb trail
- [ ] Each step shows: icon, label, status (✅ complete, ⏳ running, ❌ failed, ⏭ skipped)
- [ ] Data sourced from `sequence_executions` + `agent_trigger_runs` linked via `source_event_id`
- [ ] Failed steps show error message on hover/click
- [ ] Renders inside expanded CC item detail view
- [ ] "Show trace" link on CC item cards and Slack DM messages (deep link to CC item)
- [ ] Typecheck passes
- [ ] Verify in browser on localhost:5175

---

### US-025: Graduated Autonomy UI in CC Inbox
**Description:** As a sales rep, I want to see my current autonomy level per action type and get in-app promotion proposals, not just Slack nudges.

**Acceptance Criteria:**
- [ ] Settings page section: "AI Autonomy" showing each action type with current tier (suggest/approve/auto), confidence score bar, approval count, and toggle to promote/demote
- [ ] In CC inbox: when `pending_promotion_nudge = true`, show banner: "You've approved X [action type] without changes. Let me handle these automatically?" with Accept/Not Now buttons
- [ ] Accept calls promotion engine, updates tier, records signal
- [ ] Not Now snoozes nudge for 7 days
- [ ] Typecheck passes
- [ ] Verify in browser on localhost:5175

---

### US-026: Implement CC Auto-Execute Action Dispatch
**Description:** As a platform engineer, I want the CC auto-execute function to actually execute actions instead of being a stub, so that graduated autonomy works end-to-end.

**Acceptance Criteria:**
- [ ] Replace stub in `cc-auto-execute/index.ts` (CC12-007) with real action dispatch
- [ ] Dispatch routes by `drafted_action.type`: `send_email` → `email-send-as-rep`, `update_crm` → `agent-crm-update`, `create_task` → task creation, `send_slack` → `slack-send`
- [ ] Rate limits preserved: 10 total/day, 3 external-facing/day per user
- [ ] Pre-exec state stored for undo support (existing `context.pre_exec_state` pattern)
- [ ] Records `autopilot-record-signal` with `auto_executed` signal type
- [ ] Typecheck passes

---

### US-027: Learn from Edits — Capture Edited Content
**Description:** As a sales rep, I want my edits to AI-generated drafts to be captured so the system can learn my preferences.

**Acceptance Criteria:**
- [ ] When user edits a draft in the CC inbox approval flow, edited content saved to `hitl_pending_approvals.edited_content`
- [ ] HITL callback (`triggerHITLCallback`) sends `edited_content` (not `original_content`) when edits exist
- [ ] Signal recorded as `approved_edited` (not `approved`) in autopilot system
- [ ] Original and edited content both preserved for diff analysis
- [ ] Typecheck passes

---

### US-028: Learn from Edits — Diff Extraction + Preference Memories
**Description:** As a sales rep, I want the system to analyze my edits, extract style preferences, and remember them for future drafts.

**Acceptance Criteria:**
- [ ] New `extract-edit-feedback` edge function triggers when `hitl_pending_approvals` has `status='approved'` AND `edited_content IS NOT NULL`
- [ ] Uses Claude to compare original vs edited content and extract: what changed (greeting, tone, length, structure), inferred preference, confidence score
- [ ] Creates `copilot_memories` record with `category: 'preference'`, subject describing the preference, confidence score
- [ ] Deduplicates: if similar preference already exists, updates confidence instead of creating duplicate
- [ ] Typecheck passes

---

### US-029: Inject Learned Preferences into Draft Generation
**Description:** As a sales rep, I want future AI-generated drafts to reflect my learned writing preferences so I edit less over time.

**Acceptance Criteria:**
- [ ] `draft-followup-email` skill (and other draft generation skills) fetches recent `preference` memories for the user before generating
- [ ] Preferences injected into system prompt: "User's writing style: [preferences]. Apply these patterns."
- [ ] Contact-specific preferences (e.g., "casual tone for Acme Corp") override general preferences
- [ ] If no preferences exist yet, generation works as before (no regression)
- [ ] Typecheck passes

---

### US-030: Consolidated Morning Brain DM
**Description:** As a sales rep, I want one Slack DM each morning that covers everything: meetings, auto-executed actions, integration alerts, deals, and overnight activity.

**Acceptance Criteria:**
- [ ] Merge `slack-morning-brief` and `agent-morning-briefing` into single consolidated builder
- [ ] Sections (in order): Auto-executed overnight actions (from CC items with `resolution_channel: 'auto_exec'`), Integration alerts (from heartbeat), Follow-ups due, Today's meetings (with "Prep" buttons), Deals needing attention, Overnight activity (wire existing `overnightSummary.ts`), AI-generated priorities
- [ ] Block Kit format with action buttons per section
- [ ] Per-user timezone-aware timing (existing `preferred_briefing_time`)
- [ ] Single cron trigger (deduplicate, remove System B separate run)
- [ ] Typecheck passes

---

### US-031: Morning DM "Reply More" Thread Handler
**Description:** As a sales rep, I want to reply "more" to my morning brief and get expanded details in a thread.

**Acceptance Criteria:**
- [ ] Slack event handler detects "more" reply (or 👀 reaction) in morning brief DM thread
- [ ] Responds in thread with expanded view: full meeting details, all deal context, complete overnight log, integration diagnostic details
- [ ] Supports section-specific expansion: "more meetings", "more deals", "more overnight"
- [ ] Handler registered in `slack-events` or `slack-interactive` router
- [ ] Typecheck passes

---

### US-032: Cross-Deal Pattern Intelligence
**Description:** As a sales rep, I want the AI to spot patterns across my pipeline and proactively suggest what works — like "deals with case studies close 3x faster."

**Acceptance Criteria:**
- [ ] Wire `agent-pipeline-patterns` and `agent-engagement-patterns` outputs as proactive CC items
- [ ] Pattern insights created as CC items with `item_type: 'insight'`, `urgency: 'normal'`
- [ ] Insights include: pattern description, evidence (which deals), suggested action, confidence score
- [ ] Example patterns: "Deals stall at Proposal — send case study within 48h", "Multi-threaded deals close 3x faster", "Follow-ups within 24h have 2x response rate"
- [ ] Max 2 pattern insights per week per user (avoid noise)
- [ ] Typecheck passes

---

### Phase 7: Admin + Onboarding

### US-033: Brain Health Dashboard (Agent Demo Page)
**Description:** As an admin, I want to see the health of all brain heartbeats, trigger rates, errors, and dead letter queue depth on the Agent Demo page.

**Acceptance Criteria:**
- [ ] New section on Agent Demo page: "Brain Health"
- [ ] Shows: all active cron jobs with last run time and status (healthy/warning/error), trigger fire rate (last 24h), error rate and top errors, dead letter queue depth (`agent_dead_letters` count), Slack delivery success rate (from `slack_delivery_log`)
- [ ] Color-coded status: green (all healthy), yellow (some warnings), red (failures detected)
- [ ] Data fetched via single RPC that aggregates `agent_schedule_runs`, `agent_trigger_runs`, `agent_dead_letters`, `slack_delivery_log`
- [ ] Auto-refresh every 30 seconds
- [ ] Typecheck passes
- [ ] Verify in browser on localhost:5175

---

### US-034: First 24h Onboarding — Brain Does Something Visible
**Description:** As a new user, I want the brain to do something visible within my first 24 hours so I know it's working — even if it's just "I noticed 3 stale deals."

**Acceptance Criteria:**
- [ ] On first login (or first calendar sync), trigger `agent-initial-scan` to analyze existing data
- [ ] Initial scan creates 2-5 CC items: stale deals found, upcoming meetings to prep for, contacts needing follow-up, integration setup suggestions
- [ ] If calendar is connected: prep the next upcoming meeting immediately
- [ ] If no data yet: CC item says "Connect your calendar and I'll prep your first meeting"
- [ ] Items styled with "Welcome" badge to distinguish from ongoing items
- [ ] Typecheck passes
- [ ] Verify in browser on localhost:5175

---

## Functional Requirements

- FR-1: Database triggers on `deals`, `calendar_events`, `meetings`, `contacts`, and `tasks` must invoke `agent-trigger` via `pg_net.http_post()` with Vault-secured auth
- FR-2: Event chains must be defined in `fleet_event_routes`, `fleet_sequence_definitions`, and `fleet_handoff_routes` — not hardcoded in edge functions
- FR-3: All CC items must follow the `command_centre_items` schema lifecycle: open → enriching → ready → approved → executing → completed
- FR-4: All user-facing actions (email send, CRM update, deal creation) must require approval until autonomy tier is promoted to `auto`
- FR-5: Slack DMs must respect quiet hours, rate limits, and delivery preferences from `slack_user_preferences`
- FR-6: Every trigger execution must be logged to `agent_trigger_runs` for observability and replay
- FR-7: Circuit breakers must auto-disable failing cron jobs after 5 consecutive failures with exponential backoff recovery
- FR-8: Edit capture must preserve both `original_content` and `edited_content` in `hitl_pending_approvals` for learning
- FR-9: Morning brain DM must consolidate all overnight intelligence into a single per-user message
- FR-10: Ability card popovers must show live stats, trigger flow, and inline threshold editing

## Non-Goals (Out of Scope)

- **Real-time collaborative editing** of AI-generated drafts (approve/edit is sufficient)
- **Multi-org event chains** — triggers fire within a single organization only
- **Custom trigger creation by users** — admins configure via ability toggles, not custom trigger builder
- **Email delivery** as a notification channel (Slack DM + in-app only for v1)
- **Mobile-specific CC inbox** — responsive web is sufficient
- **AI model selection per ability** — uses org-level `orchestrator_model` / `worker_model` from `agent_teams_config`
- **Retroactive event processing** — triggers fire on new events only, not historical data (except US-034 initial scan)

## Technical Considerations

### Schema Changes
- New migration: `agent_trigger_runs` table (US-001)
- New migration: DB triggers on `deals`, `calendar_events`, `meetings`, `contacts`, `tasks` (US-002 through US-004)
- New migration: Fleet handoff route inserts for pre-call and post-call chains (US-005, US-006)
- New migration: `slack_delivery_log` table (US-022)
- New migration: `cron_circuit_breaker` table (US-023)
- Potential column addition: `hitl_pending_approvals.edit_feedback` JSONB (US-028)

### Edge Functions (New or Modified)
- New: `integration-health-heartbeat` (US-021)
- New: `extract-edit-feedback` (US-028)
- Modified: `agent-trigger/index.ts` — add `calendar_event_created` handler, fix rate limit fallback (US-001, US-007)
- Modified: `cc-auto-execute/index.ts` — replace stub with real dispatch (US-026)
- Modified: `slack-morning-brief` — consolidate with `agent-morning-briefing` (US-030)
- Modified: `slack-interactive` or `slack-events` — add "reply more" handler (US-031)
- Modified: `_shared/proactive/deliverySlack.ts` — add audit logging (US-022)
- Modified: `draft-followup-email` — inject learned preferences (US-029)

### Existing Patterns to Follow
- DB triggers: Follow `ops_rule_event_triggers` pattern (debounce, pg_net, Vault auth)
- CC item writing: Use `_shared/commandCentre/writeAdapter.ts` `writeToCommandCentre()` / `emitCCItem()`
- Slack delivery: Use `_shared/proactive/deliverySlack.ts` with Block Kit
- Realtime subscriptions: Track via `realtimeMonitor`, cleanup in useEffect return
- Ability stats: Query `agent_trigger_runs` + `agent_schedule_runs`
- Confidence scoring: Use existing `autopilot_confidence` table and promotion engine

### Performance Requirements
- DB triggers must be async (pg_net, not synchronous HTTP)
- CC inbox realtime subscription: single channel, filtered by user_id
- Morning brief: must complete within 30 seconds per user
- Integration health heartbeat: must complete within 60 seconds for all users in an org

### Deploy Notes
- All new edge functions deployed with `--no-verify-jwt` on staging (ES256 JWT issue)
- Pin `@supabase/supabase-js@2.43.4` on esm.sh in any new edge functions
- New cron jobs via `pg_cron` in migrations using `call_proactive_edge_function()` pattern

## Success Metrics

- **Prep brief coverage**: >90% of meetings with external attendees get a prep brief before the call
- **Follow-up automation**: >80% of completed meetings generate a follow-up draft within 15 minutes
- **CC inbox engagement**: 5-10 actionable items per active user per day, >60% acted on (approved/dismissed, not ignored)
- **Integration alert speed**: User notified within 2 hours of integration failure (vs current: user discovers manually)
- **Autonomy graduation**: Average user promotes first action type to auto-execute within 2 weeks
- **Edit learning**: Approval-without-edit rate increases by 20% over 30 days for users who edit drafts
- **Morning brief engagement**: >70% of users open/interact with the consolidated morning DM

## Open Questions

1. Should the "reply more" handler support natural language queries about the brief content, or just structured section expansion?
2. Should cross-deal pattern insights be org-wide (team patterns) or per-user (individual patterns)?
3. What is the maximum number of CC items to show before pagination/archival kicks in?
4. Should the circuit breaker auto-recovery notification go to the user or to an admin Slack channel?
