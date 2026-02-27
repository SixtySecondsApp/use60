---
name: Autonomy Report
description: |
  Comprehensive summary of the user's current autonomy profile — which actions are automated,
  overall autonomy score, time saved, and what's eligible for the next upgrade. Use when a
  user asks "how autonomous am I", "show my autonomy", "what's automated", "autonomy report",
  "show my autopilot status", "what actions are automated", "how much time is the AI saving me",
  "show my autopilot", or asks about time saved by AI automation.
  Queries the user's autopilot_confidence data and returns a rich formatted report with tier
  breakdown, confidence scores, promotion candidates, and a call to action for upgrades.
metadata:
  author: sixty-ai
  version: "1"
  category: platform
  skill_type: atomic
  is_active: true
  context_profile: minimal
  agent_affinity:
    - platform
  triggers:
    - pattern: "how autonomous am I"
      intent: "autonomy_report"
      confidence: 0.95
      examples:
        - "how autonomous am I?"
        - "what's my autonomy level"
        - "how automated am I"
        - "show my autonomy score"
    - pattern: "autonomy report"
      intent: "autonomy_report"
      confidence: 0.95
      examples:
        - "autonomy report"
        - "show autonomy report"
        - "give me my autonomy report"
        - "run an autonomy report"
    - pattern: "show my autopilot status"
      intent: "autonomy_report"
      confidence: 0.90
      examples:
        - "show my autopilot status"
        - "autopilot status"
        - "what's my autopilot doing"
        - "show autopilot"
    - pattern: "what actions are automated"
      intent: "autonomy_report"
      confidence: 0.90
      examples:
        - "what actions are automated"
        - "what's on auto"
        - "which actions run automatically"
        - "what does autopilot handle"
        - "what is being automated"
    - pattern: "how much time is the AI saving me"
      intent: "autonomy_report"
      confidence: 0.88
      examples:
        - "how much time is AI saving me"
        - "time saved by automation"
        - "how many hours does autopilot save"
        - "what's my time saved"
        - "AI time savings"
    - pattern: "show my autonomy"
      intent: "autonomy_report"
      confidence: 0.88
      examples:
        - "show my autonomy"
        - "what's my autonomy"
        - "my autonomy breakdown"
        - "autonomy breakdown"
  keywords:
    - "autonomous"
    - "autonomy"
    - "autopilot"
    - "automated"
    - "automation"
    - "auto tier"
    - "time saved"
    - "AI saving"
    - "approve"
    - "promote"
    - "confidence"
    - "tier"
  required_context: []
  optional_context:
    - user_id
  inputs:
    - name: user_id
      type: string
      description: "The user ID to generate the autonomy report for. Defaults to the authenticated user."
      required: false
  outputs:
    - name: autonomy_score
      type: number
      description: "Overall autonomy score (0-100): percentage of tracked action types at the 'auto' tier"
    - name: time_saved_hours_week
      type: number
      description: "Estimated hours saved per week across all auto and approve-tier actions"
    - name: tier_breakdown
      type: object
      description: "Count of action types at each tier: auto, approve, suggest"
    - name: auto_actions
      type: array
      description: "Action types currently at 'auto' tier with confidence scores"
    - name: approve_actions
      type: array
      description: "Action types at 'approve' tier — HITL but nearly automated"
    - name: promotion_candidates
      type: array
      description: "Action types closest to qualifying for the next tier upgrade"
  priority: high
  tags:
    - platform
    - autonomy
    - autopilot
    - automation
    - reporting
---

## Available Context & Tools
@_platform-references/org-variables.md
@_platform-references/capabilities.md

## Instructions

You are executing the Autonomy Report skill. Your job is to query the user's autopilot confidence data and produce a clear, motivating summary of their current automation profile — what's running on autopilot, what's nearly there, how much time is being saved, and what they should promote next.

## Data Gathering

Fetch the user's autopilot confidence data by querying the `autopilot_confidence` table:

```
execute_action("get_autopilot_confidence", { user_id: "${user_id}" })
```

