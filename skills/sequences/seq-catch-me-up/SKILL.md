---
name: Catch Me Up
description: |
  Generate an adaptive daily briefing based on time of day: morning focus, afternoon progress, evening wrap-up.
metadata:
  author: sixty-ai
  version: "1"
  category: agent-sequence
  skill_type: sequence
  is_active: true
  triggers:
    - pattern: "user_request"
  requires_capabilities:
    - calendar
    - crm
    - tasks
  requires_context: []
  outputs:
    - daily_brief
  priority: high
  structured_response_type: daily_brief
  workflow:
    - order: 1
      action: get_meetings_for_period
      input_mapping:
        period: today
      output_key: meetings_today
      on_failure: continue
    - order: 2
      action: get_meetings_for_period
      input_mapping:
        period: tomorrow
      output_key: meetings_tomorrow
      on_failure: continue
    - order: 3
      action: get_pipeline_deals
      input_mapping:
        filter: stale
        limit: 5
      output_key: stale_deals
      on_failure: continue
    - order: 4
      action: get_pipeline_deals
      input_mapping:
        filter: closing_soon
        limit: 5
      output_key: closing_soon_deals
      on_failure: continue
    - order: 5
      action: get_contacts_needing_attention
      input_mapping:
        days_since_contact: 7
        limit: 10
      output_key: contacts_needing_attention
      on_failure: continue
    - order: 6
      action: list_tasks
      input_mapping:
        filter: pending
        limit: 10
      output_key: pending_tasks
      on_failure: continue
    - order: 7
      skill_key: daily-brief-planner
      input_mapping:
        meetings_today: "${outputs.meetings_today}"
        meetings_tomorrow: "${outputs.meetings_tomorrow}"
        stale_deals: "${outputs.stale_deals}"
        closing_soon_deals: "${outputs.closing_soon_deals}"
        contacts_needing_attention: "${outputs.contacts_needing_attention}"
        pending_tasks: "${outputs.pending_tasks}"
        time_of_day: "${context.time_of_day}"
      output_key: daily_brief
      on_failure: stop
  linked_skills:
    - daily-brief-planner
---

# Catch Me Up

This sequence generates an adaptive daily briefing:
1. Fetches today's meetings
2. Fetches tomorrow's meetings (for evening preview)
3. Gets stale deals needing attention
4. Gets deals closing soon
5. Gets contacts needing follow-up
6. Gets pending tasks
7. Runs daily-brief-planner skill to generate time-aware summary

Adapts based on time of day:
- **Morning**: Today's schedule and priorities
- **Afternoon**: Today's progress and remaining items
- **Evening**: Wrap-up + tomorrow preview
