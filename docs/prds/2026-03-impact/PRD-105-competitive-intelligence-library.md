# PRD-105: Competitive Intelligence Library

**Priority:** Tier 2 — High-Impact Quick Win
**Current Score:** 3 (ALPHA) — agent extracts mentions, no management UI
**Target Score:** 4 (BETA)
**Estimated Effort:** 8-10 hours
**Dependencies:** None

---

## Problem

`agent-competitive-intel` (501 lines) extracts competitor mentions from meeting transcripts and auto-generates battlecards. Slack alerts fire when mentions cross thresholds. But:

1. **No battlecard library page** — generated battlecards have nowhere to live in the UI
2. **No competitor profile management** — can't view/edit competitor profiles
3. **Mention tracking buried** — no way to see which competitors are mentioned most across deals
4. **Battlecards only accessible via Copilot** — not browsable or searchable

## Goal

A Competitive Intelligence page where reps can browse competitor profiles, view auto-generated battlecards, and see mention trends.

## Success Criteria

- [ ] `/intelligence/competitive` page with competitor list, profiles, and battlecards
- [ ] Competitor mention frequency chart (last 30/60/90 days)
- [ ] Auto-generated battlecards viewable and editable
- [ ] Win/loss ratio per competitor
- [ ] "Mentioned in" section showing which deals reference each competitor
- [ ] Quick access from deal sheet when competitor is detected

## Stories

| ID | Title | Type | Est | Dependencies |
|----|-------|------|-----|-------------|
| COMP-001 | Create CompetitiveIntelPage with competitor list sidebar | frontend | 3h | — |
| COMP-002 | Build CompetitorProfileView with auto-generated battlecard | frontend | 2h | COMP-001 |
| COMP-003 | Add mention frequency chart (Recharts, 30/60/90d toggle) | frontend | 1.5h | COMP-001 |
| COMP-004 | Build "Mentioned in deals" section with deal links | frontend | 1h | COMP-001 |
| COMP-005 | Add win/loss ratio stats per competitor | frontend | 1h | COMP-001 |
| COMP-006 | Wire CompetitorBadge in DealDetailsModal to link to profile | frontend | 1h | COMP-001 |
| COMP-007 | Create RPC to aggregate competitor data across deals | backend | 1.5h | — |

## Technical Notes

- `agent-competitive-intel` stores results — need to confirm table structure (likely `competitive_mentions` or similar)
- `BattlecardViewer.tsx` and `CompetitorProfileCard.tsx` already exist — extend them
- Mention extraction uses Claude Haiku — confidence scores available for filtering
- Battlecard structure: strengths, weaknesses, key differentiators, common objections, talk track
- Chart pattern: reuse `SalesActivityChart.tsx` Recharts pattern
