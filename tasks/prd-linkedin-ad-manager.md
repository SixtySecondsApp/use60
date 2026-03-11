# PRD: LinkedIn Ad Manager

**Date**: 2026-03-09
**Branch**: `feat/linkedin-ad-manager`
**Status**: Draft

---

## Summary

Build a full campaign management interface inside `use60` that lets users create, launch, edit, pause, and monitor LinkedIn ad campaigns end-to-end without leaving the platform. This includes campaign groups, campaigns, creatives, lead gen forms, audience targeting, budgets, and scheduling — all powered by the LinkedIn Advertising API.

The goal is not to replicate every corner of LinkedIn Campaign Manager, but to provide a streamlined, revenue-aware campaign workflow that integrates with `use60`'s lead capture, pipeline tracking, and proactive optimization engine so users can go from campaign idea to qualified lead to closed deal in one platform.

## Why This Matters

- Small teams bounce between `use60` for pipeline and Campaign Manager for ads; this creates context-switching and disconnects the "run ads" action from the "close revenue" outcome
- `use60` already captures LinkedIn leads (Lead Response Copilot), sends conversion signals back (Revenue Feedback Loop), and reports on ad performance (Advertising Analytics); the missing piece is creating and managing the campaigns themselves
- AI-assisted campaign creation (audience suggestions, copy generation, budget recommendations) adds value that Campaign Manager alone does not provide
- An approval-and-autonomy model for campaign actions keeps the human in the loop for high-stakes budget decisions while enabling the AI to handle routine optimizations

## Goals

- Connect LinkedIn ad accounts with appropriate permissions for campaign management
- Create and manage the full campaign hierarchy: ad accounts, campaign groups, campaigns, creatives
- Support all primary campaign types: sponsored content, text ads, dynamic ads, sponsored messaging, event ads
- Create and manage lead gen forms and link them to campaigns
- Set targeting, budgets, scheduling, and bidding strategies
- Launch, pause, resume, and archive campaigns
- Provide AI-assisted campaign creation: audience suggestions, copy drafts, budget recommendations
- Apply an approval model for budget-impacting actions with progressive autonomy

## Non-Goals

- Supporting managed/programmatic campaign types that require LinkedIn sales team involvement
- Building a full ad creative design studio (asset upload and basic formatting, not Canva-style editing)
- Replacing LinkedIn Campaign Manager for power users managing dozens of accounts and complex programmatic setups
- Real-time bidding optimization or algorithmic bid management beyond what LinkedIn's built-in optimization provides

## LinkedIn APIs and Permissions

### Primary APIs

| API | Capability |
|-----|-----------|
| Ad Accounts | Create and manage ad accounts; read account roles and permissions |
| Campaign Groups | Create and manage campaign groups with budgets and schedules |
| Campaigns | Create and manage campaigns with targeting, budgets, objectives, and scheduling |
| Creatives | Create and manage ad creatives (sponsored content, text ads, dynamic ads) |
| Lead Forms | Create and manage lead gen forms via Lead Sync API |
| Targeting | Set targeting criteria: job title, function, seniority, company, industry, geography |
| Ad Analytics | Read campaign and creative performance metrics (see Advertising Analytics PRD) |

### Required Permissions

| Scope | Purpose |
|-------|---------|
| `rw_ads` | Read and write ad accounts, campaigns, campaign groups, creatives |
| `r_ads` | Read ad accounts (fallback read-only) |
| `r_ads_reporting` | Read campaign performance data |
| `r_marketing_leadgen_automation` | Read lead gen form responses |

### Ad Account User Roles
The authenticated user must have one of the following roles on the ad account:

| Role | Capability |
|------|-----------|
| `ACCOUNT_MANAGER` | Full access: create, edit, delete campaigns, manage billing |
| `CAMPAIGN_MANAGER` | Create and manage campaigns and creatives |
| `CREATIVE_MANAGER` | Manage creatives only |
| `VIEWER` | Read-only access even with `rw_ads` scope |
| `ACCOUNT_BILLING_ADMIN` | Billing management |

