# Event Sequence Definitions

Complete mapping of every event type to its execution sequence. Each step specifies the skill or action, required context tier, failure mode, whether HITL approval is needed, and any conditional branches.

---

## meeting_ended

**Trigger**: MeetingBaaS webhook -> `meetingbaas-webhook` edge function
**Source**: `webhook:meetingbaas`
**Required context**: Tier 1 + Tier 2 (contact from attendees)
**Expected duration**: 60-90s (with parallel steps)
**Chain depth**: 1 (may queue proposal_generation or calendar_find_times)

| Order | Skill/Action | Context | Failure | Approval | Output Key |
|-------|-------------|---------|---------|----------|------------|
| 1 | `extract-action-items` | tier1, tier2 | stop | no | `action_items` |
| 2 | `detect-intents` | tier1, tier2 | continue | no | `intents` |
| 3 | `suggest-next-actions` | tier1, tier2 | continue | no | `next_actions` |
| 4 | `draft-followup-email` | tier1, tier2 | continue | yes | `email_draft` |
| 5 | `update-crm-from-meeting` | tier2 | continue | no | `crm_updates` |
| 6 | `create-tasks-from-actions` | tier2 | continue | yes | `tasks_created` |
| 7 | `notify-slack-summary` | tier1 | continue | no | `slack_sent` |

### Step Details

**Step 1: extract-action-items**
- Input: `{ meeting_id, transcript_id, transcript_text }`
- Output: `{ action_items: [{ text, owner, deadline?, priority }], decisions: [{ text, context }] }`
- Calls existing `extract-action-items` edge function
- Critical path — if this fails, the transcript is unprocessable

**Step 2: detect-intents**
- Input: `{ transcript_text, attendees, org_profile, meeting_type }`
- Output: `{ commitments: [...], buying_signals: [...], follow_up_items: [...] }`
- See `detect-intents` skill for full specification
- Non-blocking — sequence continues even if intent detection fails

**Step 3: suggest-next-actions**
- Input: `{ action_items, intents, contact, deal, meeting_history }`
- Output: `{ prioritized_actions: [{ action, reason, urgency }] }`
- Combines action items + detected intents into ranked next steps
- Uses existing `suggest-next-actions` skill

**Step 4: draft-followup-email**
- Input: `{ action_items, intents, next_actions, contact, meeting_data }`
- Output: `{ subject, body, thread_id?, tone_used }`
- Uses existing `post-meeting-followup-drafter` skill
- HITL gate: Rep sees full email preview in Slack, must approve before send
- On approval: queues `email_send` event (calls `email-send-as-rep` skill)

**Step 5: update-crm-from-meeting**
- Input: `{ meeting_id, action_items, intents.buying_signals, deal_id }`
- Output: `{ fields_updated: [{ field, old_value, new_value }] }`
- Updates: deal stage (if buying signals warrant), last meeting date, notes
- Stage changes require HITL approval (handled internally by CRM service)

**Step 6: create-tasks-from-actions**
- Input: `{ action_items, intents.commitments, contact_id, deal_id }`
- Output: `{ tasks: [{ id, title, due_date, assigned_to }] }`
- Only creates tasks for items owned by the rep (not prospect commitments)
- HITL gate: Batch task list shown in Slack for approval

**Step 7: notify-slack-summary**
- Input: `{ meeting_data, action_items, intents, next_actions, email_draft, tasks_created }`
- Output: `{ message_ts, channel_id }`
- Inform-only — no approval needed
- Rich Slack Block Kit format with expandable sections

### Branching After Step 2 (detect-intents)

```
IF intents.commitments contains "send_proposal" with confidence >= 0.8:
  QUEUE EVENT: proposal_generation
    payload: { meeting_id, contact_id, trigger_phrase, discussed_topics }

IF intents.commitments contains "schedule_meeting" with confidence >= 0.8:
  QUEUE EVENT: calendar_find_times
    payload: { contact_id, requested_duration, requested_timeframe }

IF intents.commitments contains "send_content" with confidence >= 0.8:
  QUEUE EVENT: content_retrieval
    payload: { contact_id, requested_content_type, trigger_phrase }

IF intents.buying_signals.aggregate_score > 0.7:
  ADD TO crm_updates: { deal_stage: advance_to_next }
  FLAG: high_buying_intent for Slack summary

IF intents.buying_signals.aggregate_score < -0.3:
  FLAG: deal_risk for Slack summary
  ADD TO next_actions: { action: "Address concerns raised in meeting" }
```

---

## pre_meeting_90min

