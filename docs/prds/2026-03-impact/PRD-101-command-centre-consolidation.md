# PRD-101: Command Centre Consolidation

**Priority:** Tier 1 — Ship Blocker
**Current Score:** 1 (SPEC ONLY) — 4 demo variants, no production version
**Target Score:** 4 (BETA)
**Estimated Effort:** 20-25 hours
**Dependencies:** None (self-contained)

---

## Problem

The Command Centre is 60's core value proposition — the unified hub where all AI-generated actions land for review, approval, or auto-execution. But right now:

1. **4 competing implementations exist:** `CommandCentre.tsx`, `CommandCentreDemo.tsx`, `CommandCentreV2Demo.tsx`, `CommandCentreWowDemo.tsx`
2. **No production routing** — agent outputs go to Slack, not the CC
3. **Action Centre overlap** — `ActionCentre.tsx` (557 lines) and `EmailActionCenter.tsx` (648 lines) duplicate intent
4. **Routing unclear** — items arrive via Slack OR CC but never both consistently

Users see scattered Slack messages from agents but have no single place to review, approve, or dismiss AI actions.

## Goal

One production Command Centre that is the single destination for all agent-generated items, with Slack as a notification layer (not the primary UI).

## Success Criteria

- [ ] Single `CommandCentre.tsx` component replaces all 4 variants
- [ ] All 10 fleet agents route items to CC inbox via `cc-enrich` pipeline
- [ ] Slack notifications link back to CC item (deep link)
- [ ] Approve/dismiss/edit actions work in both CC and Slack
- [ ] Realtime subscription (already implemented) shows new items instantly
- [ ] Keyboard navigation (j/k/Enter/a/d/Escape) works
- [ ] `ActionCentre.tsx` and `EmailActionCenter.tsx` deprecated and redirected

## Stories

| ID | Title | Type | Est | Dependencies |
|----|-------|------|-----|-------------|
| CC-001 | Consolidate CC components into single production version | frontend | 4h | — |
| CC-002 | Wire all fleet agents to emit CC items via `cc-enrich` | backend | 3h | — |
| CC-003 | Add deep links from Slack notifications to CC items | backend | 2h | CC-002 |
| CC-004 | Deprecate ActionCentre and EmailActionCenter with redirects | frontend | 2h | CC-001 |
| CC-005 | Add CC to main sidebar navigation (replace scattered entry points) | frontend | 1h | CC-001 |
| CC-006 | Wire Realtime subscription for live item arrival | frontend | 2h | CC-001 |
| CC-007 | Implement inline compression layout (feed + detail panel) | frontend | 3h | CC-001 |
| CC-008 | Add approve/dismiss/undo actions with 5-second undo window | frontend | 3h | CC-007 |
| CC-009 | Integration test: agent → CC → Slack notification → approve | test | 2h | CC-002, CC-008 |

## Technical Notes

- Reuse the best parts from each demo variant (V2Demo has the best compression layout, WowDemo has the best animations)
- `cc-enrich` pipeline already exists and works — the gap is agent emission, not enrichment
- Slack `slack-interactive` handlers already support approve/dismiss — just need CC equivalents
- `CCDetailPanel.tsx`, `CCItemCard.tsx`, `CCFilterBar.tsx` are good production components — keep them

## What Gets Removed

- `CommandCentreDemo.tsx`
- `CommandCentreV2Demo.tsx`
- `CommandCentreWowDemo.tsx`
- `ActionCentre.tsx` (redirects to CC)
- `EmailActionCenter.tsx` (redirects to CC email filter)