This returns rows from the `autopilot_confidence` table. Each row has:
- `action_type`: string identifier (e.g. `crm.note_add`, `email.send`, `task.create`)
- `current_tier`: one of `disabled`, `suggest`, `approve`, `auto`
- `score`: 0–100 confidence score (higher = more trusted)
- `approval_rate`: fraction of executions approved by the user (null if no data)
- `clean_approval_rate`: fraction approved without edits (null if no data)
- `edit_rate`: fraction where user edited before approving (null if no data)
- `rejection_rate`: fraction rejected (null if no data)
- `undo_rate`: fraction undone after auto-execution (null if no data)
- `total_signals`: total number of interactions recorded
- `total_approved`: count of approvals
- `total_rejected`: count of rejections
- `total_undone`: count of undos
- `last_30_score`: score over the last 30 days (null if insufficient data)
- `days_active`: days since first signal
- `promotion_eligible`: boolean — true if ready for next tier
- `cooldown_until`: ISO timestamp if in cooldown after a rejection/undo (null if not)
- `never_promote`: boolean — user has locked this action out of auto promotion
- `extra_required_signals`: additional signals needed before promotion eligibility
- `first_signal_at`: ISO timestamp of first signal
- `last_signal_at`: ISO timestamp of most recent signal

If no rows are returned, the user has not interacted with autopilot yet — present an onboarding message.

## Computed Metrics

Calculate these aggregates from the returned rows before writing the report:

**Autonomy Score** (0–100):
- `autonomy_score = (count of rows where current_tier = 'auto') / (total rows) * 100`
- Round to nearest integer.

**Tier Counts**:
- `auto_count`: rows where `current_tier = 'auto'`
- `approve_count`: rows where `current_tier = 'approve'`
- `suggest_count`: rows where `current_tier = 'suggest'`

**Time Saved Per Week (hours)**:
Use these per-action time estimates (in seconds) to compute weekly savings:

| Action Type | Seconds Saved |
|-------------|--------------|
| `crm.note_add` | 120 |
| `crm.activity_log` | 30 |
| `crm.contact_enrich` | 300 |
| `crm.next_steps_update` | 60 |
| `crm.deal_field_update` | 45 |
| `crm.deal_stage_change` | 30 |
| `crm.deal_amount_change` | 30 |
| `crm.deal_close_date_change` | 30 |
| `email.draft_save` | 0 |
| `email.send` | 600 |
| `email.follow_up_send` | 480 |
| `email.check_in_send` | 300 |
| `task.create` | 60 |
| `task.assign` | 30 |
| `analysis.risk_assessment` | 900 |
| `analysis.coaching_feedback` | 1200 |
| (all other action types) | 60 |

For each row at `auto` or `approve` tier:
- `signals_per_week = (total_signals / 90) * 7`
- `multiplier = 1.0` for `auto`, `0.7` for `approve` (HITL reduces savings)
- `time_saved_seconds += signals_per_week * action_time_seconds * multiplier`

`time_saved_hours_week = time_saved_seconds / 3600`

**Promotion Candidates**:
Rows that are NOT at `auto` and NOT `never_promote = true`, sorted by:
1. `promotion_eligible = true` first
2. Then highest `score`
3. Then lowest `extra_required_signals`

Take the top 3 candidates.

**Next-Tier Labels**:
- `suggest` -> next tier is `approve`
- `approve` -> next tier is `auto`

## Output Format

Render a rich, plain-text formatted report using block characters and markdown-compatible structure. Do NOT use emoji — use action_type names and Lucide-style labels instead.

---

### Report Template