**Trigger**: `proactive-meeting-prep` cron (90 minutes before meeting start)
**Source**: `cron:pre_meeting`
**Required context**: Tier 1 + Tier 2 + selective Tier 3
**Expected duration**: 30-60s
**Chain depth**: 0 (terminal — does not queue follow-ups)

| Order | Skill/Action | Context | Failure | Approval | Output Key |
|-------|-------------|---------|---------|----------|------------|
| 1 | `enrich-attendees` | tier1, tier3:apollo | continue | no | `enrichment` |
| 2 | `pull-crm-history` | tier2 | continue | no | `crm_history` |
| 3 | `check-previous-action-items` | tier2 | continue | no | `previous_actions` |
| 4 | `research-company-news` | tier3:news | continue | no | `company_news` |
| 5 | `generate-briefing` | tier1, tier2 | stop | no | `briefing` |
| 6 | `deliver-slack-briefing` | tier1 | stop | no | `slack_sent` |

### Step Details

**Steps 1-4 execute in parallel** where possible (no inter-dependencies):
- `enrich-attendees`: Apollo lookup for attendee titles, company info, recent job changes
- `pull-crm-history`: Previous meetings, deals, emails with this contact
- `check-previous-action-items`: Unresolved tasks from prior meetings with this contact
- `research-company-news`: Recent press, funding, leadership changes (Apify web scrape)

**Step 5: generate-briefing** — Synthesises all gathered data into a structured brief:
- Attendee profiles with enriched data
- Relationship history summary
- Open action items from previous meetings
- Company news relevant to the conversation
- Suggested talking points based on deal stage and history
- Risk factors (stale deal, competitor mentioned, budget concerns)

**Step 6: deliver-slack-briefing** — Sends the briefing via Slack Block Kit:
```
Meeting in 90 min: {contact_name}, {company}

ATTENDEES
  {name} -- {title} at {company}
  {enrichment highlights}

RELATIONSHIP HISTORY
  {meeting_count} meetings | Last: {last_meeting_date}
  {deal_summary}

UNRESOLVED FROM LAST MEETING
  {action_item_1}
  {action_item_2}

COMPANY NEWS
  {news_headline_1}

SUGGESTED TALKING POINTS
  {point_1}
  {point_2}

[Open full brief ->] [Skip prep ->]
```

---

## email_received

**Trigger**: Gmail/O365 push notification or poll webhook
**Source**: `webhook:email`
**Required context**: Tier 1 + Tier 2 (matched contact)
**Expected duration**: 15-30s
**Chain depth**: 1 (may queue calendar_find_times or proposal_generation)

| Order | Skill/Action | Context | Failure | Approval | Output Key |
|-------|-------------|---------|---------|----------|------------|
| 1 | `classify-email-intent` | tier1 | stop | no | `classification` |
| 2 | `match-to-crm-contact` | tier2 | continue | no | `matched_contact` |
| 3 | BRANCH based on classification | — | — | — | — |

### Branch: meeting_request
| 3a | `calendar_find_times` event queued | tier2 | continue | — | `scheduling_event` |

### Branch: needs_response
| 3b | `draft-reply-email` | tier1, tier2 | continue | yes | `reply_draft` |
| 4b | `notify-slack-reply-ready` | tier1 | continue | no | `slack_sent` |

### Branch: proposal_request
| 3c | `proposal_generation` event queued | tier2 | continue | — | `proposal_event` |

### Branch: info_only
| 3d | `log-email-activity` | tier2 | continue | no | `activity_logged` |

### Classification Categories

| Category | Description | Action |
|----------|-------------|--------|
| `meeting_request` | Prospect wants to schedule a call/meeting | Queue `calendar_find_times` |
| `needs_response` | Question or request that needs a reply | Draft reply, send to Slack for approval |
| `proposal_request` | Asking for pricing, proposal, or quote | Queue `proposal_generation` |
| `positive_reply` | Interested response to outreach | Draft reply + flag deal for stage advance |
| `negative_reply` | Not interested, unsubscribe, etc. | Log, update CRM, suppress from sequences |
| `info_only` | FYI, newsletter, forwarded content | Log activity, no action needed |
| `internal_forward` | Prospect forwarded to colleague | Add new contact, update deal stakeholders |
| `out_of_office` | Auto-reply, OOO message | Log, reschedule any pending follow-ups |

---

## proposal_generation

