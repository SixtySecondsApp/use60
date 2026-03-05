# PRD-114: Campaign Management Dashboard

**Priority:** Tier 1 — Ship Blocker
**Current Score:** 2 (SCAFFOLD) — full Instantly API integration, zero campaign UI
**Target Score:** 4 (BETA)
**Estimated Effort:** 12-15 hours
**Dependencies:** None

---

## Problem

The Instantly integration backend is complete — `instantly-admin` (580 lines) supports 11 actions (connect, status, list, create, activate, pause, delete, analytics, link, unlink, daily). `push-to-instantly` (374 lines) and `instantly-push` (435 lines) handle lead pushing. `monitor-campaigns` (241 lines) pulls metrics and classifies replies using Claude Haiku.

But there is **zero campaign management UI**:
1. **No campaign creation flow** — users can't create Instantly campaigns from within 60
2. **No campaign list/status page** — can't see active, paused, or completed campaigns
3. **No analytics dashboard** — metrics are pulled but never displayed
4. **No reply classification view** — AI classifies replies (interested/not interested/OOO/bounce) but nowhere shows this
5. **No engagement sync trigger** — `sync-instantly-engagement` (297 lines) runs but has no manual trigger or progress UI

## Goal

A Campaigns page where users can create, manage, monitor, and analyse their outreach campaigns with reply classification and engagement metrics.

## Success Criteria

- [ ] `/campaigns` page with campaign list showing status, leads count, and key metrics
- [ ] Campaign creation wizard (select leads from Ops table, configure schedule, launch)
- [ ] Campaign detail view with open/click/reply/bounce rates
- [ ] Reply classification panel (interested, not interested, OOO, bounce) with drill-down
- [ ] Pause/resume/delete controls per campaign
- [ ] Engagement sync trigger with progress indicator

## Stories

| ID | Title | Type | Est | Dependencies |
|----|-------|------|-----|-------------|
| CAMP-001 | Create CampaignsPage with campaign list and status cards | frontend | 2h | — |
| CAMP-002 | Build campaign creation wizard (lead selection + schedule config) | frontend | 3h | CAMP-001 |
| CAMP-003 | Add campaign detail view with metrics charts (open, click, reply, bounce) | frontend | 2h | CAMP-001 |
| CAMP-004 | Build reply classification panel with intent categories | frontend | 2h | CAMP-003 |
| CAMP-005 | Add pause/resume/delete controls wired to instantly-admin | frontend | 1h | CAMP-001 |
| CAMP-006 | Wire engagement sync trigger with progress indicator | frontend | 1.5h | CAMP-001 |
| CAMP-007 | Create RPC for campaign analytics aggregation | backend | 1.5h | — |

## Technical Notes

- `instantly-admin` edge function already supports all needed actions — just wire to UI
- `monitor-campaigns` (241 lines) pulls metrics + classifies replies — results need a table to persist
- `sync-instantly-engagement` (297 lines) auto-creates engagement columns in Ops tables — batch upsert optimised
- `push-to-instantly` handles lead pushing with email deduplication
- Instantly API quirk: `campaign_schedule` required with specific timezone enum (see MEMORY.md)
- Reply classification uses Claude Haiku — categories: interested, not_interested, out_of_office, bounce, auto_reply
- Consider `campaign_metrics` table to cache pulled metrics (avoid repeated API calls)
- Reuse `SalesActivityChart.tsx` Recharts pattern for metric visualisation
