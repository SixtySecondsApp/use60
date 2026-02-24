Use60 HITL Webhook System Brief
Overview
Build a webhook-based Human-in-the-Loop system that enables Use60 to collect user decisions (approve/edit/reject) from Slack button interactions, process responses, and trigger downstream automations.

System Architecture
┌─────────────────┐     ┌──────────────────┐     ┌─────────────────┐
│   Use60 Agent   │────▶│  Slack Message   │────▶│  User Views &   │
│  (sends block)  │     │  (with buttons)  │     │  Clicks Button  │
└─────────────────┘     └──────────────────┘     └────────┬────────┘
                                                          │
                                                          ▼
┌─────────────────┐     ┌──────────────────┐     ┌─────────────────┐
│  State Updated  │◀────│ Webhook Handler  │◀────│ Slack Payload   │
│  + Next Action  │     │ (Cloudflare)     │     │ (POST request)  │
└─────────────────┘     └──────────────────┘     └─────────────────┘

Component 1: Webhook Handler (Cloudflare Worker)
Endpoint Structure
POST /webhooks/slack/interactions
Responsibilities

Verify Slack request signature
Parse interaction payload
Route to appropriate handler based on action_id
Acknowledge within 3 seconds (Slack requirement)
Update original message to show action taken
Trigger downstream workflow via queue/callback

Payload Structure (from Slack)
json{
  "type": "block_actions",
  "user": { "id": "U123", "name": "andrew" },
  "channel": { "id": "C456" },
  "message": { "ts": "1234567890.123456" },
  "response_url": "https://hooks.slack.com/...",
  "actions": [{
    "action_id": "approve_email_draft::draft_abc123",
    "block_id": "actions_block",
    "value": "{\"draft_id\":\"abc123\",\"meeting_id\":\"mtg_456\"}"
  }]
}
```

### Action ID Convention
```
{action_type}::{resource_type}::{resource_id}

Examples:
- approve::email_draft::draft_abc123
- reject::follow_up::fu_xyz789
- edit::meeting_summary::ms_def456
- confirm::task_list::tl_ghi012

Component 2: Extended Slack Blocks Skill
New Message Types for HITL
Add to existing skill:
markdown### hitl_approval
Input structure:
- approval_type: email_draft|follow_up|task_list|summary
- title, preview_content, context_info
- resource_id, meeting_id (for linking)
- options: { allow_edit: boolean, require_reason: boolean }
- callback_metadata: {} (passed through to webhook)

### hitl_confirmation
Input structure:
- items[]: { id, description, status }
- bulk_actions: boolean
- resource_id, context

### hitl_edit_request
Input structure:
- original_content, suggested_content
- edit_fields[]: { field_name, current_value }
- resource_id
HITL Button Patterns
json{
  "type": "actions",
  "block_id": "hitl_actions::{{resource_id}}",
  "elements": [
    {
      "type": "button",
      "text": { "type": "plain_text", "text": "✅ Approve", "emoji": true },
      "style": "primary",
      "action_id": "approve::{{resource_type}}::{{resource_id}}",
      "value": "{{callback_metadata_json}}"
    },
    {
      "type": "button",
      "text": { "type": "plain_text", "text": "✏️ Edit", "emoji": true },
      "action_id": "edit::{{resource_type}}::{{resource_id}}",
      "value": "{{callback_metadata_json}}"
    },
    {
      "type": "button",
      "text": { "type": "plain_text", "text": "❌ Reject", "emoji": true },
      "style": "danger",
      "action_id": "reject::{{resource_type}}::{{resource_id}}",
      "value": "{{callback_metadata_json}}"
    }
  ]
}

Component 3: State Management
Pending Approval Record (D1 or KV)
json{
  "id": "approval_abc123",
  "resource_type": "email_draft",
  "resource_id": "draft_xyz",
  "meeting_id": "mtg_456",
  "user_id": "user_789",
  "slack_channel": "C123",
  "slack_ts": "1234567890.123456",
  "status": "pending|approved|rejected|edited",
  "content": { /* original content that was presented */ },
  "response": { /* user's response when actioned */ },
  "created_at": "2026-01-01T10:00:00Z",
  "actioned_at": null,
  "expires_at": "2026-01-02T10:00:00Z"
}

Component 4: Response Handlers
Approve Handler

Mark approval record as approved
Update Slack message to show "✅ Approved by @user"
Trigger downstream action (send email, create task, etc.)
Log action for audit

