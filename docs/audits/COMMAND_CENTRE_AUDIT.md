# Command Centre — Production Readiness Audit

**Date:** 2 March 2026
**Target:** Go-live this month
**Status:** NOT production-ready — critical gaps identified below

---

## Executive Summary

The Command Centre has solid infrastructure (schema, edge functions, frontend components, RLS) but is **not functional for end users** because:

1. **The data pipeline has a critical gap** — only 4 of ~8 expected agents write items into `command_centre_items`. The morning briefing agent (the primary source) does NOT write to the table.
2. **21 orphaned component files** from a previous implementation sit dead in the codebase alongside the current implementation, creating confusion.
3. **3 demo pages** (200KB+ of hardcoded mock data) exist at accessible URLs and may be what internal testers are seeing.
4. **The old `tasks`-based hook** (`useCommandCentreTasks`) queries a completely different table (`tasks`) from the production system (`command_centre_items`), and nothing uses it.

---

## Architecture Map

There are **3 separate directories** all confusingly named "Command Centre/Center":

| Directory | What it actually is | Used by | Status |
|-----------|-------------------|---------|--------|
| `src/components/commandCentre/` | **CC items UI** — production inbox components | `CommandCentre.tsx` page | ACTIVE |
| `src/components/command-centre/` | **Old task-based UI** — TaskSidebar, WritingCanvas, etc. | NOTHING — orphaned | DEAD CODE |
| `src/components/command-center/` | **Quick-add popup** — Copilot overlay (green + button) | `AppLayout.tsx` | ACTIVE (unrelated) |

### Data Sources

| Source | Table | Used by production page | Items populated by |
|--------|-------|------------------------|-------------------|
| `command_centre_items` | Production CC table | YES — `useCommandCentreItemsQuery` | 4 agents (see below) |
| `tasks` | Legacy tasks table | NO — orphaned `useCommandCentreTasks` hook | Various (unrelated) |

---

## CRITICAL Issues (Must Fix for Go-Live)

### 1. Incomplete Data Population Pipeline

**Impact:** Users see an empty Command Centre — no items to review, approve, or action.

The `writeToCommandCentre()` adapter exists and works, but only **4 agents** call it:

| Agent | Edge Function | Writes CC items | Status |
|-------|--------------|----------------|--------|
| CRM Heartbeat | `agent-crm-heartbeat` | YES — stale deal alerts | Working |
| Deal Risk Batch | `agent-deal-risk-batch` | YES — risk alerts | Working |
| CRM Update | `agent-crm-update` | YES — CRM diff items | Working |
| Re-engagement | `process-reengagement` | YES — re-engage prompts | Working |
| **Morning Briefing** | `agent-morning-briefing` | **NO** | NOT WIRED |
| **Pipeline Analysis** | `proactive-pipeline-analysis` | **NO** | NOT WIRED |
| **Post-Meeting** | `slack-post-meeting` | **NO** | NOT WIRED |
| **Meeting Prep** | `proactive-meeting-prep` | **NO** | NOT WIRED |

**The morning briefing is the #1 source of daily CC items.** The `slack-morning-brief` function reads FROM `command_centre_items` (via `briefingAdapter.ts`) but `agent-morning-briefing` doesn't write TO it. This means the brief can reference CC items, but the briefing agent itself generates zero new items.

**Fix required:** Wire `writeToCommandCentre()` into all proactive agents. At minimum: morning briefing, pipeline analysis, post-meeting follow-up.

### 2. Enrichment Pipeline Not Triggering

**Impact:** Even when items exist, they stay in `open` status without enrichment or drafted actions.

The enrichment pipeline (`cc-enrich` → `cc-prioritise` → `actionDrafter`) processes items, but:
- `cc-enrich` runs as an edge function — needs to be triggered (no cron schedule found)
- `cc-prioritise` also requires explicit invocation
- Only `cc-daily-cleanup` and `cc-auto-execute` have pg_cron schedules

**Fix required:** Add cron schedules or event-driven triggers for `cc-enrich` and `cc-prioritise`. Without these, items never progress from `open` → `enriching` → `ready` and never get drafted actions.

### 3. Drafted Actions Never Generated

**Impact:** "Needs You" filter shows nothing because `drafted_action` is always null.

The `actionDrafter.ts` shared module exists but it's unclear if it's invoked by any running process. Without drafted actions:
- The "Needs You" tab (items with `drafted_action != null`) is always empty
- Approve/Send Email flow has nothing to approve
- The CC is just a list of titles with no actionable content

