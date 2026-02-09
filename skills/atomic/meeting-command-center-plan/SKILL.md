---
name: Meeting Command Center Plan
description: |
  Create a concrete meeting prep plan with a checklist task, talking points, risks, and questions.
  Use when a user asks "prepare for my next meeting", "meeting prep checklist",
  "what should I prepare for my call", or needs a structured preparation plan.
  Returns a prep task with time-bound checklist, key risks, and talking points.
metadata:
  author: sixty-ai
  version: "2"
  category: sales-ai
  skill_type: atomic
  is_active: true
  triggers:
    - pattern: "prepare for my meeting"
      intent: "meeting_prep_plan"
      confidence: 0.85
      examples:
        - "prepare for my next meeting"
        - "help me prepare for the call"
        - "meeting preparation checklist"
    - pattern: "meeting prep checklist"
      intent: "meeting_checklist"
      confidence: 0.85
      examples:
        - "give me a prep checklist"
        - "what should I prepare for my meeting"
        - "meeting prep task"
    - pattern: "get ready for my call"
      intent: "call_preparation"
      confidence: 0.80
      examples:
        - "prep for the call"
        - "what do I need for the meeting"
        - "meeting prep plan"
  keywords:
    - "prepare"
    - "prep"
    - "meeting"
    - "checklist"
    - "call"
    - "ready"
    - "talking points"
    - "risks"
  required_context:
    - next_meeting
    - brief
  inputs:
    - name: meeting_id
      type: string
      description: "The meeting or calendar event identifier to build a prep plan for"
      required: true
    - name: contact_id
      type: string
      description: "Primary contact associated with the meeting"
      required: false
    - name: include_transcript
      type: boolean
      description: "Whether to include previous meeting transcript context"
      required: false
      default: false
  outputs:
    - name: prep_task
      type: object
      description: "Preparation task with title, description, due date, priority, and time-bound checklist"
    - name: key_risks
      type: array
      description: "Key risks and potential objections to prepare for"
    - name: talking_points
      type: array
      description: "Recommended talking points for the meeting"
    - name: questions
      type: array
      description: "Strategic questions to ask during the meeting"
  priority: high
  requires_capabilities:
    - calendar
    - crm
---

# Meeting Command Center Plan

## Goal
Given a next meeting object and a brief, create a concrete prep plan and a single task with a checklist.

## Inputs
- `next_meeting`: from execute_action(get_next_meeting)
- `brief`: from meeting-prep-brief

## Output Contract
Return:
- `data.prep_task`: { title, description, due_date, priority }
- `data.key_risks`: array
- `data.talking_points`: array
- `data.questions`: array

## Checklist Rules
- Checklist must be time-bound (what to do now vs 10 mins before)
- Include links when available (meetingUrl, CRM deal/contact URLs)
- Keep it short and demo-friendly
