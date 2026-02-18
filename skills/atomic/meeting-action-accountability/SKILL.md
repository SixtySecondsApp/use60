---
name: Meeting Action Accountability
description: |
  Track outstanding action items and commitments across all meetings. Use when a user
  asks "what action items are still open", "outstanding commitments", "what did we promise",
  "overdue action items", "meeting commitments tracker", "what's still pending from meetings",
  or wants to see the full picture of meeting-generated obligations. Aggregates action items
  across ALL meetings -- unlike meeting-digest-truth-extractor which handles a single meeting.
  Correlates with CRM tasks and follow-up status.
  Do NOT use for single-meeting digests or task management unrelated to meetings.
metadata:
  author: sixty-ai
  version: "2"
  category: sales-ai
  skill_type: atomic
  is_active: true
  context_profile: sales
  agent_affinity:
    - meetings
    - pipeline
  triggers:
    - pattern: "outstanding action items from meetings"
      intent: "meeting_action_items"
      confidence: 0.88
      examples:
        - "open action items from calls"
        - "pending meeting action items"
        - "action items across meetings"
    - pattern: "what did we promise"
      intent: "meeting_commitments"
      confidence: 0.85
      examples:
        - "what commitments did we make"
        - "promises from meetings"
        - "what did I commit to"
    - pattern: "meeting commitments tracker"
      intent: "commitment_tracking"
      confidence: 0.82
      examples:
        - "track meeting commitments"
        - "commitment status from meetings"
        - "meeting follow-through"
    - pattern: "overdue action items"
      intent: "overdue_actions"
      confidence: 0.85
      examples:
        - "overdue meeting tasks"
        - "late action items"
        - "what's overdue from meetings"
    - pattern: "what action items are still open"
      intent: "open_actions"
      confidence: 0.88
      examples:
        - "which action items haven't been done"
        - "incomplete tasks from meetings"
        - "what's still pending from calls"
  keywords:
    - "action items"
    - "commitments"
    - "promises"
    - "outstanding"
    - "overdue"
    - "pending"
    - "follow-up"
    - "accountability"
    - "tracker"
    - "open"
    - "completed"
  required_context:
    - user_id
  inputs:
    - name: period
      type: string
      description: "Time period to analyze: 'this_week', 'last_week', 'this_month', 'last_month', 'last_30_days', 'last_90_days'. Defaults to 'last_30_days'."
      required: false
      default: "last_30_days"
    - name: status_filter
      type: string
      description: "Filter by status: 'all', 'open', 'overdue', 'completed', 'at_risk'. Defaults to 'open'."
      required: false
      default: "open"
    - name: group_by
      type: string
      description: "How to group results: 'meeting', 'deal', 'assignee', 'priority'. Defaults to 'meeting'."
      required: false
      default: "meeting"
    - name: deal_id
      type: string
      description: "Optional deal ID to focus on action items related to a specific deal"
      required: false
  outputs:
    - name: action_dashboard
      type: object
      description: "Summary stats: total, completed, overdue, at-risk counts"
    - name: action_items
      type: array
      description: "All action items grouped by the specified grouping"
    - name: overdue_items
      type: array
      description: "Items past their deadline with days overdue"
    - name: commitment_split
      type: object
      description: "Commitments we made vs commitments they made"
    - name: suggested_followups
      type: array
      description: "Suggested follow-up actions for stale or at-risk items"
    - name: completion_rate
      type: object
      description: "Completion rate metrics and trend"
  requires_capabilities:
    - calendar
    - crm
    - tasks
  priority: high
  tags:
    - sales-ai
    - meetings
    - action-items
    - accountability
    - follow-up
---

## Available Context & Tools
@_platform-references/org-variables.md
@_platform-references/capabilities.md

# Meeting Action Accountability

## Why Action Item Tracking Across Meetings Matters

The gap between what was promised in a meeting and what actually gets done is where deals go to die.

- **63% of verbal commitments made in meetings are never documented** (Harvard Business Review). If they're not tracked, they don't get done.
- **Broken commitments are the #1 credibility killer in B2B sales** (Sandler Training). When you promise to send a proposal by Friday and it arrives on Wednesday of the following week, trust erodes instantly.
- **Prospects track YOUR commitments better than you do.** They may not say it, but when you walk into the next meeting without having done what you said you'd do, they notice.
- **Scattered action items across meetings create blind spots.** A rep may have 5 open commitments across 8 different meetings -- without aggregation, they're managing by memory (which fails).

This skill aggregates all action items and commitments from meeting transcripts and CRM tasks into a single accountability dashboard, highlighting what's done, what's pending, and what's at risk.

## Data Gathering (via execute_action)

