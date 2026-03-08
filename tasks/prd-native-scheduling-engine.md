# PRD: Native Scheduling Engine — Closing the Gap

**Date**: 2026-03-07
**Branch**: feat/native-scheduling-engine
**Status**: APPROVED — Ready for execution

---

## Summary

60 has robust server-side scheduling infrastructure (50+ pg_cron jobs, agent-scheduler edge function, 20+ specialist agents) that architecturally surpasses Claude Code Desktop's local-machine scheduling. However, analysis reveals 6 UX and reliability gaps that limit user adoption. This PRD closes those gaps across 3 phases.

## What Exists (DO NOT REBUILD)

- `agent-scheduler/index.ts` (597 lines) — fully working scheduler with cron matching, budget checks, delivery
- `AgentTeamSettings.tsx` (878 lines) — 3-tab admin UI with schedule/trigger CRUD
- `agentTeamService.ts` (269 lines) — full CRUD service layer
- `agent_schedules` + `agent_triggers` tables with RLS
- `unifiedAutonomyResolver.ts` (368 lines) — dual-system trust gating
- `ExecutionHistoryPanel.tsx` (336 lines) — shows sequence_jobs history (NOT schedule runs)

## What's Missing (BUILD THESE)

### Phase 1 — Quick Wins
1. **Friendly frequency picker** replacing raw cron input
2. **agent_schedule_runs table** verified/created with proper migration
3. **Schedule run history UI** wired into AgentTeamSettings

### Phase 2 — Reliability
4. **Missed run catch-up** logic in agent-scheduler
5. **Per-schedule permission mode** wired to unifiedAutonomyResolver

### Phase 3 — Intelligence
6. **One-shot reminders** via copilot ("remind me at 3pm to follow up with Acme")

---

## User Stories

### US-001: Friendly Frequency Picker Component
**Priority**: 1 | **Type**: component | **Estimate**: 30min
**Dependencies**: None

As a platform admin, I want to select schedule frequency from a dropdown (Manual, Hourly, Daily, Weekdays, Weekly) with time/day pickers instead of typing raw cron expressions.

**Acceptance Criteria**:
- [ ] New `FrequencyPicker` component with 5 presets: Manual, Hourly, Daily (time picker), Weekdays (time picker), Weekly (day + time picker)
- [ ] "Custom" option reveals raw cron input for power users
- [ ] Component outputs a valid 5-field cron expression string
- [ ] Time picker defaults to user's timezone (from user_time_preferences or browser)
- [ ] Displays human-readable summary ("Every weekday at 9:00 AM")

**Files**: `src/components/agent/FrequencyPicker.tsx` (new)

---

### US-002: Wire FrequencyPicker into AgentTeamSettings
**Priority**: 2 | **Type**: integration | **Estimate**: 15min
**Dependencies**: US-001

As a platform admin, I want the Schedules tab to use the FrequencyPicker instead of the raw cron text input.

**Acceptance Criteria**:
- [ ] Replace cron_expression Input in schedule creation form with FrequencyPicker
- [ ] Existing schedules display human-readable frequency in the table
- [ ] Edit mode pre-populates FrequencyPicker from existing cron_expression
- [ ] Schedule templates (Morning Brief, Afternoon Check, Weekly Review) use FrequencyPicker presets

**Files**: `src/pages/platform/AgentTeamSettings.tsx` (edit)

---

### US-003: Agent Schedule Runs Migration
**Priority**: 3 | **Type**: schema | **Estimate**: 15min
**Dependencies**: None

As the system, I need a properly created `agent_schedule_runs` table to log every scheduled agent execution.

**Acceptance Criteria**:
- [ ] Migration creates `agent_schedule_runs` table with columns: id, schedule_id (FK), organization_id, agent_name, user_id, status (success/failed/skipped/catch_up), response_summary (text), delivery_channel, delivered (bool), duration_ms (int), error_message, skip_reason, created_at
- [ ] Index on (organization_id, created_at DESC) for fast lookups
- [ ] Index on (schedule_id, created_at DESC) for per-schedule history
- [ ] RLS: service role full access, authenticated users SELECT if can_access_org_data
- [ ] DROP POLICY IF EXISTS before CREATE POLICY (idempotent)

**Files**: `supabase/migrations/<timestamp>_create_agent_schedule_runs.sql` (new)

---

### US-004: Schedule Run History in AgentTeamSettings
**Priority**: 4 | **Type**: component | **Estimate**: 30min
**Dependencies**: US-003

As a platform admin, I want to see execution history for my scheduled agents — when they ran, whether they succeeded, duration, and any errors.