```
AUTONOMY REPORT
───────────────────────────────────────

OVERALL AUTONOMY SCORE
[render a 20-char block bar where filled blocks (█) represent score, empty (░) represent remainder]
[score]% autonomous   [auto_count] auto / [approve_count] approve / [suggest_count] suggest

[One-line interpretation:]
- 0%: "Autopilot is just getting started — every approval builds trust."
- 1–25%: "Early stage — the AI is learning your patterns."
- 26–50%: "Growing autonomy — several actions are now fully automated."
- 51–75%: "Strong autopilot — more than half your tracked actions run hands-free."
- 76–99%: "Near-full autonomy — you're running lean."
- 100%: "Maximum autonomy — fully hands-free across all tracked actions."

TIME SAVED THIS WEEK
~[X.X] hrs saved      [X] actions ran on autopilot (last 30 days)

───────────────────────────────────────

AUTO (fully hands-free)
[For each auto-tier row:]
  [action_type label]   score: [score]/100   [approval_rate*100]% approval rate
  [if undo_rate > 0.05]: "  Note: [undo_rate*100]% undo rate — watch this one"

APPROVE (you review, then it runs)
[For each approve-tier row:]
  [action_type label]   score: [score]/100   [total_approved] approved / [total_rejected] rejected
  [if promotion_eligible]: "  Ready to promote to auto"

SUGGEST (recommendation only)
[For each suggest-tier row:]
  [action_type label]   score: [score]/100   [total_signals] signals recorded

───────────────────────────────────────

WHAT'S NEXT
[Show top 3 promotion candidates:]

[For each promotion_eligible = true candidate:]
  [action_type label] is ready for promotion
  Current tier: [current_tier] -> [next_tier]   Score: [score]/100
  "[action_type] has [total_approved]/30 clean approvals. Want me to upgrade it to [next_tier]?"

[For each candidate NOT yet promotion_eligible:]
  [action_type label] needs [extra_required_signals] more signals
  Current tier: [current_tier]   Score: [score]/100   [total_signals] signals so far

[If no candidates:]
  All tracked actions are either at 'auto' or locked from promotion.

───────────────────────────────────────

RECENT ACTIVITY
[List the 3 most recently active rows by last_signal_at:]
  [action_type label]   last seen: [relative time, e.g. "2 days ago"]   tier: [current_tier]
```

### Action Type Labels

Map raw `action_type` values to human-readable labels:

| action_type | Label |
|-------------|-------|
| `crm.note_add` | CRM Note |
| `crm.activity_log` | Activity Log |
| `crm.contact_enrich` | Contact Enrichment |
| `crm.next_steps_update` | Next Steps Update |
| `crm.deal_field_update` | Deal Field Update |
| `crm.deal_stage_change` | Deal Stage Change |
| `crm.deal_amount_change` | Deal Amount Update |
| `crm.deal_close_date_change` | Close Date Update |
| `email.draft_save` | Email Draft Save |
| `email.send` | Email Send |
| `email.follow_up_send` | Follow-Up Email |
| `email.check_in_send` | Check-In Email |
| `task.create` | Task Creation |
| `task.assign` | Task Assignment |
| `analysis.risk_assessment` | Risk Assessment |
| `analysis.coaching_feedback` | Coaching Feedback |
| (unknown) | use the raw `action_type` value, replacing dots with spaces |

### Block Bar Rendering

For a 20-character progress bar at score `S`:
- `filled = round(S / 100 * 20)`
- `empty = 20 - filled`
- Bar: `"█".repeat(filled) + "░".repeat(empty)`

Example at 65%: `█████████████░░░░░░░`

### Call-to-Action Phrasing

For each `promotion_eligible = true` candidate, produce a specific call to action:

- If `current_tier = 'approve'` and `next_tier = 'auto'`:
  > "Want me to upgrade [Label] to auto? I've got [total_approved]/[total_approved + total_rejected] clean approvals — that's [approval_rate*100 rounded]%."

- If `current_tier = 'suggest'` and `next_tier = 'approve'`:
  > "[Label] is ready to move to approve mode. Should I enable it? You'll get a preview before each action runs."

## Error Handling

### No data returned (new user)
> "Autopilot is warming up. As you interact with the platform, I'll track which actions I can handle for you and start earning trust tier by tier. Check back after a few days of activity."

### All actions at 'auto' (100% autonomy)
> "You've reached maximum autonomy — every tracked action type is running hands-free. Nothing to promote. I'll continue monitoring for reliability and flag anything that needs attention."

### All actions locked (`never_promote = true` on all non-auto rows)
> "All remaining actions are locked from promotion by your preferences. If you'd like to re-enable promotion for any action, visit Autopilot Settings."

### Partial data (some rows missing `approval_rate`)
> Skip the approval_rate display for those rows. Do not show null or "N/A" — simply omit the metric.

## Quality Checklist

Before returning:
- [ ] Autonomy score computed correctly (auto count / total count)
- [ ] Block bar matches score visually
- [ ] Time saved uses the correct per-action seconds table and weekly extrapolation
- [ ] Promotion candidates sorted correctly (eligible first, then by score)
- [ ] Call-to-action phrasing includes specific signal counts, not generic text
- [ ] Action type labels are human-readable (not raw `crm.note_add` style)
- [ ] No emoji used anywhere in the output
- [ ] Undo rate warnings included where `undo_rate > 0.05`
- [ ] Cooldown actions noted if `cooldown_until` is in the future
