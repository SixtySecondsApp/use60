# Enhanced Morning Briefing — Manual Test Guide

**Story**: BRF-009
**Function**: `proactive-pipeline-analysis`
**Cron**: `0 8 * * 1-5` (08:00 UTC, Mon–Fri)

---

## Prerequisites

- Slack integration connected for the test user (Settings → Integrations → Slack)
- At least one open deal with a deal stage that has a `default_probability > 0`
- Agent config seeded (BRF-002 migration applied)
- Pipeline math RPCs available (BRF-003 migration applied)

---

## 1. Automated Unit Tests

Run Vitest directly against the pure functions:

```bash
npm run test -- supabase/functions/proactive-pipeline-analysis/test.ts
```

The suite covers:

| Test Group | # Tests | What it validates |
|---|---|---|
| `detectQuarterPhase` | 6 | Build/progress/close phase boundaries, April fiscal year, weeksRemaining, description |
| `pipeline math coverage` | 5 | On-track 3x coverage, behind-target shortfall, no-target null fields |
| `recommendHighestLeverageAction` | 6 | Closing-soon priority, pipeline build, at-risk revive, required fields, empty fallback, protect_coverage |
| `overnight summary contract` | 2 | Severity enum values, event type enum coverage |
| `buildEnhancedMorningBriefMessage` | 3 | Module export, blocks/text structure, summary vs detailed block count |

**Expected**: All 22 tests pass.

---

## 2. Manual Slack Delivery Test (Staging)

### Step 1 — Invoke the function directly

```bash
curl -X POST \
  "https://caerqjzvuerejfrdtygb.supabase.co/functions/v1/proactive-pipeline-analysis" \
  -H "Authorization: Bearer <YOUR_STAGING_SERVICE_ROLE_KEY>" \
  -H "Content-Type: application/json" \
  -d '{"action": "analyze"}'
```

Or using the Supabase CLI:

```bash
npx supabase functions invoke proactive-pipeline-analysis \
  --project-ref caerqjzvuerejfrdtygb \
  --body '{"action": "analyze"}'
```

### Step 2 — Verify Slack message received

Check the Slack DM for the test user. The message should contain:

- **Header**: `Morning Brief — <Phase> | Wk <N>`
- **Pipeline Math section**: Closed $X / Weighted $X / Coverage Xx
- **Top Action block** with category and rationale (detailed format)
- **Overnight Events** section (if any events since 7PM yesterday)
- **Meetings Today** section (if any calendar events)
- **Footer buttons**: "Open Pipeline" + "Ask Copilot"

### Step 3 — Verify Action Centre item created

Check Supabase `action_items` table for a row with:
- `user_id` = test user ID
- `action_type` = `morning_brief`
- `title` contains "Morning Brief"
- `due_date` = today

---

## 3. Briefing Format Variants

### Detailed format (default)

No action needed — `briefing_format = detailed` is the seeded default.

Detailed format includes:
- Pipeline math as 2-column field blocks
- Quarter phase context (weeks remaining + description)
- Top action rationale paragraph
- All overnight events (up to 3)

### Summary format

Override the agent config for the test user:

```sql
-- Run in Supabase SQL editor (staging)
INSERT INTO agent_config_user_overrides (user_id, org_id, agent_type, key, value)
VALUES (
  '<TEST_USER_ID>',
  '<TEST_ORG_ID>',
  'morning_briefing',
  'briefing_format',
  '"summary"'
)
ON CONFLICT (user_id, org_id, agent_type, key)
DO UPDATE SET value = '"summary"';
```

Then re-invoke the function. Summary format should:
- Use compact bullet list for pipeline math (not field blocks)
- Omit quarter phase context block
- Omit top action rationale
- Have fewer total blocks than detailed format

Restore default after testing:

```sql
DELETE FROM agent_config_user_overrides
WHERE user_id = '<TEST_USER_ID>'
  AND key = 'briefing_format';
```

---

## 4. Quarter Phase Scenarios

The `detect-quarter-phase` step is driven by the real calendar date. To test specific phases without waiting for the correct week, you can temporarily patch `quarterStartMonth` via agent config:

| Phase | Weeks into quarter | Test date (Q1 Jan start) |
|---|---|---|
| Build | 1–4 | Jan 1–28 |
| Progress | 5–9 | Jan 29–Mar 1 |
| Close | 10–13 | Mar 2–Mar 31 |

