# PRD: Critical Meeting Team Alerts

## Introduction

When a client terminates, expresses deep dissatisfaction, or a meeting goes critically wrong, the team currently has no way to know unless the rep manually shares the news. Critical feedback, commitments (e.g. "compile assets and send Google Drive link"), and churn signals fall through the cracks.

This feature automatically detects critical meetings from the existing AI analysis pipeline, alerts the team via a configured Slack channel with rich context, prepares an email draft for approval, tracks commitments as formal action items, and learns from false positives over time.

**The trigger:** The myConsole call — Philip Collard ending the engagement due to unmet video strategy and process misalignment. The system extracted `risk_flag: "Client terminated relationship"` and `sentiment: HIGHLY NEGATIVE`, but nobody else on the team knew until it was too late.

## Goals

- Zero critical meetings go unnoticed by the team — every termination, severe dissatisfaction, or high-risk signal triggers a team-visible alert within minutes of the meeting ending
- Reduce time-to-action on critical meetings from hours/days (manual relay) to minutes (automated detection → alert → tracked action items)
- Configurable thresholds and recipients per org so teams can tune sensitivity without developer intervention
- Email drafts ready for approval so the team can communicate externally within minutes, not hours
- False positive feedback loop so the system gets smarter over time and doesn't become "yet another noisy alert"

## User Stories

### US-001: Risk Flag Extraction from Transcripts
**Description:** As the system, I want to extract structured risk flags from meeting transcripts so that critical signals are captured as structured data, not buried in free text.

**Acceptance Criteria:**
- [ ] Add `risk_flags` JSONB column to `meetings` table via migration
- [ ] Extend the AI analysis prompt in `slack-post-meeting/index.ts` to return `riskFlags` array
- [ ] Each risk flag has: `flag` (string enum), `severity` (critical/high/medium), `evidence` (quoted text from transcript)
- [ ] Flag taxonomy includes at minimum: `client_terminated`, `budget_cut`, `competitor_displacement`, `severe_dissatisfaction`, `relationship_breakdown`, `scope_reduction`, `legal_escalation`
- [ ] Risk flags are stored in the `meetings.risk_flags` column after analysis
- [ ] Also extend `fathom-sync/aiAnalysis.ts` if it runs the parallel analysis path
- [ ] Typecheck passes

### US-002: Critical Meeting Detection Logic
**Description:** As the system, I want a detection function that evaluates whether a meeting crosses the "critical" threshold so that we can trigger team alerts with configurable sensitivity.

**Acceptance Criteria:**
- [ ] Create `isCriticalMeeting({ sentimentScore, riskFlags, coachRating })` function in `_shared/`
- [ ] Returns `{ isCritical: boolean, reasons: string[], severity: 'critical' | 'high' | 'medium' }`
- [ ] Default thresholds: sentiment ≤ -0.7 = critical, ≤ -0.5 = high; any risk flag with severity "critical" = critical
- [ ] Thresholds are read from org settings (see US-003), falling back to defaults
- [ ] Coach rating ≤ 20 contributes to severity escalation
- [ ] Multiple signals compound: negative sentiment + critical risk flag = always critical regardless of individual thresholds
- [ ] Pure function with no side effects — fully unit-testable
- [ ] Typecheck passes

### US-003: Notification Recipient Configuration
**Description:** As a team admin, I want to configure who gets notified when a critical meeting is detected so that the right people are in the loop without spamming everyone.

**Acceptance Criteria:**
- [ ] Add critical alert settings to org notification configuration (use existing `notification_settings` JSONB on `organizations` or `slack_notification_settings`)
- [ ] Configurable fields: `critical_alert_recipients` (role filter: owner/admin/member/all), `critical_alert_threshold` (numeric, default -0.5), `critical_alert_email_recipients` (array of emails or "org_admins")
- [ ] Settings UI in the existing notification/Slack settings page with form fields for threshold slider and recipient multi-select
- [ ] When a user first encounters the feature, prompt them to configure (or use smart defaults: notify all admins, threshold -0.5)
- [ ] Settings persist across sessions
- [ ] Typecheck passes
- [ ] Verify in browser on localhost:5175

