-- Migration: HITL Skill Templates
-- Purpose: Create Human-in-the-Loop skill templates for sequences
-- Feature: sequence-simplification (SEQ-007)
-- Date: 2026-02-03

-- =============================================================================
-- HITL Skill: Slack Approval
-- A skill that pauses sequence execution and waits for human approval via Slack
-- =============================================================================

INSERT INTO platform_skills (skill_key, category, frontmatter, content_template, is_active)
VALUES
  (
    'hitl-slack-approval',
    'hitl',
    '{
      "name": "Slack Approval Request",
      "description": "Pause sequence execution and request human approval via Slack. The sequence will resume only after approval is received.",
      "category": "hitl",
      "version": 1,
      "skill_type": "atomic",

      "triggers": [
        {"pattern": "get approval", "intent": "approval-request", "confidence": 0.9},
        {"pattern": "human approval", "intent": "approval-request", "confidence": 0.9},
        {"pattern": "slack approval", "intent": "approval-request", "confidence": 0.95},
        {"pattern": "wait for approval", "intent": "approval-request", "confidence": 0.85}
      ],

      "required_context": ["job_id", "channel", "message"],
      "optional_context": ["approvers", "timeout_minutes", "options"],

      "inputs": [
        {"name": "channel", "type": "string", "description": "Slack channel ID or name", "required": true, "example": "#sales-approvals"},
        {"name": "message", "type": "string", "description": "Message to display in the approval request", "required": true, "example": "Ready to send outreach email to John Smith at Acme Corp?"},
        {"name": "options", "type": "array", "description": "Approval options (default: Approve, Reject)", "required": false, "default": ["Approve", "Reject"], "example": ["Approve", "Reject", "Edit First"]},
        {"name": "approvers", "type": "array", "description": "List of Slack user IDs who can approve", "required": false, "example": ["U12345", "U67890"]},
        {"name": "timeout_minutes", "type": "number", "description": "Minutes to wait before timeout (default: 60)", "required": false, "default": 60},
        {"name": "context_preview", "type": "object", "description": "Data to show in the approval request for context", "required": false},
        {"name": "job_id", "type": "string", "description": "Job ID for tracking (auto-provided by sequence engine)", "required": true}
      ],

      "outputs": [
        {"name": "approval_status", "type": "string", "description": "The selected approval option", "example": "Approve"},
        {"name": "approver_id", "type": "string", "description": "Slack user ID of the person who approved", "example": "U12345"},
        {"name": "approver_name", "type": "string", "description": "Display name of the approver", "example": "Jane Smith"},
        {"name": "approval_timestamp", "type": "string", "description": "ISO timestamp when approval was given", "example": "2026-02-03T14:30:00Z"},
        {"name": "feedback", "type": "string", "description": "Optional feedback text from approver", "example": "Looks good, but change the subject line"},
        {"name": "was_timeout", "type": "boolean", "description": "Whether the approval timed out", "example": false}
      ],

      "execution_mode": "async",
      "timeout_ms": 3600000,

      "tags": ["hitl", "slack", "approval", "human-in-the-loop"]
    }',
    E'# HITL: Slack Approval Request

This skill pauses sequence execution and requests human approval via Slack.

## How It Works

1. **Request Sent**: Posts an interactive message to the specified Slack channel
2. **Sequence Paused**: The job enters a "waiting_approval" state
3. **Human Responds**: User clicks an approval button in Slack
4. **Sequence Resumes**: The job continues with the approval result

## Slack Message Format

Uses `@output-format/slack-blocks` for rich formatting:

```json
{
  "blocks": [
    {
      "type": "header",
      "text": {"type": "plain_text", "text": "🔔 Approval Required"}
    },
    {
      "type": "section",
      "text": {"type": "mrkdwn", "text": "{message}"}
    },
    {
      "type": "context",
      "elements": [
        {"type": "mrkdwn", "text": "Job ID: `{job_id}` | Timeout: {timeout_minutes} min"}
      ]
    },
    {
      "type": "actions",
      "block_id": "approval_actions",
      "elements": [
        // Dynamic buttons based on {options}
      ]
    }
  ]
}
```

## Input Variables

- `{channel}` - Slack channel to post to
- `{message}` - The approval request message
- `{options}` - Array of button options (default: ["Approve", "Reject"])
- `{approvers}` - Optional list of user IDs who can approve
- `{timeout_minutes}` - Timeout before auto-fail (default: 60)
- `{context_preview}` - Optional data to show as context
- `{job_id}` - Auto-provided by sequence engine

## Output Variables

- `{approval_status}` - The selected option (e.g., "Approve")
- `{approver_id}` - Slack user ID of approver
- `{approver_name}` - Display name of approver
- `{approval_timestamp}` - When approval was given
- `{feedback}` - Optional text feedback
- `{was_timeout}` - True if request timed out

## Example Usage in Sequence

