# PRD: LinkedIn Ad Library → Ops Tables → Ads Manager Pipeline

## Introduction

Turn the LinkedIn Ad Library into a full creative operations engine. Users multi-select competitor ads, import them into an ops table (creative, copy, CTA, landing page), remix them with AI Image, AI Video, and SVG Animation columns, push the remixed variations into LinkedIn Ads Manager as campaign creatives with budget mapping, and capture live analytics back into the ops table — closing the loop from inspiration to performance data in one workspace.

This connects three existing systems that currently operate independently: Ad Library (intelligence), Ops Tables (creative workspace), and LinkedIn Ads Manager (campaign execution). The missing pieces are three connectors between them.

## Goals

- Enable users to go from "competitor ad spotted" to "live campaign variation" without leaving the platform
- Reduce creative variation workflow from hours of manual work to minutes of AI-assisted remixing
- Provide a single-table view of creative → campaign → performance data for rapid A/B testing decisions
- Make LinkedIn ad operations fully configurable through ops tables (the "ops-first" paradigm)

## User Stories

### US-001: Multi-select UI in Ad Library
**Description:** As a sales user, I want to select multiple ads from the Ad Library list so that I can batch-import them into an ops table.

**Acceptance Criteria:**
- [ ] Checkbox overlay appears on each ad card in the Ad Library grid/list view
- [ ] `selectedAdIds: Set<string>` state tracks selections across pagination
- [ ] "Select All" checkbox in toolbar selects all visible ads
- [ ] Floating bulk actions bar appears when >= 1 ad selected, showing count
- [ ] Bulk actions bar includes "Add to Ops Table" button (primary) and "Deselect All"
- [ ] Clicking "Add to Ops Table" opens the AdLibraryImportWizard (US-002)
- [ ] Typecheck passes
- [ ] Verify in browser on localhost:5175

### US-002: Ad Library Import Wizard
**Description:** As a sales user, I want a guided wizard to choose where and how my selected ads are imported so that the ops table is pre-configured for creative operations.

**Acceptance Criteria:**
- [ ] 3-step wizard dialog: (1) Select Destination, (2) Map Columns, (3) Review & Import
- [ ] Step 1: Choose existing ops table OR create new table with name field
- [ ] Step 1: "Creative Testing Template" preset button creates a pre-configured table with columns: Advertiser, Headline, Body Text, CTA, Landing Page URL, Creative Image, AI Image Remix, AI Video, SVG Animation
- [ ] Step 2: Column mapping shows source ad fields on left, target ops columns on right
- [ ] Step 2: Auto-maps matching fields (headline → headline, body_text → body text, etc.)
- [ ] Step 2: User can skip columns or create new columns inline
- [ ] Step 3: Review summary shows ad count, target table, column mapping
- [ ] Step 3: "Import" button triggers the edge function (US-003)
- [ ] Loading state during import with progress feedback
- [ ] Success toast with link to navigate to the ops table
- [ ] Follows CrossOpImportWizard pattern from existing codebase
- [ ] Typecheck passes
- [ ] Verify in browser on localhost:5175

### US-003: from_ad_library Import Handler (Edge Function)
**Description:** As the system, I need an edge function handler that reads selected ads from `linkedin_ad_library_ads` and creates ops table rows so that ad data flows into the ops table system.

**Acceptance Criteria:**
- [ ] New handler `from_ad_library` in `import-router` edge function
- [ ] Accepts: `{ org_id, user_id, ad_ids: string[], table_id?: string, table_name?: string, column_mapping: Record<string, string>, template?: 'creative_testing' }`
- [ ] Creates new `dynamic_tables` row with `source_type: 'ad_library'` when `table_id` is null
- [ ] Creates `dynamic_table_columns` for each mapped field with correct `column_type` (text, url, etc.)
- [ ] Reads ads from `linkedin_ad_library_ads` by IDs
- [ ] Archives media URLs to Supabase Storage (`linkedin-ad-assets/{org_id}/{ad_id}/`) — prevents Apify URL expiry
- [ ] Creates `dynamic_table_rows` with `source_id` = ad UUID, `source_data` = full ad JSON
- [ ] Creates `dynamic_table_cells` for each column/row intersection
- [ ] Stores `{ ad_library_ad_id }` in cell metadata for the primary row identifier
- [ ] Updates `dynamic_tables.row_count` after import
- [ ] Batch inserts in chunks of 50 (follows existing MAX_BATCH pattern)
- [ ] Auth: JWT validation, org membership check
- [ ] Uses `getCorsHeaders(req)` from `_shared/corsHelper.ts`
- [ ] Pins `@supabase/supabase-js@2.43.4`
- [ ] Typecheck passes

