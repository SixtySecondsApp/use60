# PRD-117: Win/Loss Analysis Dashboard

**Priority:** Tier 2 — High-Impact Quick Win
**Current Score:** 2 (SCAFFOLD) — backend extracts signals, no analysis UI
**Target Score:** 4 (BETA)
**Estimated Effort:** 10-12 hours
**Dependencies:** None

---

## Problem

Win/loss signal extraction runs across multiple agents:
- `coaching-analysis` (827 lines) correlates coaching metrics with win/loss outcomes
- `agent-competitive-intel` (501 lines) tracks competitor mentions and competitive win/loss
- `proactive-pipeline-analysis` (727 lines) identifies patterns in won vs lost deals
- `deal_health_scores` table tracks predicted close probability
- `deal_health_history` stores snapshots for trend analysis

But there's **no win/loss analysis UI**:
1. **No deal outcome categorisation** — no structured way to mark won/lost with reason codes
2. **No win rate dashboard** — can't see win rates by stage, rep, product, or competitor
3. **No loss reason tracking** — lost deals have no taxonomy (price, timing, competitor, no decision)
4. **No competitive win/loss matrix** — competitor intel agent tracks mentions but no win rates per competitor
5. **No coaching integration** — managers can't connect loss patterns to coaching actions

## Goal

A Win/Loss Analysis page that tracks deal outcomes, categorises loss reasons, and surfaces patterns to improve team win rates.

## Success Criteria

- [ ] `/analytics/win-loss` page with win rate overview and trend chart
- [ ] Deal outcome form (won/lost with reason code, competitor, notes)
- [ ] Win rate breakdown by stage, rep, deal size, and time period
- [ ] Loss reason distribution chart with drill-down to specific deals
- [ ] Competitive win/loss matrix (win rate per competitor)
- [ ] Pattern insights panel (AI-generated observations from win/loss data)

## Stories

| ID | Title | Type | Est | Dependencies |
|----|-------|------|-----|-------------|
| WL-001 | Create WinLossPage with win rate overview and trend chart | frontend | 2h | — |
| WL-002 | Build deal outcome form with reason codes and competitor selection | frontend + backend | 2h | — |
| WL-003 | Add win rate breakdown charts (by stage, rep, size, period) | frontend | 2h | WL-001 |
| WL-004 | Build loss reason distribution chart with deal drill-down | frontend | 1.5h | WL-001 |
| WL-005 | Create competitive win/loss matrix from competitive_mentions data | frontend | 1.5h | WL-001 |
| WL-006 | Add AI pattern insights panel (generated from deal outcomes) | frontend + backend | 2h | WL-001 |
| WL-007 | Create deal_outcomes table and aggregation RPC | backend | 1.5h | — |

## Technical Notes

- Deals table has `status` (won/lost/open) but no `loss_reason` or `outcome_notes` — need `deal_outcomes` table
- `deal_outcomes` table: deal_id, outcome (won/lost), reason_code, competitor_id, notes, recorded_by, recorded_at
- Loss reason codes: price, timing, competitor_won, no_decision, feature_gap, champion_left, budget_cut, other
- `agent-competitive-intel` stores competitor mentions — join with deal outcomes for competitive matrix
- `coaching-analysis` has `correlateWinLossAdapter` — use its output for pattern insights
- `deal_health_history` has score snapshots — overlay health trajectory on won vs lost deals
- Win rate calculation: `COUNT(won) / COUNT(won + lost)` grouped by dimension
- Chart pattern: reuse Recharts, consider stacked bar for reason distribution