```json
{
  "order": 3,
  "skill_key": "hitl-slack-approval",
  "input_mapping": {
    "channel": "#sales-approvals",
    "message": "Ready to send email to {prospect_name}?\\n\\nSubject: {email.subject}\\nPreview: {email.body_preview}",
    "options": ["Send Now", "Edit First", "Cancel"],
    "timeout_minutes": 30
  },
  "output_key": "approval",
  "on_failure": "stop"
}
```

## Timeout Behavior

When timeout occurs:
- `approval_status` = "timeout"
- `was_timeout` = true
- Sequence continues to `on_failure` action
',
    true
  ),

  -- =============================================================================
  -- HITL Skill: In-App Approval
  -- A skill that pauses and shows approval request in the use60 app
  -- =============================================================================
  (
    'hitl-inapp-approval',
    'hitl',
    '{
      "name": "In-App Approval Request",
      "description": "Pause sequence execution and request human approval via in-app notification. User can review and approve directly in use60.",
      "category": "hitl",
      "version": 1,
      "skill_type": "atomic",

      "triggers": [
        {"pattern": "app approval", "intent": "approval-request", "confidence": 0.9},
        {"pattern": "in-app approval", "intent": "approval-request", "confidence": 0.95},
        {"pattern": "review in app", "intent": "approval-request", "confidence": 0.85}
      ],

      "required_context": ["job_id", "message"],
      "optional_context": ["notify_users", "timeout_minutes", "options", "preview_data"],

      "inputs": [
        {"name": "message", "type": "string", "description": "Message to display in the approval request", "required": true},
        {"name": "options", "type": "array", "description": "Approval options (default: Approve, Reject)", "required": false, "default": ["Approve", "Reject"]},
        {"name": "notify_users", "type": "array", "description": "List of user IDs to notify", "required": false},
        {"name": "timeout_minutes", "type": "number", "description": "Minutes to wait before timeout (default: 60)", "required": false, "default": 60},
        {"name": "preview_data", "type": "object", "description": "Data to render as preview (email, message, etc.)", "required": false},
        {"name": "allow_edit", "type": "boolean", "description": "Allow user to edit the preview data before approving", "required": false, "default": false},
        {"name": "job_id", "type": "string", "description": "Job ID for tracking (auto-provided by sequence engine)", "required": true}
      ],

      "outputs": [
        {"name": "approval_status", "type": "string", "description": "The selected approval option"},
        {"name": "approver_id", "type": "string", "description": "User ID of the person who approved"},
        {"name": "approval_timestamp", "type": "string", "description": "ISO timestamp when approval was given"},
        {"name": "edited_data", "type": "object", "description": "Modified preview data if user edited before approving"},
        {"name": "feedback", "type": "string", "description": "Optional feedback text from approver"},
        {"name": "was_timeout", "type": "boolean", "description": "Whether the approval timed out"}
      ],

      "execution_mode": "async",
      "timeout_ms": 3600000,

      "tags": ["hitl", "in-app", "approval", "human-in-the-loop"]
    }',
    E'# HITL: In-App Approval Request

This skill pauses sequence execution and requests human approval via the use60 app.

## How It Works

1. **Notification Sent**: Creates in-app notification and optionally email notification
2. **Sequence Paused**: The job enters a "waiting_approval" state
3. **User Reviews**: User sees the approval request in their dashboard
4. **User Responds**: Clicks approve/reject button (with optional edits)
5. **Sequence Resumes**: The job continues with the approval result

## Input Variables

- `{message}` - The approval request message
- `{options}` - Array of button options (default: ["Approve", "Reject"])
- `{notify_users}` - User IDs to notify
- `{timeout_minutes}` - Timeout before auto-fail (default: 60)
- `{preview_data}` - Data to show as preview (e.g., email content)
- `{allow_edit}` - Let user edit preview before approving
- `{job_id}` - Auto-provided by sequence engine

## Output Variables

- `{approval_status}` - The selected option
- `{approver_id}` - User ID of approver
- `{approval_timestamp}` - When approval was given
- `{edited_data}` - Modified data if user edited
- `{feedback}` - Optional text feedback
- `{was_timeout}` - True if request timed out

## Example Usage in Sequence

```json
{
  "order": 2,
  "skill_key": "hitl-inapp-approval",
  "input_mapping": {
    "message": "Review the drafted email before sending to {prospect_name}",
    "preview_data": {
      "type": "email",
      "subject": "{email.subject}",
      "body": "{email.body}",
      "to": "{prospect_email}"
    },
    "allow_edit": true,
    "options": ["Send", "Edit & Send", "Cancel"]
  },
  "output_key": "approval"
}
```
',
    true
  )
ON CONFLICT (skill_key) DO UPDATE SET
  frontmatter = EXCLUDED.frontmatter,
  content_template = EXCLUDED.content_template,
  is_active = EXCLUDED.is_active,
  updated_at = now();

-- Add the 'hitl' category if it doesn't exist in the enum
-- (This is handled by the baseline, but we make it explicit here)
COMMENT ON TABLE platform_skills IS 'Platform skills including HITL (Human-in-the-Loop) skills for sequence pause/resume';
