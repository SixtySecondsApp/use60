---
name: Daily Brief Planner
description: |
  Generate a time-aware daily briefing: morning focus, afternoon progress, evening wrap-up.
metadata:
  author: sixty-ai
  version: "1"
  category: sales-ai
  skill_type: atomic
  is_active: true
  triggers:
    - pattern: user_request
  required_context:
    - meetings
    - deals
    - contacts
    - tasks
    - time_of_day
  outputs:
    - daily_brief
  requires_capabilities:
    - calendar
    - crm
    - tasks
  priority: high
  tags:
    - sales-ai
    - daily-briefing
    - productivity
---

# Daily Brief Planner

## Goal
Generate a **time-aware daily briefing** that adapts to the time of day.

## Time-Aware Modes
- **Morning (before 12pm)**: Focus on today's schedule, key meetings, and top priorities
- **Afternoon (12pm-5pm)**: Include today's progress, completed items, and remaining priorities
- **Evening (after 5pm)**: Wrap-up summary of the day + preview of tomorrow

## Inputs
- `meetings`: from `execute_action("get_meetings_for_period", { period: "today" })` and optionally tomorrow
- `deals`: from `execute_action("get_pipeline_deals", { filter: "stale" })` or `{ filter: "closing_soon" }`
- `contacts`: from `execute_action("get_contacts_needing_attention", { days_since_contact: 7 })`
- `tasks`: from `execute_action("list_tasks", { filter: "today" })`
- `time_of_day`: "morning" | "afternoon" | "evening" (from sequence context)

## Output Contract
Return a SkillResult with `data.daily_brief`:
- `greeting`: string (time-appropriate, e.g., "Good morning!" / "Here's your afternoon update" / "Wrapping up the day")
- `time_of_day`: "morning" | "afternoon" | "evening"
- `schedule`: array of today's meetings with times, attendees, linked deals
- `priority_deals`: array of 3-5 deals needing attention (stale or closing soon)
- `contacts_needing_attention`: array of contacts to follow up with
- `tasks`: array of pending tasks for today
- `tomorrow_preview`: (evening only) array of tomorrow's key meetings/priorities
- `summary`: string (1-2 sentence summary of the day)

## Guidance
- Keep the briefing scannable (~30 seconds to read)
- Highlight the most important 3-5 items per section
- For evening, include what got done today + what's coming tomorrow
- Make items clickable where possible (meeting IDs, deal IDs, contact IDs)