Reject Handler

Mark approval record as rejected
Optionally: Open modal for rejection reason
Update Slack message to show "❌ Rejected by @user"
Notify agent/log for learning

Edit Handler

Open Slack modal with editable fields
On modal submit → capture edited content
Either: auto-approve edited version OR send for re-review
Update original message to show "✏️ Edited & Approved"


Component 5: Message Update Templates
After user action, replace the actions block:
json{
  "type": "context",
  "elements": [{
    "type": "mrkdwn",
    "text": "✅ *Approved* by <@U123> • Jan 1, 2026 at 10:30 AM"
  }]
}
Or for rejection:
json{
  "type": "context",
  "elements": [{
    "type": "mrkdwn",
    "text": "❌ *Rejected* by <@U123> • _\"Not the right tone\"_"
  }]
}

Implementation Phases
Phase 1: Core Webhook Infrastructure

 Cloudflare Worker for /webhooks/slack/interactions
 Slack signature verification
 Action ID parsing utility
 Response URL message updater
 Basic logging/audit trail

Phase 2: Approval Flow

 D1 table for pending approvals
 Approve/Reject handlers
 Message update after action
 Callback to Use60 agent/workflow

Phase 3: Edit Flow

 Slack modal definitions
 Modal submission handler
 Field-level edit tracking
 Re-approval flow option

Phase 4: Extended Skill Integration

 Update Slack blocks skill with HITL templates
 Standardized metadata structure
 Expiry/timeout handling
 Bulk action support


Slack App Configuration Required
yaml# Slack App Manifest additions
interactivity:
  is_enabled: true
  request_url: https://use60-webhooks.{your-domain}.workers.dev/webhooks/slack/interactions

# For edit modals
features:
  bot_user:
    display_name: Use60
  shortcuts: []
  
oauth_config:
  scopes:
    bot:
      - chat:write
      - chat:write.public
      - users:read

Key Design Decisions Needed
DecisionOptionsRecommendationState storageKV vs D1D1 (need queries by user/status)Edit flowInline vs ModalModal (better UX for multi-field)Expiry handlingSilent expire vs NotifyNotify + disable buttonsBulk actionsPer-item vs Select allStart per-item, add bulk laterAudit depthBasic vs Full historyFull (compliance + learning)

Example HITL Message: Email Draft Approval
json{
  "blocks": [
    {
      "type": "header",
      "text": { "type": "plain_text", "text": "📧 Follow-up Email Ready", "emoji": true }
    },
    {
      "type": "section",
      "text": {
        "type": "mrkdwn",
        "text": "*To:* sarah.jones@acme.com\n*Subject:* Great chatting today - next steps"
      }
    },
    { "type": "divider" },
    {
      "type": "section",
      "text": {
        "type": "mrkdwn",
        "text": "Hi Sarah,\n\nGreat speaking with you about your Q2 pipeline challenges. As discussed, I'll send over the case study from TechCorp...\n\n_[Preview truncated]_"
      }
    },
    { "type": "divider" },
    {
      "type": "context",
      "elements": [{
        "type": "mrkdwn",
        "text": "📅 From meeting: *Acme Corp Discovery Call* • 45 mins ago"
      }]
    },
    {
      "type": "actions",
      "block_id": "hitl_actions::draft_abc123",
      "elements": [
        {
          "type": "button",
          "text": { "type": "plain_text", "text": "✅ Send Now", "emoji": true },
          "style": "primary",
          "action_id": "approve::email_draft::draft_abc123",
          "value": "{\"draft_id\":\"abc123\",\"meeting_id\":\"mtg_456\"}"
        },
        {
          "type": "button",
          "text": { "type": "plain_text", "text": "✏️ Edit First", "emoji": true },
          "action_id": "edit::email_draft::draft_abc123",
          "value": "{\"draft_id\":\"abc123\",\"meeting_id\":\"mtg_456\"}"
        },
        {
          "type": "button",
          "text": { "type": "plain_text", "text": "🚫 Don't Send", "emoji": true },
          "style": "danger",
          "action_id": "reject::email_draft::draft_abc123",
          "value": "{\"draft_id\":\"abc123\",\"meeting_id\":\"mtg_456\"}"
        }
      ]
    }
  ],
  "text": "Follow-up email ready for Sarah Jones at Acme Corp - approve to send"
}