### Access Tier Implications

| Capability | Development Tier | Standard Tier |
|-----------|-----------------|---------------|
| Ad account access | Up to 5 accounts | Unlimited |
| Campaign creation | Yes (test accounts) | Yes (production) |
| Lead gen forms | Yes | Yes |
| Creatives | Yes | Yes |
| API rate limits | Lower | Higher |

**Development tier** is sufficient for building and testing the integration. **Standard tier** is required for production multi-customer operation with real ad spend.

### Key API Constraints

| Entity | Limit |
|--------|-------|
| Campaigns per account | 5,000 total; 1,000 concurrent active |
| Campaigns per non-default group | 2,000 |
| Active creatives per campaign | 15 |
| Total creatives per campaign | 100 |
| Total creatives per account | 15,000 |

- Campaign format is immutable once set (either explicitly or by first creative)
- Paused campaigns are considered active until their end time
- Political ad compliance is required for EU-targeted campaigns
- `versionTag` must be used for optimistic concurrency on updates

## Key Product Decisions

### Approval Model for Campaign Actions
Budget-impacting actions require explicit approval by default, with progressive autonomy:

| Action | Default Gate | Autonomy Upgrade |
|--------|-------------|-----------------|
| Create campaign (draft) | Auto-approve | Auto-approve |
| Activate campaign | Require approval | Auto-approve after 5 successful activations |
| Increase budget | Require approval | Auto-approve for increases < 20% |
| Pause campaign | Auto-approve | Auto-approve |
| Create creative | Auto-approve | Auto-approve |
| Delete campaign | Require approval | Always require approval |

Approval surfaces: in-app confirmation modal, Slack message with approve/reject buttons, or copilot chat confirmation.

### AI-Assisted Campaign Creation
The copilot can suggest or generate:
- **Audience**: based on ICP data, deal history, and previous campaign performance
- **Copy**: headlines, body text, and CTAs using the organization's brand voice and sales messaging
- **Budget**: recommendations based on historical CPM/CPC for the target audience and objective
- **Format**: recommendation based on the campaign objective (lead gen → single image or carousel, brand awareness → video)
- **Schedule**: optimal launch timing based on historical engagement patterns

All AI-generated content goes through preview-then-confirm flow.

### Lead Gen Form Integration
- Lead gen forms can be created and managed inside `use60`
- Forms are linked to campaigns during creative setup
- Lead form responses flow through the existing Lead Response Copilot pipeline
- No need to rebuild lead capture; the Ad Manager creates the form, the Lead Response Copilot handles the response

## User Stories

### US-001: Connect Ad Accounts for Campaign Management
As a marketer, I want to connect my LinkedIn ad accounts with write access so `use60` can create and manage campaigns on my behalf.

**Acceptance Criteria**
- [ ] OAuth flow requests `rw_ads` permission and discovers eligible ad accounts
- [ ] User selects which ad accounts to manage
- [ ] User's ad account role is detected and displayed (Account Manager, Campaign Manager, etc.)
- [ ] Insufficient role triggers a clear message explaining what access is needed
- [ ] Connection supports both personal and client ad accounts

### US-002: Create a Campaign Group
As a marketer, I want to create campaign groups to organize related campaigns with shared budgets and schedules.

**Acceptance Criteria**
- [ ] User can create a campaign group with name, status, budget (daily/lifetime), and schedule
- [ ] Campaign groups are listed with their campaigns and aggregate metrics
- [ ] Editing and archiving campaign groups is supported
- [ ] Validation enforces LinkedIn limits (2,000 campaigns per non-default group)

### US-003: Create a Campaign
As a marketer, I want to create a LinkedIn ad campaign with targeting, budget, schedule, and objective from inside `use60`.