### US-004: Source Image Auto-Detection in AI Wizards
**Description:** As a user adding AI Image/Video/SVG columns to an ad-imported ops table, I want the wizard to automatically detect the creative image column so that I can remix from the source creative with one click.

**Acceptance Criteria:**
- [ ] AiImageColumnWizard detects columns with `column_type: 'url'` that contain image URLs and surfaces "Remix from: [column name]" as a first-class option
- [ ] FalVideoColumnWizard detects image columns and offers "Image-to-Video from: [column name]" option
- [ ] SvgAnimationColumnWizard detects text/image columns and offers "Animate from: [column name]" option
- [ ] When a source column is selected, the prompt template auto-populates with `{{column_key}}` reference
- [ ] Users can still configure manually (not forced into auto-detection)
- [ ] Typecheck passes
- [ ] Verify in browser on localhost:5175

### US-005: Remix All Bulk Action
**Description:** As a user with an ops table full of imported ads, I want to trigger AI generation across all selected rows at once so that I can remix an entire batch of competitor creatives in one click.

**Acceptance Criteria:**
- [ ] "Remix All" button appears in BulkActionsBar when rows are selected AND table has AI generation columns (ai_image, fal_video, or svg_animation)
- [ ] Clicking "Remix All" shows confirmation dialog with: row count, column count, estimated credit cost
- [ ] On confirm, triggers generation for each AI column across all selected rows
- [ ] Uses existing `onGenerate` handlers for each cell type (does not bypass existing generation flow)
- [ ] Progress indicator shows "Generating X of Y" in the bulk actions bar
- [ ] Individual cells show their own pending/processing/completed states
- [ ] Toast notification when all generations complete or if any fail
- [ ] Typecheck passes
- [ ] Verify in browser on localhost:5175

### US-006: Ops Table to Campaign Binding UI
**Description:** As an ads manager, I want to link an ops table to a LinkedIn campaign or campaign group so that I can push creative variations from the table into LinkedIn.

**Acceptance Criteria:**
- [ ] New "LinkedIn Campaign" section in OpsDetailPage settings panel (or toolbar dropdown)
- [ ] Dropdown to select existing LinkedIn campaign group, or create new one
- [ ] Dropdown to select existing campaign within group, or create new one
- [ ] Option to choose campaign structure: "All rows as creatives in ONE campaign (A/B test)" or "Each row as a separate campaign"
- [ ] Binding stored in `dynamic_tables.integration_config` as `{ linkedin: { campaign_group_id, campaign_id, structure: 'single_campaign' | 'per_row_campaign' } }`
- [ ] Shows connection status indicator (linked/unlinked)
- [ ] Requires LinkedIn integration to be connected (checks `useLinkedInIntegration()`)
- [ ] Typecheck passes
- [ ] Verify in browser on localhost:5175

### US-007: Ops-to-Creative Column Mapping Wizard
**Description:** As an ads manager, I want to map ops table columns to LinkedIn creative fields so that the system knows which column is the headline, body, CTA, image, and destination URL.

**Acceptance Criteria:**
- [ ] Multi-step wizard accessible from the campaign binding panel (US-006)
- [ ] Step 1: Map columns — left side shows ops table columns, right side shows LinkedIn creative fields (headline, body, CTA text, destination URL, media asset)
- [ ] Step 2: Preview — shows mock creative cards generated from actual row data
- [ ] Step 3: Budget — choose budget source: manual entry OR map from a number column in the ops table
- [ ] Budget supports: total campaign budget + optional per-variation weight column
- [ ] Mapping stored in `dynamic_tables.integration_config.linkedin.column_mapping`
- [ ] Validates all required fields are mapped (headline and body minimum)
- [ ] Typecheck passes
- [ ] Verify in browser on localhost:5175