**Acceptance Criteria**:
- [ ] New `ScheduleRunHistory` component showing last 20 runs per schedule
- [ ] Columns: Timestamp, Agent, Status (badge), Duration, Delivery, Error
- [ ] Status badges: success (green), failed (red), skipped (yellow), catch_up (blue)
- [ ] Expandable rows showing response_summary
- [ ] Filter by schedule or show all
- [ ] Wired into AgentTeamSettings as a 4th tab or expandable section under Schedules tab
- [ ] Uses React Query with 30s refetch interval

**Files**: `src/components/agent/ScheduleRunHistory.tsx` (new), `src/pages/platform/AgentTeamSettings.tsx` (edit), `src/lib/services/agentTeamService.ts` (edit — add getScheduleRuns)

---

### US-005: Missed Run Catch-Up Logic
**Priority**: 5 | **Type**: service | **Estimate**: 45min
**Dependencies**: US-003

As the system, I need to detect and execute missed scheduled runs so that users always receive their scheduled briefings even after infrastructure issues.

**Acceptance Criteria**:
- [ ] In agent-scheduler, before cronMatchesNow() filtering, add catch-up pass
- [ ] For each active schedule: if last_run_at is older than expected_interval + 15min buffer, AND within 7 days, fire ONE catch-up run
- [ ] Catch-up runs logged with status='catch_up' and skip_reason='missed_run_catchup' in agent_schedule_runs
- [ ] Helper function `getExpectedInterval(cronExpression)` calculates expected interval from cron
- [ ] Maximum ONE catch-up per schedule per scheduler invocation (prevent cascade)
- [ ] Daily schedules: catch up if missed by >1 hour. Hourly: if missed by >15 min. Weekly: if missed by >1 day

**Files**: `supabase/functions/agent-scheduler/index.ts` (edit)

---

### US-006: Per-Schedule Permission Mode
**Priority**: 6 | **Type**: schema+service | **Estimate**: 45min
**Dependencies**: US-003

As a platform admin, I want each schedule to have its own permission mode (suggest/approve/auto) so that new schedules default to safe mode and earn autonomy over time.

**Acceptance Criteria**:
- [ ] Migration adds `permission_mode` column to `agent_schedules` (default: 'suggest', options: 'suggest'|'approve'|'auto')
- [ ] agent-scheduler consults unifiedAutonomyResolver before executing side effects
- [ ] Permission mode shown in schedule table and editable in creation form
- [ ] If mode is 'suggest': agent runs but results go to Command Centre for review (no auto-send)
- [ ] If mode is 'approve': results delivered but external actions (email send, CRM update) queued for approval
- [ ] If mode is 'auto': full autonomous execution (current behavior)
- [ ] agentTeamService.ts updated with permission_mode in SCHEDULE_COLS

**Files**: `supabase/migrations/<timestamp>_add_schedule_permission_mode.sql` (new), `supabase/functions/agent-scheduler/index.ts` (edit), `src/pages/platform/AgentTeamSettings.tsx` (edit), `src/lib/services/agentTeamService.ts` (edit)

---

### US-007: One-Shot Reminders
**Priority**: 7 | **Type**: schema+service+component | **Estimate**: 45min
**Dependencies**: US-003

As a sales rep, I want to say "remind me at 3pm to follow up with Acme" and receive a notification at that time.

**Acceptance Criteria**:
- [ ] Migration creates `reminders` table: id, user_id, organization_id, remind_at (timestamptz), message, context_type (deal/contact/task/general), context_id (uuid nullable), delivered (bool), delivery_channel (default: 'in_app'), created_at
- [ ] RLS: users can CRUD their own reminders
- [ ] `process-reminders` edge function: queries due reminders, delivers via notification/Slack, marks delivered
- [ ] pg_cron job every minute calling process-reminders
- [ ] Copilot intent detection for "remind me" patterns (time parsing from natural language)
- [ ] Reminders visible in Command Centre or notification feed
- [ ] Expired undelivered reminders (>24h past due) auto-marked as skipped

**Files**: `supabase/migrations/<timestamp>_create_reminders.sql` (new), `supabase/functions/process-reminders/index.ts` (new), `supabase/migrations/<timestamp>_schedule_reminders_cron.sql` (new)

---

## Execution Order

```
Phase 1 — Parallel Group A (no dependencies):
  US-001 (FrequencyPicker)     ← can start immediately
  US-003 (Runs migration)      ← can start immediately

Phase 1 — Sequential:
  US-002 (Wire picker)          ← depends on US-001
  US-004 (Run history UI)       ← depends on US-003

Phase 2 — Sequential:
  US-005 (Missed run catch-up)  ← depends on US-003
  US-006 (Permission mode)      ← depends on US-003

Phase 3:
  US-007 (One-shot reminders)   ← independent but last priority
```

## Non-Goals
- Rebuilding the scheduler engine (already works)
- Desktop/CLI scheduled task integration (no SDK available)
- Visual workflow builder (separate feature)
- Email delivery channel completion (out of scope)
