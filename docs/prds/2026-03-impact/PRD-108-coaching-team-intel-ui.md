# PRD-108: Coaching & Team Intelligence UI

**Priority:** Tier 3 — Differentiator Upgrade
**Current Score:** 2 (SCAFFOLD) — backend complete, frontend is settings-only
**Target Score:** 4 (BETA)
**Estimated Effort:** 12-15 hours
**Dependencies:** None (backend is complete)

---

## Problem

The coaching system is one of 60's deepest backends — 4,500+ lines across `coaching-analysis` (827 lines), orchestrator adapters (411 lines), Slack handlers (623 lines), and a full scoring framework based on SPIN methodology with Gong-validated benchmarks (43/57 talk ratio, 76s monologue cliff, 11-14 questions per call).

But the frontend is **settings-only**:
- `CoachingScorecardSettings.tsx` (708 lines) — admin template management
- `CoachingPreferences.tsx` (522 lines) — user preference config
- `RepScorecardView.tsx` (501 lines) — single meeting scorecard

There's no:
1. **Team-wide coaching dashboard** — managers can't see rep performance across the team
2. **Skill progression view** — `coaching_skill_progression` table tracks weekly trends but nothing displays them
3. **Org learning insights** — `org_learning_insights` table has winning talk tracks, competitive positioning, discovery patterns — all invisible
4. **Coaching leaderboard** — `useTeamScorecardLeaderboard()` hook exists but no page uses it

## Goal

A Coaching & Team Intelligence page that gives managers a team-wide view of rep performance, skill progression, and org-level learning insights.

## Success Criteria

- [ ] `/coaching` page with team overview dashboard
- [ ] Rep performance cards showing scorecard averages, grade distribution, and trend sparklines
- [ ] Skill progression chart per rep (from `coaching_skill_progression` table)
- [ ] Team leaderboard using existing `useTeamScorecardLeaderboard()` hook
- [ ] Org learning insights cards (winning talk tracks, optimal cadence, competitive positioning)
- [ ] Drill-down to individual rep's meeting scorecards

## Stories

| ID | Title | Type | Est | Dependencies |
|----|-------|------|-----|-------------|
| COACH-UI-001 | Create CoachingDashboardPage with team overview layout | frontend | 2h | — |
| COACH-UI-002 | Build RepPerformanceCard with scorecard stats and trends | frontend | 2h | COACH-UI-001 |
| COACH-UI-003 | Add skill progression chart (Recharts, weekly data) | frontend | 2h | COACH-UI-001 |
| COACH-UI-004 | Wire team leaderboard from useTeamScorecardLeaderboard hook | frontend | 1.5h | COACH-UI-001 |
| COACH-UI-005 | Build OrgLearningInsightsPanel (winning talk tracks, patterns) | frontend | 2h | COACH-UI-001 |
| COACH-UI-006 | Add rep drill-down view with meeting scorecard history | frontend | 2h | COACH-UI-002 |
| COACH-UI-007 | Create RPC for team coaching stats aggregation | backend | 1.5h | — |
| COACH-UI-008 | Wire org_learning_insights data via get_active_org_insights RPC | backend | 1h | — |

## Technical Notes

- `coaching_analyses` table has per-meeting scores: talk_ratio, question_quality, objection_handling, discovery_depth
- `coaching_skill_progression` table tracks weekly scores per rep — perfect for trend charts
- `org_learning_insights` table has 6 insight types: winning_talk_track, objection_handling, optimal_cadence, competitive_positioning, stage_best_practice, discovery_pattern
- `get_active_org_insights(org_id)` RPC already exists — returns non-expired insights
- `useTeamScorecardLeaderboard()` in `useCoachingScorecard.ts` already computes rankings
- `useRepScorecardStats()` returns total scorecards, avg score, grade distribution, trend
- Chart pattern: reuse `SalesActivityChart.tsx` Recharts pattern
- Coaching benchmarks reference: `skills/atomic/coaching-analysis/references/coaching-metrics.md` (325 lines)