### US-008: create_creatives_from_ops Edge Function
**Description:** As the system, I need an edge function that reads ops table rows and creates LinkedIn creatives so that remixed ad variations can be pushed to campaigns.

**Acceptance Criteria:**
- [ ] New action `create_creatives_from_ops` in `linkedin-campaign-manager` edge function
- [ ] Accepts: `{ table_id, row_ids: string[], column_mapping, campaign_id, structure }`
- [ ] Reads mapped cell values from `dynamic_table_cells` for each row
- [ ] Uploads images to LinkedIn via Images API (`POST /rest/images?action=initializeUpload`)
- [ ] Creates `linkedin_managed_creatives` records with headline, body, CTA, destination_url, media_urn
- [ ] Creates creatives via LinkedIn Creatives API (`POST /rest/adAccounts/{id}/creatives`)
- [ ] Stores LinkedIn creative URN in source cell metadata: `{ linkedin_creative_urn: "urn:li:sponsoredCreative:..." }`
- [ ] Batches API calls: max 10 creatives per request to respect LinkedIn rate limits
- [ ] Handles partial failures: creates what it can, reports failures per-row
- [ ] Auth: JWT validation, org membership, LinkedIn token retrieval from `linkedin_org_integrations`
- [ ] Uses token refresh pattern if 401 received
- [ ] Typecheck passes

### US-009: Budget Column Mapping
**Description:** As an ads manager, I want to set campaign budgets from ops table columns so that I can control spend per variation from the creative workspace.

**Acceptance Criteria:**
- [ ] Number column in ops table can be designated as "Budget" via column header menu or wizard (US-007)
- [ ] For single-campaign structure: total budget = sum of all row budget values (or manual override)
- [ ] For per-row-campaign structure: each row's budget value becomes that campaign's daily budget
- [ ] Optional "Weight" column: distributes total budget proportionally (e.g., row weight 2 gets 2x the spend)
- [ ] Validation: minimum $10/day per campaign (LinkedIn minimum), no negative values
- [ ] Budget changes in ops table cells trigger campaign budget update via `update_campaign` action
- [ ] Budget sync is one-directional: ops table → LinkedIn (not reverse, to prevent conflicts)
- [ ] Typecheck passes
- [ ] Verify in browser on localhost:5175

### US-010: Campaign Launch with Spend Approval Gate
**Description:** As an ads manager, I want a launch button with spend confirmation so that campaigns don't go live without explicit budget approval.

**Acceptance Criteria:**
- [ ] "Launch Campaign" button in ops table toolbar (visible when campaign is bound via US-006)
- [ ] Button disabled until creatives are created (US-008) and budget is set (US-009)
- [ ] Clicking shows spend confirmation modal: campaign name, number of variations, total daily budget, total lifetime budget (if set), estimated monthly spend
- [ ] Modal requires typing "LAUNCH" to confirm (prevents accidental clicks)
- [ ] On confirm: calls `update_status` action with `status: 'ACTIVE'` for each campaign
- [ ] Creates `linkedin_campaign_approvals` record with approval timestamp, user, budget snapshot
- [ ] Success: shows "Campaign Live" status badge in ops table toolbar
- [ ] Failure: shows error toast with LinkedIn API error message
- [ ] Status changes reflected in campaign binding panel (US-006)
- [ ] Typecheck passes
- [ ] Verify in browser on localhost:5175

### US-011: LinkedIn Analytics Column Type + Wizard
**Description:** As a user, I want to add analytics columns to my ops table so that I can see campaign performance data next to my creative variations.

**Acceptance Criteria:**
- [ ] New column type `linkedin_analytics` added to `dynamic_table_columns.column_type` CHECK constraint (migration)
- [ ] Column wizard with metric selector: Impressions, Clicks, CTR, Spend, Leads, CPA, CPL, Conversions, Video Views, Engagement Rate
- [ ] Date range selector: Last 7 days, Last 30 days, Last 90 days, Lifetime, Custom
- [ ] Refresh schedule selector: Manual only, Daily auto-sync, Both (daily + manual)
- [ ] Column renders numeric value with appropriate formatting (percentage for CTR, currency for Spend/CPA/CPL, whole number for Impressions/Clicks)
- [ ] Column header shows metric name and date range
- [ ] Registered in AddColumnModal under "LinkedIn" or "Analytics" section
- [ ] Registered in OpsTableCell dispatch
- [ ] Typecheck passes
- [ ] Verify in browser on localhost:5175

