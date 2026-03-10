# PRD: Platform Polish Sprint — 8 Items

**Date**: 2026-03-09
**Priority**: High (demo-blocking, UX quality)
**Branch**: `feature/platform-polish-sprint`

---

## Items Overview

| # | Item | Complexity | Status |
|---|------|-----------|--------|
| 1 | Relationship graph missing meeting touchpoints | Medium | Planned |
| 2 | Ops deals table redirecting to pipeline | Quick | **DONE** |
| 3 | Company toggle on relationship graph too busy | Small | Planned |
| 4 | Meeting next steps actions not working | Medium | Planned |
| 5 | AI email em-dashes + user preferences + date injection | Medium | Planned |
| 6 | Show relationship graph in ABM demo | Small | Planned |
| 7 | ABM campaigns flow simplification + URL lead creation | Large | Planned |
| 8 | Proposal generation 400/500 errors | Quick | **DONE** |

---

## Item 1: Relationship Graph — Missing Meeting Touchpoints

**Problem**: The relationship graph view doesn't show all touchpoints, especially meetings.

**Root Cause**: `useContactCompanyGraph` hook fetches meetings but the graph visualization may not be rendering all meeting data. Meeting participants (multi-contact) aren't tracked — only `primary_contact_id` links.

**Solution**:
- Ensure all meetings with the contact appear in the timeline/graph (including via `meeting_contacts` junction)
- Add meeting type badges (discovery, demo, negotiation)
- Show meeting sentiment in the graph
- Include call duration and outcome data

**Files**:
- `src/lib/hooks/useContactCompanyGraph.ts`
- `src/components/CRM/TimelineView.tsx`
- `src/lib/services/relationshipHealthService.ts`

---

## Item 2: Ops Deals Table — Stop Redirecting to Pipeline ✅

**Problem**: Clicking Deals in Ops redirects to `/pipeline` instead of showing the ops table.

**Fix**: Removed `standard_deals` from `DEDICATED_ROUTES` in `StandardTablesGallery.tsx`.

**File**: `src/components/ops/StandardTablesGallery.tsx`

---

## Item 3: Company Toggle — Simplify Like Contacts View

**Problem**: The company toggle on the relationship graph is visually busy compared to the clean contacts view.

**Solution**: Replace the busy company toggle with the same simple toggle pattern used in the contacts view.

**Files**: TBD (waiting on research agent)

---

## Item 4: Meeting Next Steps — 6 Working Actions

**Problem**: "Send Follow-up" and "Book Next Call" show "coming soon" toast. Only "Share Meeting" works.

**Proposed 6 Next Steps**:
1. **Generate Proposal** — Already exists (ProposalQuickGenerate), wire it in
2. **Draft Follow-up Email** — Edge function `generate-follow-up` exists, wire to compose UI
3. **Create Deal** — Create deal from meeting context (meeting has contact/company data)
4. **Create Task** — Convert meeting action items to tasks
5. **Share Meeting** — Already working
6. **Book Next Call** — Calendar link generation with context

**Files**:
- `src/components/meetings/QuickActionsCard.tsx`
- `src/pages/MeetingDetail.tsx`

---

## Item 5: AI Email Output — No Em-Dashes + User Preferences + Date

**Problem**: AI output still contains em-dashes. Users can't feed preferences. Date not always in prompts.

**Current State**:
- `emailPromptRules.ts` already forbids em-dashes (line 119)
- `user_writing_styles` and `user_tone_settings` tables exist
- Follow-up composer injects today's date, but sequence generator doesn't

**Solution**:
- Enforce em-dash ban in ALL prompt paths (not just cold email)
- Inject `today's date: ${date}` into all AI prompts
- Add a "writing preferences" quick-edit when user edits/rejects an AI suggestion
- Save preference feedback to `user_tone_settings`

**Files**:
- `supabase/functions/_shared/emailPromptRules.ts`
- `supabase/functions/generate-email-sequence/index.ts`
- `supabase/functions/_shared/follow-up/composer.ts`
- `supabase/functions/_shared/businessContext.ts`
- All edge functions that generate text content

---

## Item 6: Relationship Graph in ABM Demo

**Problem**: Relationship graph is a key feature but not shown in the ABM campaign demo flow.

**Solution**: Add a RelationshipGraph scene/step in the ABM demo sandbox experience.

**Files**:
- `src/components/demo/scenes/RelationshipGraphScene.tsx` (already exists)
- ABM sandbox/demo flow components

---

## Item 7: ABM Campaign Flow Simplification

**Problem**: Creating a lead + campaign requires too many steps (form per lead, campaign per form).

**Current Flow**: Form → Fill prospect details → campaign-enrich → get link
**Desired Flow**:
- Option A: Table-based bulk entry with campaign ID
- Option B: URL-based: `use60.com/t/domain.com?f=name&l=last&id=123` → auto-creates lead + opens marketing screen
- Use Gemini 3.1 Flash Lite for messaging generation

**Solution**:
- Add inline table row creation in ABM campaigns page
- Support bulk add to existing campaign
- Enhance `/t/{domain}` URL to accept query params (`f`, `l`, `id`, `email`, `title`)
- Auto-create campaign link from URL params
- Route to marketing/messaging screen with pre-filled data
- Switch AI model to `gemini-3.1-flash-lite` for messaging generation

**Files**:
- `src/pages/campaigns/AbmCampaignsPage.tsx`
- `packages/landing/src/pages/CampaignLanding.tsx`
- `packages/landing/src/pages/CreatorView.tsx`
- `supabase/functions/campaign-enrich/index.ts`

---

## Item 8: Proposal Generation 400/500 Errors ✅

**Problem**: ProposalProgressOverlay selecting non-existent `metadata` column → 400. Reading `_pipeline_error` from wrong field.

**Fix**:
- Replaced `metadata` with `rendered_html` in SELECT
- Changed error reading from `metadata._pipeline_error` to `style_config._pipeline_error`
- Fixed thumbnail fallback to only use `brand_config.thumbnail_url`

**File**: `src/components/proposals/ProposalProgressOverlay.tsx`