**Fix required:** Confirm the enrichment pipeline invokes `actionDrafter` and verify the full lifecycle: open → enriching → ready (with `drafted_action` populated).

---

## MAJOR Issues (Should Fix for Go-Live)

### 4. 21 Orphaned Component Files

**Impact:** Developer confusion, dead code bloat, potential for accidental regression.

The entire `src/components/command-centre/` directory (21 files) is dead code:

```
src/components/command-centre/
├── AIReasoningFooter.tsx        ← NOT IMPORTED ANYWHERE
├── ActionItemsTab.tsx           ← NOT IMPORTED ANYWHERE
├── ActivityTimeline.tsx         ← NOT IMPORTED ANYWHERE
├── CanvasConversation.tsx       ← NOT IMPORTED ANYWHERE
├── CommentSection.tsx           ← NOT IMPORTED ANYWHERE
├── ComposePreview.tsx           ← NOT IMPORTED ANYWHERE
├── ContactIntelligenceTab.tsx   ← NOT IMPORTED ANYWHERE
├── ContextPanel.tsx             ← NOT IMPORTED ANYWHERE
├── CrmUpdatePreview.tsx         ← NOT IMPORTED ANYWHERE
├── MeetingSearchPanel.tsx       ← NOT IMPORTED ANYWHERE
├── RecordingPlayer.tsx          ← NOT IMPORTED ANYWHERE
├── SidebarTaskItem.tsx          ← NOT IMPORTED ANYWHERE
├── SlackPreview.tsx             ← NOT IMPORTED ANYWHERE
├── SlashCommandDropdown.tsx     ← NOT IMPORTED ANYWHERE
├── TaskChainGroup.tsx           ← NOT IMPORTED ANYWHERE
├── TaskDetailHeader.tsx         ← NOT IMPORTED ANYWHERE
├── TaskSidebar.tsx              ← NOT IMPORTED ANYWHERE
├── TranscriptViewer.tsx         ← NOT IMPORTED ANYWHERE
├── WritingCanvas.tsx            ← NOT IMPORTED ANYWHERE
├── types.ts                     ← only imported by orphaned hook/store
└── useKeyboardNav.ts            ← NOT IMPORTED ANYWHERE
```

**Also orphaned:**
- `src/lib/hooks/useCommandCentreTasks.ts` — queries `tasks` table, imported by nothing
- `src/lib/stores/commandCentreStore.ts` — only imported by orphaned `TaskSidebar.tsx`

**Recommendation:** Delete the entire `src/components/command-centre/` directory, `useCommandCentreTasks.ts`, and update `commandCentreStore.ts` to remove the import from old types.

### 5. Demo Pages at Accessible URLs

**Impact:** Internal testers may be visiting demo pages (with hardcoded data) instead of the production page, causing the "hardcoded information" complaint.

| Page | URL | Size | Data Source |
|------|-----|------|-------------|
| `CommandCentreDemo.tsx` | `/command-centre-demo` | 45KB | `MOCK_TASKS` array (58+ items) |
| `CommandCentreV2Demo.tsx` | `/command-centre-v2-demo` | 85KB | Fully hardcoded |
| `CommandCentreWowDemo.tsx` | `/command-centre-wow` | 70KB | Fully hardcoded |

These are 200KB of mock-data-driven code. They show rich, realistic-looking data that creates the impression Command Centre "works" — but it's all fake.

**Recommendation:** Either delete these demo pages or gate them behind a feature flag / dev-only route. At minimum, add a prominent "DEMO — NOT REAL DATA" banner.

### 6. Realtime Hook Not Mounted

**Impact:** Items added by agents in the background won't appear until user manually refreshes.

The `useCommandCentreRealtime()` hook exists in `useCommandCentreItemsQuery.ts` (line 156) but is **never called** in `CommandCentre.tsx`. The page component imports the items/stats/mutations hooks but not the realtime hook.

**Fix required:** Add `useCommandCentreRealtime()` call to the `CommandCentre.tsx` page component.

---

## MINOR Issues (Nice to Fix)

### 7. Snooze Doesn't Change Status

**Impact:** Snoozed items still appear in the feed — just with a pushed-back due date.