**Acceptance Criteria**
- [ ] Campaign creation wizard with steps: objective, format, targeting, budget/bid, schedule, review
- [ ] Supported objectives: lead generation, website visits, website conversions, engagement, brand awareness, video views
- [ ] Supported formats: sponsored content (single image, carousel, video), text ads, dynamic ads, sponsored messaging, event ads
- [ ] Targeting builder supports: job title, job function, seniority, company, company size, industry, geography, skills, groups
- [ ] Budget options: daily budget, lifetime budget (with pacing strategy)
- [ ] Bidding strategies: manual CPC/CPM, target cost, cost cap
- [ ] Schedule: start/end dates or continuous
- [ ] LinkedIn Audience Network toggle with offsite preferences
- [ ] EU political ad compliance notice when targeting EU regions
- [ ] Campaign is created in DRAFT status by default; activation requires approval

### US-004: Create and Manage Creatives
As a marketer, I want to create ad creatives and attach them to campaigns.

**Acceptance Criteria**
- [ ] Upload or select images and videos for creatives
- [ ] Create direct sponsored content (does not appear on company page)
- [ ] AI-assisted copy generation for headlines, body text, and CTAs
- [ ] Preview creative in multiple formats (desktop feed, mobile feed, right rail)
- [ ] Validation enforces format constraints (creative format must match campaign type)
- [ ] Limit warnings when approaching 15 active creatives per campaign

### US-005: Create and Manage Lead Gen Forms
As a marketer, I want to create lead gen forms and link them to lead generation campaigns.

**Acceptance Criteria**
- [ ] Form builder with field selection (name, email, company, job title, phone, custom questions)
- [ ] Form preview showing how it will appear on LinkedIn
- [ ] Form linked to campaign during creative setup
- [ ] Form responses flow through Lead Response Copilot pipeline (existing integration)
- [ ] List, edit, and archive existing lead gen forms

### US-006: Launch, Pause, and Manage Campaigns
As a marketer, I want to activate, pause, resume, and archive campaigns from inside `use60`.

**Acceptance Criteria**
- [ ] Activate campaign: changes status from DRAFT to ACTIVE (requires approval per autonomy model)
- [ ] Pause campaign: sets status to PAUSED (auto-approved)
- [ ] Resume campaign: changes status from PAUSED to ACTIVE
- [ ] Archive campaign: sets status to ARCHIVED
- [ ] Status changes reflect immediately in `use60` and sync to LinkedIn
- [ ] Campaign status indicators: draft, active, paused, completed, archived
- [ ] Concurrent active campaign limit warnings

### US-007: AI-Suggested Campaign Creation
As a founder, I want `use60` to suggest a full campaign setup based on my goals and ICP so I can launch faster.

**Acceptance Criteria**
- [ ] User provides a goal (e.g., "generate leads for our new product") and the AI drafts a complete campaign
- [ ] AI suggests: objective, format, targeting criteria, budget, copy, and CTA
- [ ] Suggestions are pre-filled into the campaign wizard for review and editing
- [ ] User confirms or adjusts each element before creation
- [ ] AI explains its reasoning for each suggestion

### US-008: Campaign Performance Monitoring
As a marketer, I want to see campaign performance inside the campaign management view so I can make decisions without switching to Campaign Manager.

**Acceptance Criteria**
- [ ] Inline performance metrics on campaign list: impressions, clicks, spend, leads, CTR, CPC, CPL
- [ ] Campaign detail view with daily/weekly trend charts
- [ ] Proactive alerts for underperforming campaigns (integrated with Advertising Analytics PRD)
- [ ] Quick actions from alerts: pause, increase budget, swap creative

### US-009: Bulk Campaign Actions
As a marketer managing multiple campaigns, I want to perform bulk actions like pausing or budget changes.

**Acceptance Criteria**
- [ ] Multi-select campaigns from the list view
- [ ] Bulk pause, resume, and archive operations
- [ ] Bulk budget adjustment (increase/decrease by percentage)
- [ ] Approval gate for bulk budget increases
- [ ] Action summary confirmation before execution

## Functional Requirements

