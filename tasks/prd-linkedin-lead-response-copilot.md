# PRD: LinkedIn Lead Response Copilot

**Date**: 2026-03-09
**Branch**: `feat/linkedin-lead-response-copilot`
**Status**: Reviewed

---

## Summary

Build a LinkedIn-native lead capture and response workflow that turns new LinkedIn leads into immediate sales action inside `use60`.

When a prospect submits a LinkedIn lead form or event registration form, `use60` should ingest the lead, match or create the company/contact, enrich the profile, score the lead against ICP, draft the first follow-up, create the right tasks, and notify the assigned rep in Slack with a preview-and-approve flow.

This is the strongest first LinkedIn offer because it aligns directly with `use60`'s core promise: the AI acts quickly with full context, but external actions still respect human approval.

## Why This Matters

- LinkedIn leads are high intent but often decay fast when follow-up is delayed
- Most teams sync the lead into a CRM but still leave response quality and speed to the rep
- `use60` already has the strongest parts needed after capture: follow-up drafting, task generation, Slack approval flows, company research, and CRM orchestration
- Winning here gives `use60` a clear revenue story: "respond to LinkedIn leads in under 60 seconds with context-aware outreach"

## Goals

- Capture LinkedIn leads from lead gen forms and event registrations into `use60`
- Enrich, score, and route each lead automatically
- Draft a personalized first response using campaign/form context
- Create structured next steps for the owner and team
- Keep all external send actions behind HITL approval by default, with autonomy progression after 5 consecutive approvals with no edits

## Non-Goals

- Automating LinkedIn DMs or InMail
- Exporting LinkedIn member data for CRM enrichment outside approved marketing workflows
- Building a full standalone marketing automation suite
- Replacing the customer's CRM as the system of record

## LinkedIn APIs and Permissions

### Unified Lead Sync API

As of July 2025, LinkedIn unified ad form leads and event registration leads under a single **Lead Sync API**. Both lead types use the same webhook mechanism and payload structure, differentiated by `leadType`:
- `SPONSORED` — from ad Lead Gen Forms, `associatedEntity` = creative URN
- `EVENTS` — from event registration forms, `associatedEntity` = event URN

This means **one webhook handler, one ingestion path** for both ad and event leads.

### Required Permissions

| Scope | Purpose |
|-------|---------|
| `r_marketing_leadgen_automation` | Read lead gen forms and form responses |
| `r_events` | Read organization events and event registration leads |
| `r_organization_admin` | Org page verification |

Note: The old `r_ads_leadgen_automation` scope was deprecated July 2023. The `r_ads` scope is not required for lead ingestion.

### Optional Later Expansion
- `Advertising API` for form creation/management

### API Access Approval

Access to Lead Sync API requires LinkedIn business verification:
1. Verified business email address (personal emails rejected)
2. LinkedIn Developer App created in Developer Portal
3. LinkedIn Page associated with the organization
4. Super admin of the LinkedIn Page must verify the developer application
5. Separate product access requests for Lead Sync API and Event Management API

**Timeline**: Days to weeks. This should be initiated early as it can block MVP testing.

## Product Principles

- Speed over admin: the lead should be actionable in under 60 seconds
- Context before copy: every draft should know the campaign, offer, company, and role
- Approval for outbound: email drafts are previewed before send, with autonomy earned over time
- CRM-safe: de-dupe and routing happen before task explosion

## Decisions (Resolved)

| Question | Decision |
|----------|----------|
| CRM object model | **Contact-first** — leads create contacts + companies, with optional deal creation based on ICP score. No separate leads staging table. |
| Multi-org LinkedIn accounts | **Supported** — a single LinkedIn ad account can be connected to multiple `use60` orgs. Webhook routing uses org-specific subscription IDs. |
| Email send channel | **User's choice** — rep can send via connected Gmail/Outlook (`email-send-as-rep`) or via campaign tool (Instantly). Selection exposed in approval flow. |
| Custom form fields | **Contact custom fields** — LinkedIn custom question/answer pairs map to contact custom fields in `use60`. |
| Webhook endpoint | **Dedicated public function** — `webhook-linkedin` edge function with `verify_jwt = false` in config. HMAC-SHA256 signature verification using app `clientSecret`. |
| LinkedIn enrichment | **Auto-triggered by default** — lead ingestion triggers `linkedinEnrichmentService` (Apify profile scraping) automatically. Adds 5-15s but runs async after initial capture. |
| Event registrations | **Phase 1** — unified API means zero incremental cost to support both ad and event leads from day one. |
| Webhook vs polling | **Webhook-first** — register via `leadNotifications` endpoint for real-time push. Polling as reconciliation job to catch missed deliveries. |
| Low-fit leads | **Contacts + tasks only** — no deal creation for low-fit leads. Retained for reporting. |