### US-012: Analytics-to-Ops Sync Handler
**Description:** As the system, I need an edge function that reads LinkedIn campaign metrics and writes them into ops table cells so that analytics data appears alongside creative variations.

**Acceptance Criteria:**
- [ ] New edge function `linkedin-analytics-to-ops` (or new action in existing `linkedin-analytics-sync`)
- [ ] Accepts: `{ table_id, column_id, metric, date_range, row_ids?: string[] }`
- [ ] Resolves row → creative mapping via cell metadata `linkedin_creative_urn` (stored in US-008)
- [ ] Reads from `linkedin_campaign_metrics` table (already populated by existing analytics sync)
- [ ] Aggregates metrics over the specified date range per creative
- [ ] Writes aggregated value to `dynamic_table_cells.value` for each row
- [ ] Handles unmapped rows gracefully (no creative URN → cell shows "No data")
- [ ] Stores sync metadata: `{ last_synced_at, date_range, metric }` in cell metadata
- [ ] Auth: JWT validation, org membership check
- [ ] Typecheck passes

### US-013: Auto-Sync + Manual Refresh Controls
**Description:** As a user, I want analytics to auto-refresh daily and have a manual refresh button so that my ops table always shows current performance data.

**Acceptance Criteria:**
- [ ] "Refresh Analytics" button in ops table toolbar (visible when table has linkedin_analytics columns)
- [ ] Button triggers immediate sync for all analytics columns in the table
- [ ] Loading spinner on button during sync, disabled state to prevent double-clicks
- [ ] "Last synced: X minutes ago" timestamp shown next to button
- [ ] Daily auto-sync: edge function cron trigger (or Supabase pg_cron) that syncs all tables with linkedin_analytics columns
- [ ] Auto-sync runs at 6:00 AM UTC daily
- [ ] Manual refresh and auto-sync both call the same handler (US-012)
- [ ] Toast notification on manual refresh completion
- [ ] Typecheck passes
- [ ] Verify in browser on localhost:5175

### US-014: Analytics Controls + Comparison View
**Description:** As a user, I want to sort, filter, and compare analytics across my creative variations so that I can quickly identify winning ads.

**Acceptance Criteria:**
- [ ] Analytics columns support sorting (ascending/descending by metric value)
- [ ] Conditional formatting: green background for top 25% performers, red for bottom 25% (based on CTR or selected metric)
- [ ] Column footer shows aggregation: total (Impressions, Clicks, Spend), average (CTR, CPA, CPL)
- [ ] Date range picker in column header menu allows changing the analytics window per-column
- [ ] "Compare" toggle highlights the best/worst performer per metric with visual indicators
- [ ] Typecheck passes
- [ ] Verify in browser on localhost:5175

## Functional Requirements