- FR-1: All campaign mutations must use `versionTag` for optimistic concurrency control
- FR-2: Campaign creation must validate against LinkedIn limits before API submission
- FR-3: Lead gen form creation and management must integrate with the existing Lead Sync pipeline
- FR-4: Budget-impacting actions must go through the approval model unless autonomy threshold is met
- FR-5: Failed API calls must provide clear, user-friendly error messages, not raw API errors
- FR-6: Campaign data must sync bidirectionally: changes made in Campaign Manager should be reflected in `use60`
- FR-7: EU political ad compliance consent must be captured and sent to LinkedIn when targeting EU regions

## Technical Considerations

### Existing `use60` Capabilities to Reuse
- LinkedIn OAuth and credential storage (shared with Lead Response Copilot, Revenue Feedback Loop, Advertising Analytics)
- Lead Gen Form response handling from Lead Response Copilot
- Approval flow infrastructure from copilot preview-then-confirm pattern
- Proactive alerting infrastructure from pipeline intelligence
- AI copy generation from sales sequence and follow-up skills

### Architecture Overview

```
Campaign Management Flow:

User → Campaign Wizard UI → Edge Function (campaign-manager)
  ├── Validates inputs against LinkedIn constraints
  ├── Creates entities via LinkedIn Advertising API
  ├── Stores local copies for fast reads
  └── Returns confirmation to UI

Sync Flow:

Cron → Edge Function (campaign-sync)
  ├── Pulls campaign/creative/form updates from LinkedIn
  ├── Detects drift between local state and LinkedIn state
  ├── Updates local store
  └── Triggers alerts for externally-modified campaigns

AI Assist Flow:

User → Copilot → Edge Function (campaign-ai-assist)
  ├── Reads ICP data, deal history, previous campaign performance
  ├── Generates campaign suggestions via LLM
  └── Returns structured suggestions for wizard pre-fill
```

### Suggested Data Model

```
linkedin_managed_campaigns
├── id (uuid, PK)
├── org_id (uuid, FK)
├── ad_account_id (text, LinkedIn URN)
├── campaign_group_id (text, LinkedIn URN)
├── linkedin_campaign_id (text, LinkedIn URN)
├── name (text)
├── objective_type (text)
├── campaign_type (text)
├── format (text)
├── status (text)
├── daily_budget_amount (decimal)
├── total_budget_amount (decimal)
├── currency_code (text)
├── unit_cost_amount (decimal)
├── cost_type (text)
├── targeting_criteria (jsonb)
├── run_schedule_start (timestamptz)
├── run_schedule_end (timestamptz)
├── pacing_strategy (text)
├── audience_expansion_enabled (boolean)
├── offsite_delivery_enabled (boolean)
├── version_tag (text)
├── created_by (uuid, FK → users)
├── last_synced_at (timestamptz)
├── created_at (timestamptz)
└── updated_at (timestamptz)

linkedin_managed_creatives
├── id (uuid, PK)
├── org_id (uuid, FK)
├── campaign_id (uuid, FK → linkedin_managed_campaigns)
├── linkedin_creative_id (text, LinkedIn URN)
├── headline (text)
├── body_text (text)
├── cta_text (text)
├── destination_url (text)
├── media_type (text)
├── media_asset_id (text)
├── status (text)
├── is_direct_sponsored (boolean)
├── version_tag (text)
├── created_at (timestamptz)
└── updated_at (timestamptz)

linkedin_managed_lead_forms
├── id (uuid, PK)
├── org_id (uuid, FK)
├── linkedin_form_id (text, LinkedIn URN)
├── name (text)
├── headline (text)
├── description (text)
├── fields (jsonb)
├── thank_you_message (text)
├── landing_page_url (text)
├── status (text)
├── created_at (timestamptz)
└── updated_at (timestamptz)

linkedin_campaign_approvals
├── id (uuid, PK)
├── org_id (uuid, FK)
├── campaign_id (uuid, FK → linkedin_managed_campaigns)
├── action_type (text)
├── requested_by (uuid, FK → users)
├── approved_by (uuid, FK → users, nullable)
├── status (text: pending, approved, rejected)
├── details (jsonb)
├── created_at (timestamptz)
└── resolved_at (timestamptz)
```

