---
name: Event Follow-Up
description: |
  Post-event follow-up sequence: identifies priority leads from event attendees, generates
  personalized follow-up recommendations, and creates tasks. Use when a user says
  "follow up on the conference", "who should I contact from the webinar",
  "event follow-up plan", or needs to act on leads from a recent event.
metadata:
  author: sixty-ai
  version: "2"
  category: agent-sequence
  skill_type: sequence
  is_active: true
  triggers:
    - pattern: "follow up on the event"
      intent: "event_followup"
      confidence: 0.95
      examples:
        - "follow up on the conference"
        - "event follow-up plan"
        - "follow up from the trade show"
    - pattern: "who should I contact from the webinar"
      intent: "event_leads"
      confidence: 0.90
      examples:
        - "who should I reach out to from the event"
        - "best leads from the conference"
        - "priority contacts from the webinar"
    - pattern: "post-event action plan"
      intent: "event_actions"
      confidence: 0.85
      examples:
        - "what should I do after the event"
        - "event lead follow-up"
        - "conference follow-up tasks"
  keywords:
    - "event"
    - "conference"
    - "webinar"
    - "trade show"
    - "follow up"
    - "attendees"
    - "leads"
    - "contacts"
    - "post-event"
  requires_capabilities:
    - crm
    - tasks
  requires_context: []
  outputs:
    - contacts
    - priority_leads
    - followup_recommendations
    - task_preview
  priority: high
  structured_response_type: event_followup
  workflow:
    - order: 1
      action: get_contacts_needing_attention
      input_mapping:
        days_since_contact: 14
        limit: 25
      output_key: contacts
      on_failure: continue
    - order: 2
      skill_key: event-followup-analyzer
      input_mapping:
        contacts: "${outputs.contacts}"
        event_context: "${trigger.params.event_context}"
      output_key: analysis
      on_failure: stop
    - order: 3
      action: create_task
      input_mapping:
        title: "Follow up with ${outputs.analysis.priority_leads[0].name} from ${trigger.params.event_name}"
        description: "${outputs.analysis.followup_recommendations[0].suggested_message}"
        due_date: tomorrow
        priority: high
        contact_id: "${outputs.analysis.priority_leads[0].contact_id}"
      output_key: task_preview
      requires_approval: true
      on_failure: continue
  linked_skills:
    - event-followup-analyzer
---

## Available Context
@_platform-references/org-variables.md

# Event Follow-Up Sequence

This sequence helps sales reps follow up effectively after events, webinars, or trade shows.

## Workflow
1. Get contacts who may have attended the event
2. Analyze them to identify priority leads
3. Generate follow-up task (requires confirmation)

## Usage
Trigger with: "Follow up on [event name] attendees"
Or: "Who should I contact from yesterday's webinar?"
