---
name: Meeting Command Center Plan
description: |
  Turn next-meeting context + brief into a concrete prep plan and a single prep task with checklist.
metadata:
  author: sixty-ai
  version: "1"
  category: sales-ai
  skill_type: atomic
  is_active: true
  triggers:
    - pattern: before_meeting
    - pattern: user_request
  required_context:
    - next_meeting
    - brief
  outputs:
    - prep_task
    - key_risks
    - talking_points
    - questions
  priority: high
  requires_capabilities:
    - calendar
    - crm
---

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
