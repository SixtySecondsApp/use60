# Consult Report: Slack Assistant Professional

**Generated**: 2026-02-24
**Feature**: slack-assistant-professional
**Plan**: `.sixty/plan-slack-assistant-professional.json`

## User Request

Transform the Slack AI sales assistant from a noisy, spammy notification bot into a professional, context-aware assistant. Key complaints:
1. Calendar tasks ("Send Payroll", "Pay court fee") treated as meetings
2. Links to use60.com cause messy Open Graph unfurls
3. Can't mark tasks as done from Slack
4. Prospect tasks shown as if they're rep tasks
5. Same notification sent 4x in 8 hours (12AM, 4AM, 7AM, 8AM)

## User Decisions

- **Task category model**: Option B — add `task_category` column with enum values
- **Prospect task behavior**: Don't notify about prospect tasks unless they require rep follow-up. Example: "Kevin said he'd get back to you yesterday but didn't. Want to call or shall I draft an email?"

---

## Codebase Scout Findings

### Key Files

| File | Purpose | Issues |
|------|---------|--------|
| `supabase/functions/proactive-task-analysis/index.ts` | Task reminder cron | No dedup, no quiet hours, unpinned import, no Complete button, no task categorization |
| `supabase/functions/proactive-meeting-prep/index.ts` | Meeting prep cron | Staging fallback removes attendee filter, no cross-dedup with morning brief |
| `supabase/functions/slack-morning-brief/index.ts` | Morning briefing | Duplicated by enhanced-morning-briefing cron |
| `supabase/functions/slack-copilot-actions/index.ts` | Slack message posting | Missing unfurl_links: false, dead slack_auth table reference |
| `supabase/functions/slack-interactive/index.ts` | Slack button handlers | Wrong appUrl default, but has working task_complete/snooze handlers |
| `supabase/functions/_shared/proactive/deliverySlack.ts` | Shared delivery layer | Has checkUserDeliveryPolicy() but proactive-task-analysis doesn't use it |
| `supabase/functions/_shared/proactive/dedupe.ts` | Shared dedup layer | Has shouldSendNotification() but proactive-task-analysis doesn't use it |

### Existing Assets (reusable)

- `shouldSendNotification()` in `_shared/proactive/dedupe.ts` — ready to use, proactive-task-analysis just never imports it
- `checkUserDeliveryPolicy()` in `_shared/proactive/deliverySlack.ts` — quiet hours + rate limit, ready to use
- `handleTaskComplete()` in `slack-interactive/index.ts` — existing handler for `task_complete` action_id
- `handleTaskSnooze()` in `slack-interactive/index.ts` — existing handler for `task_snooze_1d` action_id
- `slack_user_preferences` table — per-user, per-feature notification toggle + quiet hours
- `slack_notifications_sent` table — dedup tracking with cooldown windows

### Gaps Identified

- No `task_category` column on `tasks` table
- No classification heuristics for task ownership (rep vs prospect vs admin)
- No `unfurl_links: false` anywhere in the codebase
- No cross-deduplication between meeting prep and morning brief
- `proactive-task-analysis` is completely standalone — doesn't use any shared proactive infrastructure

---

## Patterns Analyst Findings

### Notification Delivery Pattern

All proactive notifications should follow:
1. `shouldSendNotification()` — dedup check
2. `checkUserDeliveryPolicy()` — quiet hours + rate limit
3. Build Block Kit message
4. `deliverToSlack()` or direct `chat.postMessage`
5. `recordNotificationSent()` — log for future dedup

**`proactive-task-analysis` skips steps 1, 2, and 5.** This is why it spams.

### Slack Block Kit Conventions

- Headers: `plain_text` with emoji
- Task items: `section` with mrkdwn, `actions` block with buttons
- Footer: `context` block with mrkdwn links
- Buttons: `action_id` pattern `{action}_{entity_type}` or `{action}::{entity_type}::{id}`
- Values: `JSON.stringify({ taskId, ... })`

### Cron Scheduling

| Pattern | Description |
|---------|-------------|
| `0 */4 * * *` | Every 4 hours (BROKEN for task reminders) |
| `0 8 * * 1-5` | Daily 8AM UTC weekdays (morning brief pattern) |
| `*/15 * * * *` | 15-min polling (slack-morning-brief, respects user time) |

---

## Risk Scanner Findings

| Severity | Risk | Mitigation |
|----------|------|------------|
| High | `@supabase/supabase-js@2` unpinned — intermittent 500s | Pin to `@2.43.4` (story SLKPRO-001) |
| High | `slack_auth` table doesn't exist — thread replies broken | Replace with `slack_user_mappings` (story SLKPRO-011) |
| Medium | Backfill heuristics for task_category may misclassify | Use conservative patterns, default to `rep_action` |
| Medium | Cron migration needs to run on all environments | Deploy migration to dev → staging → production |
| Low | Existing tasks won't have category until backfill runs | Default `rep_action` means they show as before until backfill |

---

## Scope Sizer

- **Total stories**: 12
- **Total estimate**: ~3 hours (with parallel execution)
- **MVP (Phase 1 + 2)**: ~1.5 hours — stops spam + adds smart filtering
- **Parallel opportunities**: All Phase 1 stories are independent. Phase 2 has two parallel groups.

---

## Before/After UX

### Before (current state)
```
12:00 AM  Task Reminder: 7 overdue [identical]
 4:00 AM  Task Reminder: 7 overdue [identical]
 7:00 AM  Meeting prep: "Pay court fee" — is this a sales meeting?
 7:00 AM  Meeting briefing: Standup (generic boilerplate)
 7:30 AM  Skipped response
 8:00 AM  Morning brief (with tasks, meetings)
 8:00 AM  Task Reminder: 7 overdue [3rd time]
 8:00 AM  Meeting prep: "Pay court fee" [2nd time]
 8:00 AM  Morning brief [duplicate]
 8:30 AM  Meeting prep: "Aleto Foundation" — is this a sales meeting?
 8:30 AM  Meeting prep: "Send Payroll" — is this a sales meeting?
```

### After (target state)
```
 8:00 AM  Morning brief:
            - 3 rep tasks overdue [Done] [Snooze]
            - 1 admin task (Pay court fee) [Done] [Snooze]
            - Kevin was meant to send the budget 2 days ago but hasn't.
              [Call Kevin] [Draft follow-up email]
            - Meetings: Standup 9AM, Aleto Foundation 9:30AM
 9:00 AM  Meeting prep: Aleto Foundation (external, 3 attendees)
            - Attendee intel, talking points, deal context
```
