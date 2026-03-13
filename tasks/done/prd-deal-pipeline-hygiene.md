# PRD: Deal Pipeline Hygiene

## Introduction

Sales reps accumulate deals that go stale — no follow-up, no meeting, no activity for weeks. These dead deals pollute the pipeline, inflate forecast numbers, and mask real revenue. This PRD covers two features that make staleness visible and actionable:

- **Feature B: Deal Freshness Timer** — a visual indicator on every pipeline deal card showing days since last activity, color-coded from green to grey, with dormant treatment for 30+ day deals.
- **Feature A: Weekly Pipeline Hygiene Digest** — a Monday Slack DM to each rep listing their stale, overdue, and ghost-risk deals with one-click actions (snooze, follow up, close).

## Goals

- Reduce deals sitting 30+ days with no activity by 50% within 8 weeks
- Make deal freshness impossible to ignore on the pipeline board
- Give reps one-click paths to action (follow up or close) directly from Slack
- Exclude dormant deals from forecast weighted values so revenue projections are accurate
- Create a weekly accountability rhythm without requiring manager intervention

## User Stories

### US-B1: Expose days_since_last_activity in Pipeline RPC
**Description:** As a developer, I want `get_pipeline_with_health` to return `days_since_last_activity` so the frontend can render freshness indicators.

**Acceptance Criteria:**
- [ ] `get_pipeline_with_health` RPC returns `days_since_last_activity` from `deal_health_scores` table
- [ ] Value is `null` when no health score exists (not 0)
- [ ] Verify `days_since_last_activity` in `deal_health_scores` counts ALL activity types (meeting, email, call, proposal), not just meetings — audit the health recalc logic
- [ ] Add composite index on `activities(deal_id, created_at DESC)` if missing, for query performance
- [ ] `npx supabase db push --linked --dry-run` passes
- [ ] Typecheck passes

### US-B2: Update PipelineDeal Type and Fallback
**Description:** As a developer, I want the `PipelineDeal` TypeScript type to include `days_since_last_activity` so components can use it.

**Acceptance Criteria:**
- [ ] `PipelineDeal` interface in `usePipelineData.ts` includes `days_since_last_activity: number | null`
- [ ] Fallback query (when RPC unavailable) computes `days_since_last_activity` from activities table or deal_health_scores
- [ ] Typecheck passes

### US-B3: Freshness Badge on DealCard
**Description:** As a sales rep, I want to see a color-coded freshness indicator on each deal card so I can instantly spot which deals need attention.

**Acceptance Criteria:**
- [ ] DealCard shows a small badge with days since last activity and a Lucide icon (e.g., `Clock` or `Activity`)
- [ ] Color coding: green/emerald (0-7 days), amber (8-14 days), red (15-21 days), grey (21+ days)
- [ ] Uses existing Tailwind color conventions: `text-emerald-600 dark:text-emerald-400`, `text-amber-500`, `text-red-500`, `text-gray-400`
- [ ] Tooltip shows "Last activity X days ago"
- [ ] Deals with no activity data show no badge (graceful null handling)
- [ ] Typecheck passes
- [ ] Verify in browser on localhost:5175

### US-B4: Dormant Visual Treatment
**Description:** As a sales rep, I want deals with 30+ days of no activity to appear visually dimmed so I can focus on active deals.

**Acceptance Criteria:**
- [ ] Deals with `days_since_last_activity >= 30` have reduced opacity (e.g., `opacity-50`) on the card
- [ ] A small "Dormant" label appears on the card (grey, subtle)
- [ ] Visual treatment is distinct from "Lost" stage deals
- [ ] Typecheck passes
- [ ] Verify in browser on localhost:5175

### US-B5: Sort Dormant Deals to Bottom
**Description:** As a sales rep, I want dormant deals pushed to the bottom of each pipeline column so active deals are front and center.

**Acceptance Criteria:**
- [ ] Within each stage column, deals with `days_since_last_activity >= 30` sort after all non-dormant deals
- [ ] Within the dormant group, existing sort order is preserved (by value desc)
- [ ] Drag-and-drop still works for dormant deals
- [ ] Typecheck passes
- [ ] Verify in browser on localhost:5175

