# PRD-115: Outreach Analytics Dashboard

**Priority:** Tier 1 — Ship Blocker
**Current Score:** 1 (SPEC ONLY) — data collected, zero visualisation
**Target Score:** 4 (BETA)
**Estimated Effort:** 10-12 hours
**Dependencies:** PRD-114 (campaign data feeds analytics)

---

## Problem

Outreach data is collected across multiple systems — `sequence_jobs` tracks email sends, `agent_daily_logs` tracks send counts, `monitor-campaigns` pulls Instantly metrics, and `sync-instantly-engagement` writes engagement columns. But there is **no analytics dashboard**:

1. **No email performance metrics** — open rates, click rates, reply rates exist in data but aren't visualised
2. **No sequence performance comparison** — can't compare which email sequences perform best
3. **No rep activity tracking** — no view of emails sent per rep per day/week
4. **No ROI attribution** — meetings booked from outreach aren't linked back to campaigns
5. **No deliverability monitoring** — bounce rates exist but aren't surfaced with domain health indicators

## Goal

An Outreach Analytics page that shows email performance, sequence comparison, rep activity, and ROI attribution across all outreach channels.

## Success Criteria

- [ ] `/outreach/analytics` page with key metrics overview (sent, opened, clicked, replied, bounced)
- [ ] Time-series charts for email engagement metrics (daily/weekly)
- [ ] Sequence performance comparison table (which templates perform best)
- [ ] Rep activity leaderboard (emails sent, reply rate, meetings booked)
- [ ] Reply intent breakdown (interested vs not interested vs OOO)
- [ ] Domain health indicators (bounce rate by sending domain)

## Stories

| ID | Title | Type | Est | Dependencies |
|----|-------|------|-----|-------------|
| OUT-001 | Create OutreachAnalyticsPage with metrics overview cards | frontend | 2h | — |
| OUT-002 | Build email engagement time-series chart (Recharts) | frontend | 2h | OUT-001 |
| OUT-003 | Add sequence performance comparison table with sorting | frontend | 2h | OUT-001 |
| OUT-004 | Build rep activity leaderboard with send/reply/meeting stats | frontend | 1.5h | OUT-001 |
| OUT-005 | Add reply intent breakdown chart (pie/bar) | frontend | 1h | OUT-001 |
| OUT-006 | Add domain health indicators panel | frontend | 1h | OUT-001 |
| OUT-007 | Create RPC for outreach analytics aggregation | backend | 2h | — |

## Technical Notes

- `sequence_jobs` table: audit trail for all outreach sends — query for send counts, timing
- `agent_daily_logs` table: daily send counts per user — use for rep activity
- `monitor-campaigns` already pulls open/click/reply/bounce from Instantly API
- `sync-instantly-engagement` writes engagement data into Ops table columns
- Reply classification from `monitor-campaigns`: interested, not_interested, out_of_office, bounce, auto_reply
- ROI attribution: join `sequence_jobs` → `contacts` → `meetings` to trace outreach → booked meetings
- Chart pattern: reuse `SalesActivityChart.tsx` Recharts pattern
- Consider materialised view or periodic aggregation for performance (avoid slow real-time queries)
