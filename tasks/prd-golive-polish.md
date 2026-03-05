# PRD: Go-Live Polish — Insights, Integrations & Reports Fixes

## Introduction

Batch of 5 in-progress tickets (10 stories) from Drue's production testing covering the Insights section (reports bugs, title rename, sync error), Integrations (Slack branding, help panel), and Reports page. All are bugs or quick UX fixes blocking go-live sign-off.

## Goals

- Fix all 5 in-progress tickets assigned to Max Parish before 09/03/2026 deadline
- Resolve 6 Reports subtask bugs so the Reports tab is production-ready
- Rename "Intelligence" to "Insights" across nav and page headings
- Fix broken Help panel on Integrations page
- Correct Slack app display name during OAuth connection

## User Stories

### US-001: Rename "Intelligence" to "Insights" in Navigation and Page Heading
**Description:** As a user, I want the nav item and page heading to say "Insights" instead of "Intelligence" / "Meeting Analytics" so the branding is consistent.
**Source:** TSK-0503 (High/Feature)

**Acceptance Criteria:**
- [ ] Navigation sidebar label changed from "Intelligence" to "Insights" in routeConfig.ts
- [ ] Page heading changed from "Meeting Analytics" to "Insights" in MeetingAnalyticsPage.tsx
- [ ] data-tour attribute updated if it references "intelligence"
- [ ] Typecheck passes
- [ ] Verify in browser on localhost:5175

### US-002: Fix Sync Button Error Message
**Description:** As a user clicking the Sync button, I want a helpful error message instead of the confusing "Sync your meetings/calls first to enable AI search" since I'm already trying to sync.
**Source:** TSK-0504 (Medium/Bug)

**Acceptance Criteria:**
- [ ] Error message changed to "No conversations to index. Please ensure integrations are configured correctly"
- [ ] Message only shows when there are genuinely no meetings/calls to index
- [ ] Typecheck passes
- [ ] Verify in browser on localhost:5175

### US-003: Fix Slack App Display Name
**Description:** As a user connecting Slack, I want to see "Use60" as the app name, not "use60 (staging)".
**Source:** TSK-0507 (Medium/Bug)

**Acceptance Criteria:**
- [ ] Slack OAuth app name displays as "Use60" during connection flow
- [ ] Review Slack app permissions are correctly scoped
- [ ] If this is a Slack API-side config change, document what was changed
- [ ] Typecheck passes
- [ ] Verify in browser on localhost:5175

### US-004: Fix Help Panel on Integrations Page
**Description:** As a user clicking the "?" help icon next to Integrations, I want the help panel to show actual documentation instead of "Documentation not available yet."
**Source:** TSK-0506 (High/Bug)

**Acceptance Criteria:**
- [ ] Help panel loads and displays documentation content for the Integrations page
- [ ] If no docs_articles record exists for the integrations slug, create seed content or show a useful fallback
- [ ] Evaluate whether HelpPanel should appear on other pages (currently only on Integrations)
- [ ] Typecheck passes
- [ ] Verify in browser on localhost:5175

### US-005: Fix Reports History Showing Pre-User Dates
**Description:** As a user viewing Reports, I should only see reports generated after my account was created, not phantom historical reports.
**Source:** TSK-0505 subtask 1

**Acceptance Criteria:**
- [ ] Report history query filters by user's created_at date or organization membership date
- [ ] No reports appear dated before the user's account creation
- [ ] Typecheck passes
- [ ] Verify in browser on localhost:5175

### US-006: Fix "Send to All Channels" Email Notifications
**Description:** As a user clicking "Send to All Channels" after adding an email in Notification Settings, I want the email to actually be delivered.
**Source:** TSK-0505 subtask 2

**Acceptance Criteria:**
- [ ] Email notification is sent to the configured email address when "Send to All Channels" is clicked
- [ ] Success toast only shows after confirmed delivery (or at minimum after API call succeeds)
- [ ] If email sending fails, show error toast instead of success
- [ ] Typecheck passes
- [ ] Verify in browser on localhost:5175

