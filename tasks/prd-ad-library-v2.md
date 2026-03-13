# Ad Library Intelligence v2 — PRD

## Overview
Five enhancements to the LinkedIn Ad Library feature that transform it from a scraping tool into a full competitive intelligence platform.

## Current State
- Scrape ads from LinkedIn Ad Library via Apify
- Scrape organic posts from company LinkedIn pages
- Save/unsave individual ads with bookmark
- Get engagement data (likes, comments, reactions) via fuzzy-matching
- Watchlist for competitor tracking
- Clusters, trends, likely winners views

## Features

### 1. AI Ad Remix ("Write one like this")
**Priority**: P0 — highest user value, fastest to ship

When viewing a saved ad, users can click "Remix" to generate an adapted version for their company using AI. Uses Gemini for copy generation and Nano Banana 2 for creative generation.

**User stories:**
- US-001: Add "Remix" button to AdDetailSheet
- US-002: Create `linkedin-ad-remix` edge function (Gemini 2.5 Flash for copy + Nano Banana 2 for creative)
- US-003: Display remix results in a side panel with copy variants + generated image
- US-004: "Copy to clipboard" and "Download image" actions on remix results

**Edge function spec:**
- Input: `{ ad_id, company_name?, company_description?, tone? }`
- Reads the saved ad's body_text, headline, CTA, media_type
- Reads user's org profile for company context
- Gemini generates 3 copy variants (different angles/hooks)
- If the original ad has images, Nano Banana 2 generates a matching creative
- Returns: `{ variants: [{ headline, body, cta }], image_url? }`

**Acceptance criteria:**
- Remix button visible on saved ads in detail sheet
- 3 copy variants generated in <10s
- Image generated in <15s (if applicable)
- Copy-to-clipboard works for each variant
- Image downloadable

---

### 2. Competitor Dashboard Rollup
**Priority**: P0 — transforms the explore experience

Per-competitor aggregate view showing: total active ads, creative format mix, top messaging angles, posting frequency, avg engagement.

**User stories:**
- US-005: Create `CompetitorDashboard` component with aggregate stats
- US-006: Add `get_competitor_stats` action to `linkedin-ad-search` edge function
- US-007: Show competitor cards in a new "Competitors" tab or as header in gallery when filtering by advertiser

**Edge function spec:**
- Input: `{ action: "get_competitor_stats", advertiser_name? }`
- Aggregates from `linkedin_ad_library_ads` grouped by `advertiser_name`
- Returns per competitor: ad_count, organic_count, format_breakdown (% image/video/text/carousel), avg_engagement (likes+comments), top_angles (from classifications), first/last capture dates, active_ad_count (seen in last 30 days)

**Acceptance criteria:**
- Shows stats for each competitor with ads in the library
- Clicking a competitor card filters the gallery to their ads
- Visual format breakdown (mini bar chart or pill distribution)

---

### 3. Auto-Tracking with Longevity Alerts
**Priority**: P1 — makes longevity data actually useful

Scheduled daily re-capture for watchlisted competitors. Tracks which ads persist (performing) vs disappear (killed). Alerts via Slack when notable changes occur.

**User stories:**
- US-008: Create `linkedin-ad-auto-capture` cron edge function (daily)
- US-009: Update `last_seen_at` on re-captured ads, mark disappeared ads
- US-010: Slack alert when ad crosses 30-day longevity threshold
- US-011: Slack alert when a long-running ad disappears

**Cron function spec:**
- Runs daily via Supabase pg_cron or external cron
- For each active watchlist entry, re-runs capture
- Matches existing ads by `advertiser_name` + body_text similarity
- Updates `last_seen_at` for matched ads
- Flags ads not seen in 7+ days as `is_likely_dead`
- Sends Slack notification for milestone crossings (30d, 60d, 90d)

**Schema changes:**
- Add `is_likely_dead boolean DEFAULT false` to `linkedin_ad_library_ads`
- Add `longevity_milestone_sent int DEFAULT 0` to track which milestone alert was sent

**Acceptance criteria:**
- Watchlisted competitors auto-re-captured daily
- `last_seen_at` updates correctly for persistent ads
- Longevity display shows real multi-day data after 2+ captures
- Slack alerts fire at 30/60/90 day milestones

---

### 4. Landing Page Capture
**Priority**: P1 — completes the full-funnel view

Scrape the `destination_url` for saved ads to capture the landing page: headline, meta description, screenshot, key elements.

**User stories:**
- US-012: Create `linkedin-ad-landing-capture` edge function
- US-013: Add `landing_page` JSONB column to store captured data
- US-014: Display landing page preview in AdDetailSheet
- US-015: "Capture Landing Page" button on saved ads

**Edge function spec:**
- Input: `{ ad_id }` or `{ url }`
- Fetches the destination URL
- Extracts: title, meta description, OG image, H1, key CTAs
- Optionally uses Apify web scraper for full page content
- Stores result in `landing_page` JSONB column on the ad record

**Schema changes:**
- Add `landing_page jsonb` to `linkedin_ad_library_ads`

**Acceptance criteria:**
- "Capture Landing Page" button on saved ad detail
- Shows title, description, and OG image preview
- Stores data for future reference
- Handles redirects and common landing page patterns

---

### 5. A/B Test Detection
**Priority**: P2 — advanced intelligence layer

Group ads from the same advertiser with similar copy/creative but small variations. Surface these as "likely split tests" to reveal what competitors are testing.

**User stories:**
- US-016: Create `detect_ab_tests` action in search edge function
- US-017: Group ads by advertiser + high text similarity (>60% Jaccard)
- US-018: Display A/B test groups in a dedicated section
- US-019: Show which variant is "winning" (longer running or higher engagement)

**Edge function spec:**
- Input: `{ action: "detect_ab_tests", advertiser_name? }`
- Groups ads by advertiser
- Within each group, computes pairwise text similarity
- Clusters ads with >60% similarity as "likely variants"
- Identifies "winner" by longest running or highest engagement
- Returns: `{ test_groups: [{ ads: [...], winner_id, variable_type }] }`

**Acceptance criteria:**
- A/B tests detected and grouped correctly
- Shows what's being tested (headline, body, CTA, creative)
- Winner identified with explanation
- Accessible from gallery or competitor dashboard

---

## Execution Order

Phase 1 (ship first): US-001 → US-004 (AI Remix), US-005 → US-007 (Competitor Dashboard)
Phase 2: US-008 → US-011 (Auto-Tracking), US-012 → US-015 (Landing Page)
Phase 3: US-016 → US-019 (A/B Test Detection)

## Technical Notes
- Nano Banana 2 API: Use existing `nano-banana-image` skill/edge function pattern
- Gemini 2.5 Flash: Already used in `demo-research` function, `thinkingBudget: 0` for speed
- Apify token: Already stored in `integration_credentials` table
- Slack alerts: Use existing `send-slack-message` edge function
- All edge functions deploy with `--no-verify-jwt` on staging
