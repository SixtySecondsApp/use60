# PRD-116: Forecast Dashboard

**Priority:** Tier 1 — Ship Blocker
**Current Score:** 1 (SPEC ONLY) — RPCs and snapshots exist, zero frontend
**Target Score:** 4 (BETA)
**Estimated Effort:** 12-15 hours
**Dependencies:** None

---

## Problem

Forecasting infrastructure is built but invisible:
- `pipeline_snapshots` table stores weekly pipeline state
- `get_rep_calibration()` and `get_team_forecast_accuracy()` RPCs exist (73 lines)
- `calculate_pipeline_math` RPC returns stage conversion rates, velocity, and weighted pipeline
- `get_weighted_pipeline` RPC returns pipeline value weighted by stage probability
- `agent-pipeline-snapshot` captures periodic snapshots
- `deal_temperature` agent scores deals by close probability

But there is **no forecast UI**:
1. **No forecast vs actual comparison** — snapshots exist but nothing charts predicted vs real outcomes
2. **No rep calibration view** — RPC returns over/under-forecast bias but nothing displays it
3. **No pipeline waterfall** — no visualisation of deals in → won → lost → slipped per period
4. **No scenario modelling** — can't adjust assumptions and see projected revenue impact
5. **No commit/best case/pipeline categories** — standard forecast methodology not represented

## Goal

A Forecast page that gives managers and reps visibility into forecast accuracy, pipeline flow, rep calibration, and projected outcomes.

## Success Criteria

- [ ] `/forecast` page with forecast summary (commit, best case, pipeline totals)
- [ ] Forecast vs actual chart (monthly, using pipeline_snapshots)
- [ ] Rep calibration cards showing over/under-forecast bias per rep
- [ ] Pipeline waterfall chart (deals added, won, lost, slipped per period)
- [ ] Weighted pipeline breakdown by stage with probability adjustments
- [ ] Deal category selector (commit / best case / pipeline / omitted)

## Stories

| ID | Title | Type | Est | Dependencies |
|----|-------|------|-----|-------------|
| FORE-001 | Create ForecastPage with summary cards (commit, best case, pipeline) | frontend | 2h | — |
| FORE-002 | Build forecast vs actual comparison chart from pipeline_snapshots | frontend | 2.5h | FORE-001 |
| FORE-003 | Add rep calibration cards using get_rep_calibration RPC | frontend | 2h | FORE-001 |
| FORE-004 | Build pipeline waterfall chart (in → won → lost → slipped) | frontend | 2.5h | FORE-001 |
| FORE-005 | Add weighted pipeline breakdown by stage | frontend | 1.5h | FORE-001 |
| FORE-006 | Build deal category selector (commit/best case/pipeline/omitted) | frontend + backend | 2h | FORE-001 |
| FORE-007 | Create RPC for forecast aggregation with period filtering | backend | 1.5h | — |

## Technical Notes

- `pipeline_snapshots` table stores weekly snapshots — join consecutive weeks for trend/waterfall
- `get_rep_calibration(p_org_id, p_user_id, p_months)` RPC returns forecast accuracy metrics per rep
- `get_team_forecast_accuracy(p_org_id, p_months)` RPC returns team-wide accuracy
- `calculate_pipeline_math` RPC returns stage conversion rates, average velocity, weighted pipeline
- `get_weighted_pipeline` RPC returns pipeline value weighted by stage probability
- Deal category (commit/best case/pipeline) needs a new column on `deals` table or a `deal_forecast_categories` table
- Waterfall chart: query `pipeline_snapshots` for two periods, diff to get added/won/lost/slipped
- Chart library: Recharts (consistent with rest of app)
- Consider `PipelineInsightsCard.tsx` as a starting point — extend or replace
