# PRD-107: Internal Meeting Prep Surface

**Priority:** Tier 2 — High-Impact Quick Win
**Current Score:** 3 (ALPHA) — backend classifies and preps, no UI
**Target Score:** 4 (BETA)
**Estimated Effort:** 6-8 hours
**Dependencies:** None

---

## Problem

The Internal Meeting Prep agent classifies calendar events as internal (1:1, pipeline review, QBR, standup) using domain-based detection, then generates type-specific prep briefs. Manager pre-reads are included for team reviews. This is a unique differentiator — no competitor preps for internal meetings.

But the prep brief **only goes to Slack**. There's no in-app surface showing:
- What type of internal meeting this is
- The prep brief with relevant context
- Type-specific talking points and data
- Manager pre-read for team meetings

## Goal

Surface internal meeting prep in the Meeting Detail page and the upcoming meetings list, so users see prep context whether or not they check Slack.

## Success Criteria

- [ ] Meeting type badge on calendar events (1:1, Pipeline Review, QBR, Standup, External)
- [ ] Prep brief card in MeetingDetail page (shows type-specific context)
- [ ] Pipeline review prep includes weighted pipeline data and bottleneck alerts
- [ ] 1:1 prep includes rep performance context and recent coaching notes
- [ ] QBR prep includes account health summary
- [ ] "Internal" indicator in upcoming meetings list

## Stories

| ID | Title | Type | Est | Dependencies |
|----|-------|------|-----|-------------|
| IMP-UI-001 | Add meeting type badge to calendar events and meetings list | frontend | 1.5h | — |
| IMP-UI-002 | Create PrepBriefCard component for MeetingDetail page | frontend | 2h | — |
| IMP-UI-003 | Build pipeline review prep variant (weighted pipeline, bottlenecks) | frontend | 1.5h | IMP-UI-002 |
| IMP-UI-004 | Build 1:1 prep variant (rep performance, coaching notes) | frontend | 1.5h | IMP-UI-002 |
| IMP-UI-005 | Build QBR prep variant (account health summary) | frontend | 1h | IMP-UI-002 |
| IMP-UI-006 | Create RPC to fetch prep brief for a calendar event | backend | 1h | — |

## Technical Notes

- `calendar_events` already has `meeting_type` and `is_internal` columns (IMP-001 migration)
- `proactive-meeting-prep` generates the brief — need to store it (or generate on-demand)
- Type templates in `_shared/orchestrator/adapters/internalPrepTemplates.ts` (731 lines)
- Meeting type classifier in `_shared/orchestrator/adapters/meetingTypeClassifier.ts`
- Consider caching the prep brief in a `meeting_prep_briefs` table to avoid re-generation