1. **Fetch meetings for the period**: `execute_action("get_meetings_for_period", { period, includeContext: true })` -- all meetings with attendee and deal context
2. **Fetch CRM tasks**: `execute_action("list_tasks", { status: "open" })` -- all open tasks, then filter for those originating from meetings
3. **Fetch pipeline deals**: `execute_action("get_pipeline_deals", {})` -- correlate action items with deal context

Use the meeting analytics endpoints for transcript-sourced action items:

4. **Action items per transcript**: For each meeting with a transcript, use `/api/insights/{transcriptId}/action-items` to get extracted action items
5. **Key moments per transcript**: Use `/api/insights/{transcriptId}/key-moments` to find commitment moments
6. **Full insights**: Use `/api/insights/{transcriptId}` for complete meeting insights including commitment language
7. **Semantic search for commitments**: Use `/api/search` (POST) with queries:
   - "I will send I'll send we will provide"
   - "by Friday by end of week by next week deadline"
   - "follow up reach out circle back get back to you"
   - "promise commit deliver action item next step"
8. **Ask endpoint**: Use `/api/search/ask` (POST): "What commitments and action items were made across meetings?"

## Action Item Classification

### By Owner Side

**Seller commitments** (our team owes the prospect):
- "I'll send you the proposal by Friday"
- "We'll have the technical spec ready next week"
- "I'll introduce you to our solutions architect"
- "Let me get back to you on pricing options"
- "We'll schedule a demo for your engineering team"

**Buyer commitments** (the prospect owes us):
- "We'll review internally and get back to you"
- "I'll loop in our CTO for the next call"
- "We'll send over the requirements doc"
- "Let me check with procurement on budget"
- "I'll get you the security questionnaire"

### By Status

- **Completed**: Corresponding CRM task is marked done, or confirmed in a subsequent meeting
- **Open**: Active, not yet due
- **Overdue**: Past the stated or implied deadline
- **At-risk**: Not overdue yet, but approaching deadline with no progress indicators
- **Untracked**: Mentioned in a meeting but no corresponding CRM task exists (highest risk)

### By Priority

- **Critical**: Related to deal-advancing actions (sending proposals, scheduling demos with decision-makers)
- **High**: Time-sensitive commitments with explicit deadlines
- **Medium**: Important but without hard deadlines
- **Low**: Nice-to-have follow-ups

## Analysis Framework

### Action Item Dashboard

Provide a top-level summary:
```
Action Items from [Period]:
Total: 23 | Completed: 14 (61%) | Open: 5 | Overdue: 3 | At-Risk: 1
Seller Commitments: 15 | Buyer Commitments: 8
```

### Overdue Analysis

For each overdue item:
- What was promised
- When it was due
- How many days overdue
- Which meeting it came from
- Which deal it relates to
- Impact: What's at risk if this stays unresolved
- Suggested action: How to recover (send now, acknowledge delay, renegotiate timeline)

### Untracked Commitment Detection

Cross-reference meeting transcript action items against CRM tasks:
- If a commitment was made in a meeting but no corresponding task exists, flag it as "untracked"
- Suggest creating a task with pre-filled details

This is the highest-value detection: untracked commitments are the most likely to be forgotten.

### Completion Rate Tracking

Calculate completion rates:
- Overall: % of action items completed on time
- By seller vs. buyer: Who is more reliable?
- By deal: Are certain deals better tracked than others?
- Trend: Is completion rate improving or declining over time?

### Grouping Options

Support multiple grouping views:

**By Meeting**: All action items from each meeting, showing status and progress
**By Deal**: All action items related to each deal, across all meetings for that deal
**By Assignee**: All items assigned to each person (useful for managers)
**By Priority**: Critical items first, then high, medium, low

### Buyer Commitment Tracking

Track what the prospect committed to:
- Did they follow through?
- How long after the meeting did they deliver?
- Are there buyer commitments that are overdue? (This signals deal stall or deprioritization)

Buyer commitments that go unfulfilled are early warning signs of deal risk.

## Suggested Follow-Up Generation

For stale or at-risk items, generate follow-up suggestions:

**For overdue seller commitments**:
- Acknowledge the delay: "I apologize for the delay on [item]"
- Provide the deliverable or a revised timeline
- Add value: Include something extra to compensate for the delay

**For overdue buyer commitments**:
- Gentle reminder without being pushy: "Just following up on [item] from our last call"
- Provide a reason to respond: Attach new information or value
- Offer to simplify: "Would it help if I sent over a draft [item] for your review?"

**For untracked items**:
- Create the task with suggested due date
- Assign to the appropriate person
- Link to the source meeting

## Output Contract

Return a SkillResult with:

- `data.action_dashboard`: Object with summary stats:
  - `total`: Total action items found
  - `completed`: Count of completed items
  - `open`: Count of open items
  - `overdue`: Count of overdue items
  - `at_risk`: Count of at-risk items
  - `untracked`: Count of items from transcripts with no CRM task
  - `completion_rate`: Percentage completed on time
  - `seller_commitments_count`: Total seller commitments
  - `buyer_commitments_count`: Total buyer commitments

