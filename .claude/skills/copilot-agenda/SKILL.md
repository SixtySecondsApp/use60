---
name: Meeting Agenda
description: |
  Structured meeting agenda built from deal stage, open items, and last meeting context.
  Use when a user says "/agenda", "meeting agenda", "build agenda", "prep for meeting",
  or needs a structured plan for an upcoming customer meeting. Combines deal intelligence,
  open action items, and previous meeting notes to produce a time-boxed agenda with
  discussion points and pre-meeting prep actions.
metadata:
  author: sixty-ai
  version: "2"
  category: sales-ai
  skill_type: atomic
  is_active: true
  context_profile: sales
  agent_affinity:
    - meetings
  triggers:
    - pattern: "/agenda"
      intent: "agenda_slash_command"
      confidence: 0.95
      examples:
        - "/agenda"
        - "/agenda for Acme call"
    - pattern: "meeting agenda"
      intent: "meeting_agenda"
      confidence: 0.90
      examples:
        - "create a meeting agenda"
        - "build an agenda for the call"
        - "what should we cover in the meeting"
    - pattern: "build agenda"
      intent: "build_agenda"
      confidence: 0.85
      examples:
        - "build an agenda for this deal"
        - "prep the agenda for my next call"
        - "help me plan the meeting"
  keywords:
    - "agenda"
    - "meeting"
    - "prep"
    - "discussion points"
    - "call plan"
    - "meeting plan"
    - "topics"
    - "time allocation"
  requires_context:
    - deal
    - contact
  inputs:
    - name: deal_id
      type: string
      description: "Deal ID to build the agenda from -- pulls stage, history, and open items"
      required: false
    - name: contact_id
      type: string
      description: "Contact ID if building agenda for a contact-level meeting without deal context"
      required: false
    - name: meeting_duration
      type: number
      description: "Meeting duration in minutes (default: 30)"
      required: false
      default: 30
    - name: meeting_type
      type: string
      description: "Type of meeting: discovery, demo, technical_review, negotiation, check_in, qbr"
      required: false
  outputs:
    - name: agenda_items
      type: array
      description: "Ordered list of agenda topics with objectives, talking points, and owner for each item"
    - name: time_allocation
      type: object
      description: "Time-boxed breakdown showing minutes allocated per agenda item, totaling the meeting duration"
    - name: discussion_points
      type: array
      description: "Key questions to ask and topics to probe, organized by priority"
    - name: pre_meeting_actions
      type: array
      description: "Prep tasks the rep should complete before the meeting with deadlines"
  requires_capabilities:
    - crm
  priority: high
  tags:
    - sales-ai
    - meetings
    - agenda
    - preparation
---

## Available Context & Tools
@_platform-references/org-variables.md
@_platform-references/capabilities.md

# Meeting Agenda

## Instructions

You are executing the /agenda skill. Your job is to produce a structured, time-boxed meeting agenda that maximizes the value of every minute with the prospect. The agenda should be informed by deal context, previous conversations, and open items -- not generic templates.

## Goal

Generate a meeting agenda that is:
1. **Context-aware**: Built from actual deal data, not a generic template
2. **Time-boxed**: Every item has allocated minutes that sum to the meeting duration
3. **Outcome-oriented**: Each agenda item has a clear objective (what you want to achieve)
4. **Actionable**: Includes pre-meeting prep so the rep walks in prepared

## Required Capabilities
- **CRM**: Fetch deal context, meeting history, open tasks, and contact information

## Data Gathering (via execute_action)

### If deal_id is provided:
1. `execute_action("get_deal", { id: deal_id })` -- stage, value, health, MEDDICC gaps
2. `execute_action("get_deal_contacts", { deal_id })` -- who will be in the meeting
3. `execute_action("get_deal_activities", { deal_id, limit: 30 })` -- recent activity and conversations
4. `execute_action("get_meetings", { deal_id })` -- previous meetings, especially the last one
5. `execute_action("list_tasks", { deal_id })` -- open action items from previous meetings

### If contact_id is provided (no deal):
1. `execute_action("get_contact", { id: contact_id })` -- name, title, company
2. `execute_action("get_contact_activities", { contact_id, limit: 20 })` -- interaction history

### Always:
- Identify the last meeting and its outcomes/action items
- Check for open tasks that should be addressed
- Determine the deal stage to inform agenda priorities
- Look for MEDDICC gaps that should be explored

## Agenda Construction Logic

### Stage-Based Agenda Priorities

**Discovery / Qualification**:
- Focus on: Understanding pain, identifying stakeholders, confirming budget and timeline
- Key questions: Why now? What happens if you do nothing? Who else is involved?
- Time split: 70% listening/questions, 20% positioning, 10% next steps

