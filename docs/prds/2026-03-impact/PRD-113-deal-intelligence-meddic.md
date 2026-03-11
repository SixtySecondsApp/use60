# PRD-113: Deal Intelligence MEDDIC Panel

**Priority:** Tier 3 — Differentiator Upgrade
**Current Score:** 2 (SCAFFOLD) — health scoring + MEDDIC extraction exist, no dedicated panel
**Target Score:** 4 (BETA)
**Estimated Effort:** 10-12 hours
**Dependencies:** None

---

## Problem

Deal intelligence has strong foundations:
- `calculate-deal-health` (503 lines) runs daily — scores velocity, sentiment, engagement, activity, response time
- `health-recalculate` (1,516 lines) orchestrates real-time recalculation with alert evaluation, CRM sync, and Slack notifications
- `deal_health_scores` table stores comprehensive metrics (overall score, 5 component scores, risk factors, predicted close probability)
- `meeting-digest-truth-extractor` skill (660 lines) extracts MEDDIC deltas from transcripts
- `meddicc-guide.md` (427 lines) defines a 0-4 scoring matrix per field

But the frontend surfaces are limited:
1. **`DealIntelligenceSheet.tsx` (956 lines)** shows health score and risk factors but **no MEDDIC panel**
2. **`DealIntelligenceResponse.tsx` (336 lines)** renders copilot responses but doesn't show MEDDIC fields
3. **MEDDIC data is extracted from transcripts** but there's no place to view or edit the extracted fields
4. **No MEDDIC scoring visualisation** — the 0-4 scoring matrix exists in docs but not in UI
5. **No deal-over-time health trend chart** — `deal_health_history` stores snapshots but nothing charts them

## Goal

A MEDDIC panel in the deal sheet that shows auto-populated fields from meeting transcripts, a visual scoring matrix, and health trend charts — making deal qualification visible without manual entry.

## Success Criteria

- [ ] MEDDIC tab or section in DealDetailsModal / DealIntelligenceSheet
- [ ] 7 MEDDIC fields displayed with auto-populated data from transcript extraction
- [ ] Visual scoring matrix (0-4 per field) with colour coding
- [ ] Overall MEDDIC score with deal health assessment (Critical/At Risk/Healthy/Strong)
- [ ] Health trend sparkline from deal_health_history snapshots
- [ ] Editable fields — reps can correct or supplement AI-extracted data
- [ ] "Last updated from" indicator showing which meeting populated each field

## Stories

| ID | Title | Type | Est | Dependencies |
|----|-------|------|-----|-------------|
| MEDDIC-001 | Create MEDDICPanel component with 7-field layout | frontend | 2.5h | — |
| MEDDIC-002 | Build MEDDIC scoring matrix visualisation (0-4 scale, colour-coded) | frontend | 2h | MEDDIC-001 |
| MEDDIC-003 | Add health trend sparkline from deal_health_history | frontend | 1.5h | — |
| MEDDIC-004 | Wire auto-populated data from transcript extraction | frontend + backend | 2h | MEDDIC-001 |
| MEDDIC-005 | Add inline editing for MEDDIC fields with save to DB | frontend + backend | 2h | MEDDIC-001 |
| MEDDIC-006 | Integrate MEDDICPanel into DealIntelligenceSheet | frontend | 1h | MEDDIC-001 |
| MEDDIC-007 | Create meddic_scores table and RPC for storage/retrieval | backend | 1.5h | — |

## Technical Notes

- MEDDIC fields: Metrics, Economic Buyer, Decision Criteria, Decision Process, Identify Pain, Champion, Competition
- Scoring matrix (from `meddicc-guide.md`): 0=Unknown, 1=Identified, 2=Developing, 3=Confirmed, 4=Locked
- Deal health ranges: 0-7 Critical, 8-14 At Risk, 15-21 Healthy, 22-28 Strong
- `meeting-digest-truth-extractor` skill already extracts MEDDIC deltas — need to persist them
- `deal_health_scores` table has: overall_health_score, health_status, risk_level, component scores, risk_factors, predicted_close_probability
- `deal_health_history` table has snapshots for trend charts — query with `deal_id` ordered by `snapshot_at`
- `DealIntelligenceSheet.tsx` (956 lines) is the natural home — add MEDDIC as a tab or section
- `DealIntelligenceResponse.tsx` (336 lines) can link to MEDDIC panel from copilot responses
- Colour coding: 0=grey, 1=red, 2=amber, 3=green, 4=blue (locked)
- Consider storing MEDDIC scores in a `meddic_scores` table: deal_id, field, score (0-4), evidence (text), source_meeting_id, updated_at, updated_by (user or AI)
