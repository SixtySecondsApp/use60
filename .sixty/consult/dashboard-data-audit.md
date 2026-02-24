# Consult Report: Dashboard & Intelligence Data Correctness
Generated: 2026-02-23

## User Request
"Run a deep analysis on data grabbing for the information displayed on the dashboard and intelligence pages. Ensure all graphs are correctly displaying and data is valid, makes sense for what it's meant to show, and correctly accounts for date range filtering."

## Agent Findings Summary

### P0 Bugs (Charts broken / date picker has zero effect)
1. SentimentTrend + SentimentDashboard: wrong column names (meeting_date→meeting_start, user_id→owner_user_id) — returns zero rows always
2. Dashboard KPI cards always show full calendar month regardless of date picker
3. TeamKPIGrid hardcodes period=30, ignores 7d/90d selection
4. VSL Analytics custom date range silently ignored (effect early-returns)

### P1 Bugs (Significant data errors)
5. False +100% trends when previous period = 0
6. useTeamTimeSeries query key missing dateRange — stale cache on range change
7. useSentimentExtremes, useTalkTimeExtremes, useObjectionDetails, useMeetingsForDrillDown, useTeamQualitySignals — no dateRange param
8. Custom date ranges always send period=30 to RPCs
9. MetricCard memo comparator skips dateRange — stale renders
10. KPI card clicks are no-ops

### P2 (Display inconsistencies)
11. Sentiment scale mismatch: KPI shows raw (0.32), chart shows ×10 (3.2)
12. RepScorecard progress bar uses arbitrary ×2 denominator
13. Forward movement % denominator includes unclassified meetings
14. TalkTimeLeaderboard ranks highest talk time not proximity to ideal range
15. Currency hardcoded to £

## Stories Generated
See .sixty/plan.json
