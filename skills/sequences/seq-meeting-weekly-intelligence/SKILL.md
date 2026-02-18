---
name: Meeting Weekly Intelligence
description: |
  Comprehensive weekly meeting intelligence pack that combines weekly review, objection
  tracking, competitive intel, and action accountability into a single briefing.
  Use when a user asks "weekly meeting intelligence", "full meeting recap for the week",
  "meeting intelligence briefing", "complete weekly meeting report", or wants a
  comprehensive weekly analysis of all meeting-related intelligence.
  Orchestrates 4 atomic skills into a unified briefing with executive summary.
metadata:
  author: sixty-ai
  version: "2"
  category: agent-sequence
  skill_type: sequence
  is_active: true
  triggers:
    - pattern: "weekly meeting intelligence"
      intent: "weekly_intelligence"
      confidence: 0.92
      examples:
        - "meeting intelligence report"
        - "full meeting intelligence pack"
        - "weekly meeting intel"
    - pattern: "full meeting recap for the week"
      intent: "full_weekly_recap"
      confidence: 0.88
      examples:
        - "complete meeting recap"
        - "comprehensive meeting review"
        - "everything about my meetings this week"
    - pattern: "meeting intelligence briefing"
      intent: "intelligence_briefing"
      confidence: 0.85
      examples:
        - "meeting briefing for the week"
        - "weekly intelligence pack"
        - "give me a meeting intelligence briefing"
  keywords:
    - "intelligence"
    - "briefing"
    - "comprehensive"
    - "weekly"
    - "complete"
    - "full recap"
    - "meeting report"
    - "meeting pack"
  required_context:
    - user_id
  outputs:
    - executive_summary
    - weekly_review
    - objections
    - competitive_intel
    - action_items
    - top_actions
  requires_capabilities:
    - calendar
    - crm
    - tasks
  priority: high
  linked_skills:
    - meeting-weekly-review
    - meeting-objection-tracker
    - meeting-competitive-intel
    - meeting-action-accountability
  workflow:
    - order: 1
      action: get_meetings_for_period
      input_mapping:
        period: "this_week"
        includeContext: true
      output_key: meetings_data
      on_failure: stop
    - order: 2
      skill_key: meeting-weekly-review
      input_mapping:
        period: "this_week"
        include_trends: true
        include_alerts: true
      output_key: weekly_review
      on_failure: continue
    - order: 3
      skill_key: meeting-objection-tracker
      input_mapping:
        period: "this_week"
        category_filter: "all"
      output_key: objections
      on_failure: continue
    - order: 4
      skill_key: meeting-competitive-intel
      input_mapping:
        period: "this_week"
        include_battle_cards: false
      output_key: competitive_intel
      on_failure: continue
    - order: 5
      skill_key: meeting-action-accountability
      input_mapping:
        period: "this_week"
        status_filter: "all"
        group_by: "priority"
      output_key: action_items
      on_failure: continue
  tags:
    - agent-sequence
    - meetings
    - intelligence
    - weekly-review
    - comprehensive
---

## Available Context
@_platform-references/org-variables.md

# Meeting Weekly Intelligence

This sequence orchestrates a comprehensive weekly meeting intelligence briefing by combining four atomic skills:

1. **Weekly Review** (meeting-weekly-review): Aggregate stats, highlights, concerns, deal impact, and trends
2. **Objection Tracker** (meeting-objection-tracker): Objection patterns, frequency, and suggested responses
3. **Competitive Intel** (meeting-competitive-intel): Competitor mentions, positioning signals, and battle card updates
4. **Action Accountability** (meeting-action-accountability): Outstanding commitments, overdue items, and follow-up suggestions

## Execution Flow

### Step 1: Load Meeting Context
Fetch all meetings for the week to establish the scope and share context across skills.

### Step 2: Weekly Review
Run `meeting-weekly-review` to produce the performance overview: meeting count, total hours, sentiment, performance scores, highlights, concerns, deal impact, and week-over-week trends.

### Step 3: Objection Tracking
Run `meeting-objection-tracker` to extract and categorize objections from the week's meetings, identify patterns, and generate response recommendations.

### Step 4: Competitive Intelligence
Run `meeting-competitive-intel` to find competitor mentions, analyze prospect sentiment toward competitors, and identify positioning signals.

### Step 5: Action Accountability
Run `meeting-action-accountability` to aggregate all action items, flag overdue commitments, and suggest follow-ups.

## Executive Summary Generation

After all four skills complete, synthesize an executive summary:

1. **One-line headline**: "This week: [N] meetings, [sentiment direction], [key highlight or concern]"
2. **Key metrics**: Meeting count, total hours, avg sentiment, completion rate
3. **Top insight from each section**:
   - Weekly Review: Most notable trend or highlight
   - Objections: Most common objection and whether it's new or recurring
   - Competitive: Most mentioned competitor and key positioning signal
   - Actions: Number of overdue items and highest-priority follow-up
4. **Top 3 recommended actions**: The three most important things to do this coming week, drawn from across all four sections, prioritized by deal impact

## Output Contract

Return a SkillResult with:

- `data.executive_summary`: String with 3-5 sentence synthesis of the week
- `data.weekly_review`: Full output from meeting-weekly-review skill
- `data.objections`: Full output from meeting-objection-tracker skill
- `data.competitive_intel`: Full output from meeting-competitive-intel skill
- `data.action_items`: Full output from meeting-action-accountability skill
- `data.top_actions`: Array of the 3 most important recommended actions:
  - `action`: What to do
  - `reason`: Why (from which skill's analysis)
  - `priority`: critical | high
  - `source_section`: Which skill surfaced this (weekly_review | objections | competitive | actions)
  - `related_deal`: Deal name if applicable

## Partial Failure Handling

Each skill step has `on_failure: continue`, meaning the sequence completes even if individual skills fail:
- If weekly review fails: Skip the stats section, note it as unavailable
- If objection tracker fails: Skip the objection section, note it as unavailable
- If competitive intel fails: Skip the competitive section, note it as unavailable
- If action accountability fails: Skip the action items section, note it as unavailable

The executive summary adapts to include only the sections that succeeded. The briefing is still valuable even with partial data.

## Guidelines

- Keep the executive summary under 5 sentences. It should be readable in 15 seconds.
- Top 3 recommended actions should be specific, not generic. "Follow up with Acme Corp on the pricing proposal that was due Tuesday" not "Follow up on outstanding items."
- Indicate which sections have data and which don't. "Competitive: No competitor mentions this week" is better than silently omitting the section.
- When the week had very few meetings (1-2), note that pattern-based sections (objections, competitive) have limited data and may not show meaningful patterns.
- This briefing is designed for Friday end-of-week review or Monday morning planning. Adapt the recommendations to whichever timing context applies.
