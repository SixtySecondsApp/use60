# PRD: LinkedIn Advertising Analytics

**Date**: 2026-03-09
**Branch**: `feat/linkedin-advertising-analytics`
**Status**: Draft

---

## Summary

Build a revenue-aware LinkedIn advertising analytics layer inside `use60` that goes beyond standard ad-platform reporting by connecting LinkedIn campaign performance to real downstream pipeline and revenue outcomes.

Users should be able to see spend, impressions, clicks, leads, and demographic breakdowns from the official LinkedIn Advertising API, and overlay that with `use60`-native pipeline metrics like meetings booked, proposals sent, deals won, and revenue generated. The result is a single view that answers "which LinkedIn campaigns actually create revenue?" instead of just "which campaigns get clicks?"

## Why This Matters

- Most LinkedIn analytics stop at impressions, clicks, and leads. Founders and small teams cannot easily answer "what did that spend produce?"
- `use60` already tracks the full downstream journey: contacts, meetings, proposals, deals, and revenue
- Combining official LinkedIn ad metrics with `use60` pipeline data creates a closed-loop reporting surface that no standalone ad tool provides for SMBs
- This is a natural complement to the Revenue Feedback Loop PRD, which sends signals back to LinkedIn; this PRD surfaces the combined picture for the user

## Goals

- Pull campaign, account, and creative performance data from the LinkedIn Advertising API
- Show standard ad metrics: spend, impressions, clicks, CTR, CPM, CPC, leads, cost per lead
- Overlay downstream pipeline metrics from `use60`: meetings booked, proposals sent, deals won, revenue, cost per meeting, cost per deal
- Support professional demographic breakdowns: job title, seniority, industry, company size, geography
- Surface anomaly detection and optimization recommendations proactively
- Keep analytics scoped to connected ad accounts the user administers

## Non-Goals

- Replacing LinkedIn Campaign Manager as the primary campaign editing tool (see Ad Manager PRD)
- Real-time streaming analytics; near-real-time with periodic sync is sufficient
- Providing exact attribution guarantees beyond what LinkedIn and `use60` source tracking support
- Building general-purpose BI or cross-platform ad analytics

## LinkedIn APIs and Permissions

### Primary API
- `adAnalytics` endpoint with `Statistics`, `Analytics`, and `AttributedRevenueMetrics` finders
- Campaign, campaign group, and account structure endpoints for hierarchy context

### Required Permissions

| Scope | Purpose |
|-------|---------|
| `r_ads_reporting` | Retrieve ad analytics and reporting data |
| `r_ads` | Read ad accounts, campaigns, creatives, and campaign groups |

### Key API Characteristics
- Performance data retained for 10 years; demographic data for 2 years
- Performance metrics are near-real-time; demographic metrics delayed 12-24 hours
- Up to 20 metrics per request via `fields` parameter
- Maximum 15,000 elements per response; no pagination support
- Professional demographic pivots require minimum 3 events and return top 100 values per creative per day
- Data throttling: 45 million metric values across all queries in a 5-minute window
- `AttributedRevenueMetrics` finder available when CRM is connected to LinkedIn Business Manager

### Access Tier Implications
- `Development` tier: read analytics for up to 5 ad accounts (sufficient for MVP)
- `Standard` tier: unlimited ad account analytics (needed for multi-customer production)

## Product Principles

- Revenue over vanity metrics: always show downstream outcomes alongside ad-platform metrics
- Proactive over passive: surface anomalies and recommendations, do not just display dashboards
- Honest attribution: clearly label what LinkedIn reports vs what `use60` infers
- Actionable: every insight should suggest or enable a next step

## User Stories

### US-001: Connect Ad Accounts for Analytics
As a marketer, I want to connect my LinkedIn ad accounts so `use60` can pull performance data.

**Acceptance Criteria**
- [ ] OAuth flow authenticates user and discovers eligible ad accounts
- [ ] User selects which ad accounts to sync for analytics
- [ ] Connection health and last sync time are visible in settings
- [ ] Reuses the same LinkedIn credential infrastructure as Lead Response Copilot and Revenue Feedback Loop

### US-002: Sync Campaign Performance Data
As the system, I want to periodically pull campaign performance metrics so reporting is current.

**Acceptance Criteria**
- [ ] Scheduled sync job pulls metrics at configurable intervals (default: every 6 hours)
- [ ] Sync fetches account, campaign group, campaign, and creative level data
- [ ] Standard metrics: impressions, clicks, spend, CTR, CPM, CPC, leads, conversions, cost per lead
- [ ] Sync handles API throttling with backoff and retry
- [ ] Historical backfill on first connection (configurable lookback, default 90 days)
- [ ] Sync status and errors are logged and visible to admin

### US-003: View Campaign Performance Dashboard
As a founder or marketer, I want to see LinkedIn campaign performance in `use60` so I do not need to switch to Campaign Manager.

**Acceptance Criteria**
- [ ] Dashboard shows account-level, campaign-group-level, and campaign-level views
- [ ] Standard metrics displayed: impressions, clicks, spend, CTR, CPM, CPC, leads, conversions
- [ ] Date range filtering with presets (last 7 days, 30 days, 90 days, custom)
- [ ] Campaign status indicators (active, paused, completed, draft)
- [ ] Sortable and filterable by any metric column

### US-004: Overlay Pipeline Revenue Metrics
As a revenue leader, I want to see which campaigns produce meetings, proposals, and revenue, not just leads.

**Acceptance Criteria**
- [ ] Dashboard shows downstream metrics alongside ad metrics: meetings booked, proposals sent, deals won, revenue
- [ ] Derived metrics: cost per meeting, cost per proposal, cost per deal, ROAS
- [ ] Attribution links LinkedIn-sourced contacts to downstream pipeline events
- [ ] Attribution methodology is clearly disclosed in the UI
- [ ] Campaigns with high lead volume but poor downstream conversion are flagged

