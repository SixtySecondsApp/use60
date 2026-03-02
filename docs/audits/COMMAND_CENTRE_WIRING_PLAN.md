# Command Centre — Wiring Plan

**Date:** 2 March 2026
**Goal:** Get Command Centre fully functional with live data for go-live this month
**Prerequisite:** Read `docs/audits/COMMAND_CENTRE_AUDIT.md` for full context

---

## The Problem

The Command Centre infrastructure is solid but the **data pipeline is disconnected**. Items never appear because:

1. Most agents don't write to `command_centre_items`
2. The enrichment + prioritisation cron jobs don't exist
3. The frontend is missing realtime, deep links, and snooze filtering

This plan has **4 phases**, ordered by dependency chain. Each phase unblocks the next.

```
Phase 1: Data In        → Items appear in the table
Phase 2: Enrichment     → Items get drafted actions + priority scores
Phase 3: Frontend       → Users see live updates, deep links, keyboard nav
Phase 4: Cleanup        → Remove 200KB+ of dead code and demos
```

---

## Phase 1: Data Population (Items In)

**Goal:** Get proactive agents writing items into `command_centre_items`.

### Story 1.1 — Wire morning briefing to CC

**File:** `supabase/functions/agent-morning-briefing/index.ts`
**Insert at:** ~Line 95 (after `insert_agent_activity` RPC, before notification queue update)

```typescript
import { writeToCommandCentre } from '../_shared/commandCentre/writeAdapter.ts';

// After existing agent_activity write:
await writeToCommandCentre({
  org_id: persona.org_id,
  user_id: persona.user_id,
  source_agent: 'morning-brief',
  item_type: 'insight',
  title: `Morning briefing: ${deals.length} deals, ${meetings.length} meetings`,
  summary: narrativeBriefing?.substring(0, 500) ?? null,
  urgency: 'normal',
  context: {
    deals_count: briefing.deals?.length ?? 0,
    meetings_count: briefing.meetings?.length ?? 0,
    tasks_count: briefing.tasks?.length ?? 0,
  },
});
```

**Pattern to follow:** `agent-crm-heartbeat/index.ts:196` (already writes to CC).

**Notes:**
- Runs per-user in the persona loop, so each user gets their own item
- `org_id` and `user_id` available from `persona` object
- Wrap in try/catch — CC write failures must never break the briefing flow

---

### Story 1.2 — Wire pipeline analysis to CC

**File:** `supabase/functions/proactive-pipeline-analysis/index.ts`
**Insert at:** ~Line 559 (replace or supplement the existing Action Centre call)

Currently writes to the **old** `action_centre_items` table via `createActionCentreItems()`. Replace with `writeMultipleItems()` targeting `command_centre_items`.

```typescript
import { writeMultipleItems } from '../_shared/commandCentre/writeAdapter.ts';

// Replace createActionCentreItems() with:
if (summary.insights.length > 0) {
  const ccItems = summary.insights.map(insight => ({
    org_id: orgId,
    user_id: insight.userId ?? userId,
    source_agent: 'pipeline-analysis',
    item_type: insight.actionType ?? 'insight',       // 'alert' | 'task' | 'insight'
    title: insight.title,
    summary: insight.summary?.substring(0, 500) ?? null,
    urgency: mapSeverityToUrgency(insight.severity),  // critical→critical, high→high, medium→normal, low→low
    deal_id: insight.dealId ?? null,
    contact_id: insight.contactId ?? null,
    context: { severity: insight.severity, category: insight.category },
  }));
  await writeMultipleItems(ccItems);
}
```

**Notes:**
- Existing `summary.insights` array (built at lines 351–495) has all the data
- Add a `mapSeverityToUrgency()` helper: `{ critical: 'critical', high: 'high', medium: 'normal', low: 'low' }`
- Consider keeping the old Action Centre call temporarily for backwards compatibility, or remove if Action Centre is deprecated

---

### Story 1.3 — Wire meeting prep to CC

**File:** `supabase/functions/proactive-meeting-prep/index.ts`
**Insert at:** ~Line 596 (after `log_copilot_engagement` RPC)

