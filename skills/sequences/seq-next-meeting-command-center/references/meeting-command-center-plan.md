# meeting-command-center-plan

> This reference is auto-populated from `skills/atomic/meeting-command-center-plan/SKILL.md`.
> Do not edit directly — edit the source skill and re-sync.


# Meeting Command Center Plan

## Goal
Given a next meeting object and a brief, create a concrete prep plan and a single task with a checklist.

## Inputs
- `next_meeting`: from execute_action(get_next_meeting)
- `brief`: from meeting-prep-brief

## Output Contract
Return:
- `data.prep_task`: { title, description, due_date, priority }
- `data.key_risks`: array
- `data.talking_points`: array
- `data.questions`: array

## Checklist Rules
- Checklist must be time-bound (what to do now vs 10 mins before)
- Include links when available (meetingUrl, CRM deal/contact URLs)
- Keep it short and demo-friendly
