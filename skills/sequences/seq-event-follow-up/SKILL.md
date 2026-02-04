---
name: Event Follow-Up
description: |
  After an event, identify priority leads and generate personalized follow-up actions and email drafts.
metadata:
  author: sixty-ai
  version: "1"
  category: agent-sequence
  skill_type: sequence
  is_active: true
  triggers:
    - pattern: "user_request"
    - pattern: "event_completed"
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

# Event Follow-Up Sequence

This sequence helps sales reps follow up effectively after events, webinars, or trade shows.

## Workflow
1. Get contacts who may have attended the event
2. Analyze them to identify priority leads
3. Generate follow-up task (requires confirmation)

## Usage
Trigger with: "Follow up on [event name] attendees"
Or: "Who should I contact from yesterday's webinar?"
