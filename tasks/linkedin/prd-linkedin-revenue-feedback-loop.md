# PRD: LinkedIn Revenue Feedback Loop

**Date**: 2026-03-09
**Branch**: `feat/linkedin-revenue-feedback-loop`
**Status**: Draft

---

## Summary

Build a closed-loop conversion and revenue measurement system that sends real downstream sales outcomes from `use60` back to LinkedIn so customers can optimize campaigns for actual pipeline quality, not just raw lead volume.

The product should let customers map `use60` lifecycle events like qualified lead, meeting booked, meeting held, proposal sent, and deal won into LinkedIn conversion rules, then continuously stream those outcomes via the LinkedIn `Conversions API`.

This turns `use60` into the intelligence layer between campaign spend and revenue.

## Why This Matters

- Most LinkedIn setups optimize for form fills, not revenue quality
- `use60` already sees pipeline progression, follow-up completion, meetings, and deal outcomes
- Sending richer downstream signals back to LinkedIn gives users better optimization and better reporting
- This is a strategically strong wedge because it improves every dollar customers already spend on LinkedIn

## Goals

- Let customers define which `use60` events map to LinkedIn conversion events
- Stream those events reliably to the right ad account and conversion rule
- Show campaign quality in `use60` using pipeline and revenue metrics
- Enable future optimization workflows based on the same signal set

## Non-Goals

- Building a full LinkedIn campaign builder in MVP
- Replacing LinkedIn Campaign Manager reporting entirely
- Guaranteeing LinkedIn optimization behavior beyond the events we send
- Using LinkedIn member data for CRM enrichment or prospecting

## LinkedIn APIs and Permissions

- `Conversions API`
- `Advertising API` for account/campaign context and future expansion

Expected permissions:
- `rw_conversions`
- `r_ads`

Role requirement:
- authenticated user must hold a valid role on the ad account such as `CAMPAIGN_MANAGER`, `ACCOUNT_MANAGER`, `CREATIVE_MANAGER`, or `ACCOUNT_BILLING_ADMIN`

## Product Principles

- Revenue over vanity metrics
- Reliable event delivery over fancy dashboards
- Transparent mapping from sales stage to ad signal
- Configurable enough for different GTM motions, opinionated enough to ship fast

## User Stories

### US-001: Connect LinkedIn Ad Accounts for Conversion Streaming
As a marketer or operator, I want to connect eligible LinkedIn ad accounts so `use60` can send conversion events to the correct destination.

**Acceptance Criteria**
- [ ] User can authenticate LinkedIn and see eligible ad accounts they can access
- [ ] System validates the user's ad account role before enabling conversion setup
- [ ] Connected ad accounts are stored with health and permission status
- [ ] UI explains Development vs Standard tier limitations where relevant

### US-002: Create and Manage Conversion Rules
As an operator, I want to create or link LinkedIn conversion rules for `use60` milestones so downstream events map correctly.

**Acceptance Criteria**
- [ ] User can create new conversion rules for supported milestones
- [ ] User can link to existing conversion rules on the connected ad account
- [ ] Conversion rules show attribution windows and status
- [ ] Validation prevents duplicate or conflicting mappings

### US-003: Map `use60` Milestones to LinkedIn Signals
As a revenue team, I want to choose which pipeline events count as meaningful conversion signals.

**Acceptance Criteria**
- [ ] Supported events include qualified lead, meeting booked, meeting held, proposal sent, and closed won
- [ ] Users can enable or disable each event type per ad account
- [ ] Each event can have a configurable value and currency where appropriate
- [ ] Mapping changes are versioned for auditability

### US-004: Stream Conversion Events Reliably
As the system, I want to send conversion events with idempotency and retries so customers can trust the data.

**Acceptance Criteria**
- [ ] Events are queued and retried on transient failures
- [ ] Idempotency prevents duplicate sends for the same business event
- [ ] Payloads include the best available user identifiers permitted by the API
- [ ] Delivery status is visible per event and per sync run

### US-005: Show Revenue-Quality Reporting in `use60`
As a founder or marketer, I want to see which LinkedIn campaigns produce actual pipeline and revenue outcomes.

**Acceptance Criteria**
- [ ] Dashboard shows lead volume, qualified leads, meetings, proposals, won deals, and revenue by campaign
- [ ] Metrics can be filtered by account, campaign, date range, and owner
- [ ] Users can compare campaign efficiency by cost per meeting, cost per proposal, and cost per won deal when spend is available
- [ ] Attribution assumptions are disclosed clearly in the UI

### US-006: Alert on Low-Quality Lead Sources
As a revenue leader, I want `use60` to flag campaigns that produce lots of leads but poor downstream outcomes.

**Acceptance Criteria**
- [ ] System detects poor conversion from lead to meeting or proposal
- [ ] Alerts can be delivered in Slack or the command center
- [ ] Alert includes recommendation, such as pause review, audience review, or creative review
- [ ] Alert links back to affected campaigns and sample leads

## Functional Requirements

- FR-1: Conversion events must be linked to an explicit connected ad account
- FR-2: Event streaming must support retries, dead-letter handling, and audit history
- FR-3: Event mappings must be configurable per organization
- FR-4: Pipeline reports must distinguish LinkedIn-sourced outcomes from other sources
- FR-5: Customer-visible reports must not imply unsupported attribution precision
- FR-6: Failure to stream an event must not block normal CRM or deal progression

## Technical Considerations

### Existing `use60` Capabilities to Reuse
- source attribution on contacts/deals/leads
- pipeline health and stage progression logic
- task and meeting lifecycle data
- Slack alerting infrastructure
- proactive pipeline analysis patterns

### Recommended Architecture
- LinkedIn ad account connection service
- conversion rule management service
- event mapping configuration UI
- conversion event queue and worker
- reporting tables/materialized views for LinkedIn-sourced performance

### Suggested Data Model
- `linkedin_ad_account_connections`
- `linkedin_conversion_rules`
- `linkedin_conversion_mappings`
- `linkedin_conversion_events`
- `linkedin_conversion_delivery_attempts`

## Risks and Constraints

- LinkedIn Conversions API requires both correct scopes and valid ad account roles
- Match quality depends on the identifiers available from the lead or contact record
- Attribution disagreements will surface if campaign naming or source capture is poor
- Some higher-scale multi-account campaign management experiences may require `Advertising API` Standard tier

## Success Metrics

- 95%+ successful streaming rate for valid conversion events
- Median event delivery latency under 5 minutes
- Reduction in spend on low-quality LinkedIn campaigns after rollout
- Increased meeting and proposal rate from LinkedIn-sourced leads over time

## Rollout Plan

### Phase 1
- connect ad accounts
- create/link conversion rules
- stream one or two high-value events like meeting booked and qualified lead

### Phase 2
- add proposal sent and closed won
- reporting dashboard by campaign
- Slack alerts for weak campaign quality

### Phase 3
- richer recommendations and optimization playbooks
- tighter campaign-level automation where allowed by LinkedIn access tier

## Open Questions

- Which event set should be MVP default: qualified lead + meeting booked, or meeting booked + proposal sent?
- Do we derive conversion value from deal amount, fixed mapping, or both?
- How should we handle attribution when a lead touches multiple campaigns or multiple channels?
- Should spend ingestion be included in MVP or follow after conversion streaming is reliable?