```typescript
import { writeToCommandCentre } from '../_shared/commandCentre/writeAdapter.ts';

await writeToCommandCentre({
  org_id: orgId || prepResult.organizationId,
  user_id: userId,
  source_agent: 'meeting-prep',
  item_type: 'meeting_prep',
  title: `Prep: ${meeting.title}`,
  summary: prepResult.brief?.substring(0, 500) ?? null,
  urgency: 'high',                    // meeting prep is time-sensitive
  due_date: meeting.start_time,       // prep needed before meeting starts
  context: {
    meeting_id: meeting.id,
    start_time: meeting.start_time,
    attendees_count: meeting.attendees_count,
  },
});
```

**Notes:**
- `org_id` resolved from membership lookup at line 809–814
- `deal_id` not directly available — would need an extra query to get the meeting's linked deal (defer to enrichment)

---

### Story 1.4 — Wire post-meeting to CC

**File:** `supabase/functions/slack-post-meeting/index.ts`
**Insert at:** After action items / follow-ups are extracted from the meeting debrief

```typescript
import { writeMultipleItems } from '../_shared/commandCentre/writeAdapter.ts';

// After action items are extracted:
const ccItems = actionItems.map(item => ({
  org_id: meeting.org_id,
  user_id: meeting.owner_user_id,
  source_agent: 'post-meeting',
  item_type: 'follow_up',
  title: item.title ?? `Follow-up: ${meeting.title}`,
  summary: item.description?.substring(0, 500) ?? null,
  urgency: 'high',
  deal_id: meeting.deal?.id ?? null,
  contact_id: null,                   // enrichment can resolve from attendees
  context: {
    meeting_id: meeting.id,
    meeting_title: meeting.title,
    action_type: item.type,
  },
}));
await writeMultipleItems(ccItems);
```

**Notes:**
- Need to read the full file to find exact extraction point
- `meeting.owner_user_id` is the deals table pattern for meeting ownership
- If multiple action items are extracted, use `writeMultipleItems()` for efficiency

---

## Phase 2: Enrichment Pipeline (Items Processed)

**Goal:** Items progress from `open` → `enriching` → `ready` with drafted actions and priority scores.

### Story 2.1 — Create cron schedule for cc-enrich

**New migration file:** `supabase/migrations/YYYYMMDD_schedule_cc_enrich_cron.sql`

Follow the pattern from `20260222700005_schedule_cc_auto_execute_cron.sql`:

```sql
-- Schedule cc-enrich to run every 15 minutes (matches fleet-health expectations)
SELECT cron.schedule(
  'cc-enrich-every-15min',
  '*/15 * * * *',
  $$
  SELECT net.http_post(
    url := current_setting('app.settings.supabase_url') || '/functions/v1/cc-enrich',
    headers := jsonb_build_object(
      'Content-Type', 'application/json',
      'Authorization', 'Bearer ' || current_setting('app.settings.service_role_key')
    ),
    body := jsonb_build_object('source', 'cron')
  );
  $$
);
```

**Notes:**
- cc-enrich already handles batch processing (up to 20 items per run)
- Respects per-provider rate limits (HubSpot 8/min, Calendar 10/min, Slack 5/min)
- Uses semaphore pattern for max 5 concurrent enrichments
- Fleet-health already expects 15-minute cadence — this makes it real

---

### Story 2.2 — Create cron schedule for cc-prioritise

**New migration file:** `supabase/migrations/YYYYMMDD_schedule_cc_prioritise_cron.sql`

```sql
-- Schedule cc-prioritise to run every 10 minutes (after enrichment has had time to process)
SELECT cron.schedule(
  'cc-prioritise-every-10min',
  '3,13,23,33,43,53 * * * *',
  $$
  SELECT net.http_post(
    url := current_setting('app.settings.supabase_url') || '/functions/v1/cc-prioritise',
    headers := jsonb_build_object(
      'Content-Type', 'application/json',
      'Authorization', 'Bearer ' || current_setting('app.settings.service_role_key')
    ),
    body := jsonb_build_object('batch', true, 'source', 'cron')
  );
  $$
);
```

