# PRD: LinkedIn Ad Library Intelligence

**Date**: 2026-03-09
**Branch**: `feat/linkedin-ad-library-intelligence`
**Status**: Draft

---

## Summary

Build a competitive ad intelligence layer that lets `use60` users monitor, capture, cluster, and learn from LinkedIn ads running in their industry or niche. The system should surface what competitors and top performers are saying, which creative formats they use, how their messaging evolves over time, and what angles are getting repeated investment.

Because LinkedIn does not offer a public Ad Library API, this PRD explicitly separates capabilities into two tiers:

1. **Official Mode** — using LinkedIn's public-facing Ad Library web interface constraints and any officially supported endpoints
2. **Enhanced Intelligence Mode** — using third-party scraping providers (Apify actors, Adyntel API) and AI analysis to deliver the "best possible product" experience

Both modes are documented because the user requested "best possible scope," and the distinction ensures transparency about data provenance and compliance risk.

## Why This Matters

- LinkedIn is the dominant B2B advertising channel, but competitive intelligence tools are fragmented and expensive (Pathmatics, Moat, AdBeat charge $500+/month)
- Small sales teams waste budget because they cannot see what messaging is working in their vertical
- Knowing what competitors promote — their angles, offers, CTAs, and creative formats — directly improves campaign strategy, proposal positioning, and sales battlecards
- `use60` already powers battlecards, proposals, outreach sequences, and campaign ideation; ad intelligence is a natural input layer for all of these

## Goals

- Let users search and browse LinkedIn ads by advertiser, industry, keyword, and geography
- Capture and store ad creative data: copy, headlines, CTAs, media type, format, destination URLs
- Cluster ads by theme, angle, persona, offer type, and creative format using AI
- Identify repeated patterns that suggest successful campaigns (ads that run for extended periods, receive multiple creative variants, or reappear across time)
- Feed insights into battlecard generation, proposal writing, outreach sequences, and campaign ideation
- Support both official and enhanced intelligence modes with clear user controls

## Non-Goals

- Providing actual performance metrics (impressions, clicks, spend) for competitor ads — LinkedIn does not expose this data
- Scraping private or authenticated LinkedIn surfaces (feeds, InMail, DMs)
- Building a standalone ad-spy SaaS product; this is an intelligence layer inside `use60`
- Replacing the user's own campaign analytics (see Advertising Analytics PRD)

## Data Sources and Compliance

### Official Mode
LinkedIn provides a public Ad Library accessible at `linkedin.com/ad-library`. This surface allows searching by advertiser name or keyword and returns active and recently completed ads with basic metadata (advertiser, format, copy, media). There is no official REST API for this data.

**Capability in Official Mode**:
- Manual search and browse experience linked from `use60`
- User-submitted ad screenshots or copy for AI analysis
- No programmatic data collection

### Enhanced Intelligence Mode
Third-party providers offer structured access to publicly visible Ad Library data:

| Provider | Pricing | Capabilities |
|----------|---------|-------------|
| Apify `memo23/linkedin-ads-scraper` | ~$0.55–$1.00 per 1,000 ads | Search by company, keyword, country; returns ad text, advertiser, CTA, media URLs |
| Apify `ivanvs/linkedin-ads-scraper` | $12/mo + usage | Works with LinkedIn Ad Library search URLs; structured output |
| Adyntel API | Credit-based (~1 credit per 25 ads) | Full ad inventory by domain; creative URLs, headlines, descriptions, format detection |

**Capability in Enhanced Mode**:
- Automated, scheduled ad monitoring for tracked competitors
- Full ad creative capture with media and copy
- Historical ad library snapshots for trend analysis
- AI-powered clustering and pattern detection

**Compliance Note**: Enhanced mode uses only publicly visible data from LinkedIn's Ad Library. No authentication bypass, no private data access. Users opt into enhanced mode explicitly and are informed of the data source.

## Key Product Decisions

### What "Top Performers" Means Without Spend Data
LinkedIn does not expose impression counts, clicks, or spend for competitor ads. "Top performer" proxies in this system are:
- **Longevity**: ads that run for extended periods (weeks or months) suggest positive ROI
- **Variant density**: advertisers who create many variants of the same angle are likely optimizing a winner
- **Recurrence**: ads that stop and restart indicate deliberate re-investment
- **Creative investment**: video and carousel formats require higher production cost, signaling commitment

These proxies are clearly labeled in the UI as inferred signals, not performance data.

### Industry and Niche Classification
- Users define their industry, vertical, and competitor list during onboarding or in settings
- AI classification enriches ads with industry vertical, persona target, messaging angle, and offer type
- Users can manually tag or reclassify ads for training purposes

## User Stories

### US-001: Track Competitors' LinkedIn Ads
As a marketer, I want to monitor LinkedIn ads from specific competitors so I understand their messaging.