`commandCentreItemsService.snoozeItem()` (line 250-266) only updates `due_date`. It doesn't change `status` to `snoozed` or add any filter logic. Snoozed items remain visible with status `open`/`ready`.

**Recommendation:** Add a `snoozed_until` column or status value, and filter snoozed items from the feed until their snooze time expires.

### 8. Route Access Level

**Impact:** Only `internal` users can access Command Centre.

Route config (line 310): `access: 'internal'`. External/customer users cannot see it. This may be intentional for launch but should be documented.

### 9. Deep Link Hook Not Connected

**Impact:** Direct URLs like `/command-centre?item=xxx` don't auto-open the detail panel.

`useCommandCentreDeepLinks.ts` exists with URL param parsing logic but is not called in `CommandCentre.tsx`.

### 10. Missing Keyboard Navigation

**Impact:** Power users can't navigate items with keyboard.

`useCommandCentreKeyboard.ts` hook exists but is not used in the production page.

---

## What's Working Well

These components are production-quality and properly implemented:

| Component | Status | Notes |
|-----------|--------|-------|
| Database schema | Solid | 11 migrations, proper indexes, RLS policies |
| `command_centre_items` table | Solid | Full lifecycle statuses, dedup, reconciliation |
| RPC functions | Solid | `get_cc_stats`, `insert_command_centre_item`, `bulk_update_cc_status`, `get_command_centre_view` |
| `CommandCentre.tsx` page | Solid | Clean component with filters, stats, animations |
| `commandCentreItemsService.ts` | Solid | Explicit columns, `maybeSingle()`, error handling with toasts |
| `useCommandCentreItemsQuery.ts` | Solid | React Query with proper cache keys and mutations |
| `CCItemCard.tsx`, `CCDetailPanel.tsx`, etc. | Solid | Well-structured UI components |
| Edge functions (cc-*) | Solid | All 7 fully implemented with proper auth |
| `writeAdapter.ts` | Solid | Dedup, batch writes, error isolation |
| Cron: `cc-daily-cleanup` | Solid | 6 AM UTC, handles stale items + re-scoring |
| Cron: `cc-auto-execute` | Solid | Rate-limited, undo-aware, confidence-gated |

---

## Go-Live Checklist

### Must-Have (Blocking)

- [ ] Wire `writeToCommandCentre()` into `agent-morning-briefing`
- [ ] Wire `writeToCommandCentre()` into `proactive-pipeline-analysis`
- [ ] Wire `writeToCommandCentre()` into post-meeting agent flow
- [ ] Add cron/trigger for `cc-enrich` (items stuck at `open` without it)
- [ ] Add cron/trigger for `cc-prioritise` (items have no priority scores)
- [ ] Verify `actionDrafter.ts` runs in the enrichment pipeline (drafted actions never populate)
- [ ] Mount `useCommandCentreRealtime()` in `CommandCentre.tsx`
- [ ] Verify `CRON_SECRET` env var is set in production
- [ ] Verify `SLACK_BOT_TOKEN` is set for `cc-action-sync`
- [ ] Run an end-to-end test: agent creates item → enrichment runs → drafted action appears → user approves → item completes

### Should-Have (Pre-Launch Polish)

- [ ] Delete orphaned `src/components/command-centre/` directory (21 dead files)
- [ ] Delete orphaned `useCommandCentreTasks.ts` hook
- [ ] Clean up `commandCentreStore.ts` to remove dependency on old types
- [ ] Remove or gate demo pages (`CommandCentreDemo`, `V2Demo`, `WowDemo`)
- [ ] Connect `useCommandCentreDeepLinks` for bookmarkable URLs
- [ ] Connect `useCommandCentreKeyboard` for keyboard navigation
- [ ] Fix snooze to actually hide items from the feed

### Nice-to-Have (Post-Launch)

- [ ] Add morning-brief integration: CC items surface in daily Slack brief
- [ ] Add notification badge on sidebar nav when new CC items arrive
- [ ] Add deal page integration: show CC items for that deal inline
- [ ] Consider consolidating `commandCentre/` and `command-centre/` directories (one canonical naming convention)
- [ ] Add telemetry: track approve/dismiss/snooze rates per agent source

---

## File Reference