## Autonomy Model

Draft approval follows 60's progressive autonomy system:

1. **Initial state**: All drafts require explicit HITL approval (approve/edit/reject in Slack or in-app)
2. **Autonomy assessment**: After **5 consecutive approvals with zero edits**, the system prompts the user to grant auto-send permission for LinkedIn lead responses
3. **Auto-send state**: High-ICP leads (score > threshold) auto-send after a configurable delay (default 5 min) with no rejection. Rep can still intervene during the delay window.
4. **Revocation**: Any manual edit or rejection resets the approval counter

## User Stories

### US-001: Connect LinkedIn Lead Sources
As a revenue operator, I want to connect my LinkedIn ad account, forms, and eligible event lead sources so that new leads can flow into `use60`.

**Acceptance Criteria**
- [ ] OAuth 2.0 3-legged flow authenticates the user with LinkedIn
- [ ] User can see eligible ad accounts, lead gen forms, and event registration forms they administer
- [ ] User can choose which forms/events sync into `use60`
- [ ] UI clearly shows required LinkedIn permissions and missing roles
- [ ] Connection health is visible in settings (connected/disconnected/error/token expiry)
- [ ] Multiple `use60` orgs can connect to the same LinkedIn ad account
- [ ] Credentials stored in `integration_credentials` table with `provider = 'linkedin'`

### US-002: Ingest and Normalize New Leads
As the system, I want every incoming LinkedIn lead normalized into a common lead payload so downstream automation works consistently.

**Acceptance Criteria**
- [ ] Webhook endpoint (`webhook-linkedin`) receives real-time lead notifications from LinkedIn
- [ ] HMAC-SHA256 signature verification using app `clientSecret` validates authenticity
- [ ] Payload uses explicit field projection to retrieve `formResponse`, `submittedAt`, `ownerInfo`, `associatedEntityInfo`
- [ ] Both `SPONSORED` and `EVENTS` lead types are handled via the unified `leadType` field
- [ ] Standard fields are mapped; custom question/answer pairs are preserved as contact custom fields
- [ ] Retry-safe idempotency prevents duplicate ingestion (dedup by LinkedIn notification ID)
- [ ] Raw source payload is stored for debugging and audit
- [ ] Reconciliation polling job catches missed webhook deliveries
- [ ] LinkedIn enrichment (Apify profile scraping) is triggered async after capture

### US-003: Match or Create Contact and Company
As a rep, I want `use60` to avoid duplicates and attach the lead to the right company and owner automatically.

**Acceptance Criteria**
- [ ] Contact-first model: leads create/match contacts, not a separate leads table
- [ ] Matching priority: email exact match > LinkedIn URL match > domain + company name heuristics
- [ ] New contacts and companies are linked to source campaign/form metadata
- [ ] Ambiguous matches are flagged for review instead of auto-merging
- [ ] Low-fit leads create contacts + tasks only (no deal creation)
- [ ] High-fit leads (above ICP threshold) optionally create a deal

### US-004: Score and Route the Lead
As a manager, I want new LinkedIn leads prioritized and assigned intelligently so reps focus on the best opportunities first.

**Acceptance Criteria**
- [ ] ICP score (0-100) is generated using company size, role seniority, industry, domain, and form context
- [ ] Enrichment data from LinkedIn profile scraping feeds into scoring
- [ ] Routing rules support owner assignment by territory, campaign, or fallback owner
- [ ] High-priority leads can trigger faster SLA tags or Slack escalation
- [ ] Low-fit leads are marked but still retained for reporting

### US-005: Draft the First Follow-Up
As a rep, I want the first outreach draft to reference why the lead converted so it feels personal and timely.

**Acceptance Criteria**
- [ ] Draft references the campaign/form/event context where available
- [ ] Draft tone uses org voice settings and owner writing style if available
- [ ] CTA reflects the lead intent: demo request, content follow-up, event follow-up, etc.
- [ ] Draft is generated as a preview, not auto-sent by default
- [ ] Enrichment data (role, company intel) is incorporated into draft context
- [ ] Rep can choose to send via Gmail/Outlook or campaign tool (Instantly)

