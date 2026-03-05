# PRD-120: Follow-Up Draft Review & Scheduling

**Priority:** Tier 2 — High-Impact Quick Win
**Current Score:** 3 (ALPHA) — generation + sending work, no draft management UI
**Target Score:** 4 (BETA)
**Estimated Effort:** 8-10 hours
**Dependencies:** None

---

## Problem

Follow-up email generation is strong — `generate-follow-up` (890 lines) produces contextual emails with SSE streaming, buying signal extraction, and tone adaptation. `hitl-send-followup-email` (832 lines) handles approval and sending with daily caps. `email-send-as-rep` (330 lines) sends via Gmail.

But the flow from generation to sending has gaps:
1. **No draft management** — generated follow-ups go to Slack for approval, no in-app draft inbox
2. **No editing before send** — HITL is approve/reject only, no inline editing
3. **No scheduled send** — can't queue emails for optimal send times
4. **No draft history** — rejected or expired drafts vanish with no record
5. **No in-app approval flow** — everything goes through Slack, missing users who don't check Slack

## Goal

An in-app follow-up draft inbox where users can review, edit, schedule, and send AI-generated follow-ups.

## Success Criteria

- [ ] Follow-up drafts inbox showing all pending AI-generated emails
- [ ] Inline editing with rich text (preserve AI-generated formatting)
- [ ] Schedule send with date/time picker and "optimal time" suggestion
- [ ] Draft history with status (sent, edited, rejected, expired)
- [ ] Meeting context sidebar (which meeting generated this follow-up)
- [ ] Batch approve/reject for multiple drafts

## Stories

| ID | Title | Type | Est | Dependencies |
|----|-------|------|-----|-------------|
| FU-001 | Create FollowUpDraftsPage with pending drafts list | frontend | 2h | — |
| FU-002 | Build draft editor with inline rich text editing | frontend | 2h | FU-001 |
| FU-003 | Add schedule send with date/time picker | frontend + backend | 1.5h | FU-001 |
| FU-004 | Build draft history timeline with status badges | frontend | 1.5h | FU-001 |
| FU-005 | Add meeting context sidebar for each draft | frontend | 1h | FU-001 |
| FU-006 | Wire batch approve/reject actions | frontend | 1h | FU-001 |
| FU-007 | Create scheduled_emails table and send-scheduled-emails cron | backend | 1.5h | — |

## Technical Notes

- `generate-follow-up` (890 lines) stores generated emails — check if they persist in a table or are Slack-only
- `hitl-send-followup-email` (832 lines) handles the send callback — extend for in-app approval
- `email-send-as-rep` (330 lines) does the actual Gmail send — reuse for scheduled sends
- `EmailComposerEnhanced.tsx` (32,592 lines) exists — extract/reuse editor component for draft editing
- Daily send cap in `hitl-send-followup-email` — honour same cap for scheduled sends
- Scheduled emails: `scheduled_emails` table (org_id, user_id, to, subject, body, scheduled_at, status, meeting_id)
- Cron: `send-scheduled-emails` runs every 5 minutes, picks up emails where `scheduled_at <= now()` and `status = 'pending'`
- "Optimal time" suggestion: use historical reply data from `sequence_jobs` to find best send windows
- Draft states: pending → editing → approved → scheduled → sent | rejected | expired