### Production Code (Active)
| File | Purpose |
|------|---------|
| `src/pages/platform/CommandCentre.tsx` | Main page component |
| `src/components/commandCentre/CCItemCard.tsx` | Item card with urgency, actions |
| `src/components/commandCentre/CCDetailPanel.tsx` | Full item detail view |
| `src/components/commandCentre/CCItemDetailPanel.tsx` | Alternative detail panel |
| `src/components/commandCentre/CCFilterBar.tsx` | All / Needs You / Deals / Signals |
| `src/components/commandCentre/CCEmptyState.tsx` | Empty states (first-load, all-caught-up) |
| `src/components/commandCentre/CCStatsPanel.tsx` | Stats header |
| `src/components/commandCentre/CCStatusBar.tsx` | Item lifecycle status |
| `src/components/commandCentre/CCAttribution.tsx` | Source attribution |
| `src/components/commandCentre/panels/CCEmailPanel.tsx` | Email draft panel |
| `src/components/commandCentre/panels/CCCrmDiffPanel.tsx` | CRM update panel |
| `src/components/commandCentre/panels/CCDealHealthPanel.tsx` | Deal health panel |
| `src/components/commandCentre/panels/CCSignalPanel.tsx` | Signal/alert panel |
| `src/lib/services/commandCentreItemsService.ts` | CRUD service layer |
| `src/lib/hooks/useCommandCentreItemsQuery.ts` | React Query hooks + mutations |
| `src/lib/hooks/useCommandCentreDeepLinks.ts` | URL param deep linking (unmounted) |
| `src/lib/hooks/useCommandCentreKeyboard.ts` | Keyboard navigation (unmounted) |
| `src/lib/hooks/useActionFeed.ts` | Action feed (uses CC as fallback source) |
| `src/lib/stores/commandCentreStore.ts` | Zustand UI state |

### Edge Functions (Backend)
| Function | Purpose | Trigger |
|----------|---------|---------|
| `cc-enrich` | Enrichment orchestrator | Manual/needs cron |
| `cc-prioritise` | Priority scoring | Manual/needs cron |
| `cc-auto-execute` | Autonomous execution | pg_cron |
| `cc-daily-cleanup` | Stale cleanup + re-scoring | pg_cron (6 AM UTC) |
| `cc-action-sync` | Slack bi-directional sync | Called by mutations |
| `cc-undo` | Undo auto-executed items | Called by frontend |
| `cc-auto-report` | Daily Slack auto-complete report | Cron |

### Data Population (Agents that write to CC)
| Agent | Status |
|-------|--------|
| `agent-crm-heartbeat` | WRITES to CC |
| `agent-deal-risk-batch` | WRITES to CC |
| `agent-crm-update` | WRITES to CC |
| `process-reengagement` | WRITES to CC |
| `agent-morning-briefing` | DOES NOT write to CC |
| `proactive-pipeline-analysis` | DOES NOT write to CC |
| `proactive-meeting-prep` | DOES NOT write to CC |
| `slack-post-meeting` | DOES NOT write to CC |

### Dead Code (Delete)
| File | Reason |
|------|--------|
| `src/components/command-centre/` (21 files) | Orphaned — not imported by any page |
| `src/lib/hooks/useCommandCentreTasks.ts` | Queries wrong table (`tasks`), unused |
| `src/pages/platform/CommandCentreDemo.tsx` | 45KB demo with hardcoded mock data |
| `src/pages/platform/CommandCentreV2Demo.tsx` | 85KB demo with hardcoded mock data |
| `src/pages/platform/CommandCentreWowDemo.tsx` | 70KB demo with hardcoded mock data |

### Migrations
| Migration | Purpose |
|-----------|---------|
| `20260222600001_command_centre_items.sql` | Main table + RLS + indexes |
| `20260222600002_command_centre_rpcs.sql` | insert, bulk_update, view RPCs |
| `20260222600003_cc_reconciliation_columns.sql` | Dedup/reconciliation columns |
| `20260222600004_schedule_cc_cleanup_cron.sql` | Cleanup cron schedule |
| `20260222700003_morning_brief_cc_source_config.sql` | Morning brief CC source |
| `20260222700005_schedule_cc_auto_execute_cron.sql` | Auto-execute cron |
| `20260222220003_cc_backpressure.sql` | Backpressure/rate limiting |
| `20260222220004_cc_dedup.sql` | Deduplication support |
| `20260225000002_cc_slack_sync_columns.sql` | Slack sync columns |
| `20260225000003_cc_stats_rpc.sql` | Stats RPC |
| `20260225000005_cc_items_realtime.sql` | Realtime subscriptions |