### US-004: Slack Channel Configuration
**Description:** As a team admin, I want to choose which Slack channel receives critical meeting alerts so that alerts go to the right place (e.g. #client-updates).

**Acceptance Criteria:**
- [ ] Add `critical_alert_channel_id` to `slack_notification_settings` (or `slack_org_settings`) for feature `critical_meeting_alert`
- [ ] Add a Slack channel selector component to the Slack settings UI
- [ ] Channel selector lists available channels from the Slack API (using existing bot token)
- [ ] Selected channel is saved and used by the delivery function
- [ ] If no channel is configured, fall back to DM to the meeting owner only (no silent failure)
- [ ] Handle "bot not in channel" gracefully with `conversations.join` for public channels, or error message for private channels
- [ ] Typecheck passes
- [ ] Verify in browser on localhost:5175

### US-005: Critical Alert Block Kit Builder
**Description:** As a team member, I want the Slack alert to be rich, actionable, and clear so that I can understand the situation and act immediately without switching tools.

**Acceptance Criteria:**
- [ ] Create `buildCriticalMeetingAlert(data)` in `_shared/slackBlocks.ts`
- [ ] Header with severity badge (critical = red circle, high = orange, medium = yellow) and meeting title
- [ ] Context section: attendees, duration, deal name + stage, company name
- [ ] Sentiment section: score with visual indicator, sentiment reasoning quote
- [ ] Risk flags section: each flag with severity badge and evidence quote from transcript
- [ ] Action items section: extracted commitments with suggested owners and due dates
- [ ] Action buttons: "View Meeting", "View Deal", "Assign Follow-up", "Draft Recovery Email", "Dismiss (False Positive)"
- [ ] All text fields use existing `truncate()` and `safeMrkdwn()` safety helpers
- [ ] Follows existing `buildRiskAlertBlocks()` and `buildMeetingDebriefMessage()` patterns
- [ ] Typecheck passes

### US-006: Slack Channel Delivery
**Description:** As the system, I want to post the critical alert to the configured Slack channel so that the whole team sees it in real time.

**Acceptance Criteria:**
- [ ] Post `buildCriticalMeetingAlert()` output to the configured channel (from US-004)
- [ ] Add `'critical_meeting_alert'` to `ProactiveNotificationType` union type
- [ ] Add to `TRIAGE_MATRIX` with priority `urgent` (bypasses batching)
- [ ] Register in `DEFAULT_COOLDOWNS` with 24h per-meeting-entity cooldown
- [ ] Use `recordNotificationSent()` after delivery (mandatory — prevents spam per current branch learnings)
- [ ] Mirror to in-app notifications via `deliverToInApp()` for all configured recipients
- [ ] Also create `command_centre_items` entry for team visibility
- [ ] If channel delivery fails, fall back to DM to meeting owner + org admins
- [ ] Typecheck passes

### US-007: Email Draft for Approval (HITL)
**Description:** As a rep, I want the system to prepare an email to my team about the critical meeting so that I can review and send it quickly without writing from scratch.

**Acceptance Criteria:**
- [ ] Generate email draft with: subject line, summary of what happened, risk flags, action items, and commitments
- [ ] Email recipients resolved from US-003 config (configured team members' emails from `profiles` table)
- [ ] Email sent from system account (AWS SES) with `Reply-To` set to the rep's email
- [ ] Draft is presented for approval via HITL pattern (Slack interactive message with Approve/Edit/Dismiss buttons)
- [ ] On approve: send via SES to all configured recipients
- [ ] On edit: open in a text input modal for the rep to modify before sending
- [ ] On dismiss: cancel email, log the dismissal
- [ ] Email includes: meeting title, date, attendees, sentiment summary, risk flags with evidence, extracted action items, and any commitments made
- [ ] Typecheck passes

### US-008: Role-Based Alert Gating
**Description:** As an org admin, I want different team members to see different levels of detail so that sensitive deal financials aren't exposed to everyone.

**Acceptance Criteria:**
- [ ] Admin/owner role sees full alert: all risk flags, evidence quotes, deal financials, full sentiment reasoning
- [ ] Member role sees summary alert: meeting title, severity level, high-level summary, action items (no deal financials, no raw quotes)
- [ ] Role determined from `organization_memberships.role` at delivery time
- [ ] Separate Block Kit builder variants: `buildCriticalMeetingAlert(data, { detailLevel: 'full' | 'summary' })`
- [ ] Email drafts also respect role gating (full detail for admins, summary for members)
- [ ] Typecheck passes

### US-009: False Positive Override + Learning
**Description:** As a team member, I want to dismiss a critical alert as a false positive with a reason so that the system learns what's actually critical vs. a tough-but-normal negotiation.

**Acceptance Criteria:**
- [ ] "Dismiss (False Positive)" button on the Slack alert opens a modal with reason options: "Normal negotiation", "Already resolved", "Not relevant to team", "Other" (free text)
- [ ] Dismissal reason stored in `slack_notifications_sent` or a new `alert_feedback` table with: `meeting_id`, `dismissed_by`, `reason`, `created_at`
- [ ] Dismissal count per org tracked — if >50% of critical alerts are dismissed over 30 days, suggest threshold adjustment in next daily digest
- [ ] Future: feed dismissal patterns into the detection logic to reduce false positives (can be deferred to v2)
- [ ] Typecheck passes

### US-010: Commitment Tracking with Deadlines
**Description:** As a team member, I want commitments from critical meetings (e.g. "compile all assets and send Google Drive link") tracked as formal action items so that nothing falls through the cracks.

**Acceptance Criteria:**
- [ ] Extract commitments from meeting transcript alongside risk flags (extend AI prompt from US-001)
- [ ] Each commitment has: `description`, `suggested_owner`, `suggested_due_date`, `status` (pending/in_progress/complete)
- [ ] Create tasks in the `tasks` table for each commitment with `source = 'critical_meeting_alert'` and `meeting_id` reference
- [ ] Tasks assigned to suggested owner (or meeting owner if no clear assignee)
- [ ] Include commitment list in both Slack alert and email draft
- [ ] Use existing `check-commitment-deadlines` edge function to monitor overdue commitments
- [ ] Typecheck passes

### US-011: Critical Meeting Digest
**Description:** As a team lead, I want a daily/weekly summary of all critical meetings so that nothing slips through if I miss a real-time alert.

**Acceptance Criteria:**
- [ ] Add `critical_meetings` section to the existing daily Slack digest (`slack-daily-digest`)
- [ ] Section shows: count of critical meetings in period, each meeting's title + severity + key risk flag + status of action items
- [ ] If no critical meetings in period, section is omitted (not "0 critical meetings")
- [ ] Weekly digest option: aggregate critical meetings from the past 7 days with trend (more/fewer than last week)
- [ ] Digest respects the same role-based gating as real-time alerts (US-008)
- [ ] Configurable frequency (daily/weekly/both) in the notification settings from US-003
- [ ] Typecheck passes

### US-012: Pipeline Integration
**Description:** As the system, I want critical meeting detection to trigger automatically after every meeting analysis so that no critical meeting is missed.

**Acceptance Criteria:**
- [ ] Add a step to the `meeting_ended` orchestrator sequence (after `notify-slack-summary`) that calls `isCriticalMeeting()`
- [ ] If critical: trigger Slack channel delivery (US-006) + email draft (US-007) + commitment tracking (US-010)
- [ ] If not critical: no action (existing flow continues unchanged)
- [ ] Also integrate into `fathom-sync` pipeline for meetings synced from Fathom
- [ ] Existing meeting debrief DM to the rep is unaffected — critical alert is an additional notification, not a replacement
- [ ] Dedup: if the same meeting triggers both paths (orchestrator + fathom-sync), only one alert is sent (use existing dedup infrastructure)
- [ ] Log all critical meeting detections to `console.log` for observability
- [ ] Typecheck passes

## Functional Requirements

- FR-1: The system must extract structured risk flags from meeting transcripts during AI analysis
- FR-2: The system must evaluate every analyzed meeting against configurable critical thresholds
- FR-3: When a meeting is classified as critical, the system must post a rich Slack alert to the configured channel within 2 minutes of analysis completion
- FR-4: The system must prepare an email draft and present it for human approval before sending
- FR-5: The system must create tracked tasks for every commitment extracted from a critical meeting
- FR-6: The system must respect role-based access — admins see full details, members see summaries
- FR-7: The system must deduplicate alerts (24h cooldown per meeting entity) and respect quiet hours
- FR-8: The system must allow dismissal of false positives with feedback that is stored for future tuning
- FR-9: The system must include critical meeting summaries in the daily/weekly digest
- FR-10: Critical alert thresholds, recipients, and Slack channel must be configurable per org without code changes

## Non-Goals (Out of Scope)

- **Auto-sending emails** — all emails are draft-for-approval only
- **SMS or phone call notifications** — Slack + email only for v1
- **Customer-facing notifications** — this is internal team alerts only
- **Automatic deal stage changes** — the alert informs, humans decide on deal actions
- **Real-time transcript monitoring** — detection happens post-meeting, not during the call
- **Cross-org alerts** — alerts stay within the org boundary
- **ML-based threshold tuning** — v1 stores dismissal feedback; v2 can use it for auto-tuning

## Technical Considerations

### Schema Changes
- **Migration:** Add `risk_flags JSONB DEFAULT '[]'` column to `meetings` table
- **Migration:** Add `critical_alert_config JSONB` to `slack_notification_settings` for feature `critical_meeting_alert` (or extend existing notification_settings)
- Optional: `alert_feedback` table for false positive tracking

### Existing Patterns to Follow
- `buildRiskAlertBlocks()` in `_shared/riskAlertBlocks.ts` — Block Kit alert pattern
- `deliverToSlack()` / `deliverToInApp()` in `_shared/proactive/` — delivery with dedup, quiet hours, rate limiting
- `recordNotificationSent()` in `_shared/proactive/dedupe.ts` — mandatory call after delivery
- `postToChannel()` in `_shared/slackAuth.ts` — channel posting with join retry
- `sendEmail()` in `_shared/ses.ts` — AWS SES email delivery
- `check-commitment-deadlines` — commitment tracking pattern
- `slack-deal-risk-alert` — closest existing feature to model after

### Integrations Affected
- Post-meeting analysis pipeline (`slack-post-meeting`, `fathom-sync/aiAnalysis.ts`, `meetingAnalysisPipeline.ts`)
- Slack delivery infrastructure (`_shared/proactive/`)
- Daily digest (`slack-daily-digest`)
- Notification settings UI

### Performance
- Detection logic is a pure function — sub-millisecond
- Slack channel post: existing infrastructure, ~1-2s
- Email draft generation: AI call for template, ~3-5s
- Total added latency to post-meeting pipeline: ~5-10s (acceptable, non-blocking)

## Success Metrics

- **100% detection rate** — every meeting with sentiment ≤ configured threshold triggers an alert
- **<2 min alert latency** — from meeting analysis completion to Slack channel post
- **<30% false positive rate** — after 30 days, fewer than 30% of alerts are dismissed as false positives
- **>80% action item completion** — commitments extracted from critical meetings are completed within their deadline
- **Zero notification spam** — dedup prevents duplicate alerts for the same meeting

## Open Questions

- Should the Slack alert thread be used for ongoing discussion about the critical meeting (reply threading)?
- Should we notify the client's CSM (if assigned) separately from the team channel?
- Should critical meeting history be visible on the Deal page in the app UI? (Future enhancement)