### Bidirectional Sync
- Outbound: `use60` writes campaigns/creatives/forms to LinkedIn via API
- Inbound: Periodic sync job reads current state from LinkedIn and updates local store
- Drift detection: If a campaign was modified in Campaign Manager, `use60` flags the drift and offers to reconcile
- Conflict resolution: LinkedIn is the source of truth; `use60` local state updates to match after drift detection

## Risks and Constraints

- **Development vs Standard tier**: Development tier limits to 5 ad accounts with test campaigns; Standard tier required for real spend across multiple customers. Users must understand this distinction during onboarding
- **Campaign format immutability**: once a campaign's format is set, it cannot be changed; the wizard must make this clear upfront
- **API rate limits**: LinkedIn's Marketing API has rate limits that scale with tier; bulk operations may need throttling
- **Budget safety**: creating campaigns with real budgets requires robust approval flows and safeguards against accidental overspend
- **EU political ad compliance**: failure to capture and send political intent consent for EU-targeted campaigns results in API rejection
- **Bidirectional sync lag**: changes made in Campaign Manager may not appear in `use60` until the next sync cycle; users may see stale state
- **Lead gen form complexity**: LinkedIn's lead form builder has constraints on custom questions and field types that must be reflected accurately in `use60`'s builder

## Success Metrics

- Campaign creation adoption: 40%+ of users with connected ad accounts create at least one campaign within 60 days
- Campaign management actions: average 3+ management actions (pause, resume, edit, create creative) per user per month
- AI-assisted campaign completion rate: 70%+ of AI-suggested campaigns are approved and activated
- Budget approval response time: < 2 hours for Slack-delivered approval requests
- Sync accuracy: 99%+ match between `use60` local state and LinkedIn actual state
- Lead form utilization: 50%+ of lead gen campaigns use forms created in `use60`

## Rollout Plan

### Phase 1 — Core Campaign CRUD (MVP)
- Ad account connection with `rw_ads` permission
- Campaign group creation and management
- Campaign creation wizard: objective, format, targeting, budget, schedule
- Campaign status management: activate, pause, resume, archive
- Basic creative creation (single image sponsored content)
- Local campaign state with periodic LinkedIn sync

### Phase 2 — Full Creative and Form Management
- All creative types: carousel, video, text ads, dynamic ads, sponsored messaging
- Direct sponsored content support
- Lead gen form builder and campaign linking
- Creative performance inline metrics
- Bulk campaign actions
- Approval flow with Slack integration

### Phase 3 — AI-Powered Campaign Intelligence
- AI-assisted campaign creation (audience, copy, budget, format suggestions)
- Proactive optimization recommendations
- Campaign ideation from Ad Library Intelligence (cross-PRD integration)
- Progressive autonomy for campaign actions
- Event ad creation integration with Events Management API
- Drift detection and reconciliation UI

## Related PRDs

| PRD | Relationship |
|-----|-------------|
| Advertising Analytics | Campaign performance data from Advertising Analytics surfaces inline in campaign management views |
| Ad Library Intelligence | Campaign ideation from competitive intelligence generates pre-filled campaign drafts |
| Revenue Feedback Loop | Campaigns created here generate conversion events streamed by the Revenue Feedback Loop |
| Lead Response Copilot | Lead gen forms created here produce leads ingested by the Lead Response Copilot |
| Event-to-Pipeline Engine | Event Ad campaigns link to event workflows managed by the Event-to-Pipeline Engine |

## Open Questions

- Should `use60` attempt to manage client ad accounts on behalf of agencies, or focus on first-party accounts only?
- How should we handle the scenario where a user creates a campaign in `use60` but another team member edits it in Campaign Manager?
- What is the right UX for the political ad compliance consent — inline toggle, dedicated step, or auto-detect based on targeting?
- Should A/B testing (multiple creatives per campaign) be a first-class feature or left to manual creative management?
- How do we handle campaign budget currency mismatches if a user's org uses USD but their ad account uses EUR?