### US-007: Fix "Generate Preview" Button UX
**Description:** As a user on the Reports tab, the "Generate Preview" button should clearly communicate what it does.
**Source:** TSK-0505 subtask 3

**Acceptance Criteria:**
- [ ] Button label or tooltip clarifies the action (e.g., "Generate Report Preview" or contextual label)
- [ ] Button behavior matches user expectation — generates a preview of the report before sending
- [ ] Typecheck passes
- [ ] Verify in browser on localhost:5175

### US-008: Fix Total Meetings Count Showing 0
**Description:** As a user with meetings, the Reports section should show the correct meeting count instead of 0.
**Source:** TSK-0505 subtask 4

**Acceptance Criteria:**
- [ ] Total meetings metric reflects actual meeting count for the user
- [ ] Query uses correct column `meetings.owner_user_id` (NOT user_id)
- [ ] Count matches what the user sees in other parts of the app
- [ ] Typecheck passes
- [ ] Verify in browser on localhost:5175

### US-009: Fix Generic AI Tips When No Transcripts Exist
**Description:** As a user with no meeting transcripts, the Reports section should not show AI-generated coaching tips that have no data basis.
**Source:** TSK-0505 subtask 5

**Acceptance Criteria:**
- [ ] If user has zero transcripts, AI tips section is hidden or shows "Record meetings to get personalized coaching tips"
- [ ] Tips only appear when there is actual transcript data to derive them from
- [ ] Typecheck passes
- [ ] Verify in browser on localhost:5175

### US-010: Fix Notification Settings Slack Webhook URL Overflow
**Description:** As a user adding a Slack webhook URL in Notification Settings, the popup should not break layout with a wide scrollbar.
**Source:** TSK-0505 subtask 6

**Acceptance Criteria:**
- [ ] Webhook URL input truncates or wraps long URLs within the popup width
- [ ] No horizontal scrollbar appears in the notification settings popup
- [ ] URL is still fully accessible (e.g., via tooltip on hover or expandable field)
- [ ] Typecheck passes
- [ ] Verify in browser on localhost:5175

## Functional Requirements

- FR-1: Navigation and page titles must use "Insights" consistently
- FR-2: Sync error must show actionable message when no data exists
- FR-3: Slack OAuth flow must display correct production app name
- FR-4: Help panel must load documentation or show useful fallback
- FR-5: Reports must only show data scoped to the current user's tenure
- FR-6: Meeting count must use `owner_user_id` column from meetings table
- FR-7: AI tips must be gated on transcript availability
- FR-8: All notification settings UI must handle long-form URLs gracefully

## Non-Goals (Out of Scope)

- Redesigning the Reports page layout
- Adding help panels to pages beyond Integrations (evaluate only)
- Changing Slack OAuth scopes or permissions beyond the app name
- Building new report types or analytics features
- Grafana/OTel setup (separate ticket, different assignee)
- MeetingBaaS Recorder (separate ticket, unassigned)

## Technical Considerations

- **Key files**: ReportsTab.tsx, HelpPanel.tsx, routeConfig.ts, MeetingAnalyticsPage.tsx, SlackConfigModal.tsx, AskAnythingPanel.tsx
- **Database**: meetings table uses `owner_user_id` (not user_id) — critical for US-008
- **Slack app name**: May require Slack API dashboard change (api.slack.com) rather than code change
- **Help panel**: Uses `docs_articles` table — may need seed data or fallback content
- **Reports history**: Check if `useMaReportHistory` hook filters by user/org properly

## Success Metrics

- All 5 Dev Hub tickets moved to "Done"
- Zero console warnings on Insights and Integrations pages
- Reports tab shows accurate data scoped to the user
- Help panel displays content on Integrations page

## Open Questions

- Is the Slack app name configured in the Slack API dashboard (external) or in our codebase?
- Should HelpPanel be extended to other pages, or is Integrations-only intentional?
- What is the source of phantom report history records dated before user creation?
