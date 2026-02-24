# PRD: Copilot Showstopper V1

## Introduction

Transform Copilot into a skill-first "smart assistant" that reliably selects and runs deterministic workflows (not prompt-by-prompt), with a delightful animated progress story, clickable structured results, and safe preview→confirm execution for emails.

This is the flagship V1 release bundling 5 core workflows that turn Copilot from a demo into a production-ready teammate.

## Goals

- **Reliability**: 5 V1 workflows execute deterministically via canonical sequences, bypassing free-form LLM reasoning
- **Delight**: Animated stepper with icons per tool type, estimated durations, and smooth transitions
- **Trust**: Preview→confirm pattern for email sending; all other actions execute immediately
- **Discoverability**: Clickable structured results with standard action vocabulary (`open_meeting`, `open_deal`, etc.)
- **Adaptability**: "Catch me up" briefing adjusts based on time of day (morning vs. end-of-day)

## User Stories

### US-001: Deterministic Workflow Router
**Description:** As a user, I want my requests for the 5 V1 workflows to be handled reliably and consistently, so that I get predictable results every time.

**Acceptance Criteria:**
- [ ] Add workflow router in `api-copilot` that detects V1 intents before LLM reasoning
- [ ] Router maps: "next meeting prep" → `seq-next-meeting-command-center`
- [ ] Router maps: "post-meeting follow-up" → `seq-post-meeting-followup-pack`
- [ ] Router maps: "email zero inbox" → `seq-followup-zero-inbox`
- [ ] Router maps: "pipeline focus" → `seq-pipeline-focus-tasks`
- [ ] Router maps: "catch me up" → `seq-catch-me-up` (new sequence)
- [ ] Deterministic routes bypass Gemini free-form reasoning
- [ ] Fallback to Gemini tool-calling for non-V1 intents
- [ ] Typecheck passes
- [ ] Verify in browser on localhost:5175

---

### US-002: Animated Delightful Progress Stepper
**Description:** As a user, I want to see an animated progress stepper with icons, estimated durations, and smooth transitions while Copilot processes my request, so that I feel confident it's working.

**Acceptance Criteria:**
- [ ] Placeholder steps appear immediately when request starts (from `detectToolType`)
- [ ] Each step shows an icon based on tool type (calendar, database, AI, email, etc.)
- [ ] Steps animate through pending → active → complete states with Framer Motion
- [ ] Active step shows subtle pulsing animation
- [ ] Completed steps show checkmark with green accent
- [ ] Estimated duration shown for active step (e.g., "~2s")
- [ ] Real tool telemetry replaces placeholders as `tool_executions` arrive
- [ ] Staggered reveal animation for new steps
- [ ] Right panel progress mirrors chat stepper
- [ ] Typecheck passes
- [ ] Verify in browser on localhost:5175

---

### US-003: Standardized Clickable Action Contract
**Description:** As a user, I want to click on items in Copilot results to navigate directly to meetings, deals, contacts, and tasks, so that I can take action quickly.

**Acceptance Criteria:**
- [ ] Define standard action vocabulary: `open_contact`, `open_deal`, `open_meeting`, `open_task`, `open_external_url`
- [ ] All structured response components emit actions via `onActionClick` prop
- [ ] Central handler in `AssistantShell.tsx` routes actions to correct navigation
- [ ] `open_meeting` navigates to meeting detail page
- [ ] `open_deal` navigates to deal detail page
- [ ] `open_contact` navigates to contact detail page
- [ ] `open_task` navigates to task detail page
- [ ] `open_external_url` opens in new tab
- [ ] Legacy aliases (`open_meeting_url`, `view_meeting`, `view_task`) map to standard names
- [ ] Audit and update all existing response components to use standard contract
- [ ] Typecheck passes
- [ ] Verify in browser on localhost:5175

---

