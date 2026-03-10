# PRD: Pipeline Page Enhancements

## Introduction

Five UX improvements to the pipeline page that surface existing data, enable quick edits, and add bulk operations. All data already exists in `get_pipeline_with_health` RPC — no schema changes or migrations required. These build on the freshness/dormancy features just shipped.

## Goals

- Surface deal urgency signals (overdue, ghost risk) directly on cards so reps act faster
- Enable managers to filter pipeline by deal owner
- Reduce clicks for common edits (probability, close date) via inline table editing
- Enable bulk pipeline cleanup with multi-select actions

## User Stories

### US-001: Overdue Badge on DealCard
**Description:** As a rep, I want to see which deals are past their close date so I can prioritise follow-ups.

**Acceptance Criteria:**
- [ ] Red "Overdue" badge appears on DealCard when `close_date` < today OR `expected_close_date` < today
- [ ] Badge shows in tags area alongside existing freshness/dormant badges
- [ ] Badge does NOT show for deals with no close date set
- [ ] Signed and Lost deals do not show overdue badge
- [ ] Typecheck passes
- [ ] Verify in browser on localhost:5175

### US-002: Overdue Column in PipelineTable
**Description:** As a rep, I want to see days overdue in the table view so I can sort by urgency.

**Acceptance Criteria:**
- [ ] New "Overdue" column in PipelineTable showing days past close date
- [ ] Shows dash (—) when deal is not overdue or has no close date
- [ ] Column is sortable
- [ ] Red text styling for overdue values
- [ ] Column is toggleable via column customiser
- [ ] Typecheck passes
- [ ] Verify in browser on localhost:5175

### US-003: Ghost Risk Icon on DealCard
**Description:** As a rep, I want to see ghost risk at a glance on deal cards so I can re-engage before losing the deal.

**Acceptance Criteria:**
- [ ] Lucide `Ghost` icon appears on DealCard when `ghost_probability` > 70
- [ ] Shows percentage next to icon (e.g. Ghost icon + "85%")
- [ ] Styled in purple/violet to differentiate from other badges
- [ ] Does not show for Signed/Lost deals (ghost_probability is nulled)
- [ ] Typecheck passes
- [ ] Verify in browser on localhost:5175

### US-004: Owner Filter Popover in PipelineHeader
**Description:** As a manager, I want to filter the pipeline by deal owner so I can review individual rep pipelines.

**Acceptance Criteria:**
- [ ] Owner filter button is enabled (remove `opacity-50 cursor-not-allowed`)
- [ ] Clicking opens a popover with checkable list of org members
- [ ] Members list fetched from profiles/org_members table
- [ ] Selecting owners filters pipeline via existing `owner_ids` RPC parameter
- [ ] Active filter count shown on button
- [ ] Filter persists in URL params
- [ ] Typecheck passes
- [ ] Verify in browser on localhost:5175

### US-005: Inline Edit — Probability in PipelineTable
**Description:** As a rep, I want to click a probability cell and edit it inline so I don't have to open the deal sheet.

**Acceptance Criteria:**
- [ ] Clicking probability cell enters edit mode with number input (0-100)
- [ ] Press Enter or blur to save
- [ ] Press Escape to cancel
- [ ] Optimistic update with rollback on error
- [ ] Toast on save error
- [ ] Typecheck passes
- [ ] Verify in browser on localhost:5175

### US-006: Inline Edit — Close Date in PipelineTable
**Description:** As a rep, I want to click a close date cell and pick a new date inline.

**Acceptance Criteria:**
- [ ] Clicking close date cell enters edit mode with date input
- [ ] Selecting a date saves immediately
- [ ] Press Escape to cancel
- [ ] Optimistic update with rollback on error
- [ ] Toast on save error
- [ ] Typecheck passes
- [ ] Verify in browser on localhost:5175

### US-007: BulkActionBar — Stage Change
**Description:** As a rep, I want to select multiple deals and move them to a different stage in one action.

**Acceptance Criteria:**
- [ ] BulkActionBar appears as floating bar at bottom when 1+ deals selected
- [ ] Shows count of selected deals
- [ ] "Move to Stage" dropdown lists all pipeline stages
- [ ] Selecting a stage updates all selected deals
- [ ] Success toast shows count updated
- [ ] Selection clears after action
- [ ] Typecheck passes
- [ ] Verify in browser on localhost:5175

### US-008: BulkActionBar — Close as Lost
**Description:** As a rep, I want to bulk-close stale deals as lost to clean up my pipeline.

**Acceptance Criteria:**
- [ ] "Close as Lost" button in BulkActionBar
- [ ] Confirmation dialog before executing ("Close N deals as lost?")
- [ ] Updates deal status to 'lost' and moves to Lost stage
- [ ] Success toast shows count closed
- [ ] Selection clears after action
- [ ] Typecheck passes
- [ ] Verify in browser on localhost:5175

### US-009: BulkActionBar — Assign Owner
**Description:** As a manager, I want to reassign multiple deals to a different rep.

**Acceptance Criteria:**
- [ ] "Assign to" dropdown in BulkActionBar lists org members
- [ ] Selecting a member updates `owner_id` on all selected deals
- [ ] Success toast shows count reassigned
- [ ] Selection clears after action
- [ ] Typecheck passes
- [ ] Verify in browser on localhost:5175

## Functional Requirements

- FR-1: Overdue badge uses `close_date` first, falls back to `expected_close_date`
- FR-2: Ghost icon uses Lucide `Ghost` component, not emoji
- FR-3: Owner filter fetches members with `select('id, full_name, avatar_url')` from profiles
- FR-4: Inline edits use `supabase.from('deals').update()` with React Query cache invalidation
- FR-5: Bulk actions use `supabase.from('deals').update().in('id', selectedIds)` for single DB call
- FR-6: BulkActionBar uses fixed positioning at bottom of viewport with backdrop blur

## Non-Goals (Out of Scope)

- No new RPC or migration changes
- No inline editing in kanban view (table only)
- No bulk delete (too destructive)
- No bulk email/notification from selected deals
- No drag-to-select in table (checkbox only)

## Technical Considerations

- All data already in `PipelineDeal` type from `usePipelineData.ts`
- Inline edits should invalidate `['pipeline']` React Query cache key
- Bulk operations: single `.in('id', ids)` query, not N individual updates
- Owner filter needs a hook to fetch org members (check if `useOrgMembers` exists)
- Follow existing patterns: toast on error, optimistic updates where possible

## Success Metrics

- Overdue/ghost badges visible without opening deal sheets
- Owner filter enables manager pipeline review
- Inline edits reduce clicks from 4+ to 1
- Bulk actions enable cleaning 10+ deals in seconds
