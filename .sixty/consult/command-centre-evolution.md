# Consult Report: Command Centre Evolution
Generated: 2026-02-25

## User Request

Evolve the existing Command Centre into a single-page feed + side panel experience that feels alive, connects human and AI through shared ownership, and replaces polling with event-driven updates. Full email editing capability required. Slack bi-directional sync.

## Key Decisions

| Decision | Choice | Rationale |
|----------|--------|-----------|
| Naming | Keep "Command Centre" | Evolution of existing page, not a rebrand |
| Data model | Evolve `command_centre_items` | Already has 8-state lifecycle, write adapter, Slack digest — no new table needed |
| Default filter | "All" first, "Needs You" second | Show copilot working, not just what needs the user |
| Auto-execution | All approvals manual, user controls auto-send per type | Build trust first, then earn autonomy |
| Side panel layout | Compression (feed shrinks) | Maintain feed context during review — not Sheet overlay |
| Realtime approach | Supabase Realtime via existing hub | No Redis, no new infrastructure — cheaper than current polling |
| Email editing | TipTap in side panel | Reuse existing TipTapEditor + EmailComposerEnhanced patterns |

## Codebase Findings

### What Already Exists (reuse, don't rebuild)

- **`command_centre_items` table** — 8-state lifecycle (open/enriching/ready/approved/executing/completed/dismissed/auto_resolved)
- **Write adapter** — every agent already writes to CC items via `_shared/commandCentre/writeAdapter.ts`
- **5 CC edge functions** — cc-enrich, cc-auto-execute, cc-prioritise, cc-daily-cleanup, cc-auto-report
- **Prioritisation engine** — 5-factor weighted scoring (time_sensitivity, deal_value, signal_strength, strategic_alignment, effort_required)
- **Confidence scorer** — 5-factor scoring (data_completeness, pattern_match, template_confidence, recency, trust_history)
- **Deduplicator** — compatible type groups, user+deal+contact matching
- **Reconciler** — auto-resolves items when external actions detected (email_sent, crm_updated, calendar_created)
- **Action executor** — dispatches send_email/update_crm/create_task/schedule_meeting/send_proposal
- **TipTap editor** — fully installed with toolbar, wired into EmailComposerEnhanced with Gmail send
- **email-send-as-rep edge function** — production Gmail send with audit trail, daily limits, signatures
- **useRealtimeHub** — singleton hub with 2-3 consolidated channels, working-hours awareness, consumer callback pattern
- **Slack Block Kit library** — buildCommandCentreDigest with Approve/Edit/Snooze/Dismiss action buttons
- **slack-interactive handler** — processes cc_approve, cc_edit, cc_snooze, cc_dismiss action IDs

### Gaps Found (must build)

| Gap | Impact | Story |
|-----|--------|-------|
| CC items not in Realtime publication | Page feels dead — no live updates | CC-001 |
| Stats computed client-side (fetches all rows) | Won't scale past 100 items | CC-003 |
| CCItem TypeScript interface missing 5 columns | Silent undefined access via casts | CC-017 |
| cc-undo edge function doesn't exist as a file | Undo button is broken | CC-017 |
| No TipTap in detail panel — uses plain textarea | Can't preview email formatting | CC-008 |
| No bridge from Approve → email-send-as-rep | Approval is a dead-end status change | CC-009 |
| No slack_message_ts column | Can't sync state back to Slack | CC-002 |
| Sheet overlay instead of compression layout | Loses feed context during review | CC-004 |
| 5-tab layout instead of filter bar | Too many destinations, not inbox-like | CC-005 |

## Scaling Analysis: Realtime vs Polling

Polling (current): full SELECT per user per tab-focus, all rows transferred, stats counted client-side.
Realtime (proposed): zero DB queries — reads WAL stream, pushes only changed rows over existing WebSocket.

Adding command_centre_items to the existing high-priority channel creates zero new WebSocket connections. Supabase Pro allows 500 concurrent connections — a sales tool won't approach this. CC items see ~5-20 writes per user per day (~0.001 writes/second) — no WAL pressure.

The polling approach is the scaling problem, not Realtime.

## Architecture

### Phase 1: Foundation (CC-001 through CC-007)

```
                    CC-001 (Realtime)  ─┐
                    CC-002 (Schema)    ─┤─ parallel
                    CC-003 (Stats RPC) ─┤
                    CC-014 (Empty)     ─┤
                    CC-017 (Type fix)  ─┘
                           │
                           ▼
                    CC-004 (Compression layout)
                    CC-010 (Deep links)  ── parallel with CC-004
                    CC-012 (Auto-send)   ── parallel with CC-004
                           │
                    ┌──────┴──────┐
                    ▼             ▼
             CC-005 (Feed)   CC-006 (Status bar) ─┐
                    │        CC-007 (Attribution) ─┘ parallel
                    ▼
```

### Phase 2: Email (CC-008, CC-009)

```
             CC-004 (Compression layout)
                    │
             CC-008 (Email TipTap panel) ─┐
             CC-013 (Typed panels)       ─┘ parallel
                    │
             CC-009 (Approve & Send flow)
```

### Phase 3: Slack Sync (CC-010, CC-011)

```
             CC-002 (Schema)
                    │
             CC-010 (Deep links)
                    │
             CC-011 (Bi-directional sync)
```

### Phase 4: Polish (CC-015, CC-016)

```
             CC-005 + CC-004
                    │
             CC-015 (Keyboard) ─┐
             CC-016 (Animations) ─┘ parallel
```

## File Impact Summary

| Area | Files | Stories |
|------|-------|---------|
| Migrations | 3 new | CC-001, CC-002, CC-003 |
| useRealtimeHub.ts | Modified | CC-001 |
| useCommandCentreItemsQuery.ts | Modified | CC-001, CC-003, CC-009 |
| commandCentreItemsService.ts | Modified | CC-003, CC-009, CC-012, CC-017 |
| CommandCentre.tsx | Major rewrite | CC-004, CC-005, CC-006, CC-010, CC-014, CC-015, CC-016 |
| CCItemCard.tsx | Rewrite | CC-005, CC-007, CC-016 |
| New: CCDetailPanel.tsx | Created | CC-004 |
| New: CCEmailPanel.tsx | Created | CC-008, CC-009 |
| New: CCFilterBar.tsx | Created | CC-005 |
| New: CCStatusBar.tsx | Created | CC-006 |
| New: CCAttribution.tsx | Created | CC-007 |
| New: 3 typed panels | Created | CC-013 |
| New: CCEmptyState.tsx | Created | CC-014 |
| New: useCommandCentreKeyboard.ts | Created | CC-015 |
| slackBlocks.ts | Modified | CC-011 |
| slack-interactive/index.ts | Modified | CC-011 |
| New: cc-undo/index.ts | Created | CC-017 |
| New: cc-action-sync/index.ts | Created | CC-011 |
| cc-auto-execute/index.ts | Modified | CC-012 |
| settings component | Created | CC-012 |
