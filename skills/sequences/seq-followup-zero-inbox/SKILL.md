---
name: Follow-Up Zero Inbox
description: |
  Complete inbox zero workflow: scans emails and contacts, triages threads needing response,
  drafts replies, and creates follow-up tasks. Use when a user says "zero inbox",
  "catch up on emails", "help me clear my follow-ups", "what emails need replies",
  or wants to systematically handle outstanding email threads.
metadata:
  author: sixty-ai
  version: "2"
  category: agent-sequence
  skill_type: sequence
  is_active: true
  triggers:
    - pattern: "zero inbox"
      intent: "inbox_zero"
      confidence: 0.95
      examples:
        - "help me get to zero inbox"
        - "inbox zero mode"
        - "clear my inbox"
    - pattern: "catch up on emails"
      intent: "email_catchup"
      confidence: 0.90
      examples:
        - "catch up on my emails"
        - "what emails do I need to handle"
        - "email backlog"
    - pattern: "help me clear my follow-ups"
      intent: "followup_clearing"
      confidence: 0.90
      examples:
        - "clear my follow-ups"
        - "handle outstanding follow-ups"
        - "process my follow-ups"
    - pattern: "draft replies for my emails"
      intent: "bulk_reply_drafting"
      confidence: 0.85
      examples:
        - "help me reply to emails"
        - "draft responses to pending emails"
        - "write replies for my inbox"
  keywords:
    - "zero inbox"
    - "inbox"
    - "emails"
    - "follow-ups"
    - "replies"
    - "catch up"
    - "clear"
    - "respond"
    - "triage"
  requires_capabilities:
    - email
    - crm
    - tasks
  requires_context: []
  outputs:
    - email_threads
    - triage
    - reply_drafts
    - task_preview
  priority: high
  workflow:
    - order: 1
      action: search_emails
      input_mapping:
        limit: 50
      output_key: email_threads
      on_failure: continue
    - order: 2
      action: get_contacts_needing_attention
      input_mapping:
        days_since_contact: 7
        limit: 20
      output_key: recent_contacts
      on_failure: continue
    - order: 3
      skill_key: followup-triage
      input_mapping:
        email_threads: "${outputs.email_threads}"
        recent_contacts: "${outputs.recent_contacts}"
      output_key: triage
      on_failure: stop
    - order: 4
      action: get_contact
      input_mapping:
        id: "${outputs.triage.threads_needing_response[0].contact_id}"
      output_key: contact_data
      on_failure: continue
    - order: 5
      skill_key: followup-reply-drafter
      input_mapping:
        threads_needing_response: "${outputs.triage.threads_needing_response}"
        contact_data: "${outputs.contact_data}"
      output_key: reply_drafts
      on_failure: stop
    - order: 6
      action: draft_email
      input_mapping:
        to: "${outputs.reply_drafts.reply_drafts[0].to}"
        subject: "${outputs.reply_drafts.reply_drafts[0].subject}"
        context: "${outputs.reply_drafts.reply_drafts[0].context}"
        tone: "${outputs.reply_drafts.reply_drafts[0].tone}"
      output_key: email_preview
      on_failure: continue
    - order: 7
      action: create_task
      input_mapping:
        title: "${outputs.reply_drafts.task_previews[0].title}"
        description: "${outputs.reply_drafts.task_previews[0].description}"
        due_date: "${outputs.reply_drafts.task_previews[0].due_date}"
        priority: "${outputs.reply_drafts.task_previews[0].priority}"
        contact_id: "${outputs.reply_drafts.task_previews[0].contact_id}"
        deal_id: "${outputs.reply_drafts.task_previews[0].deal_id}"
      output_key: task_preview
      on_failure: continue
      requires_approval: true
  linked_skills:
    - followup-triage
    - followup-reply-drafter
---

# Follow-Up Zero Inbox

This sequence helps reps catch missed follow-ups:
1. Searches recent emails + contacts needing attention
2. Identifies threads needing response (unanswered questions, promises, stale)
3. Drafts reply emails for top threads
4. Previews email drafts + creates follow-up task (approval-gated)