### US-005: Professional Demographic Breakdowns
As a marketer, I want to understand which professional segments engage with my ads so I can refine targeting.

**Acceptance Criteria**
- [ ] Demographic pivots available: job title, job function, seniority, industry, company size, geography
- [ ] Demographic data displayed at account, campaign, and creative levels
- [ ] Minimum threshold and approximation caveats from LinkedIn are surfaced in the UI
- [ ] Top-performing segments are highlighted

### US-006: Anomaly Detection and Optimization Alerts
As a founder, I want `use60` to proactively flag underperforming campaigns and suggest actions.

**Acceptance Criteria**
- [ ] System detects spend anomalies: sudden cost spikes, CTR drops, lead volume declines
- [ ] System detects pipeline quality issues: campaigns with leads but no meetings or proposals
- [ ] Alerts delivered via Slack or in-app command center
- [ ] Each alert includes a suggested action: pause, adjust targeting, review creative, increase budget
- [ ] Actionable alerts link to campaign management actions (see Ad Manager PRD) where write access is connected
- [ ] Alert frequency is configurable; default is daily digest plus real-time for critical issues

### US-007: Export and Share Reports
As a marketer, I want to export or share analytics views so I can report to stakeholders.

**Acceptance Criteria**
- [ ] CSV export for any analytics view
- [ ] Shareable link to a read-only report view (optional, phase 2)
- [ ] Slack summary post with key metrics on demand or scheduled

## Functional Requirements

- FR-1: Analytics sync must not block other LinkedIn integrations (lead capture, conversions) on failure
- FR-2: Pipeline overlay metrics must clearly distinguish LinkedIn-attributed vs multi-touch attribution
- FR-3: API throttling must be handled gracefully with retry and backoff
- FR-4: Historical data backfill must be bounded and configurable
- FR-5: Demographic data approximation caveats must be visible to users
- FR-6: Anomaly detection must be tunable per organization to avoid alert fatigue

## Technical Considerations

### Existing `use60` Capabilities to Reuse
- LinkedIn OAuth and credential storage from Lead Response Copilot
- Pipeline source attribution on contacts, deals, and activities
- Proactive alert infrastructure via Slack and command center
- Reporting and dashboard patterns from existing pipeline views

### Recommended Architecture
- LinkedIn analytics sync worker (scheduled edge function or cron job)
- Analytics data store (materialized views or dedicated reporting tables)
- Dashboard UI component with metric overlays
- Alert engine for anomaly detection
- Attribution service linking LinkedIn-sourced contacts to pipeline events

### Suggested Data Model
- `linkedin_analytics_sync_runs` for sync audit trail
- `linkedin_campaign_metrics` for time-series ad metrics by campaign/creative/account
- `linkedin_demographic_metrics` for professional demographic pivot data
- Attribution views joining LinkedIn source metadata on contacts to downstream pipeline events

### API Constraints
- No pagination on `adAnalytics` endpoint; large date ranges may require splitting
- Demographic pivots limited to top 100 values per creative per day
- `AttributedRevenueMetrics` only available if CRM is connected to LinkedIn Business Manager (not available for most `use60` SMB users; use `use60` pipeline attribution instead)
- Data throttling at 45M metric values per 5-minute window

## Risks and Constraints

- `Development` tier limits analytics to 5 ad accounts; `Standard` tier needed for production scale
- LinkedIn demographic data is approximate and privacy-protected; users may expect exact numbers
- Pipeline attribution quality depends on source tracking accuracy in `use60`
- API throttling can delay sync for heavy accounts; sync scheduling must be adaptive
- Users may expect real-time data; LinkedIn performance metrics are near-real-time, demographics are delayed 12-24 hours

## Success Metrics

- 90%+ successful sync rate for connected ad accounts
- Dashboard adoption: 60%+ of users with connected LinkedIn accounts view analytics weekly
- Anomaly alerts acted upon within 24 hours for critical issues
- Users report pipeline-overlay metrics as the primary differentiation vs Campaign Manager

## Rollout Plan

### Phase 1 (MVP)
- Ad account connection (reuse existing OAuth flow)
- Periodic metric sync (account, campaign, creative levels)
- Basic campaign performance dashboard with standard metrics
- Date range filtering and sorting

### Phase 2
- Pipeline revenue overlay (meetings, proposals, deals, ROAS)
- Professional demographic breakdowns
- Anomaly detection and Slack alerts
- CSV export

### Phase 3
- Optimization recommendations and playbooks
- Comparative reporting (campaign vs campaign, period vs period)
- Scheduled Slack report summaries
- Shareable report links

## Related PRDs

| PRD | Relationship |
|-----|-------------|
| Revenue Feedback Loop | Complementary — that PRD sends `use60` pipeline events to LinkedIn; this PRD reads performance data from LinkedIn and overlays `use60` pipeline metrics |
| Ad Manager | This PRD's anomaly alerts and optimization recommendations feed into campaign actions managed by the Ad Manager |
| Lead Response Copilot | LinkedIn-sourced contacts flow through Lead Response Copilot; this PRD attributes downstream pipeline outcomes back to the originating campaigns |
| Ad Library Intelligence | Competitive ad data can contextualize own-campaign performance and creative strategy |

## Open Questions

- Should we attempt `AttributedRevenueMetrics` for users who have LinkedIn Business Manager CRM connections, or rely entirely on `use60` pipeline attribution?
- How should we handle attribution for contacts who interact with multiple campaigns?
- What is the right default sync frequency: every 6 hours, every 12 hours, or daily?
- Should demographic breakdowns be a premium/paid feature or available to all plans?