**Acceptance Criteria**
- [ ] User adds competitor names or LinkedIn company page URLs to a watchlist
- [ ] System regularly captures new ads from watched competitors (Enhanced Mode)
- [ ] Ads are stored with full creative data: headline, body, CTA, media, format, destination URL, advertiser
- [ ] User can browse captured ads in a gallery view sorted by recency or cluster
- [ ] In Official Mode, user can manually paste ad URLs or screenshots for AI analysis

### US-002: Search Ads by Industry and Keyword
As a sales leader, I want to search for LinkedIn ads by industry keyword (e.g., "sales automation", "CRM") so I can see the competitive landscape.

**Acceptance Criteria**
- [ ] Keyword search returns matching ads from the ad library dataset
- [ ] Results filterable by geography, ad format, date range, and advertiser
- [ ] Results show ad creative preview, advertiser name, and inferred metadata
- [ ] Search works across both actively tracked competitors and broader keyword sweeps

### US-003: AI-Powered Ad Clustering
As a marketer, I want ads automatically clustered by messaging angle, target persona, offer type, and CTA pattern so I can spot trends.

**Acceptance Criteria**
- [ ] AI classifies each ad into categories: angle (e.g., pain-point, ROI, social-proof), persona (e.g., CEO, VP Sales, Developer), offer (e.g., demo, free trial, whitepaper, event), CTA type (e.g., sign up, learn more, register), creative format (single image, carousel, video, text)
- [ ] Cluster view shows ad groupings with count, sample creatives, and trend over time
- [ ] Users can filter by any classification dimension
- [ ] Users can correct or override AI classifications

### US-004: Identify Likely Winners and Trending Angles
As a marketer, I want to see which ad patterns suggest high investment or success so I can prioritize what to emulate or counter.

**Acceptance Criteria**
- [ ] System surfaces "likely winner" signals: longevity, variant density, recurrence, creative investment
- [ ] Trend view shows which angles, offers, and formats are increasing in frequency
- [ ] Alerts when a tracked competitor launches a new ad type or angle
- [ ] UI clearly labels signals as inferred proxies, not performance data

### US-005: Feed Ad Intelligence Into Battlecards and Proposals
As a salesperson, I want competitor ad intelligence to appear in my battlecards and proposal prep so I can position against their public messaging.

**Acceptance Criteria**
- [ ] Battlecard skill receives recent competitor ad angles, offers, and claims as input
- [ ] Proposal skill references competitor messaging when crafting positioning sections
- [ ] Copilot surfaces relevant competitor ads when preparing for meetings with competitive deals
- [ ] Links to source ads are included for reference

### US-006: Feed Ad Intelligence Into Campaign Ideation
As a marketer, I want to use competitor and industry ad patterns to generate my own campaign ideas.

**Acceptance Criteria**
- [ ] Campaign ideation view shows top-performing angles and underrepresented opportunities in the user's niche
- [ ] AI suggests campaign angles based on competitor gaps and trending themes
- [ ] Suggested angles include example copy, CTA options, and format recommendations
- [ ] Integration with Ad Manager PRD for one-click campaign creation from an idea

### US-007: Ad Intelligence Digest
As a revenue leader, I want a periodic summary of competitive ad activity so I stay informed without daily monitoring.

**Acceptance Criteria**
- [ ] Weekly Slack digest summarizes new ads from tracked competitors
- [ ] Digest highlights new angles, format changes, and likely winners
- [ ] Digest is configurable: frequency, competitors included, detail level
- [ ] On-demand summary available via copilot chat

## Functional Requirements

- FR-1: Enhanced mode ad capture must run on a configurable schedule (default weekly per competitor)
- FR-2: Ad data must be stored with full provenance: source, capture date, provider, confidence
- FR-3: AI classification must use a consistent taxonomy that supports filtering and trend analysis
- FR-4: Ad creative media (images, videos) must be cached locally to avoid broken links
- FR-5: User must explicitly opt into Enhanced Mode; Official Mode is the default
- FR-6: Rate limiting and cost controls for third-party scraping providers must be configurable per org
- FR-7: Ad data must be scoped to the organization; no cross-org data leakage

## Technical Considerations

### Architecture Overview
- **Ad Capture Pipeline**: Scheduled edge function triggers Apify actor or Adyntel API, normalizes output, stores in `linkedin_ad_library_ads` table
- **AI Classification Engine**: Edge function or background job that classifies new ads using LLM with structured output (angle, persona, offer, CTA, format)
- **Intelligence Views**: React components for gallery, cluster, trend, and search views
- **Integration Layer**: Skill inputs for battlecard, proposal, and campaign ideation copilot skills

### Existing `use60` Capabilities to Reuse
- Apify actor invocation patterns from ops enrichment
- AI classification patterns from deal auto-tagger and lead qualification
- Competitor intelligence skill as an integration consumer
- Slack digest infrastructure from meeting and pipeline digests

