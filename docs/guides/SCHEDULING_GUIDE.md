# Native Scheduling Engine

The scheduling engine runs agent tasks on cron schedules and delivers results via in-app notifications, Slack, or email.

## Architecture

```
┌──────────────┐     pg_cron      ┌──────────────────┐
│ agent_schedules│ ──────────────▶ │ agent-scheduler   │
│ (config)      │                 │ (edge function)   │
└──────────────┘                 └────────┬─────────┘
                                          │
                    ┌─────────────────────┼─────────────────────┐
                    ▼                     ▼                     ▼
            ┌────────────┐     ┌──────────────┐     ┌──────────────┐
            │ in_app     │     │ slack-send   │     │ email        │
            │ notification│     │ (edge fn)    │     │ (placeholder)│
            └────────────┘     └──────────────┘     └──────────────┘
```

### Tables

| Table | Purpose |
|-------|---------|
| `agent_schedules` | Schedule config: cron, agent, prompt, delivery channel, permission mode |
| `agent_schedule_runs` | Execution log: status, duration, response, delivery outcome |
| `reminders` | User reminders processed by `process-reminders` edge function |

### Edge Functions

| Function | Trigger | Purpose |
|----------|---------|---------|
| `agent-scheduler` | pg_cron (every 5 min) or manual POST | Matches cron expressions, runs agents, delivers results |
| `process-reminders` | pg_cron (every minute) | Delivers due reminders via notification or Slack |

## Permission Modes

| Mode | Behavior |
|------|----------|
| `suggest` | Agent runs but result is NOT delivered. Stored as a pending suggestion for user review. |
| `approve` | Agent runs and result is delivered, but external actions are gated. |
| `auto` | Full autonomous execution and delivery. |

## Catch-Up Logic

When the scheduler detects a missed run (e.g., server downtime), it triggers a catch-up:

- Buffer = `max(15 min, 10% of interval)`
- Max lookback: 7 days
- First-time schedules are never caught up
- Catch-up runs are tagged with `status: 'catch_up'`

## Schedule Templates

Three pre-built templates are available via Quick Add:

1. **Morning Pipeline Brief** — Pipeline agent, weekdays 9am EST (`0 14 * * 1-5` UTC)
2. **Afternoon Follow-up Check** — Outreach agent, weekdays 2pm EST (`0 19 * * 1-5` UTC)
3. **Weekly Pipeline Review** — Pipeline agent, Monday 9am EST (`0 14 * * 1` UTC)

## Frontend Components

| Component | Location | Purpose |
|-----------|----------|---------|
| `FrequencyPicker` | `src/components/agent/FrequencyPicker.tsx` | Human-friendly cron builder with presets |
| `ScheduleRunHistory` | `src/components/agent/ScheduleRunHistory.tsx` | Execution history table with expandable details |
| `AgentTeamSettings` | `src/pages/platform/AgentTeamSettings.tsx` | Admin page with tabs: Config, Schedules, Triggers, History |

## Cron Expression Format

Standard 5-field: `minute hour day-of-month month day-of-week`

| Preset | Example | Cron |
|--------|---------|------|
| Hourly | Every hour at :30 | `30 * * * *` |
| Daily | Every day at 9 AM | `0 9 * * *` |
| Weekdays | Weekdays at 2 PM | `0 14 * * 1-5` |
| Weekly | Monday at 9 AM | `0 9 * * 1` |

Note: Cron expressions are evaluated in **UTC**. The FrequencyPicker displays the user's local timezone alongside the time picker.

## Migrations

| File | Purpose |
|------|---------|
| `20260307223445_create_agent_schedule_runs.sql` | Run history table + RLS |
| `20260307223713_add_schedule_permission_mode.sql` | Permission mode column on agent_schedules |
| `20260307223924_create_reminders.sql` | Reminders table + RLS |
| `20260307223925_schedule_reminders_cron.sql` | pg_cron job for process-reminders |

## Manual Run (API)

```bash
curl -X POST "${SUPABASE_URL}/functions/v1/agent-scheduler" \
  -H "Authorization: Bearer ${USER_JWT}" \
  -H "Content-Type: application/json" \
  -d '{"schedule_id": "uuid-here"}'
```

Requires admin role in the schedule's organization.