**Demo / Evaluation**:
- Focus on: Showing value against stated needs, handling objections, confirming fit
- Key questions: Does this solve your stated problem? What concerns remain?
- Time split: 50% demo/discussion, 30% questions/objections, 20% next steps

**Technical Review / POC**:
- Focus on: Technical requirements, integration feasibility, success criteria
- Key questions: What does success look like? What are the technical blockers?
- Time split: 40% technical deep-dive, 30% requirements validation, 30% next steps

**Negotiation / Closing**:
- Focus on: Commercial terms, implementation plan, timeline to decision
- Key questions: What needs to happen to get this approved? Who else needs to sign off?
- Time split: 30% recap value, 40% commercial discussion, 30% next steps and timeline

**Check-in / QBR**:
- Focus on: Value delivered, adoption metrics, expansion opportunities
- Key questions: What is working? What needs improvement? What are your goals for next quarter?
- Time split: 30% review, 40% forward-looking, 30% action planning

### Agenda Item Structure

For each item:
- **Topic**: Clear, specific title (not "Discussion")
- **Objective**: What outcome you want from this item
- **Duration**: Minutes allocated
- **Owner**: Who drives this section (rep, prospect, SE, etc.)
- **Talking points**: 2-3 specific points to cover
- **Transition**: How to move to the next topic smoothly

### Standard Agenda Skeleton (30-minute meeting)

1. **Opening & rapport** (2 min) -- Brief personal connection, confirm agenda
2. **Recap & continuity** (3 min) -- Reference last meeting, confirm action items completed
3. **Core discussion** (15 min) -- Stage-appropriate deep-dive (see priorities above)
4. **Open questions** (5 min) -- Address prospect's questions and concerns
5. **Next steps & commitments** (5 min) -- Agree on specific actions with dates and owners

Adjust proportionally for longer meetings. For 60-minute meetings, expand core discussion and add a dedicated objection-handling block.

## Discussion Points

Generate prioritized questions organized by:
- **Must ask**: Questions that fill MEDDICC gaps or address deal risks (ask these even if time is short)
- **Should ask**: Questions that deepen understanding and build rapport
- **If time permits**: Nice-to-have questions that provide additional context

Each question should include:
- The question itself (phrased naturally, not like an interrogation)
- Why you are asking (the insight you hope to gain)
- How to follow up based on likely answers

## Pre-Meeting Actions

Generate a checklist of prep tasks:
- Review last meeting notes/recording (link if available)
- Research any topics the prospect mentioned wanting to discuss
- Prepare demo environment or materials if needed
- Check for any company news about the prospect's organization
- Confirm attendees and adjust agenda if new stakeholders are joining
- Prepare one piece of value-add content to share (article, case study, data point)

Each action should include: what to do, why it matters, and a suggested deadline (e.g., "day before meeting").

## Quality Checklist

Before returning results, verify:
- [ ] Time allocations sum to the meeting duration
- [ ] Each agenda item has a clear objective (not just a topic)
- [ ] Agenda references specific deal context (not a generic template)
- [ ] Previous meeting outcomes and action items are incorporated
- [ ] Discussion points address at least one MEDDICC gap (if applicable)
- [ ] Next steps block is always included (never skip this)
- [ ] Pre-meeting actions are specific and actionable
- [ ] Agenda is appropriate for the deal stage

## Error Handling

### No previous meetings found
Build agenda from deal stage and contact information. Note: "No previous meeting history found. Agenda is based on deal stage and general best practices."

### No deal or contact context
Return a generic agenda template for the specified meeting type. Note: "Provide deal_id or contact_id for a context-aware agenda."

### Meeting type not specified
Infer from deal stage. If no deal context, default to "check_in" structure.

### Very short meeting (< 15 min)
Strip to essentials: brief recap (2 min), one core discussion item (8 min), next steps (5 min). Note: "Short meeting -- agenda focused on highest-priority item only."

## Output Contract

Return a SkillResult with:
- `data.agenda_items`: array of { topic, objective, duration_minutes, owner, talking_points[], transition }
- `data.time_allocation`: object with { total_minutes, items: [{ topic, minutes, percentage }] }
- `data.discussion_points`: array of { question, priority ("must_ask" | "should_ask" | "if_time_permits"), insight_sought, follow_up_guidance }
- `data.pre_meeting_actions`: array of { action, reason, deadline, completed (boolean, default false) }
- `data.meeting_context`: object with { deal_stage, last_meeting_date, last_meeting_summary, attendees[], meeting_type }
