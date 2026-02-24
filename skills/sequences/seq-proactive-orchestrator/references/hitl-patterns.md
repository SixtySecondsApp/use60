# HITL (Human-in-the-Loop) Approval Patterns

All approval patterns use the existing `slack-interactive` edge function and `slack_pending_actions` table. The orchestrator pauses at approval points and resumes when the rep acts.

---

## How Approval Gates Work

### Lifecycle

```
ORCHESTRATOR                    SLACK                           REP
     │                            │                              │
     │  1. Reach approval step    │                              │
     │  2. Create pending_action  │                              │
     │  3. Send Slack message ──────> Display message            │
     │  4. Persist state          │   with action buttons ─────> │
     │  5. Exit edge function     │                              │
     │                            │                              │
     │          (time passes — minutes, hours, or days)          │
     │                            │                              │
     │                            │   <── Rep clicks button      │
     │  <────── slack-interactive │                              │
     │  6. Reload state           │                              │
     │  7. Process action         │                              │
     │  8. Resume sequence        │                              │
     │                            │                              │
```

### Database Record

When an approval gate is hit, a `slack_pending_actions` record is created:

```typescript
{
  id: uuid,
  org_id: string,
  user_id: string,
  sequence_job_id: string,       // Links back to the orchestrator sequence
  action_type: string,           // 'email_send' | 'task_create' | 'crm_update' | 'proposal_send'
  payload: {
    step_index: number,          // Which step to resume from
    action_data: any,            // The full data needed to execute the action
    preview_data: any,           // What was shown to the rep in Slack
  },
  status: 'pending' | 'approved' | 'rejected' | 'expired',
  slack_message_ts: string,      // For updating the message after action
  created_at: timestamp,
  expires_at: timestamp,         // Auto-expire after 24 hours
  resolved_at: timestamp | null,
  resolution: string | null,     // 'approve' | 'edit' | 'skip' | 'cancel' | 'send_later'
}
```

### Resumption

When `slack-interactive` receives a button click:

1. Look up the `slack_pending_actions` record by action ID
2. Update record: `status = 'approved'` (or 'rejected'), `resolved_at = now()`
3. Invoke the orchestrator with:
   ```typescript
   {
     type: 'slack_approval_received',
     source: 'slack:button_approve',
     payload: {
       action: 'approve',
       pending_action_id: record.id,
       sequence_job_id: record.sequence_job_id,
       resume_step: record.payload.step_index + 1,  // Resume AFTER the approval step
       user_modifications: null,  // Or edited content if they chose "Edit"
     }
   }
   ```
4. Orchestrator reloads `SequenceState` from `sequence_jobs.context` and resumes

---

## Pattern 1: Review & Send (Emails, Proposals)

Used when the orchestrator has drafted content that needs human approval before delivery.

### Slack Message Format

```
{emoji} Ready to send {content_type} to {contact_name}:

To: {email_address}
Subject: {subject_line}

{body_preview_first_3_lines}
{if body_is_long} [... click to expand]

[Send now] [Edit in use60] [Send later] [Skip]
```

### Action Buttons

| Button | Label | Style | Action |
|--------|-------|-------|--------|
| Send now | `Send now` | `primary` (green) | Execute send immediately |
| Edit | `Edit in use60` | `default` | Open editor in app, re-submit when done |
| Send later | `Send later` | `default` | Prompt for time, defer delivery |
| Skip | `Skip` | `danger` (red) | Cancel this action, continue sequence |

### Implementation

```typescript
function buildEmailApprovalBlocks(draft: EmailDraft, contact: Contact): SlackBlock[] {
  return [
    {
      type: 'section',
      text: {
        type: 'mrkdwn',
        text: `*Ready to send follow-up to ${contact.name}:*`
      }
    },
    {
      type: 'section',
      fields: [
        { type: 'mrkdwn', text: `*To:* ${contact.email}` },
        { type: 'mrkdwn', text: `*Subject:* ${draft.subject}` },
      ]
    },
    {
      type: 'section',
      text: {
        type: 'mrkdwn',
        text: truncate(draft.body, 500)
      }
    },
    { type: 'divider' },
    {
      type: 'actions',
      elements: [
        {
          type: 'button',
          text: { type: 'plain_text', text: 'Send now' },
          style: 'primary',
          action_id: 'orchestrator_approve',
          value: JSON.stringify({ pending_action_id, action: 'approve' })
        },
        {
          type: 'button',
          text: { type: 'plain_text', text: 'Edit in use60' },
          action_id: 'orchestrator_edit',
          value: JSON.stringify({ pending_action_id, action: 'edit' })
        },
        {
          type: 'button',
          text: { type: 'plain_text', text: 'Send later' },
          action_id: 'orchestrator_defer',
          value: JSON.stringify({ pending_action_id, action: 'defer' })
        },
        {
          type: 'button',
          text: { type: 'plain_text', text: 'Skip' },
          style: 'danger',
          action_id: 'orchestrator_skip',
          value: JSON.stringify({ pending_action_id, action: 'skip' })
        }
      ]
    }
  ]
}
```