### Suggested Data Model

```
linkedin_ad_library_ads
├── id (uuid, PK)
├── org_id (uuid, FK)
├── advertiser_name (text)
├── advertiser_linkedin_url (text)
├── headline (text)
├── body_text (text)
├── cta_text (text)
├── destination_url (text)
├── media_type (enum: image, video, carousel, text)
├── media_urls (jsonb)
├── cached_media_paths (jsonb)
├── ad_format (text)
├── geography (text)
├── first_seen_at (timestamptz)
├── last_seen_at (timestamptz)
├── capture_source (text)
├── raw_data (jsonb)
├── created_at (timestamptz)
└── updated_at (timestamptz)

linkedin_ad_library_classifications
├── id (uuid, PK)
├── ad_id (uuid, FK → linkedin_ad_library_ads)
├── angle (text)
├── target_persona (text)
├── offer_type (text)
├── cta_type (text)
├── industry_vertical (text)
├── confidence (float)
├── classified_by (text)
├── created_at (timestamptz)
└── updated_at (timestamptz)

linkedin_ad_library_watchlist
├── id (uuid, PK)
├── org_id (uuid, FK)
├── competitor_name (text)
├── competitor_linkedin_url (text)
├── capture_frequency (text, default 'weekly')
├── is_active (boolean)
├── last_captured_at (timestamptz)
├── created_at (timestamptz)
└── updated_at (timestamptz)
```

### Cost Management
- Apify scraping costs ~$0.55–$1.00 per 1,000 ads; typical competitor watchlist of 10 companies with weekly scrapes costs <$5/month
- Adyntel charges per credit (~1 credit per 25 ads); similar economics
- AI classification costs (LLM inference) are marginal per ad
- Cost caps and usage alerts must be configurable per organization

## Risks and Constraints

- **No official API**: Enhanced mode relies on third-party scraping of a public interface; LinkedIn could change the Ad Library structure at any time
- **No real performance data**: users may expect click and spend data for competitor ads; we must manage expectations clearly in the UI
- **Scraping compliance**: while the Ad Library is public, LinkedIn's ToS may restrict automated scraping; this should be reviewed with counsel
- **Data freshness**: third-party scrapers may lag behind LinkedIn's actual ad library state
- **Media caching**: storing competitor ad creative (images, videos) requires storage management and potential copyright considerations
- **Classification accuracy**: AI classification of ad angles and personas will have error rates; user override is essential

## Success Metrics

- Competitive watchlist adoption: 50%+ of active orgs add at least one competitor within 30 days of feature launch
- Ad capture success rate: 95%+ for Enhanced Mode scrapes
- Classification accuracy: 80%+ agreement with user-verified classifications
- Integration usage: 30%+ of battlecards and proposals reference ad intelligence data
- User-reported value: "I understand what my competitors are saying on LinkedIn" rating > 4/5

## Rollout Plan

### Phase 1 — Official Mode (MVP)
- Competitor watchlist management UI
- Link to LinkedIn Ad Library with pre-filled search
- Manual ad screenshot/copy paste for AI analysis
- Basic AI classification of user-submitted ads
- Gallery view for saved ads

### Phase 2 — Enhanced Intelligence Mode
- Apify-powered automated ad capture for watchlisted competitors
- Scheduled capture pipeline with configurable frequency
- Full AI classification engine with structured taxonomy
- Cluster and trend views
- Keyword-based industry search
- Slack weekly digest

### Phase 3 — Integrated Intelligence
- Battlecard skill integration with ad intelligence
- Proposal skill integration
- Campaign ideation from competitive gaps
- "Likely winner" proxy scoring and alerts
- Historical trend analysis and comparative reporting
- Integration with Ad Manager for one-click campaign creation from ideas

## Related PRDs

| PRD | Relationship |
|-----|-------------|
| Ad Manager | Campaign ideation from competitive intelligence feeds directly into campaign creation workflows in the Ad Manager |
| Advertising Analytics | Own-campaign analytics contextualized against competitor messaging trends |
| Revenue Feedback Loop | Competitor ad monitoring helps explain market shifts that affect campaign quality metrics |
| Lead Response Copilot | Competitor ad copy and offers inform battlecard and follow-up personalization |

## Open Questions

- Should we build our own scraper or exclusively use Apify/Adyntel? Own scraper gives control but increases maintenance burden
- How should we handle LinkedIn ToS changes that may affect scraping? Circuit-breaker pattern with graceful fallback to Official Mode?
- Should ad creative media be stored permanently or with a TTL policy?
- Is there demand for cross-platform ad intelligence (Google Ads, Meta) alongside LinkedIn, or should this remain LinkedIn-focused?
- Should the AI classification taxonomy be fixed or user-extensible per organization?
