---
name: Daily Brief Planner
description: |
  Generate a time-aware daily briefing that adapts to morning, afternoon, or evening.
  Use when a user asks "catch me up", "what's happening today", "give me my daily brief",
  or wants a summary of their schedule, deals, and tasks for the day.
  Returns a scannable briefing with schedule, priority deals, contacts, and tasks.
metadata:
  author: sixty-ai
  version: "2"
  category: sales-ai
  skill_type: atomic
  is_active: true
  triggers:
    - pattern: "daily briefing"
      intent: "daily_brief"
      confidence: 0.85
      examples:
        - "give me my daily briefing"
        - "daily briefing please"
        - "morning briefing"
    - pattern: "what's happening today"
      intent: "daily_summary"
      confidence: 0.85
      examples:
        - "what do I have today"
        - "what's going on today"
        - "today's summary"
    - pattern: "catch me up"
      intent: "catch_up"
      confidence: 0.80
      examples:
        - "catch me up on everything"
        - "give me the rundown"
        - "what did I miss"
    - pattern: "end of day summary"
      intent: "evening_wrap"
      confidence: 0.80
      examples:
        - "wrap up my day"
        - "evening summary"
        - "how did today go"
  keywords:
    - "briefing"
    - "today"
    - "summary"
    - "morning"
    - "afternoon"
    - "evening"
    - "schedule"
    - "rundown"
    - "catch up"
  required_context:
    - meetings
    - deals
    - contacts
    - tasks
    - time_of_day
  inputs:
    - name: date
      type: string
      description: "The date to generate the briefing for in ISO format"
      required: false
      default: "today"
      example: "2025-01-15"
    - name: time_of_day
      type: string
      description: "Time context that determines briefing mode (morning, afternoon, evening)"
      required: false
      example: "morning"
  outputs:
    - name: daily_brief
      type: object
      description: "Structured briefing with greeting, schedule, priority deals, contacts, tasks, and summary"
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