### US-B6: Exclude Dormant from Forecast and Add Dormant Filter
**Description:** As a sales manager, I want dormant deals excluded from weighted forecast values, and I want a "Dormant" quick filter to show/hide them.

**Acceptance Criteria:**
- [ ] `get_pipeline_with_health` RPC stage metrics `weighted_value` excludes deals with `days_since_last_activity >= 30`
- [ ] Summary `weighted_value` also excludes dormant deals
- [ ] Stage metric `deal_count` still includes dormant deals (they exist, just not forecasted)
- [ ] Add a `dormant_count` field to the summary statistics
- [ ] Pipeline header quick filters include a "Dormant" option that shows only dormant deals (or hides them)
- [ ] `npx supabase db push --linked --dry-run` passes
- [ ] Typecheck passes
- [ ] Verify in browser on localhost:5175

### US-A1: RPC for Stale Deals by Owner
**Description:** As a developer, I want an RPC that returns stale deals grouped by owner so the digest edge function can efficiently query per-rep deal lists.

**Acceptance Criteria:**
- [ ] New RPC `get_stale_deals_for_digest(p_org_id TEXT)` returns JSONB grouped by `owner_id`
- [ ] Each deal includes: `id`, `name`, `company`, `value`, `stage_name`, `days_since_last_activity`, `expected_close_date`, `ghost_probability`, `stale_reason` (enum: 'no_activity_14d', 'past_close_date', 'ghost_risk')
- [ ] Stale criteria: `days_since_last_activity >= 14` OR `expected_close_date < NOW()` OR `ghost_probability_percent >= 70`
- [ ] Only includes `status = 'active'` deals
- [ ] `SECURITY DEFINER` with `search_path = 'public'`
- [ ] `npx supabase db push --linked --dry-run` passes
- [ ] Typecheck passes

### US-A2: Slack Block Kit Builder for Hygiene Digest
**Description:** As a developer, I want a Block Kit builder that formats the hygiene digest into a rich Slack message with action buttons.

**Acceptance Criteria:**
- [ ] New function `buildPipelineHygieneDigest(data)` in `slackBlocks.ts`
- [ ] Header shows deal count and date
- [ ] Deals grouped by stale reason with section headers: "No Activity (14+ days)", "Past Close Date", "Ghost Risk"
- [ ] Each deal shows: name, company, value, days stale, stage
- [ ] Per-deal action buttons: "Snooze 7d", "Draft Follow-up", "Close as Lost" — button values encode `{ action, deal_id }`
- [ ] "Snooze All" bulk action button at the bottom when 3+ deals
- [ ] Respects Slack Block Kit limits (2800 char sections, 75 char button text)
- [ ] Truncates to top 15 deals if more (with "and X more..." note)
- [ ] Typecheck passes

### US-A3: Pipeline Hygiene Digest Edge Function
**Description:** As a sales rep, I want to receive a weekly Slack DM listing my stale deals so I'm reminded to act on them.

**Acceptance Criteria:**
- [ ] New edge function `pipeline-hygiene-digest` in `supabase/functions/`
- [ ] Auth: service role only (via `verifyCronSecret()` or `isServiceRoleAuth()`)
- [ ] Iterates active orgs, calls `get_stale_deals_for_digest` RPC
- [ ] Resolves Slack user IDs via `slack_user_mappings` table
- [ ] Sends Slack DM to each rep with stale deals using `sendSlackDM()`
- [ ] Batches DMs with 500ms delay between sends (Slack rate limiting)
- [ ] Skips users with no stale deals (no empty DMs)
- [ ] Skips orgs with no Slack integration configured
- [ ] Supports `?dryRun=true` query param — returns JSON payload without sending DMs
- [ ] Supports `?singleUserId=X` for testing with one user
- [ ] Writes summary to Command Centre via `writeToCommandCentre()` with `source_agent: 'pipeline_hygiene'`
- [ ] Uses `runAgent` wrapper for telemetry
- [ ] Logs errors per-user (doesn't fail entire batch on one user's error)
- [ ] Typecheck passes

### US-A4: Slack Interactive Handler for Hygiene Actions
**Description:** As a sales rep, I want to click action buttons in the digest DM and have the system create the right follow-up items.

