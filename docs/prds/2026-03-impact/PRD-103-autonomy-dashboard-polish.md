# PRD-103: Autonomy Dashboard Polish

**Priority:** Tier 1 — Ship Blocker
**Current Score:** 3 (ALPHA) — backend strong, frontend basic
**Target Score:** 4 (BETA)
**Estimated Effort:** 12-15 hours
**Dependencies:** PRD-101 (CC routes actions through autonomy gate)

---

## Problem

Graduated autonomy is 60's most unique differentiator — the AI earns trust over time by tracking approval rates and promoting itself from suggest → approve → auto. But:

1. **Settings page is basic** — `AutonomySettingsPage.tsx` (435 lines) shows presets (Conservative/Balanced/Autonomous) but no per-action detail
2. **No 7/30/90-day reporting** — backend tracks windows but frontend doesn't display them
3. **Manager ceilings not in UI** — `ManagerAutonomyControls.tsx` exists but isn't wired into settings
4. **Demo page exists but production page is thin** — `AutonomyDemoPage.tsx` is richer than the real settings
5. **Promotion notifications land in Slack only** — no in-app promotion history or approval flow

## Goal

A production autonomy dashboard that shows users exactly what the AI can do, how it earned that trust, and gives managers control over ceilings.

## Success Criteria

- [ ] Per-action-type status cards showing current tier, approval rate, signal count
- [ ] 7/30/90-day trend sparklines per action type
- [ ] Manager ceiling controls (max tier per action type, per rep)
- [ ] Promotion history timeline (when was each action type promoted/demoted)
- [ ] In-app promotion proposal banner (not just Slack)
- [ ] "What can 60 do autonomously?" summary card for new users

## Stories

| ID | Title | Type | Est | Dependencies |
|----|-------|------|-----|-------------|
| AUT-001 | Build per-action-type status cards with current tier and stats | frontend | 3h | — |
| AUT-002 | Add 7/30/90-day approval rate sparklines | frontend | 2h | AUT-001 |
| AUT-003 | Wire manager ceiling controls into AutonomySettingsPage | frontend | 2h | — |
| AUT-004 | Add promotion/demotion history timeline | frontend | 2h | AUT-001 |
| AUT-005 | Create in-app promotion proposal banner with approve/snooze/reject | frontend | 2h | — |
| AUT-006 | Build "What can 60 do?" summary card for onboarding | frontend | 1h | AUT-001 |
| AUT-007 | Wire `autopilot_confidence` table data into dashboard via RPC | backend | 2h | — |
| AUT-008 | Integration test: signal → confidence → promotion → UI update | test | 2h | AUT-001, AUT-007 |

## Technical Notes

- `autopilot_confidence` table has: `score`, `clean_approval_rate`, `rejection_rate`, `undo_rate`, `last_30_signals`, `days_active` — all the data we need
- `autopilot_thresholds` table has the promotion criteria — display alongside current stats
- `AutonomyProgressionDashboard.tsx` already exists but is basic — extend it
- `ManagerAutonomyControls.tsx` exists — just needs to be included in the settings page
- Chart library: use the same Recharts pattern as `SalesActivityChart.tsx`