**Trigger**: Detected intent from `meeting_ended`, or direct request via Slack
**Source**: `orchestrator:chain` or `slack:button_approve`
**Required context**: Tier 1 + Tier 2 + Tier 3 (templates)
**Expected duration**: 60-120s
**Chain depth**: 2 (chained from meeting_ended, may chain to email_send)

| Order | Skill/Action | Context | Failure | Approval | Output Key |
|-------|-------------|---------|---------|----------|------------|
| 1 | `select-proposal-template` | tier1, tier2 | stop | no | `template` |
| 2 | `populate-proposal-fields` | tier2, tier3:template | stop | no | `populated` |
| 3 | `generate-custom-sections` | tier1, tier2 | continue | no | `custom_sections` |
| 4 | `assemble-proposal` | — | stop | no | `proposal` |
| 5 | `present-for-review` | tier1 | stop | yes | `approval` |
| 6 | `email-send-as-rep` | tier1, tier2 | stop | yes | `email_sent` |

### Step Details

**Step 1**: Select template based on deal type (product vs service), deal stage, industry, and deal size. Uses existing proposal templates.

**Step 2**: Auto-populate template variables: company name, contact name, discussed requirements (from meeting transcript), pricing tier, relevant case studies.

**Step 3**: Generate custom sections using AI: executive summary referencing specific conversation points, ROI projections based on discussed pain points, implementation timeline based on prospect's stated urgency.

**Step 4**: Assemble all sections into final document format (PDF or shareable link).

**Step 5**: Present in Slack for review:
```
Proposal ready for {contact_name} at {company}

Executive Summary: {first_2_sentences}
Total Value: {deal_amount}
Sections: {section_count}

[Review full proposal ->] [Edit in use60 ->] [Send via email ->] [Skip ->]
```

**Step 6**: On approval, send via `email-send-as-rep` skill (second HITL gate for the actual send).

---

## calendar_find_times

**Trigger**: Detected intent or email classification
**Source**: `orchestrator:chain` or `webhook:email`
**Required context**: Tier 1 + Tier 2
**Expected duration**: 15-30s
**Chain depth**: 2 (chained from meeting_ended or email_received)

| Order | Skill/Action | Context | Failure | Approval | Output Key |
|-------|-------------|---------|---------|----------|------------|
| 1 | `parse-scheduling-request` | tier1 | stop | no | `request` |
| 2 | `find-available-slots` | tier1, tier2 | stop | no | `slots` |
| 3 | `present-time-options` | tier1 | stop | yes | `selected_times` |
| 4 | `send-times-via-email` | tier1, tier2 | stop | yes | `email_sent` |

See `find-available-slots` skill for the full slot-finding algorithm.

---

## stale_deal_revival

**Trigger**: `proactive-pipeline-analysis` detects deals with no activity for 14+ days
**Source**: `cron:pipeline_scan`
**Required context**: Tier 1 + Tier 2 + Tier 3 (news, LinkedIn)
**Expected duration**: 30-60s per deal
**Chain depth**: 0 (terminal — sends Slack notification)

| Order | Skill/Action | Context | Failure | Approval | Output Key |
|-------|-------------|---------|---------|----------|------------|
| 1 | `research-trigger-events` | tier2, tier3:news, tier3:linkedin | continue | no | `triggers` |
| 2 | `analyse-stall-reason` | tier2 | continue | no | `stall_analysis` |
| 3 | `draft-reengagement` | tier1, tier2 | continue | yes | `reengagement_draft` |

### Step Details

**Step 1**: Search for recent trigger events that could restart the conversation:
- Company funding round, acquisition, or leadership change
- Prospect job change or promotion
- Industry news relevant to the problem you solve
- Competitor activity (new product launch, pricing change)

**Step 2**: Analyse why the deal stalled:
- Last activity type and date
- Last email sentiment (positive? unanswered?)
- Deal stage when activity stopped
- Number of stakeholders engaged
- Proposal sent but not signed?

**Step 3**: Draft a re-engagement approach based on trigger events and stall reason:
- If trigger event found: "Saw your company just raised Series B — congrats. We spoke in January about..."
- If no trigger event: "Checking in — last time we spoke you were evaluating X. Has anything changed?"
- Never generic "just following up" — always reference specific context

---

## morning_brief

