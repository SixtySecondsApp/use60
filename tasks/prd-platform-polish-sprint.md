# PRD: Platform Polish Sprint

## Introduction

Sprint of 8 targeted fixes and enhancements addressing UX gaps, broken features, AI output quality, and demo readiness. Items range from quick bug fixes (proposal 400 errors, deals table redirect) to medium features (meeting next steps, inline ABM lead creation) to a new capability (user writing preference learning). All items are demo-blocking or directly impact the daily sales workflow.

## Goals

- Fix all broken features blocking demo readiness (proposals, meeting next steps, relationship graph)
- Simplify ABM campaign lead creation from multi-step form to inline table entry + URL-based creation
- Eliminate AI-generated em-dashes across all email output paths
- Ship user writing preference learning so AI output improves with every approval/rejection
- Add relationship graph to the ABM demo sandbox to showcase this differentiator

## User Stories

### US-001: Fix Proposal Generation 400/500 Errors
**Description:** As a sales rep, I want proposal generation to work without errors so that I can create proposals from meeting context.

**Acceptance Criteria:**
- [x] Replace `metadata` column (doesn't exist) with `rendered_html` in proposals SELECT query
- [x] Read pipeline errors from `style_config._pipeline_error` instead of `metadata._pipeline_error`
- [x] Fix thumbnail to use `brand_config.thumbnail_url` only
- [x] Update ProposalRow interface to match actual table schema
- [x] Typecheck passes
- [x] Verify in browser on localhost:5175 — proposal generation modal shows progress without 400s

### US-002: Stop Ops Deals Table Redirecting to Pipeline
**Description:** As a platform admin, I want the Deals ops table to display inline instead of redirecting to the pipeline page so that I can manage deal data in the ops table format.

**Acceptance Criteria:**
- [x] Remove `standard_deals` from `DEDICATED_ROUTES` in `StandardTablesGallery.tsx`
- [x] Deals table renders inline in ops with full row count
- [x] Leads table still redirects to `/leads`
- [x] Typecheck passes
- [x] Verify in browser on localhost:5175

### US-003: Add Communication Events to Relationship Graph Timeline
**Description:** As a sales rep, I want the relationship graph to show all touchpoints including emails, calls, and meeting communications so that I get a complete picture of the relationship.

**Acceptance Criteria:**
- [x] Add `communication_events` query to `fetchContactGraph` via `Promise.allSettled`
- [x] Add `communication_events` query to `fetchCompanyGraph` with `or()` filter for company_id and contact_ids
- [x] Add `normalizeCommunicationToTimeline()` function mapping to timeline items
- [x] Add `communication` record type with Mail icon and cyan color scheme to `TimelineView`
- [x] Include communication timestamps in `allTimestamps` for insights calculation
- [x] Limit to 50 most recent communications per entity
- [x] Typecheck passes

### US-004: Simplify Company/Contact Toggle on Relationship Graph
**Description:** As a sales rep, I want the entity filter on the relationship graph to be a simple toggle like the contacts view instead of the busy toolbar.

**Acceptance Criteria:**
- [x] Add 3-button toggle (All / Contacts / Companies) to `RelationshipHealthDashboard`
- [x] Use emerald highlight matching the contacts view `ViewModeToggle` compact pattern
- [x] Filter entities before search filter in the useMemo chain
- [x] Typecheck passes
- [x] Verify in browser on localhost:5175

### US-005: Wire 6 Working Meeting Next Steps Actions
**Description:** As a sales rep, I want all 6 next-step actions on the meeting page to work so that I can take immediate action after a meeting.

**Acceptance Criteria:**
- [x] Expand `QuickActionId` type to 6 actions: `follow_up_email`, `generate_proposal`, `create_task`, `create_deal`, `share_recording`, `book_call`
- [x] Add icons and colors: Mail/blue, FileText/amber, CheckSquare/orange, Briefcase/green, Share2/emerald, Phone/violet
- [x] Wire `onGenerateProposal` to `ProposalQuickGenerate` via `useImperativeHandle` ref
- [x] Wire `onEmailClick` to `generate-follow-up` edge function with clipboard copy
- [x] Wire `onCreateTask`, `onCreateDeal`, `onBookCallClick` to quick-add modal
- [x] Update priority logic per meeting type (discovery→book_call first, negotiation→proposal first)
- [x] Typecheck passes
- [x] Verify in browser on localhost:5175

### US-006: Strip Em-Dashes and Inject Date in All AI Email Prompts
**Description:** As a sales rep, I want AI-generated emails to never contain em-dashes and to reference today's date so that output doesn't look AI-generated and is contextually accurate.

**Acceptance Criteria:**
- [x] Add `stripEmDashes()` utility to `generate-email-sequence` that replaces `—` and `–` with `-`
- [x] Apply to both Tier 1 (Claude) and Tier 2 (Gemini) outputs
- [x] Add `Today's date: ${new Date().toISOString().slice(0, 10)}` to Tier 1 and Tier 2 prompts
- [x] Add em-dash stripping to `composeReturnMeetingFollowUp` and `composeFirstMeetingFollowUp` return values
- [x] Deploy `generate-email-sequence` and `generate-follow-up` to staging
- [x] Typecheck passes

### US-007: Add Relationship Graph Scene to ABM Demo Sandbox
**Description:** As a prospect viewing the ABM demo, I want to see the relationship graph feature so that I understand 60's relationship intelligence capabilities.

**Acceptance Criteria:**
- [x] Add `relationships` to `SandboxView` union type
- [x] Create `SandboxRelationships.tsx` with SVG-based interactive graph
- [x] Graph renders contacts (outer ring), deals (middle ring), companies (top) as connected nodes
- [x] Nodes colored by health status (deals) and engagement level (contacts)
- [x] Clicking a node opens detail panel with stats, connected entities, and activity timeline
- [x] Add simple 3-button entity filter (All/Contacts/Companies) with emerald highlight
- [x] Add legend showing node type colors
- [x] Register in `VIEW_MAP`, `MOBILE_TABS`, `NAV_ITEMS`, `FLOW_ORDER`
- [x] Update `TOTAL_VIEWS` from 6 to 7
- [x] Add signup CTA copy for relationships view
- [x] Typecheck passes (landing package)

### US-008: ABM Campaign Inline Lead Creation + URL Params
**Description:** As a platform admin, I want to add leads one at a time directly from the table view and via URL parameters so that creating campaign links is fast without switching views.

**Acceptance Criteria:**
- [x] Add "Add lead" button to table view header (alongside "Bulk import")
- [x] Inline quick-add form with: domain*, first_name, last_name, email, title, company, campaign name
- [x] Campaign name field autocompletes from existing campaigns via `<datalist>`
- [x] Enter key submits the form; calls `campaign-enrich` for single prospect
- [x] Form clears and table refreshes after successful creation
- [x] Add short URL param aliases: `f`→fn, `l`→ln, `id`→cid, `t`→title in `CampaignLanding.tsx`
- [x] Auto-create campaign link when CreatorView loads with query params containing contact info
- [x] Gemini model already `gemini-3.1-flash-lite-preview` (confirmed, no change needed)
- [x] Typecheck passes
- [x] Verify in browser on localhost:5175

### US-009: Inline Writing Preference Capture on AI Edit/Reject
**Description:** As a sales rep, I want to provide writing preference feedback when I edit or reject an AI suggestion so that future suggestions improve based on my style.

**Acceptance Criteria:**
- [ ] Add a "Style feedback" popover that appears when user edits an AI-generated email
- [ ] Popover shows quick toggles: formality (1-5), directness (1-5), warmth (1-5)
- [ ] Include a text field for "words to avoid" that appends to `user_tone_settings.words_to_avoid`
- [ ] Include a text field for "preferred phrases" that appends to `user_tone_settings.preferred_keywords`
- [ ] Pre-populate current values from `toneSettingsService.getToneSettings('email')`
- [ ] Save via `toneSettingsService.saveToneSettings()` with UPSERT on `(user_id, content_type)`
- [ ] Show toast: "Writing preferences updated"
- [ ] Record `approved_edited` signal to `autopilot_signals` with `edit_distance` and `edit_fields`
- [ ] Typecheck passes
- [ ] Verify in browser on localhost:5175 — edit an AI email, see popover, save preferences

### US-010: Surface Writing Preferences in Follow-Up Composer Edge Function
**Description:** As a system, I want the follow-up email composer to read the user's tone settings so that generated emails match the user's confirmed style.

**Acceptance Criteria:**
- [ ] In `generate-follow-up` edge function, fetch `user_tone_settings` for content_type='email'
- [ ] In `generate-email-sequence` edge function, fetch `user_tone_settings` for content_type='email'
- [ ] Map `formality_level`, `words_to_avoid`, `preferred_keywords`, `cta_style`, `email_sign_off` into the `WritingStyle` block
- [ ] Pass `buildWritingStyleBlock()` output into system prompt
- [ ] If no tone settings exist, use defaults (formality 5, no words to avoid, direct CTA)
- [ ] Deploy updated edge functions to staging
- [ ] Typecheck passes

## Functional Requirements

- FR-1: Proposal generation must select only columns that exist on the `proposals` table
- FR-2: Communication events must be fetched via `Promise.allSettled` so failures don't block other graph data
- FR-3: All AI email generation must strip em-dashes (`—` and `–`) from output as a post-processing safety net
- FR-4: All AI email prompts must include today's date in ISO format
- FR-5: Inline lead creation must call `campaign-enrich` with single prospect and refresh the table on success
- FR-6: URL param aliases must support both short (`f`, `l`, `id`, `t`) and long (`fn`, `ln`, `cid`, `title`) forms
- FR-7: Writing preference popover must not block the email editing flow — it's optional, not a gate
- FR-8: Preference feedback must be additive — never overwrite existing `words_to_avoid`, only append

## Non-Goals (Out of Scope)

- Full writing style training from Gmail (already exists in AIPersonalizationSettings)
- Drag-and-drop reordering of meeting next steps
- Real-time collaborative editing of AI suggestions
- Custom graph layout algorithms (SVG layout is fixed/calculated)
- A/B testing of AI output quality with/without preferences
- Retroactively updating previously generated emails when preferences change

## Technical Considerations

- **No schema changes needed** — `user_tone_settings`, `user_writing_styles`, `autopilot_signals` tables already exist
- **Edge function changes** for US-010 need staging deployment with `--no-verify-jwt`
- **`toneSettingsService.ts`** already has `getToneSettings()` and `saveToneSettings()` — reuse directly
- **`autopilot_signals`** recording pattern exists in `_shared/autopilot/signals.ts` — import and call
- **Follow-up composer** already has `WritingStyle` interface and `buildWritingStyleBlock()` — just need to populate from DB
- **Landing package** (`packages/landing/`) builds separately — test with `cd packages/landing && npx vite build`

## Success Metrics

- Zero 400/500 errors on proposal generation (was 100% failure rate)
- All 6 meeting next steps trigger their respective actions (was 2/6 working)
- Zero em-dashes in AI email output across all generation paths
- ABM lead creation possible in <10 seconds (was multi-step form flow)
- Writing preference popover used by >50% of users who edit AI suggestions (tracked via autopilot_signals)

## Open Questions

- Should the style feedback popover also appear on proposal edits, or just emails?
- Should we show a "confidence score" to the user (e.g., "60 is 82% confident in this tone")?
- What's the threshold for auto-learning vs. explicit preference capture? (Current: proposals only auto-learn via `aggregateEditPatternsIntoStyle`)