### US-006: Create the Work Package
As a rep, I want the system to create the minimum set of tasks I need so nothing gets missed after lead capture.

**Acceptance Criteria**
- [ ] A customer-facing follow-up task is created
- [ ] An internal prep/research task is created when needed
- [ ] CRM hygiene task is created only when a material update is required
- [ ] Tasks are linked to contact/company/deal and due within a configurable SLA

### US-007: Slack Approval and Action Flow
As a rep, I want to review and approve the system's proposed next steps from Slack so I can act quickly without opening multiple tools.

**Acceptance Criteria**
- [ ] Slack alert includes: lead summary, ICP score, ownership, campaign context, and recommended next action
- [ ] Buttons support: approve & send email, edit draft, reassign, and dismiss
- [ ] Send channel selection (Gmail/Outlook vs Instantly) is available in the approval flow
- [ ] Approval status is logged back in `use60`
- [ ] If Slack is not connected, the lead lands in an in-app command center queue
- [ ] Notification dedup: 4-hour cooldown per lead to prevent spam on draft edits

### US-008: Autonomy Progression
As a rep, I want `use60` to learn from my approvals and eventually auto-send high-quality drafts so I can focus on exceptions.

**Acceptance Criteria**
- [ ] System tracks consecutive approvals with zero edits per user per lead source type
- [ ] After 5 consecutive no-edit approvals, user is prompted to grant auto-send permission
- [ ] Auto-send applies a configurable delay (default 5 min) before sending, with cancel option
- [ ] Any manual edit or rejection resets the approval counter
- [ ] Autonomy level is visible in settings and revocable at any time

## Functional Requirements

- FR-1: Lead ingestion must be idempotent (dedup by LinkedIn notification ID)
- FR-2: Source metadata from LinkedIn must remain attached to the lead lifecycle
- FR-3: Draft generation must support HITL approval before outbound send, with progressive autonomy
- FR-4: Routing and scoring must be configurable per organization
- FR-5: Failures in follow-up generation, enrichment, or scoring must not block lead capture or contact creation
- FR-6: Lead-to-owner SLA timers must be measurable for reporting
- FR-7: Custom form fields must map to contact custom fields
- FR-8: Webhook signature must be verified via HMAC-SHA256

## Technical Considerations

### Existing `use60` Capabilities to Reuse

| Capability | Source | Reuse Pattern |
|-----------|--------|---------------|
| OAuth flow | `hubspot-oauth-callback/index.ts` | Copy state validation, code exchange, token storage |
| Credentials storage | `integration_credentials` table | `provider = 'linkedin'`, `credentials` JSONB |
| Webhook handler | `webhook-crm/index.ts` | Public endpoint pattern, payload routing |
| Contact/company dedup | `_shared/commandCentre/deduplicator.ts` | Compatible type merge, priority scoring |
| Email drafting | `generate-email-sequence/index.ts` | Tier-1 Sonnet + Tier-2 Gemini Flash |
| Slack approval | `slack-interactive` + `emailDraftApproval.ts` | Block Kit messages, button handlers |
| Slack blocks | `_shared/slackBlocks.ts` | Message builders with truncation |
| Notification dedup | `_shared/proactive/dedupe.ts` | Cooldown windows, dedup keys |
| Task creation | `create-task-unified/index.ts` | Validated payload, fire-and-forget notify |
| ICP scoring | `_shared/commandCentre/prioritisation.ts` | Score 0-100 integration |
| LinkedIn enrichment | `linkedinEnrichmentService.ts` | Apify profile scraping, field mapping |

### Recommended Architecture

```
LinkedIn → webhook-linkedin (public, verify_jwt=false)
              │
              ├─ HMAC-SHA256 signature verification
              ├─ Idempotency check (notification ID)
              ├─ Normalize payload (field projection)
              │
              ▼
         Lead Ingestion Pipeline (async)
              │
              ├─ 1. Match/create contact + company (email → LinkedIn URL → domain)
              ├─ 2. Map custom form fields → contact custom fields
              ├─ 3. Trigger LinkedIn enrichment (Apify, async)
              ├─ 4. ICP score + route to owner
              ├─ 5. Draft follow-up email (Sonnet/Gemini)
              ├─ 6. Create task work package
              └─ 7. Slack approval notification (or command center queue)
                    │
                    ├─ Approve → send via Gmail/Outlook or Instantly
                    ├─ Edit → open draft editor
                    ├─ Reassign → update owner
                    └─ Dismiss → mark handled

Reconciliation: Polling job (cron) catches missed webhooks
```