**Notes:**
- Offset by 3 minutes from the 15-minute enrichment cycle to avoid overlap
- Runs in batch mode (`{ batch: true }`) to score all open/enriching/ready items
- Updates `priority_score`, `priority_factors`, `urgency` on each item
- Also triggers DEDUP-003 merge group recheck (auto-approve if merged confidence >= 0.7)

---

### Story 2.3 — Verify enrichment → drafted_action flow

**Files to verify:**
- `supabase/functions/cc-enrich/index.ts` — lines 843–882 (calls `synthesiseAndDraft()`)
- `supabase/functions/_shared/commandCentre/actionDrafter.ts` — produces `DraftResult`
- Persist path: `persistDraftWithConfidence()` sets `drafted_action`, `summary`, `confidence_score`, `status = 'ready'`

**Verification steps:**
1. Deploy cc-enrich and cc-prioritise cron schedules to staging
2. Manually insert a test CC item via SQL:
   ```sql
   INSERT INTO command_centre_items (org_id, user_id, source_agent, item_type, title, urgency)
   VALUES ('your-org-id', 'your-user-id', 'manual-test', 'follow_up', 'Test: follow up with Acme', 'normal');
   ```
3. Wait 15 minutes for cc-enrich to pick it up
4. Check: `enrichment_status` should be `enriched`, `drafted_action` should be populated, `status` should be `ready`
5. Wait 10 minutes for cc-prioritise
6. Check: `priority_score` and `urgency` should be set

**If drafted_action is null after enrichment:**
- Check cc-enrich logs for AI call failures
- Verify `ANTHROPIC_API_KEY` / `OPENAI_API_KEY` is set (actionDrafter resolves model from user settings → env → Haiku default)
- Check if the minimal fallback is triggering instead of the AI path

---

## Phase 3: Frontend Polish (Users See It)

**Goal:** Realtime updates, bookmarkable URLs, keyboard navigation, snooze that works.

### Story 3.1 — Mount realtime hook

**File:** `src/pages/platform/CommandCentre.tsx`
**Insert at:** Inside the `CommandCentre` component, before any state declarations

```typescript
import {
  useCommandCentreItemsQuery,
  useCommandCentreStatsQuery,
  useCommandCentreItemMutations,
  useCommandCentreRealtime,          // ADD THIS IMPORT
} from '@/lib/hooks/useCommandCentreItemsQuery';

export default function CommandCentre() {
  useCommandCentreRealtime();         // ADD THIS LINE — mount once

  const [activeFilter, setActiveFilter] = useState<CCFilter>('all');
  // ... rest of component
}
```

**What it does:**
- Subscribes to `command_centre_items` table via Supabase Realtime
- On any INSERT/UPDATE/DELETE, invalidates both `CC_ITEMS_KEY` and `CC_STATS_KEY` React Query caches
- Uses `useRealtimeHub` which is working-hours aware (full during 8 AM–6 PM, minimal off-hours)
- Realtime publication already enabled in migration `20260225000005`

---

### Story 3.2 — Wire deep links

**File:** `src/pages/platform/CommandCentre.tsx`

```typescript
import { useCommandCentreDeepLinks } from '@/lib/hooks/useCommandCentreDeepLinks';

export default function CommandCentre() {
  useCommandCentreRealtime();

  const [activeFilter, setActiveFilter] = useState<CCFilter>('all');
  // ... existing state ...
  const [detailItem, setDetailItem] = useState<CCItem | null>(null);

  // Wire deep links
  const deepLinks = useCommandCentreDeepLinks({
    items: allItems,
    onSelectItem: setDetailItem,
    onSelectFilter: setActiveFilter,
  });

  // Update URL when user interacts:
  const handleViewDetail = (item: CCItem) => {
    setDetailItem(item);
    deepLinks.updateItemParam(item.id);
  };

  // On filter change, update URL:
  const handleFilterChange = (filter: CCFilter) => {
    setActiveFilter(filter);
    deepLinks.updateFilterParam(filter);
  };

  // On detail close, clear URL param:
  // In CCDetailPanel onClose:
  // deepLinks.updateItemParam(null);
```

**Supported URLs:**
- `/command-centre?item={id}` — auto-opens detail panel
- `/command-centre?filter=needs-you` — applies filter
- `/command-centre?filter=deals&item={id}` — combined