- `data.action_items`: Array of action item objects grouped by `group_by` param:
  - `group_key`: The grouping value (meeting title, deal name, assignee name, or priority level)
  - `items`: Array of action items, each with:
    - `description`: What was committed
    - `owner`: Person responsible (name, side: seller | buyer)
    - `source_meeting`: Meeting title and date
    - `deal`: Related deal name (if applicable)
    - `due_date`: Stated or inferred deadline
    - `status`: completed | open | overdue | at_risk | untracked
    - `days_overdue`: Number of days past due (if overdue)
    - `has_crm_task`: Whether a corresponding CRM task exists
    - `source_quote`: Verbatim quote from transcript where commitment was made
    - `priority`: critical | high | medium | low

- `data.overdue_items`: Array of overdue items (subset of action_items) with:
  - All fields from action items above
  - `impact`: What's at risk due to the delay
  - `recovery_suggestion`: How to address the delay

- `data.commitment_split`: Object with:
  - `seller`: Array of seller-side commitments with status
  - `buyer`: Array of buyer-side commitments with status
  - `seller_completion_rate`: Percentage of seller items completed on time
  - `buyer_completion_rate`: Percentage of buyer items completed on time

- `data.suggested_followups`: Array of follow-up objects:
  - `action_item`: The item needing follow-up
  - `suggested_action`: What to do (send email, create task, schedule meeting)
  - `draft_message`: Suggested follow-up message text
  - `priority`: How urgent this follow-up is
  - `deal_impact`: How this affects the deal

- `data.completion_rate`: Object with:
  - `current_period`: Rate for the analyzed period
  - `previous_period`: Rate for the prior period (for trend)
  - `trend`: improving | declining | stable
  - `by_deal`: Completion rates per deal

- `references`: Links to meetings, deals, tasks, and transcripts cited

## Quality Checklist

Before returning the analysis, verify:

- [ ] **Every action item has an owner.** "We'll send the proposal" is ambiguous -- identify the specific person responsible.
- [ ] **Deadlines are sourced, not invented.** If the transcript says "by end of week," calculate the actual date. If no deadline was stated, flag as "no deadline set" and suggest one.
- [ ] **Seller and buyer commitments are correctly attributed.** Verify speaker identification.
- [ ] **Untracked items are cross-referenced.** Only flag as untracked if no CRM task with matching description exists.
- [ ] **Overdue calculation is correct.** Use the stated deadline, not today's date vs. meeting date.
- [ ] **Duplicate items are merged.** The same commitment restated in a follow-up meeting should be one item, not two.
- [ ] **Status is current.** If a subsequent meeting confirmed completion, mark as completed even if the CRM task is still open.
- [ ] **Suggested follow-ups are professional.** No aggressive or guilt-tripping language.

## Error Handling

### No meeting transcripts available
Fall back to CRM tasks only. Generate the dashboard from CRM task data with a note: "No meeting transcripts available. Action items are based on CRM tasks only. Transcript analysis would provide more complete tracking of verbal commitments."

### No CRM tasks found
Generate from transcript action items only. Note: "No CRM tasks found. Action items below are extracted from meeting transcripts. Consider creating CRM tasks for tracking and accountability."

### No action items found in any source
Return: "No action items found for [period]. This could mean: (1) meetings were informational without commitments, (2) action items were made but not captured in transcripts, or (3) tasks are tracked outside the CRM. If commitments were made, consider documenting them as tasks for future tracking."

### Transcript action item extraction fails
Fall back to semantic search for commitment language. Note: "Structured action item extraction was unavailable for some meetings. Results include items found via transcript search, which may be less precise."

### Ambiguous owner
When the transcript says "we'll" or "the team will" without specifying a person, flag the item with owner "Unassigned" and recommend: "Assign a specific owner to ensure accountability."

## Guidelines

- Prioritize overdue and untracked items at the top. These are the highest-risk items.
- Be precise about deadlines. "End of week" from a Wednesday meeting means Friday. "Next week" means the following Monday-Friday.
- Distinguish between commitments and tasks. A commitment is "I'll send the proposal." A task is the CRM record created to track it. Flag the gap when commitments exist without corresponding tasks.
- Treat buyer commitments as deal health signals. A prospect who consistently follows through on their commitments is engaged. One who doesn't is signaling deprioritization.
- Frame overdue items as recovery opportunities, not failures. "This proposal was due 3 days ago -- sending it now with a brief apology and added value (updated case study) can recover the situation."
- When generating follow-up suggestions, maintain ${company_name}'s brand tone from Organization Context.
- Connect action items to deal impact wherever possible. "This overdue proposal is for a $50K deal in negotiation stage" gives urgency context.