**Acceptance Criteria:**
- [ ] New action_id handlers in `slack-interactive/index.ts`: `hygiene_snooze_7d`, `hygiene_draft_followup`, `hygiene_close_lost`, `hygiene_snooze_all`
- [ ] **Snooze 7d:** Creates CC item with `source_agent: 'pipeline_hygiene'`, sets deal metadata `snoozed_until` 7 days from now, updates Slack message to show "Snoozed until [date]"
- [ ] **Draft Follow-up:** Creates CC item with `item_type: 'follow_up'`, `deal_id`, triggers enrichment pipeline
- [ ] **Close as Lost:** Creates CC item with `item_type: 'deal_action'`, action to update deal status to 'lost', requires one more confirmation click
- [ ] **Snooze All:** Applies snooze to all deals in the digest for that user
- [ ] Each action updates the original Slack message to reflect the action taken (button replaced with status text)
- [ ] Typecheck passes

### US-A5: Cron Migration for Weekly Schedule
**Description:** As a system, I want the digest to run automatically every Monday at 9am UTC.

**Acceptance Criteria:**
- [ ] New migration creates pg_cron job: `pipeline-hygiene-digest` scheduled at `0 9 * * 1` (Monday 9am UTC)
- [ ] Scheduled AFTER health score recalc (which runs earlier)
- [ ] Uses `net.http_post()` to invoke the edge function with `x-cron-secret` header
- [ ] Idempotent: `cron.unschedule` before `cron.schedule`
- [ ] `npx supabase db push --linked --dry-run` passes

### US-A6: Register pipeline_hygiene as CC Source
**Description:** As a developer, I want `pipeline_hygiene` registered as a valid Command Centre source agent.

**Acceptance Criteria:**
- [ ] `pipeline_hygiene` added to `SourceAgent` type in `commandCentre/types.ts`
- [ ] Dedup logic in `writeAdapter.ts` handles `pipeline_hygiene` source correctly
- [ ] Typecheck passes

## Functional Requirements

- FR-1: The freshness badge must render on every deal card in both Kanban and Table views
- FR-2: Dormant deals (30+ days no activity) must be excluded from `weighted_value` in pipeline summary and stage metrics
- FR-3: The weekly digest must only send to reps who have at least one stale deal
- FR-4: Slack action buttons must create Command Centre items (not directly modify deals) to preserve the HITL approval flow
- FR-5: The digest edge function must support dry-run mode for safe testing
- FR-6: Freshness data must be available even when `deal_health_scores` has no record (graceful null → "No data")

## Non-Goals (Out of Scope)

- Auto-closing deals without human approval (only creates CC items)
- Email delivery of the digest (Slack only for v1)
- Customizable freshness thresholds per org (hardcoded for v1: 7/14/21/30 days)
- Historical freshness trend charts
- Mobile push notifications for stale deals

## Technical Considerations

- **Schema:** No new tables. 1 new RPC, 1 altered RPC, 1 cron job, 1 composite index. All additive changes.
- **Existing patterns:** Follow `agent-deal-risk-batch` for edge function, `slackBlocks.ts` builders for Block Kit, `DealCard.tsx` health bar for color coding.
- **Performance:** `deal_last_activity` materialized view already exists for efficient last-activity queries. Add `activities(deal_id, created_at DESC)` index as safety net.
- **Data freshness:** Health scores recalc daily. Digest runs after recalc. DealCard uses whatever data the RPC returns (acceptable lag).
- **Slack rate limits:** Batch DMs with 500ms delays. For orgs with 500+ reps, consider chunking across multiple function invocations.

## Success Metrics

- Pipeline-wide: 50% reduction in deals with 30+ days no activity within 8 weeks
- Digest engagement: >40% of reps click at least one action button per week
- Forecast accuracy: weighted pipeline value decreases by removing dormant dead weight
- Deal throughput: increase in deals moved to Lost (reps closing stale deals instead of ignoring them)

## Parallel Execution Groups

- **Group 1** (no dependencies): US-B1, US-B3, US-A1, US-A2
- **Group 2** (depends on Group 1): US-B2, US-B4, US-B5, US-A3
- **Group 3** (depends on Group 2): US-B6, US-A4, US-A5, US-A6