---

### Story 3.3 — Wire keyboard navigation

**File:** `src/pages/platform/CommandCentre.tsx`

```typescript
import { useCommandCentreKeyboard } from '@/lib/hooks/useCommandCentreKeyboard';

// Inside component:
const keyboard = useCommandCentreKeyboard({
  items: filteredItems,
  selectedItem: detailItem,
  onSelectItem: setDetailItem,
  onApprove: handleApprove,
  onDismiss: handleDismiss,
  isPanelOpen: detailItem !== null,
});

// In the item rendering:
<CCItemCard
  key={item.id}
  item={item}
  isHighlighted={keyboard.isHighlighted(item.id)}
  // ... other props
/>
```

**Keyboard shortcuts:**
| Key | Action |
|-----|--------|
| `j` | Move highlight down |
| `k` | Move highlight up |
| `Enter` | Toggle detail panel |
| `a` | Approve highlighted item |
| `d` | Dismiss highlighted item |
| `Escape` | Close detail panel |

**Note:** Automatically disabled when focus is in an input/textarea/contenteditable.

---

### Story 3.4 — Fix snooze to hide items from feed

**File:** `src/lib/services/commandCentreItemsService.ts`
**Method:** `getItems()` (line 104–153)

Add a filter to exclude snoozed items (items with `due_date` in the future):

```typescript
// After existing filters, before the query executes:
// Hide snoozed items (due_date pushed into the future by snooze action)
query = query.or('due_date.is.null,due_date.lte.now()');
```

This ensures items snoozed to a future time don't clutter the feed until their snooze expires.

**Alternative approach** (more explicit): Add a `snoozed_until` column to distinguish "due date" from "snoozed until". This is cleaner but requires a migration.

---

## Phase 4: Cleanup (Remove Dead Code)

**Goal:** Remove 200KB+ of orphaned code. Reduce confusion for developers.

### Story 4.1 — Delete orphaned `command-centre/` components

**Delete entire directory:** `src/components/command-centre/`

All 21 files are orphaned — zero imports found across the codebase:

```
src/components/command-centre/
├── AIReasoningFooter.tsx
├── ActionItemsTab.tsx
├── ActivityTimeline.tsx
├── CanvasConversation.tsx
├── CommentSection.tsx
├── ComposePreview.tsx
├── ContactIntelligenceTab.tsx
├── ContextPanel.tsx
├── CrmUpdatePreview.tsx
├── MeetingSearchPanel.tsx
├── RecordingPlayer.tsx
├── SidebarTaskItem.tsx
├── SlackPreview.tsx
├── SlashCommandDropdown.tsx
├── TaskChainGroup.tsx
├── TaskDetailHeader.tsx
├── TaskSidebar.tsx
├── TranscriptViewer.tsx
├── WritingCanvas.tsx
├── types.ts
└── useKeyboardNav.ts
```

**Also delete:**
- `src/lib/hooks/useCommandCentreTasks.ts` — queries wrong table (`tasks`), zero imports

**Update:**
- `src/lib/stores/commandCentreStore.ts` — replace import of types from `command-centre/types` with inline type definitions or import from `commandCentreItemsService`

---

### Story 4.2 — Remove or gate demo pages

**Files:**
- `src/pages/platform/CommandCentreDemo.tsx` (45KB, hardcoded `MOCK_TASKS`)
- `src/pages/platform/CommandCentreV2Demo.tsx` (85KB, hardcoded data)
- `src/pages/platform/CommandCentreWowDemo.tsx` (70KB, hardcoded data)

**Options:**
1. **Delete them** — simplest, removes 200KB of mock code
2. **Gate behind dev-only flag** — keep for internal demos but block in production
3. **Add a banner** — "DEMO — NOT REAL DATA" if keeping them

**Recommendation:** Delete. The production Command Centre with real data will be the best demo.

---

## Execution Order & Dependencies