### After Action

| Action | What Happens |
|--------|--------------|
| `approve` | Execute `email-send-as-rep`, update Slack message to "Sent", continue sequence |
| `edit` | Open deep link to use60 email editor, wait for re-submission |
| `defer` | Show time picker modal, schedule send via `agent_schedules` |
| `skip` | Mark step as skipped, continue sequence to next step |

### Post-Action Slack Update

After the rep acts, update the original Slack message to show the outcome:

```
{checkmark} Follow-up sent to Sarah Chen at 2:34pm
Subject: Great connecting today — next steps on the pilot

[View in use60 ->]
```

---

## Pattern 2: Choose from Options (Scheduling, Prioritisation)

Used when the orchestrator presents multiple options and the rep picks one.

### Slack Message Format

```
{calendar_emoji} Available times for a 30min call with {contact_name} ({timezone}):

{radio} Tomorrow (Thu) 2:00-2:30pm GMT / 9:00-9:30am EST {checkmark}
{radio} Friday 3:00-3:30pm GMT / 10:00-10:30am EST {checkmark}
{radio} Monday 2:30-3:00pm GMT / 9:30-10:00am EST {checkmark}

[Send these times via email] [Send calendar invite] [Show more options] [I'll handle this]
```

### Implementation

Uses Slack's radio button group within a section block:

```typescript
function buildTimeOptionBlocks(slots: TimeSlot[], contact: Contact): SlackBlock[] {
  return [
    {
      type: 'section',
      text: {
        type: 'mrkdwn',
        text: `*Available times for a 30min call with ${contact.name}:*`
      }
    },
    {
      type: 'section',
      accessory: {
        type: 'radio_buttons',
        action_id: 'orchestrator_select_time',
        options: slots.map(slot => ({
          text: {
            type: 'mrkdwn',
            text: `*${slot.formatted_local}* / ${slot.formatted_prospect_tz} ${slot.quality_indicator}`
          },
          value: slot.id
        }))
      },
      text: { type: 'mrkdwn', text: ' ' }
    },
    { type: 'divider' },
    {
      type: 'actions',
      elements: [
        {
          type: 'button',
          text: { type: 'plain_text', text: 'Send times via email' },
          style: 'primary',
          action_id: 'orchestrator_send_times_email',
          value: JSON.stringify({ pending_action_id })
        },
        {
          type: 'button',
          text: { type: 'plain_text', text: 'Send calendar invite' },
          action_id: 'orchestrator_send_invite',
          value: JSON.stringify({ pending_action_id })
        },
        {
          type: 'button',
          text: { type: 'plain_text', text: 'Show more options' },
          action_id: 'orchestrator_more_options',
          value: JSON.stringify({ pending_action_id })
        },
        {
          type: 'button',
          text: { type: 'plain_text', text: "I'll handle this" },
          action_id: 'orchestrator_skip',
          value: JSON.stringify({ pending_action_id, action: 'skip' })
        }
      ]
    }
  ]
}
```

### Quality Indicators

| Symbol | Meaning |
|--------|---------|
| `{checkmark}` | Good overlap — within both parties' business hours |
| `{warning}` early for them | Time is before 9am in prospect's timezone |
| `{warning}` late for you | Time is after 5pm in rep's timezone |
| `{star}` recommended | Highest-scored slot by the scoring algorithm |

---

## Pattern 3: Batch Review (Tasks, Pipeline Actions)

Used when multiple items need approval at once (e.g., tasks from action items).

### Slack Message Format

