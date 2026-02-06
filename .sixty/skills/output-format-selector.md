---
skill_key: output-format-selector
category: output-format
kind: planner
version: 1.0.0
triggers:
  - any_copilot_response
requires_capabilities: []
description: Select the optimal structured response format based on user intent and available context
---

# Output Format Selector SKILL

Given user intent and available data, this skill helps the agent select the optimal structured response format from the 48 available types.

## Response Type Decision Matrix

### Meeting-Related Queries

| Intent Pattern | Response Type | Key Data Required | Example Prompt |
|----------------|---------------|-------------------|----------------|
| "What meetings today/tomorrow" | `meeting_list` | calendar_events | "What meetings do I have today?" |
| "How many meetings this week" | `meeting_count` | calendar_events count | "How many calls this week?" |
| "Prep for next meeting" | `next_meeting_command_center` | meeting + contact + deal | "Prep me for my next meeting" |
| "Meeting briefing for X" | `meeting_briefing` | meeting + context | "Brief me on the Acme call" |
| "What's on my calendar" | `calendar` | calendar_events + availability | "When am I free tomorrow?" |
| "Time analysis/breakdown" | `time_breakdown` | meeting hours by type | "How much time in meetings this week?" |

### Pipeline-Related Queries

| Intent Pattern | Response Type | Key Data Required | Example Prompt |
|----------------|---------------|-------------------|----------------|
| "Which deals need attention" | `pipeline_focus_tasks` | deals + activity staleness | "What deals should I focus on?" |
| "Pipeline health/status" | `pipeline` | deals with health metrics | "How's my pipeline looking?" |
| "Deal rescue/at-risk" | `deal_rescue_pack` | at-risk deals + rescue plan | "Help me save the Acme deal" |
| "Deal forecast" | `pipeline_forecast` | weighted pipeline | "What's my forecast this quarter?" |
| "Stage analysis" | `stage_analysis` | conversion rates by stage | "Where are deals getting stuck?" |
| "Deal health check" | `deal_health` | health scores + risk factors | "Which deals are at risk?" |
| "Deal slippage alerts" | `deal_slippage_guardrails` | slipping deals + actions | "What deals are slipping?" |

### Email-Related Queries

| Intent Pattern | Response Type | Key Data Required | Example Prompt |
|----------------|---------------|-------------------|----------------|
| "Draft email/follow-up" | `email` | contact + context | "Draft a follow-up to Sarah" |
| "Email inbox triage" | `followup_zero_inbox` | email threads needing reply | "What emails need a reply?" |
| "Post-meeting follow-up" | `post_meeting_followup_pack` | meeting + transcript + drafts | "Create follow-ups for my last meeting" |

### Daily Briefings

| Intent Pattern | Response Type | Key Data Required | Example Prompt |
|----------------|---------------|-------------------|----------------|
| "Catch me up" | `daily_brief` | schedule + deals + tasks | "Catch me up" / "What did I miss?" |
| "What should I focus on" | `daily_focus_plan` | priorities + tasks | "What's my priority today?" |

### Contact & Relationship Queries

| Intent Pattern | Response Type | Key Data Required | Example Prompt |
|----------------|---------------|-------------------|----------------|
| "Tell me about X (person)" | `contact` | contact + deals + activities | "Tell me about Sarah Chen" |
| "Contact relationship status" | `contact_relationship` | relationship strength | "How's my relationship with Acme?" |
| "Communication history" | `communication_history` | emails + calls + meetings | "What's my history with John?" |
| "Company intelligence" | `company_intelligence` | company + contacts + deals | "Tell me about Acme Corp" |

### Task & Activity Queries

| Intent Pattern | Response Type | Key Data Required | Example Prompt |
|----------------|---------------|-------------------|----------------|
| "What tasks are due" | `task` | tasks with due dates | "What tasks do I have?" |
| "Create a task" | `task_creation` | task details + contact | "Create a follow-up task for Sarah" |
| "Log an activity" | `activity_creation` | activity type + contact | "Log a call with John" |
| "Activity breakdown" | `activity_breakdown` | activities by type | "How many calls did I make this week?" |

### Analytics & Insights

| Intent Pattern | Response Type | Key Data Required | Example Prompt |
|----------------|---------------|-------------------|----------------|
| "Performance review" | `sales_coach` | metrics comparison | "How am I doing vs last month?" |
| "Goal tracking" | `goal_tracking` | goals + progress | "Am I on track for quota?" |
| "Trend analysis" | `trend_analysis` | metric trends | "What's the trend for my close rate?" |
| "Team comparison" | `team_comparison` | user vs team metrics | "How do I compare to the team?" |
| "Data quality check" | `data_quality` | missing fields, duplicates | "Are there data issues I should fix?" |

### Write Operations (Always Preview)

| Intent Pattern | Response Type | Notes |
|----------------|---------------|-------|
| Any create/update/delete | `action_summary` | After successful write |
| Multiple entity selection | `contact_selection` | When disambiguation needed |
| Proposal linking | `proposal_selection` | When linking task to proposal |

---

## Response Selection Rules

### Priority Order

1. **Deterministic V1 sequences take precedence**
   - If V1 router matches, use the sequence's response type
   - Examples: "prep for next meeting" → `next_meeting_command_center`

2. **Entity presence determines format**
   - Contact query with full data → `contact`
   - Deal query with full data → `deal_health` or `pipeline`

3. **Time awareness**
   - Morning (before 12pm): `daily_brief` shows today's focus
   - Afternoon (12pm-5pm): Include progress + remaining items
   - Evening (after 5pm): Wrap-up + tomorrow preview

4. **Preview for writes**
   - All write operations use `is_simulation: true` first
   - Store `pending_action` for confirmation flow

5. **Fallback to text**
   - Unknown patterns use text with action links
   - Include suggested follow-up prompts

---

## Sequence → Response Type Mapping

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

---

## Action Vocabulary

All responses must use these standard actions via `onActionClick`:

### In-App Navigation
- `open_contact` - Navigate to contact detail page
- `open_deal` - Navigate to deal detail page
- `open_meeting` - Navigate to meeting detail page
- `open_task` - Navigate to task detail page

### External Links
- `open_external_url` - Open URL in new tab (meeting links, etc.)

### Legacy Aliases (Backwards Compatible)
- `open_meeting_url` → `open_external_url`
- `view_meeting` → `open_meeting`
- `view_task` → `open_task`
- `open_search_result` → route by entity type

---

## Output Contract

Every structured response MUST include:

```typescript
interface StructuredResponse {
  type: string;           // One of the 48 defined types
  summary: string;        // <100 words introduction
  data: ResponseData;     // Type-specific structured data
  actions: QuickAction[]; // Clickable actions using standard vocabulary
  metadata?: {
    timeGenerated: string;
    dataSource: string[];
    confidence?: number;  // 0-100
    warning?: string;
    timezone?: string;
  };
}

interface QuickAction {
  id: string;
  label: string;
  type: 'primary' | 'secondary' | 'tertiary';
  icon?: string;
  callback: string;  // Action name from vocabulary
  params?: Record<string, any>;
}
```

---

## Fallback Behavior

When no structured response type matches:

1. Return plain text response
2. Include inline entity links where detected
3. Suggest follow-up prompts that would trigger structured responses
4. Log the unmatched pattern for future improvement

---

## Version History

| Version | Date | Changes |
|---------|------|---------|
| 1.0.0 | 2026-01-24 | Initial version with 48 response types |