### Data Model

Uses existing tables where possible. New additions:

```sql
-- LinkedIn-specific lead source configuration
linkedin_lead_sources (
  id UUID PK,
  organization_id UUID FK → organizations,
  form_id TEXT,              -- LinkedIn versioned form URN
  form_name TEXT,
  source_type TEXT,          -- 'ad_form' | 'event_form'
  event_id TEXT,             -- LinkedIn event URN (if event)
  campaign_name TEXT,
  is_active BOOLEAN DEFAULT true,
  created_at TIMESTAMPTZ,
  updated_at TIMESTAMPTZ
)

-- Sync run history (audit + reconciliation)
linkedin_sync_runs (
  id UUID PK,
  organization_id UUID FK → organizations,
  run_type TEXT,             -- 'webhook' | 'poll_reconciliation'
  leads_received INT,
  leads_created INT,
  leads_matched INT,
  leads_duplicate INT,
  started_at TIMESTAMPTZ,
  completed_at TIMESTAMPTZ,
  error TEXT
)

-- Source metadata on contacts (lightweight, no separate leads table)
-- Add columns to contacts:
--   linkedin_lead_source_id UUID FK → linkedin_lead_sources
--   linkedin_lead_payload JSONB    -- raw source for audit
--   linkedin_lead_received_at TIMESTAMPTZ
```

Credentials stored in existing `integration_credentials` table:
```json
{
  "provider": "linkedin",
  "credentials": {
    "access_token": "...",
    "refresh_token": "...",
    "expires_at": "...",
    "scopes": ["r_marketing_leadgen_automation", "r_events", "r_organization_admin"],
    "webhook_subscription_ids": ["..."]
  }
}
```

### Edge Functions (New)

| Function | Auth | Purpose |
|----------|------|---------|
| `webhook-linkedin` | `verify_jwt = false` | Receive LinkedIn webhook, HMAC verify, enqueue |
| `linkedin-oauth-callback` | JWT | Exchange code for tokens, store credentials |
| `linkedin-lead-ingest` | JWT (internal) | Normalize, match, enrich, score, draft, notify |
| `linkedin-lead-reconcile` | JWT (cron) | Poll for missed webhook deliveries |

### API Constraints

- LinkedIn webhook notifications may be **delivered multiple times** — dedup by notification ID is mandatory
- LinkedIn does **not return all fields by default** — explicit field projection required for `formResponse`, `submittedAt`, `ownerInfo`, `associatedEntityInfo`
- Webhook URL must be HTTPS, publicly accessible, return 2xx
- LinkedIn validates URL ownership before registration
- Webhook includes `X-LI-Signature` header for HMAC-SHA256 verification
- Rate limits are not publicly documented; webhook-first avoids polling limits

## Risks and Constraints

- **API access approval delay**: Lead Sync API requires LinkedIn business verification (days to weeks). Initiate immediately.
- **Multi-org webhook routing**: Same LinkedIn account connected to multiple orgs requires routing logic based on subscription IDs stored per-org
- Form field variance across customers will require flexible mapping
- Duplicate management quality will materially affect trust
- LinkedIn enrichment (Apify) adds 5-15s async latency and costs credits per profile
- Some customers may expect auto-send; default posture is approve-first with earned autonomy

## Success Metrics

- Median time from lead creation to draft available: under 60 seconds
- Median time from lead creation to first approved action: under 10 minutes
- 90%+ successful lead ingestion for connected forms
- Increased reply or meeting-booked rate vs baseline manual follow-up
- Autonomy adoption: % of users who earn and enable auto-send within 30 days

## Rollout Plan

### Phase 1 (MVP)
- OAuth connection flow + settings page
- Webhook-first lead ingestion (both ad forms and event registrations)
- Contact/company matching and creation
- LinkedIn enrichment (async, auto-triggered)
- ICP scoring
- First-draft email generation
- Slack notification with approval flow
- Send via Gmail/Outlook or Instantly (user's choice)
- Task work package creation
- Reconciliation polling job

### Phase 2
- Routing rules configuration UI
- SLA reporting and dashboards
- Manager escalation for hot leads
- Autonomy progression (auto-send after 5 no-edit approvals)

### Phase 3
- Campaign-aware personalization improvements
- Deeper CRM sync and attribution reporting
- Form field mapping customization UI
- Analytics: lead source performance comparison