### US-004: Catch Me Up Sequence + Adaptive Briefing
**Description:** As a user, I want to ask "catch me up" and receive a time-aware briefing (morning = today's focus, evening = wrap-up + tomorrow preview), so that I stay on top of my priorities.

**Acceptance Criteria:**
- [ ] Create `seq-catch-me-up` sequence in `platform_skills` table
- [ ] Sequence steps: `get_meetings_for_period`, `get_pipeline_deals`, `get_contacts_needing_attention`, `list_tasks`
- [ ] Final step: planner skill outputs structured brief model
- [ ] Morning (before 12pm): Focus on today's schedule and priorities
- [ ] Afternoon (12pm-5pm): Include today's progress and remaining items
- [ ] Evening (after 5pm): Wrap-up summary + tomorrow preview
- [ ] Response includes: schedule, priority actions, key deals, contacts needing attention
- [ ] Seed migration enables sequence for all orgs
- [ ] Typecheck passes
- [ ] Verify in browser on localhost:5175

---

### US-005: Daily Brief Structured Response Panel
**Description:** As a user, I want the "catch me up" response to render as a rich, scannable panel (not just text), so that I can quickly understand my day.

**Acceptance Criteria:**
- [ ] Add `daily_brief` structured response type to `CopilotResponse.tsx`
- [ ] Create `DailyBriefResponse.tsx` component in `src/components/copilot/responses/`
- [ ] Panel shows time-appropriate greeting ("Good morning" / "Good afternoon" / "Here's your evening wrap-up")
- [ ] Schedule section: Today's meetings with times, clickable to open meeting
- [ ] Deals section: Cards for stale/closing-soon deals, clickable to open deal
- [ ] Contacts section: List of contacts needing attention, clickable to open contact
- [ ] Tasks section: Pending tasks list, clickable to open task
- [ ] "Expand" button to show full dashboard view with more detail
- [ ] Compact by default (~30 seconds to scan)
- [ ] Typecheck passes
- [ ] Verify in browser on localhost:5175

---

### US-006: Email Preview → Confirm Flow
**Description:** As a user, I want to preview email drafts before they are sent, so that I can review and approve before committing.

**Acceptance Criteria:**
- [ ] Email sequences run with `is_simulation: true` by default
- [ ] Backend stores `pending_action` with sequence key and params
- [ ] Email draft shown in structured response with "Send" confirmation button
- [ ] User reply "Confirm" or clicking "Send" triggers sequence with `is_simulation: false`
- [ ] Confirmation works for both Gemini-invoked and deterministic sequences
- [ ] Clear visual indicator that email is a preview (not sent yet)
- [ ] Cancel/Edit option available before confirming
- [ ] Typecheck passes
- [ ] Verify in browser on localhost:5175

---

### US-007: Validate Next Meeting Prep Sequence
**Description:** As a user, I want the "prep me for my next meeting" workflow to reliably return a complete command center, so that I'm always prepared.

**Acceptance Criteria:**
- [ ] Test `seq-next-meeting-command-center` end-to-end
- [ ] Verify all required fields in output: meeting ID, title, attendees, company, context
- [ ] Structured response includes: meeting details, attendee profiles, deal context, prep checklist
- [ ] All items are clickable (attendees → contacts, deal → deal page)
- [ ] Handles edge cases: no upcoming meetings, meeting with no linked contacts
- [ ] Response time under 5 seconds for typical case
- [ ] Typecheck passes
- [ ] Verify in browser on localhost:5175

---

### US-008: Validate Post-Meeting Follow-Up Pack Sequence
**Description:** As a user, I want the "create follow-ups for my last meeting" workflow to generate actionable items, so that nothing falls through the cracks.

**Acceptance Criteria:**
- [ ] Test `seq-post-meeting-followup-pack` end-to-end
- [ ] Verify output includes: email drafts, task suggestions, Slack message drafts
- [ ] Email drafts use preview→confirm pattern
- [ ] Task suggestions are clickable with "Create" action
- [ ] Handles edge cases: meeting with no transcript, meeting with no linked deal
- [ ] All generated content references actual meeting context (not generic)
- [ ] Typecheck passes
- [ ] Verify in browser on localhost:5175

---

### US-009: Validate Email Zero Inbox Sequence
**Description:** As a user, I want the "help me with email follow-ups" workflow to find pending emails and draft replies, so that I can clear my inbox efficiently.

**Acceptance Criteria:**
- [ ] Test `seq-followup-zero-inbox` end-to-end
- [ ] Verify output includes: list of emails needing response, draft replies
- [ ] Draft replies use preview→confirm pattern
- [ ] Each email shows: sender, subject, age, priority indicator
- [ ] Drafts reference actual email content (not generic)
- [ ] "Skip" action available for emails that don't need reply
- [ ] Typecheck passes
- [ ] Verify in browser on localhost:5175

---

### US-010: Validate Pipeline Focus Sequence
**Description:** As a user, I want the "what deals should I focus on" workflow to surface priority deals with specific actions, so that I know where to spend my time.

**Acceptance Criteria:**
- [ ] Test `seq-pipeline-focus-tasks` end-to-end
- [ ] Verify output includes: prioritized deal list with recommended actions
- [ ] Each deal shows: name, value, stage, days since activity, health indicator
- [ ] Recommended actions are specific (not generic "follow up")
- [ ] Deals are clickable to open deal page
- [ ] Filters applied: stale deals, closing soon, high value
- [ ] Handles empty pipeline gracefully
- [ ] Typecheck passes
- [ ] Verify in browser on localhost:5175

---

### US-011: Tool Type Icons and Labels
**Description:** As a user, I want each step in the progress stepper to show an appropriate icon and label, so that I understand what Copilot is doing.

**Acceptance Criteria:**
- [ ] Map tool capabilities to icons: calendar (CalendarIcon), database (DatabaseIcon), AI (SparklesIcon), email (MailIcon), Slack (MessageSquareIcon), tasks (CheckSquareIcon)
- [ ] Each step shows human-readable label (e.g., "Checking your calendar" not "get_calendar_events")
- [ ] Icon colors match tool type (calendar = blue, AI = purple, etc.)
- [ ] Create `getToolIcon` and `getToolLabel` utility functions
- [ ] Apply to both chat stepper and right panel progress
- [ ] Typecheck passes
- [ ] Verify in browser on localhost:5175

---

### US-012: Stepper Duration Estimates
**Description:** As a user, I want to see estimated time remaining for each step, so that I know how long to wait.

**Acceptance Criteria:**
- [ ] Add duration estimates per tool type (calendar ~1s, AI ~3s, database ~1s, email ~2s)
- [ ] Active step shows "~Xs remaining" based on estimate
- [ ] Completed steps show actual duration
- [ ] Total estimated time shown at top of stepper
- [ ] Estimates update as steps complete
- [ ] Typecheck passes
- [ ] Verify in browser on localhost:5175

---

### US-013: Golden Path Scenario Tests
**Description:** As a developer, I want automated tests for the 5 V1 workflows, so that regressions are caught before deployment.

**Acceptance Criteria:**
- [ ] Create test fixtures with sample context data
- [ ] Test: "Catch me up" returns `daily_brief` structured response with required fields
- [ ] Test: "Prep for next meeting" returns `next_meeting_command_center` with meeting ID
- [ ] Test: "Create follow-ups" returns `post_meeting_followup_pack` with email drafts
- [ ] Test: "Email inbox" returns `followup_zero_inbox` with pending emails
- [ ] Test: "Pipeline focus" returns `pipeline_focus_tasks` with deal list
- [ ] Tests verify `pending_action` saved for preview flows
- [ ] Tests run in CI pipeline
- [ ] Typecheck passes

---

### US-014: Workflow Telemetry and Metrics
**Description:** As a product owner, I want to track per-workflow success rates and performance, so that I can identify issues and measure improvement.

**Acceptance Criteria:**
- [ ] Add telemetry event for each workflow: `copilot_workflow_started`, `copilot_workflow_completed`, `copilot_workflow_failed`
- [ ] Track: workflow type, duration, step count, tool failures
- [ ] Track confirmation conversion rate for preview→confirm flows
- [ ] Create dashboard query for workflow success rate by type
- [ ] Add error categorization (timeout, tool failure, missing context)
- [ ] Typecheck passes

---

### US-015: Hybrid Escalation Rules
**Description:** As a user, I want Copilot to intelligently escalate complex requests to agent-first mode while keeping simple queries chat-first, so that I get the right experience for each request.

**Acceptance Criteria:**
- [ ] Define escalation criteria: multi-entity, write operations, multi-step
- [ ] Simple queries (read-only, single entity) stay chat-first
- [ ] Complex queries trigger plan→execute agent mode
- [ ] Agent mode still enforces preview→confirm for writes
- [ ] UI shows "Planning..." indicator when agent mode activates
- [ ] Escalation decision logged for debugging
- [ ] Typecheck passes
- [ ] Verify in browser on localhost:5175

## Functional Requirements

- FR-1: The system must detect V1 workflow intents and route them to deterministic sequences before LLM reasoning
- FR-2: The system must show animated progress with tool-specific icons within 100ms of request start
- FR-3: The system must replace placeholder steps with real telemetry as tool executions complete
- FR-4: The system must store `pending_action` for any sequence that includes write operations
- FR-5: The system must execute pending actions only after explicit user confirmation
- FR-6: The system must navigate to the correct detail page when users click items in structured responses
- FR-7: The system must adapt "catch me up" content based on current time of day
- FR-8: The system must complete V1 workflows within 10 seconds for typical cases

## Non-Goals (Out of Scope)

- Voice input/output for Copilot
- Custom workflow builder UI
- Multi-user collaboration in Copilot sessions
- Integration with external CRMs beyond existing patterns
- Mobile-specific Copilot experience
- Offline Copilot functionality
- Custom theming for Copilot panels

## Technical Considerations

### Backend Changes
- Extend `api-copilot/index.ts` with workflow router before Gemini call
- Create `seq-catch-me-up` sequence with time-aware planner step
- Add `pending_action` persistence for all preview flows
- Ensure all sequences output required fields for structured responses

### Frontend Changes
- Upgrade `ToolCallIndicator.tsx` with Framer Motion animations
- Add icon and label utilities in `src/lib/utils/toolUtils.ts`
- Create `DailyBriefResponse.tsx` component
- Audit all response components for action contract compliance
- Add duration tracking to progress stepper

### Database Changes
- New sequence in `platform_skills`: `seq-catch-me-up`
- Migration to enable sequence for all orgs

### Performance Requirements
- Placeholder stepper visible within 100ms
- V1 workflows complete within 10 seconds
- Animations run at 60fps

## Success Metrics

- **Reliability**: 95%+ success rate for V1 workflows (no failures, correct output)
- **Speed**: Median time to first step visible < 200ms
- **Engagement**: 80%+ of users click at least one item in structured responses
- **Trust**: 90%+ confirmation rate for email previews (users send after reviewing)
- **Adoption**: 50%+ of active users use at least one V1 workflow per week