```
Phase 1 (Data In)                      Phase 2 (Enrichment)
┌──────────────┐                       ┌──────────────────┐
│ 1.1 Morning  │──┐                    │ 2.1 Enrich cron  │──┐
│     briefing │  │                    │                  │  │
├──────────────┤  │                    ├──────────────────┤  │
│ 1.2 Pipeline │  ├─ All independent  │ 2.2 Prioritise   │  ├─ Independent
│   analysis   │  │   (parallel OK)   │      cron        │  │  (parallel OK)
├──────────────┤  │                    ├──────────────────┤  │
│ 1.3 Meeting  │  │                    │ 2.3 Verify e2e   │──┘ Depends on 2.1+2.2
│     prep     │  │                    │     lifecycle    │
├──────────────┤  │                    └──────────────────┘
│ 1.4 Post-    │──┘                           │
│   meeting    │                              │
└──────────────┘                              ▼
       │                               Phase 3 (Frontend)
       │                               ┌──────────────────┐
       └──────────────────────────────▶ │ 3.1 Realtime     │──┐
                                       ├──────────────────┤  │
                                       │ 3.2 Deep links   │  ├─ All independent
                                       ├──────────────────┤  │  (parallel OK)
                                       │ 3.3 Keyboard nav │  │
                                       ├──────────────────┤  │
                                       │ 3.4 Fix snooze   │──┘
                                       └──────────────────┘
                                              │
                                              ▼
                                       Phase 4 (Cleanup)
                                       ┌──────────────────┐
                                       │ 4.1 Delete dead  │──┐ Do last
                                       │     components   │  │ (no functional
                                       │ 4.2 Remove demos │──┘  impact)
                                       └──────────────────┘
```

**Parallelism:**
- Phase 1 stories (1.1–1.4) can all run in parallel — no file overlap
- Phase 2 stories (2.1–2.2) can run in parallel — separate migration files
- Phase 3 stories (3.1–3.4) can all run in parallel — different files/functions
- Phase 4 must be last (but is non-blocking for functionality)
- Phase 2 depends on Phase 1 only for verification (2.3) — the cron schedules can be deployed before agents are wired
- Phase 3 is independent of Phase 1 and 2 (frontend hooks work regardless of data)

---

## Verification Checklist

### After Phase 1 + 2 deployed to staging:

- [ ] Insert test item via SQL → appears in CC within 15 minutes (enriched, with drafted_action)
- [ ] Run morning briefing manually → CC item created with `source_agent = 'morning-brief'`
- [ ] Run pipeline analysis manually → CC items created with `source_agent = 'pipeline-analysis'`
- [ ] Check cc-enrich logs → items progressing through enrichment
- [ ] Check cc-prioritise logs → items getting priority scores
- [ ] Verify `drafted_action` is not null on enriched items
- [ ] Verify `status = 'ready'` on fully processed items

### After Phase 3 deployed:

- [ ] Open `/command-centre` → see real items (not empty state)
- [ ] Filter "Needs You" → shows items with drafted actions
- [ ] Approve an item → toast confirms, item status changes
- [ ] Dismiss an item → removed from feed
- [ ] Snooze an item → disappears from feed until snooze expires
- [ ] Open detail panel → URL updates to `?item={id}`
- [ ] Share URL with `?item={id}` → opens directly to that item
- [ ] Press `j`/`k` → highlight moves through items
- [ ] Press `a` on highlighted item → approves it
- [ ] New item arrives via agent → appears without manual refresh

### After Phase 4:

- [ ] Build passes with no import errors
- [ ] No references to deleted files in the codebase
- [ ] Demo URLs return 404 (or are gated)

---

## Risk Register

| Risk | Severity | Mitigation |
|------|----------|------------|
| AI enrichment costs from high item volume | Medium | cc-enrich already has rate limits and batch caps (20 items/run). Monitor costs in first week. |
| Agents creating too many low-value items | Medium | Deduplication already active. Tune urgency thresholds per agent. |
| cc-enrich failing silently | High | Fleet-health already monitors it. Check Supabase function logs after deploying cron. |
| Cron secrets not set in production | High | Verify `CRON_SECRET`, `SUPABASE_SERVICE_ROLE_KEY` before deploying migrations. |
| Breaking existing Action Centre | Medium | Keep `createActionCentreItems()` in pipeline analysis until CC is verified. Then remove. |
| Old `command-centre/` deletion breaking builds | Low | Already verified zero imports. Run build after deletion to confirm. |
