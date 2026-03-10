# PRD: LinkedIn Event-to-Pipeline Engine

**Date**: 2026-03-09
**Branch**: `feat/linkedin-event-to-pipeline-engine`
**Status**: Draft

---

## Summary

Build an end-to-end workflow that turns LinkedIn event registrations and attendee engagement into qualified pipeline actions inside `use60`.

`use60` should ingest event registrations, identify which registrants matter most, help users prep before the event, and then generate the right post-event follow-up motions for attendees, no-shows, and high-intent accounts.

This is not an "event dashboard." It is a pipeline execution engine built on top of LinkedIn events.

## Why This Matters

- Event teams often capture registrations but fail to convert them into timely sales action
- `use60` already excels at the exact workflows needed after a live event: research, prep, follow-up, tasking, and prioritization
- LinkedIn events are a natural top-of-funnel source for B2B teams already living on the platform
- A strong event workflow gives `use60` a high-value cross-functional offer to sales and marketing teams

## Goals

- Sync LinkedIn events and registrations into `use60`
- Prioritize registrants by ICP fit and account importance
- Support pre-event prep and in-event context for sales teams
- Generate differentiated post-event workflows for attendees and no-shows
- Measure event contribution to meetings, opportunities, and revenue

## Non-Goals

- Building a full standalone event platform
- Replacing LinkedIn's native event creation UI in MVP
- Automating private LinkedIn messaging to attendees
- Using restricted LinkedIn member data for off-platform sales graph enrichment

## LinkedIn APIs and Permissions

- `Events Management API`
- `Lead Sync API` for registration form sync where applicable
- Optional later: `Advertising API` for event promotion workflows
- Optional later: `Conversions API` for event-to-revenue feedback

Expected permissions:
- `r_events`
- `rw_events` for event management workflows beyond read
- `r_marketing_leadgen_automation` when using Lead Sync event lead flows
- `r_organization_admin`

## Product Principles

- Treat registrants as future sales context, not static list entries
- Segment follow-up by real event behavior
- Make the AI do the coordination work before and after the event
- Show pipeline impact, not vanity attendance numbers

## User Stories

### US-001: Connect LinkedIn Event Sources
As a marketer, I want to connect my LinkedIn organization and events so `use60` can pull event and registration data.

**Acceptance Criteria**
- [ ] User can authenticate LinkedIn and see organizations/events they administer
- [ ] User can choose which events sync into `use60`
- [ ] Connection status and permission issues are visible in settings
- [ ] Sync supports both one-time import and ongoing updates

### US-002: Sync Registrants and Event Leads
As the system, I want event registrations normalized into `use60` so downstream automation can treat them like actionable pipeline inputs.

**Acceptance Criteria**
- [ ] Registrants are stored with event metadata, timestamp, and source status
- [ ] Existing contacts/companies are matched before new records are created
- [ ] Duplicate syncs are prevented through idempotency keys
- [ ] Registration source is visible on the contact/company timeline

### US-003: Prioritize Registrants Before the Event
As a rep, I want `use60` to tell me which registrants are worth my attention before the event starts.

**Acceptance Criteria**
- [ ] Registrants are ranked by ICP fit, account value, existing pipeline, and owner relevance
- [ ] High-priority registrants are surfaced in a pre-event list
- [ ] Existing customers, open deals, and target accounts are flagged clearly
- [ ] A prep brief can be generated for top registrants or named accounts

### US-004: Generate Pre-Event Coordination
As a team lead, I want `use60` to make sure the team knows who is attending and how to follow up.

**Acceptance Criteria**
- [ ] Slack summary highlights top registrants, target accounts, and existing open deals
- [ ] Suggested talking points are generated for strategic attendees where data exists
- [ ] Owners can be assigned before the event starts
- [ ] The event worklist can be viewed in app if Slack is not connected

### US-005: Segment Post-Event Follow-Up
As a rep, I want attendees and no-shows handled differently so follow-up is more relevant.

**Acceptance Criteria**
- [ ] Registrants can be segmented into attended, engaged, no-show, and unknown states
- [ ] Attendee follow-up drafts reference event topic and next logical step
- [ ] No-show follow-up drafts emphasize recap and next chance to engage
- [ ] High-intent attendees can trigger faster follow-up SLA or deal creation prompts

### US-006: Build the Event Work Package
As a rep, I want a ready-to-execute follow-up pack after the event so nothing falls through the cracks.

**Acceptance Criteria**
- [ ] System creates a customer-facing follow-up draft for priority registrants
- [ ] System creates internal tasks for owner follow-up and deal hygiene
- [ ] Internal Slack update summarizes hot accounts, risks, and recommended actions
- [ ] Pack quality is tied to the same HITL approval patterns used elsewhere in `use60`

### US-007: Report Event-to-Pipeline Impact
As a founder or marketer, I want to know whether our LinkedIn event created real revenue opportunities.

**Acceptance Criteria**
- [ ] Dashboard shows registrations, qualified registrants, meetings booked, opportunities created, and revenue influenced
- [ ] Reporting distinguishes attendee follow-up outcomes from no-show nurture outcomes
- [ ] Users can filter by event, date range, owner, and account segment
- [ ] Event contribution is visible on related contacts and deals

## Functional Requirements

- FR-1: Event and registration sync must be idempotent and retry-safe
- FR-2: Registrant records must retain event source metadata
- FR-3: Prioritization must account for open deals and existing customer relationships
- FR-4: Follow-up generation must support attendee/no-show branching
- FR-5: External sends remain approve-first by default
- FR-6: Reporting must connect event activity to downstream pipeline outcomes

## Technical Considerations

### Existing `use60` Capabilities to Reuse
- meeting prep and research flows
- follow-up pack generation
- deal and contact matching logic
- Slack summary and approval workflows
- task generation and pipeline prioritization

### Recommended Architecture
- LinkedIn event connection service
- event and registrant sync job
- registrant prioritization service
- pre-event Slack/in-app briefing generator
- post-event follow-up and task pack builder
- event reporting layer

### Suggested Data Model
- `linkedin_event_connections`
- `linkedin_events`
- `linkedin_event_registrants`
- `linkedin_event_sync_runs`
- attribution fields on contacts/deals/tasks for event source tracking

## Risks and Constraints

- Event registration quality depends on what LinkedIn exposes and what the organizer configures
- Attendance status may require reconciliation with internal or external event signals depending on event type
- Customers may expect attendee identity depth that LinkedIn permissions do not always allow
- Reliable event ROI reporting requires strong downstream source tracking in `use60`

## Success Metrics

- 95%+ successful sync rate for connected events
- High-priority registrants surfaced before event start for supported events
- Increased meeting-booked rate from event-sourced contacts
- Clear event-to-opportunity reporting adopted by marketing and sales users

## Rollout Plan

### Phase 1
- event connection
- registrant sync
- priority list
- post-event follow-up drafts for top registrants

### Phase 2
- pre-event Slack briefings
- attendee/no-show branching
- event-to-pipeline reporting

### Phase 3
- tighter promotion and measurement workflows with Advertising and Conversions APIs
- deeper event orchestration playbooks for webinars and field events

## Open Questions

- Do we treat all LinkedIn events the same in MVP, or separate webinars vs in-person events?
- What is the minimum reliable signal for attendee vs no-show segmentation?
- Should deal creation from hot event leads be automatic, suggested, or configurable?
- How much event-level reporting belongs in marketing views vs pipeline views?