```
{clipboard_emoji} {count} tasks from your meeting with {contact_name}:

1. {checkmark_box} Send pricing comparison by Friday
   Assigned to: You | Due: Feb 14
   [Create] [Edit] [Skip]

2. {checkmark_box} Share case study with Sarah
   Assigned to: You | Due: Feb 13
   [Create] [Edit] [Skip]

3. {checkmark_box} Schedule follow-up demo with technical team
   Assigned to: You | Due: Feb 18
   [Create] [Edit] [Skip]

[Create all] [Review in use60] [Dismiss all]
```

### Implementation

Each task is a separate section with inline action buttons. The "Create all" button creates all tasks in a single batch operation.

### Batch Action Handling

| Action | What Happens |
|--------|--------------|
| `Create all` | Creates all tasks in batch, marks all as approved |
| `Create` (individual) | Creates just that task, others remain pending |
| `Edit` (individual) | Opens task editor modal in Slack |
| `Skip` (individual) | Removes that task from the batch |
| `Review in use60` | Opens deep link to task list in the app |
| `Dismiss all` | Skips all tasks, continues sequence |

---

## Pattern 4: Inform Only (CRM Updates, Enrichment, Summaries)

Used when the orchestrator has completed an action and is notifying the rep. No approval needed.

### Slack Message Format

```
{checkmark} Post-meeting updates for {contact_name} at {company}:

CRM Updated:
  Deal stage: Discovery -> Proposal (from buying signals)
  Last meeting: Today
  Notes: 3 action items logged

Tasks Created:
  {checkmark_box} Send pricing comparison (due Fri)
  {checkmark_box} Share case study (due Thu)

Follow-up email draft ready:
  [Review & send ->]

[View in use60 ->]
```

### When Used

- CRM field updates that don't change deal stage (automatic, no approval needed)
- Enrichment completion (Apollo data added to contact)
- Meeting summary posted to Slack channel
- Campaign metrics digest
- Coaching micro-feedback (inform only, no action buttons)

---

## Expiration & Cleanup

### Pending Action Expiry

Pending actions expire after 24 hours (configurable per org). When expired:

1. Update `slack_pending_actions.status = 'expired'`
2. Update Slack message to show expiry: "This action has expired. [Re-generate ->]"
3. Log expiry in `sequence_jobs.context.execution_metadata`
4. Do NOT resume the sequence — it stays in `awaiting_approval` status

### Cleanup Cron

A daily cleanup cron:
1. Expires `pending` actions older than 24 hours
2. Updates associated Slack messages
3. Closes `sequence_jobs` stuck in `awaiting_approval` for >48 hours as `expired`

---

## Undo Window (Email Send Only)

After a rep approves an email send, there's a 30-second undo window:

```
{hourglass} Sending in 30s... [Undo]

{after 30s, message updates to:}
{checkmark} Sent to sarah.chen@acme.com at 2:34pm
```

### Implementation

1. On "Send now" click: update Slack message to show countdown
2. Start a 30-second timer (via `setTimeout` in the edge function, or a deferred self-invoke)
3. If "Undo" is clicked within 30s: cancel the send, revert to the approval message
4. If no undo: execute `email-send-as-rep` and update message to "Sent"

**Edge function timeout consideration**: The 30s undo window should be implemented as a deferred invocation, not a blocking `setTimeout`. The edge function sends the "Sending in 30s" message, schedules a follow-up invocation via `agent_schedules`, and exits. The follow-up invocation checks if undo was pressed and either sends or cancels.

---

## Non-Negotiable Safety Rules

1. **Email sends always require HITL** — no exceptions, no auto-approve setting
2. **Deal stage changes require HITL** — advancing or regressing a deal stage
3. **Task creation shows preview** — rep sees what will be created before it happens
4. **Proposal sends have two gates** — review draft (Pattern 1), then approve send (Pattern 1 again)
5. **No action on expired gates** — expired = cancelled, not auto-approved
6. **All approvals are logged** — `slack_pending_actions` record with full audit trail
7. **30s undo on email sends** — last-chance safety net

---

## Slack Message Limits

Respect Slack API limits when building approval messages:

| Limit | Value | Mitigation |
|-------|-------|------------|
| Max blocks per message | 50 | Paginate large batch reviews |
| Max text length per block | 3000 chars | Truncate with "click to expand" |
| Max buttons per actions block | 5 | Split into multiple actions blocks |
| Max sections per message | 50 | Use overflow menus for long lists |
| File attachment size | 1MB | Link to use60 for large documents |

For batch reviews with more than 5 items, paginate:
- Show first 5 items with "Show more" button
- "Create all" operates on ALL items (not just visible ones)
