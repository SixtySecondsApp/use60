# PRD-106: Pipeline Patterns Dashboard

**Priority:** Tier 2 — High-Impact Quick Win
**Current Score:** 3 (ALPHA) — detection runs, results only in Slack
**Target Score:** 4 (BETA)
**Estimated Effort:** 8-10 hours
**Dependencies:** None

---

## Problem

Pipeline pattern detection is running — `agent-pipeline-patterns` (474 lines) detects stage bottlenecks, velocity anomalies, and engagement correlations. `agent-pipeline-snapshot` (427 lines) stores weekly snapshots. Results feed into morning briefing Slack messages.

But there's **no in-app dashboard** showing these patterns. Users who miss the Slack message have no way to see:
- Which pipeline stages are bottlenecked
- Velocity anomalies (2-sigma outliers)
- Week-over-week pipeline health trends
- Engagement correlation patterns

## Goal

A Pipeline Insights section (tab or page) that surfaces detected patterns, bottleneck alerts, and pipeline health trends.

## Success Criteria

- [ ] Pipeline Insights tab on the Pipeline page (or standalone `/pipeline/insights`)
- [ ] Stage bottleneck cards showing deals lingering >1.5x average
- [ ] Velocity anomaly alerts with deal links
- [ ] Weekly pipeline health trend chart (from `pipeline_snapshots` table)
- [ ] Weighted pipeline vs target overlay
- [ ] Engagement correlation indicators (which activities predict stage advancement)

## Stories

| ID | Title | Type | Est | Dependencies |
|----|-------|------|-----|-------------|
| PIP-001 | Add "Insights" tab to Pipeline page | frontend | 1h | — |
| PIP-002 | Build StageBottleneckCards showing lingering deals | frontend | 2h | PIP-001 |
| PIP-003 | Add VelocityAnomalyAlerts with deal links | frontend | 1.5h | PIP-001 |
| PIP-004 | Create WeeklyPipelineHealthChart from snapshots | frontend | 2h | PIP-001 |
| PIP-005 | Add weighted pipeline vs target overlay | frontend | 1.5h | PIP-004 |
| PIP-006 | Wire `calculate_pipeline_math` and `get_weighted_pipeline` RPCs | backend | 1h | — |
| PIP-007 | Create engagement correlation indicators | frontend | 1.5h | PIP-001 |

## Technical Notes

- `pipeline_snapshots` table stores weekly snapshots — query for trend data
- `calculate_pipeline_math` RPC exists — returns stage conversion rates, velocity, weighted pipeline
- `get_weighted_pipeline` RPC exists — returns pipeline value weighted by stage probability
- `PipelineInsightsCard.tsx` already exists — extend or replace with full insights tab
- `proactive-pipeline-analysis` (727 lines) has all the detection logic — just need to expose results via RPC
- Pattern severity levels: `critical`, `warning`, `info` — map to card border colours