**Trigger**: pg_cron at user's configured briefing time (from `slack_user_mappings.briefing_time`)
**Source**: `cron:morning`
**Required context**: Tier 1 + Tier 2 (all today's meeting contacts)
**Expected duration**: 30-45s
**Chain depth**: 0 (terminal)

| Order | Skill/Action | Context | Failure | Approval | Output Key |
|-------|-------------|---------|---------|----------|------------|
| 1 | `load-todays-calendar` | tier1 | stop | no | `meetings` |
| 2 | `check-meeting-prep-status` | tier1 | continue | no | `prep_status` |
| 3 | `scan-inbox-needing-attention` | tier1 | continue | no | `inbox_items` |
| 4 | `run-pipeline-pulse` | tier1, tier2 | continue | no | `pipeline` |
| 5 | `gather-overnight-updates` | tier1 | continue | no | `updates` |
| 6 | `compile-morning-brief` | tier1 | stop | no | `brief` |
| 7 | `deliver-slack-brief` | tier1 | stop | no | `slack_sent` |

Steps 1-5 execute in parallel. Step 6 assembles the composite brief. Step 7 delivers via Slack.

---

## campaign_check

**Trigger**: pg_cron daily (mid-morning, after morning brief)
**Source**: `cron:campaign_check`
**Required context**: Tier 1 + Tier 3 (Instantly metrics)
**Expected duration**: 30-60s
**Chain depth**: 1 (may queue email drafts for positive replies)

| Order | Skill/Action | Context | Failure | Approval | Output Key |
|-------|-------------|---------|---------|----------|------------|
| 1 | `monitor-campaigns` | tier1, tier3:campaign | stop | no | `metrics` |
| 2 | `classify-new-replies` | tier1 | continue | no | `classifications` |
| 3 | `generate-optimizations` | tier1 | continue | no | `recommendations` |
| 4 | `notify-slack-campaign-update` | tier1 | stop | no | `slack_sent` |

See `monitor-campaigns` skill for the full specification.

---

## coaching_digest

**Trigger**: pg_cron weekly (Monday morning) or per-meeting (after `meeting_ended`)
**Source**: `cron:coaching_weekly` or `orchestrator:chain`
**Required context**: Tier 1 + Tier 2 (all meetings in period)
**Expected duration**: 60-120s (weekly), 15-30s (per-meeting)
**Chain depth**: 0 (terminal)

### Weekly Mode

| Order | Skill/Action | Context | Failure | Approval | Output Key |
|-------|-------------|---------|---------|----------|------------|
| 1 | `load-week-meetings` | tier1 | stop | no | `meetings` |
| 2 | `coaching-analysis` (weekly) | tier1, tier2 | stop | no | `analysis` |
| 3 | `correlate-with-outcomes` | tier2 | continue | no | `correlations` |
| 4 | `generate-coaching-digest` | tier1 | stop | no | `digest` |
| 5 | `deliver-slack-digest` | tier1 | stop | no | `slack_sent` |
| 6 | `store-coaching-analysis` | — | continue | no | `stored` |

### Per-Meeting Mode (micro-feedback)

| Order | Skill/Action | Context | Failure | Approval | Output Key |
|-------|-------------|---------|---------|----------|------------|
| 1 | `coaching-analysis` (single) | tier1, tier2 | stop | no | `analysis` |
| 2 | `generate-micro-feedback` | tier1 | stop | no | `feedback` |
| 3 | `deliver-slack-feedback` | tier1 | continue | no | `slack_sent` |

See `coaching-analysis` skill for the full specification.

---

## Conditional Step Syntax

Steps can include conditions that reference previous outputs:

```typescript
interface ConditionalStep {
  order: number
  skill_key?: string
  action?: string
  condition?: string  // JavaScript-like expression evaluated against state.outputs
  // ... other fields
}

// Examples:
{ condition: "outputs.intents.commitments.some(c => c.intent === 'send_proposal')" }
{ condition: "outputs.classification.category === 'meeting_request'" }
{ condition: "outputs.pipeline.at_risk_deals.length > 0" }
{ condition: "outputs.metrics.reply_rate < 0.02" }  // Campaign underperforming
```

Conditions are evaluated before the step executes. If false, the step is skipped and execution moves to the next step.

---

## Parallel Step Execution

Steps at the same order number execute in parallel:

```typescript
// pre_meeting_90min: steps 1-4 all run concurrently
{ order: 1, skill_key: 'enrich-attendees', ... },
{ order: 1, skill_key: 'pull-crm-history', ... },
{ order: 1, skill_key: 'check-previous-action-items', ... },
{ order: 1, skill_key: 'research-company-news', ... },
// Step 5 waits for all order-1 steps to complete
{ order: 2, skill_key: 'generate-briefing', ... },
```

The runner groups steps by order number and uses `Promise.all()` for each group. If any parallel step fails with `on_failure: 'stop'`, all other parallel steps are cancelled.