- FR-1: The system must allow users to multi-select ads from the LinkedIn Ad Library and import them to a new or existing ops table
- FR-2: On import, the system must archive ad media assets to Supabase Storage to prevent URL expiration
- FR-3: The system must provide a "Creative Testing Template" that pre-configures an ops table with standard ad fields + AI remix columns
- FR-4: AI Image, AI Video, and SVG Animation column wizards must auto-detect imported creative image columns and offer "remix from source" as a first-class option
- FR-5: A "Remix All" bulk action must trigger AI generation across all selected rows and all AI columns simultaneously
- FR-6: The system must allow binding an ops table to a LinkedIn campaign (single A/B campaign or per-row campaigns, user's choice)
- FR-7: Ops table column-to-creative-field mapping must support: headline, body, CTA, destination URL, and media asset
- FR-8: The system must create LinkedIn creatives from ops table rows via the LinkedIn Creatives API, storing creative URNs in cell metadata
- FR-9: Budget must be configurable as campaign total + optional per-variation weight from ops table number columns
- FR-10: Campaign launch must require explicit spend confirmation (type "LAUNCH") before setting campaign status to ACTIVE
- FR-11: LinkedIn analytics (impressions, clicks, CTR, spend, leads) must be writable back into ops table cells with configurable date range
- FR-12: Analytics must auto-sync daily at 6:00 AM UTC and support manual refresh
- FR-13: Analytics columns must support sorting, conditional formatting (top/bottom quartile), and column-level aggregation
- FR-14: All LinkedIn API calls must be batched (max 10 per request) to respect the 100 calls/day/member rate limit
- FR-15: LinkedIn creative IDs must be stored in cell metadata at creation time to enable analytics row-to-creative mapping

## Non-Goals (Out of Scope)

- Bi-directional budget sync (LinkedIn → ops table) — ops table is source of truth for budget
- Editing LinkedIn campaign targeting from ops table — use the existing CampaignWizard for targeting
- Real-time analytics streaming — daily sync + manual refresh is sufficient for v1
- Auto-pausing underperforming campaigns — show the data, let the user decide
- Support for non-LinkedIn ad platforms (Meta, Google Ads) — LinkedIn only for v1
- Video upload to LinkedIn (use image creatives first) — video ads are Phase 2
- Automated A/B test winner selection — manual decision-making only

## Technical Considerations

### Schema Changes
- Add `'ad_library'` to `dynamic_tables.source_type` TypeScript union (no DB constraint exists)
- Add `'linkedin_analytics'` to `dynamic_table_columns.column_type` CHECK constraint (migration required)
- Store campaign binding in `dynamic_tables.integration_config` JSONB (no schema change)
- Store creative URNs in `dynamic_table_cells.metadata` JSONB (no schema change)

### Edge Functions (new or modified)
- `import-router`: Add `from_ad_library` handler (new handler in existing function)
- `linkedin-campaign-manager`: Add `create_creatives_from_ops` action (new action in existing function)
- `linkedin-analytics-to-ops`: New edge function for analytics write-back
- `linkedin-analytics-cron`: New edge function for daily auto-sync trigger

### Existing Components to Extend
- `AdLibrary.tsx`: Add multi-select state + bulk actions bar
- `AddColumnModal.tsx`: Register `linkedin_analytics` column type
- `OpsTableCell.tsx`: Add `linkedin_analytics` case to dispatch
- `OpsDetailPage.tsx`: Add campaign binding panel + launch button + analytics refresh
- `AiImageColumnWizard.tsx`, `FalVideoColumnWizard.tsx`, `SvgAnimationColumnWizard.tsx`: Add source image auto-detection
- `BulkActionsBar.tsx`: Add "Remix All" action

### Existing Patterns to Follow
- `CrossOpImportWizard.tsx` — blueprint for AdLibraryImportWizard (3-step wizard)
- `from-hubspot.ts` — blueprint for `from_ad_library` handler (source → ops table import)
- `FalVideoCell.tsx` / `AiImageCell.tsx` — blueprint for `LinkedInAnalyticsCell` (cell rendering + polling)
- `push_ops_to_audience` — blueprint for `create_creatives_from_ops` (ops → LinkedIn push)

### Security
- Campaign launch involves real money — approval gate required
- LinkedIn OAuth tokens stored encrypted in `linkedin_org_integrations`
- Token refresh must be wired in `oauth-token-refresh/providers/linkedin.ts`
- Verify `rw_ads` scope is included in OAuth initiation

### Performance
- Batch LinkedIn API calls: max 10 per request
- Batch ops table cell inserts: chunks of 50
- Archive media to Supabase Storage async (don't block import)
- Analytics sync: query `linkedin_campaign_metrics` (already indexed) not LinkedIn API directly

## Success Metrics

- Time from "select competitor ad" to "ops table with remix columns" < 60 seconds
- Time from "remixed creative in ops table" to "live LinkedIn campaign" < 5 minutes
- Analytics data visible in ops table within 24 hours of campaign launch
- Zero accidental campaign launches (approval gate prevents all)

## Open Questions

- Should the Creative Testing Template be customizable (save custom templates) or is one fixed template sufficient for v1?
- Should analytics columns support demographic breakdowns (by job title, industry) or just top-level metrics for v1?
- Should the campaign binding support multiple campaigns per table (A/B test group A in one campaign, group B in another)?