---

## 5. Pipeline Math Edge Cases

### User with no target set

Ensure `agent_config_user_overrides` has no `quota.revenue` key for the test user. Pipeline math fields `coverage_ratio`, `gap_amount`, and `projected_close` should all be `null` in the Slack message (fields will be omitted or show dashes).

### User with zero pipeline

Create a test user with no open deals. Invoke the function. The briefing should still send with:
- Pipeline math showing $0 weighted pipeline
- Top action recommending `build_pipeline`
- No "While you slept" section (no overnight events)

### At-risk deals

Set `risk_score >= 60` or `health_score < 50` on one or more deals for the test user. The briefing should show:
- `deals_at_risk > 0` in the pipeline math section
- Top action potentially `revive` or `protect_coverage` if coverage is low

---

## 6. Cron Job Verification (Staging)

Check the scheduled cron job exists:

```sql
SELECT jobname, schedule, command
FROM cron.job
WHERE jobname = 'enhanced-morning-briefing';
```

Expected result:

| jobname | schedule | command |
|---|---|---|
| enhanced-morning-briefing | 0 8 * * 1-5 | SELECT public.cron_morning_briefing() |

Check the last cron execution:

```sql
SELECT start_time, end_time, status, return_message
FROM cron.job_run_details
WHERE jobid = (SELECT jobid FROM cron.job WHERE jobname = 'enhanced-morning-briefing')
ORDER BY start_time DESC
LIMIT 5;
```

---

## 7. Fleet Sequence Verification

Verify the fleet route and sequence are registered:

```sql
-- Event route
SELECT org_id, event_type, sequence_key, priority, is_active
FROM fleet_event_routes
WHERE event_type = 'cron.morning_briefing';

-- Sequence definition
SELECT sequence_key, version, is_active,
       jsonb_array_length(steps) AS step_count
FROM fleet_sequence_definitions
WHERE sequence_key = 'enhanced_morning_briefing';
```

Expected:
- 1 route row with `is_active = true`
- 1 sequence row with `step_count = 4`, `is_active = true`

---

## 8. Troubleshooting

### No Slack message received

1. Check Supabase function logs for the test invocation
2. Verify Slack token is valid: `SELECT slack_bot_token IS NOT NULL FROM user_settings WHERE user_id = '<ID>'`
3. Check `action_items` table — if a row exists, the function ran but Slack delivery may have failed

### Pipeline math returns zeros

1. Check deals exist for the user: `SELECT COUNT(*) FROM deals WHERE owner_id = '<ID>' AND org_id = '<ORG>'`
2. Verify deal stages have `default_probability > 0`: `SELECT name, default_probability FROM deal_stages WHERE org_id = '<ORG>'`
3. Check the `calculate_pipeline_math` RPC directly: `SELECT * FROM calculate_pipeline_math('<ORG_ID>', '<USER_ID>', 'quarterly')`

### Quarter phase is wrong

Check the `quarter_start_month` config value:

```sql
SELECT * FROM resolve_agent_config('<ORG_ID>', '<USER_ID>', 'morning_briefing', 'quarter_start_month');
```

Default is `1` (January). Override per user as shown in section 4 above.

---

## Related Stories

| Story | File | Purpose |
|---|---|---|
| BRF-001 | `20260222500001_pipeline_snapshots.sql` | pipeline_snapshots schema |
| BRF-002 | `20260222500002_morning_briefing_agent_config.sql` | Agent config defaults seed |
| BRF-003 | `20260222500003_pipeline_math_rpcs.sql` | calculate_pipeline_math RPC |
| BRF-004 | `_shared/orchestrator/adapters/pipelineMath.ts` | detectQuarterPhase + recommender |
| BRF-005 | `20260222500004_schedule_pipeline_snapshot_cron.sql` | Weekly snapshot cron |
| BRF-006 | `_shared/orchestrator/adapters/overnightSummary.ts` | Overnight work summary |
| BRF-007 | `proactive-pipeline-analysis/index.ts` | Enhanced briefing delivery |
| BRF-008 | `20260222500005_morning_briefing_fleet_routes.sql` | Fleet routes + cron |
| BRF-009 | `proactive-pipeline-analysis/test.ts` + `TESTING.md` | Tests (this file) |
