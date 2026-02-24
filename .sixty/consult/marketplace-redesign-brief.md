# Consult Report: Org Marketplace Redesign

## Brief
The org-admin marketplace at `/agent/marketplace` needs a completely different design from the platform admin dashboard. It should feel like an **app store / showcase** (Shopify App Store, Slack Marketplace) rather than an admin control panel.

## Design Decisions

| Dimension | Decision |
|-----------|----------|
| **Visual style** | App store / showcase — hero banner, category sections, rich preview cards |
| **Organization** | By use case / outcome (not lifecycle stage) |
| **Card design** | Rich preview — icon, description, integration badges, stats, toggle, click-to-detail |
| **Onboarding** | Hero banner + 3 recommended abilities based on org profile data |
| **Detail view** | Side panel (Sheet) — full description, config, channels, stats |

## Use-Case Categories (4)

### 1. Meeting Prep (5 abilities)
**Outcome**: Go into every call prepared and confident
- Pre-Meeting Briefing, Daily Brief, Pre-Meeting Nudge, Calendar Scheduling, Intent Detection

### 2. Post-Meeting Automation (6 abilities)
**Outcome**: Never drop the ball after a call
- Post-Meeting Follow-up, Call Type Classification, Post-Call Summary, Email Send-as-Rep, HITL Follow-up Email, Email Reply Alert

### 3. Pipeline Health (6 abilities)
**Outcome**: Keep your deals moving and predictable
- Deal Risk Scanner, Stale Deal Revival, Stale Deal Alert, Daily Focus Planner, Email Classification, Proposal Generation

### 4. Coaching & Insights (5 abilities)
**Outcome**: Improve your sales performance with data
- Coaching Micro-Feedback, Coaching Analysis, Weekly Coaching Digest, Smart Suggestion, Campaign Monitoring

## Org Profile Data Available for Recommendations

| Source | Fields | Use |
|--------|--------|-----|
| `organizations` table | company_industry, company_size | Industry-specific recommendations |
| `organization_enrichment` | products, competitors, target_market | Vertical-specific abilities |
| Integration stores | slack.isConnected, google.isConnected, fathom, instantly | Show "ready to use" abilities first |
| `proactive_agent_config` | enabled_sequences | Track adoption progress |

## Recommendation Strategy
1. Prioritize abilities where all integrations are connected (ready to use)
2. Surface abilities matching org industry/size
3. Default fallback: top 3 most popular abilities (post-meeting debrief, pre-meeting briefing, deal risk scanner)

## Sheet Pattern (CRITICAL)
All sheets MUST use: `className="!top-16 !h-[calc(100vh-4rem)] w-full sm:max-w-lg"`

## Execution Plan

| # | Story | Type | Est. | Parallel |
|---|-------|------|------|----------|
| 1 | MKTV2-001: Add use-case categories to registry | frontend | 15m | — |
| 2 | MKTV2-002: MarketplaceHero with org recommendations | frontend | 25m | with #3, #4 |
| 3 | MKTV2-003: MarketplaceAbilityCard (rich preview) | frontend | 25m | with #2, #4 |
| 4 | MKTV2-004: AbilityDetailSheet (side panel) | frontend | 30m | with #2, #3 |
| 5 | MKTV2-005: Assemble OrgMarketplacePage | frontend | 25m | — |

**Waves**:
- Wave 1: MKTV2-001 (registry foundation)
- Wave 2: MKTV2-002 + MKTV2-003 + MKTV2-004 (3 parallel components)
- Wave 3: MKTV2-005 (page assembly)
