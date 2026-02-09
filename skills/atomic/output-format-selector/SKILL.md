---
name: Output Format Selector
description: |
  Internal system skill that selects the optimal structured response format from 48 available types.
  Automatically consulted when the copilot needs to determine the best UI panel to display.
  Not typically triggered directly by users. Matches intent to response type based on
  available data and query patterns.
metadata:
  author: sixty-ai
  version: "2"
  category: output-format
  skill_type: atomic
  is_active: true
  triggers:
    - pattern: "format response"
      intent: "format_selection"
      confidence: 0.75
      examples:
        - "show as a table"
        - "format this differently"
        - "change the display format"
    - pattern: "show results as"
      intent: "display_preference"
      confidence: 0.75
      examples:
        - "show results as cards"
        - "display this as a list"
        - "switch to chart view"
  keywords:
    - "format"
    - "display"
    - "show as"
    - "view"
    - "layout"
    - "response type"
  required_context:
    - user_intent
    - available_data
  inputs:
    - name: user_intent
      type: string
      description: "The detected user intent or query pattern to match against response types"
      required: true
    - name: available_data
      type: object
      description: "Object describing which data types are available (meetings, deals, contacts, etc.)"
      required: true
    - name: is_write_operation
      type: boolean
      description: "Whether the operation involves creating or updating data"
      required: false
      default: false
  outputs:
    - name: response_type
      type: string
      description: "The recommended CopilotResponseType from 48 available types"
    - name: response_config
      type: object
      description: "Configuration object with confidence, reasoning, required data, and preview mode flag"
  requires_capabilities: []
  priority: system
  tags:
    - system
    - output-format
    - ui-optimization
---

# Output Format Selector SKILL

## Goal
Select the optimal **structured response format** from the 48 available types based on user intent and available data.

## Response Type Decision Matrix

### Meeting-Related Queries
| Intent Pattern | Response Type | Key Data Required |
|----------------|---------------|-------------------|
| "What meetings today/tomorrow" | `meeting_list` | calendar_events |
| "How many meetings this week" | `meeting_count` | calendar_events count |
| "Prep for next meeting" | `next_meeting_command_center` | meeting + contact + deal |
| "Meeting briefing for X" | `meeting_briefing` | meeting + context |
| "What's on my calendar" | `calendar` | calendar_events + availability |
| "Time analysis/breakdown" | `time_breakdown` | meeting hours by type |

### Pipeline-Related Queries
| Intent Pattern | Response Type | Key Data Required |
|----------------|---------------|-------------------|
| "Which deals need attention" | `pipeline_focus_tasks` | deals + activity staleness |
| "Pipeline health/status" | `pipeline` | deals with health metrics |
| "Deal rescue/at-risk" | `deal_rescue_pack` | at-risk deals + rescue plan |
| "Deal forecast" | `pipeline_forecast` | weighted pipeline |
| "Stage analysis" | `stage_analysis` | conversion rates by stage |
| "Deal health check" | `deal_health` | health scores + risk factors |
| "Deal slippage alerts" | `deal_slippage_guardrails` | slipping deals + actions |

### Email-Related Queries
| Intent Pattern | Response Type | Key Data Required |
|----------------|---------------|-------------------|
| "Draft email/follow-up" | `email` | contact + context |
| "Email inbox triage" | `followup_zero_inbox` | email threads needing reply |
| "Post-meeting follow-up" | `post_meeting_followup_pack` | meeting + transcript + drafts |

### Daily Briefings
| Intent Pattern | Response Type | Key Data Required |
|----------------|---------------|-------------------|
| "Catch me up" | `daily_brief` | schedule + deals + tasks |
| "What should I focus on" | `daily_focus_plan` | priorities + tasks |

### Contact & Relationship Queries
| Intent Pattern | Response Type | Key Data Required |
|----------------|---------------|-------------------|
| "Tell me about X (person)" | `contact` | contact + deals + activities |
| "Contact relationship status" | `contact_relationship` | relationship strength |
| "Communication history" | `communication_history` | emails + calls + meetings |
| "Company intelligence" | `company_intelligence` | company + contacts + deals |

### Task & Activity Queries
| Intent Pattern | Response Type | Key Data Required |
|----------------|---------------|-------------------|
| "What tasks are due" | `task` | tasks with due dates |
| "Create a task" | `task_creation` | task details + contact |
| "Log an activity" | `activity_creation` | activity type + contact |
| "Activity breakdown" | `activity_breakdown` | activities by type |

### Analytics & Insights
| Intent Pattern | Response Type | Key Data Required |
|----------------|---------------|-------------------|
| "Performance review" | `sales_coach` | metrics comparison |
| "Goal tracking" | `goal_tracking` | goals + progress |
| "Trend analysis" | `trend_analysis` | metric trends |
| "Team comparison" | `team_comparison` | user vs team metrics |
| "Data quality check" | `data_quality` | missing fields, duplicates |

### Write Operations
| Intent Pattern | Response Type | Notes |
|----------------|---------------|-------|
| Any create/update/delete | `action_summary` | After successful write |
| Multiple entity selection | `contact_selection` | When disambiguation needed |
| Proposal linking | `proposal_selection` | When linking task to proposal |

## Response Selection Rules

### Priority Order
1. **Deterministic V1 sequences take precedence** - If V1 router matches, use sequence response type
2. **Entity presence determines format** - Contact query with full data -> `contact`
3. **Time awareness** - Morning (before 12pm): `daily_brief` shows today focus
4. **Preview for writes** - All write operations use `is_simulation: true` first
5. **Fallback to text** - Unknown patterns use text with action links

## Sequence to Response Type Mapping
| Sequence Key | Response Type |
|--------------|---------------|
| `seq-next-meeting-command-center` | `next_meeting_command_center` |
| `seq-post-meeting-followup-pack` | `post_meeting_followup_pack` |
| `seq-pipeline-focus-tasks` | `pipeline_focus_tasks` |
| `seq-deal-rescue-pack` | `deal_rescue_pack` |
| `seq-deal-map-builder` | `deal_map_builder` |
| `seq-daily-focus-plan` | `daily_focus_plan` |
| `seq-followup-zero-inbox` | `followup_zero_inbox` |
| `seq-deal-slippage-guardrails` | `deal_slippage_guardrails` |
| `seq-catch-me-up` | `daily_brief` |

## Action Vocabulary
All responses must use these standard actions via `onActionClick`:
- `open_contact` - Navigate to contact detail page
- `open_deal` - Navigate to deal detail page
- `open_meeting` - Navigate to meeting detail page
- `open_task` - Navigate to task detail page
- `open_external_url` - Open URL in new tab

## Output Contract
```typescript
interface SkillResult {
  status: "success" | "partial" | "failed";
  summary: string;
  data: {
    recommended_type: CopilotResponseType;
    confidence: number; // 0-100
    reasoning: string;
    required_data: string[];
    preview_mode: boolean; // true for write operations
  };
}
```

## Usage
This skill should be consulted when:
1. `detectAndStructureResponse()` cannot determine format from keywords
2. A sequence completes and needs to determine output format
3. Multiple response types could apply (disambiguation)
