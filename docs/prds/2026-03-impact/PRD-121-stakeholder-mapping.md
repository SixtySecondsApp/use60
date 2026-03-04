# PRD-121: Stakeholder Mapping & Buying Committee

**Priority:** Tier 2 — High-Impact Quick Win
**Current Score:** 1 (SPEC ONLY) — basic contact roles exist, no hierarchy or mapping
**Target Score:** 3 (ALPHA)
**Estimated Effort:** 15-20 hours
**Dependencies:** None

---

## Problem

Enterprise deals involve multiple stakeholders — economic buyers, champions, technical evaluators, blockers. 60 tracks contacts per deal but with minimal structure:
- `ContactRoles.tsx` lists contact roles but no hierarchy
- Single `is_decision_maker` boolean flag — far too simple
- No organisational chart visualisation
- No buying committee tracking per deal
- No influence/sentiment scoring per stakeholder

MEDDIC methodology (PRD-113) requires tracking Economic Buyer, Champion, and Decision Process — but there's no place to map these stakeholders visually.

## Goal

A stakeholder mapping component in the deal sheet that visualises the buying committee with roles, influence levels, sentiment, and engagement status.

## Success Criteria

- [ ] Stakeholder map in DealDetailsModal showing buying committee members
- [ ] Role assignment per contact (Economic Buyer, Champion, Technical Evaluator, End User, Blocker, Coach)
- [ ] Influence level indicator (high/medium/low) per stakeholder
- [ ] Engagement status badges (active, warming, cold, unknown)
- [ ] Auto-populate from meeting attendees and transcript extraction
- [ ] Visual org chart layout (optional tree or bubble view)

## Stories

| ID | Title | Type | Est | Dependencies |
|----|-------|------|-----|-------------|
| STAKE-001 | Create deal_stakeholders table with role, influence, sentiment columns | backend | 2h | — |
| STAKE-002 | Build StakeholderMapPanel component for DealDetailsModal | frontend | 3h | STAKE-001 |
| STAKE-003 | Add role picker and influence selector per contact | frontend | 1.5h | STAKE-002 |
| STAKE-004 | Build engagement status calculation from activity data | backend | 2h | STAKE-001 |
| STAKE-005 | Add auto-populate from meeting attendees | backend | 2h | STAKE-001 |
| STAKE-006 | Build visual org chart layout (D3 tree or bubble view) | frontend | 3h | STAKE-002 |
| STAKE-007 | Wire transcript extraction for stakeholder role detection | backend | 2h | STAKE-001 |
| STAKE-008 | Add stakeholder summary card in deal sheet sidebar | frontend | 1.5h | STAKE-002 |

## Technical Notes

- `deal_stakeholders` table: deal_id, contact_id, role (enum), influence (high/medium/low), sentiment_score, engagement_status, notes, auto_detected, source_meeting_id
- Roles enum: economic_buyer, champion, technical_evaluator, end_user, blocker, coach, influencer, legal, procurement
- `meeting-digest-truth-extractor` skill already extracts stakeholder data from transcripts — wire into auto-population
- MEDDIC integration: Economic Buyer maps to `economic_buyer` role, Champion maps to `champion` role
- Engagement status: calculated from `days_since_last_contact`, `meeting_count`, `email_count` per stakeholder
- Auto-populate: when a new meeting attendee appears, create a `deal_stakeholders` entry with role=unknown
- D3 tree layout: consider `react-d3-tree` for org chart rendering — lightweight and interactive
- `ContactRoles.tsx` can be extended or replaced with the new StakeholderMapPanel
