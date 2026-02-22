# Re-engagement Agent — Testing Guide

**PRD**: PRD-05/PRD-06 Always-On Re-engagement Agent
**Stories covered**: REN-008

This document covers automated test execution and manual Slack HITL testing
for the full re-engagement pipeline: signal detection → scoring → drafting →
Slack approval.

---

## Automated Tests

### Running the tests

```bash
# From repo root
npm run test -- supabase/functions/agent-reengagement/test.ts

# With coverage
npm run test -- --coverage supabase/functions/agent-reengagement/test.ts
```

### Test scenarios (automated)

| Scenario | What is tested |
|----------|----------------|
| 1 — Apollo job change signal | `scoreSignalStrength` response to job_change/funding_round signal types; rising trend; 24h recency bonuses |
| 2 — Apify company news signal | `scoreSignalStrength` for funding/product_launch Apify signals; no bonus for general_news |
| 3 — Relevance scoring dimensions | All four scoring dimensions: timing tiers, relationship (0/1/2/3+ contacts), reason compatibility matrix |
| 4 — Cooldown gate filtering | All four gates: unsubscribed, max_attempts, cooldown_until, min_days_since_close |
| 5 — Slack HITL block structure | `buildReengagementApprovalMessage`: blocks/text present, header contains deal name, 4 action buttons with correct action_id prefixes, deal ID embedded for routing |
| 6 — Threshold qualification | Score + gates combined for qualification; high score but blocked gate = not qualified; sorted output (qualified first) |
| 7 — Edge cases | temperature=0.0, scoreTiming boundary at minDays, case-insensitive loss_reason, fleet route step count contract, adapter registry contract |

---

## Database Verification Checklist

After running migrations (`20260222400001` through `20260222400004`), verify in
Supabase Studio or via psql:

```sql
-- 1. deal_signal_temperature table exists with correct columns
SELECT column_name, data_type
FROM information_schema.columns
WHERE table_name = 'deal_signal_temperature'
ORDER BY ordinal_position;
-- Expected: id, deal_id, org_id, temperature, trend, last_signal,
--           signal_count_24h, signal_count_7d, top_signals, created_at, updated_at

-- 2. reengagement_watchlist has REN-001 cooldown columns
SELECT column_name FROM information_schema.columns
WHERE table_name = 'reengagement_watchlist'
  AND column_name IN ('max_attempts', 'attempt_count', 'cooldown_until', 'unsubscribed');
-- Must return all 4 rows

-- 3. upsert_signal_temperature RPC exists
SELECT routine_name FROM information_schema.routines
WHERE routine_name = 'upsert_signal_temperature';

-- 4. get_hot_deals RPC exists
SELECT routine_name FROM information_schema.routines
WHERE routine_name = 'get_hot_deals';

-- 5. Fleet event routes registered
SELECT event_type, sequence_key, priority, is_active
FROM fleet_event_routes
WHERE event_type IN ('cron.reengagement_scan', 'deal_closed_lost')
ORDER BY event_type;
-- Expected:
--   cron.reengagement_scan → reengagement_scoring, priority=0, active=true
--   deal_closed_lost       → reengagement_watchlist_add, priority=0, active=true

-- 6. Fleet sequence definition: reengagement_scoring with 6 steps
SELECT sequence_key, jsonb_array_length(steps) AS step_count
FROM fleet_sequence_definitions
WHERE sequence_key IN ('reengagement_scoring', 'reengagement_watchlist_add');
-- Expected: reengagement_scoring=6, reengagement_watchlist_add=1

-- 7. Verify step skill names in sequence
SELECT step->>'skill' AS skill
FROM fleet_sequence_definitions,
     jsonb_array_elements(steps) AS step
WHERE sequence_key = 'reengagement_scoring'
ORDER BY ordinality;
-- Expected order:
--   apollo-signal-scan
--   apify-news-scan
--   score-reengagement-signals
--   analyse-stall-reason
--   draft-reengagement
--   deliver-reengagement-slack

-- 8. Cron job scheduled
SELECT jobname, schedule
FROM cron.job
WHERE jobname = 'reengagement-daily-scan';
-- Expected: '0 6 * * *' (daily at 06:00 UTC)

-- 9. Agent config defaults seeded
SELECT config_key, config_value
FROM agent_config_defaults
WHERE agent_type = 'reengagement'
ORDER BY config_key;
-- Expected 7 rows: cooldown_days, max_attempts, min_days_since_close,
-- reengagement_enabled, signal_relevance_threshold, signal_sources, tone_of_voice
```

---

## Manual Slack HITL Testing

### Prerequisites

1. Slack integration configured for the test user (Settings → Integrations → Slack)
2. `slack_user_mappings` row present mapping the deal owner's user_id to a Slack user ID
3. `agent-reengagement` deployed to staging:
   ```bash
   npx supabase functions deploy agent-reengagement \
     --project-ref caerqjzvuerejfrdtygb --no-verify-jwt
   ```
4. At least one deal in `reengagement_watchlist` with `status = 'active'` and
   `days_since_close >= 90`
5. A `deal_signal_temperature` row for that deal with `temperature >= 0.6`

### Seeding test data

```sql
-- Insert a test closed/lost deal into the watchlist
INSERT INTO reengagement_watchlist (
  org_id, deal_id, deal_name, deal_value, contact_ids, loss_reason,
  close_date, max_attempts, attempt_count, status
)
SELECT
  o.id,
  d.id,
  d.name,
  d.value,
  ARRAY[]::uuid[],
  'budget',
  NOW() - INTERVAL '120 days',
  3, 0, 'active'
FROM deals d
JOIN organizations o ON d.org_id = o.id
WHERE d.status = 'lost'
LIMIT 1
ON CONFLICT DO NOTHING;

-- Insert a temperature row (simulating Apollo/Apify signals)
INSERT INTO deal_signal_temperature (
  deal_id, org_id, temperature, trend, last_signal,
  signal_count_24h, signal_count_7d, top_signals
)
SELECT
  d.id, d.org_id, 0.75, 'rising', NOW(),
  1, 3,
  '[
    {"type": "funding_round", "source": "apollo", "description": "Raised $25M Series A", "score_delta": 0.30, "detected_at": "NOW()"},
    {"type": "leadership_change", "source": "apify", "description": "New CFO hired", "score_delta": 0.18, "detected_at": "NOW()"}
  ]'::jsonb
FROM deals d
WHERE d.status = 'lost'
LIMIT 1
ON CONFLICT (deal_id) DO UPDATE SET
  temperature = EXCLUDED.temperature,
  trend = EXCLUDED.trend,
  top_signals = EXCLUDED.top_signals;
```

### Triggering a test run

**Option A: Direct cron trigger (via curl)**
```bash
# Staging
curl -X POST https://caerqjzvuerejfrdtygb.supabase.co/functions/v1/agent-reengagement \
  -H "Authorization: Bearer $SUPABASE_SERVICE_ROLE_KEY" \
  -H "Content-Type: application/json" \
  -d '{"org_id": "<your-org-id>"}'
```

**Option B: Via fleet orchestrator event**
```bash
curl -X POST https://caerqjzvuerejfrdtygb.supabase.co/functions/v1/agent-orchestrator \
  -H "Authorization: Bearer $SUPABASE_SERVICE_ROLE_KEY" \
  -H "Content-Type: application/json" \
  -d '{
    "event_type": "cron.reengagement_scan",
    "org_id": "<your-org-id>",
    "context": {"org_id": "<your-org-id>"}
  }'
```

---

### Test Case A: Approve and send re-engagement email

**Steps**:
1. Trigger the pipeline (see above) and wait for the Slack DM to arrive
2. Review the approval message: it should show deal name, signal summary,
   top signals, and draft email (subject + body)
3. Click **Approve & Send**

**Expected**:
- Slack message updates (buttons disabled or replaced with confirmation)
- Email sent via `email-send` adapter to the contact's email address
- `agent_activity` row inserted for the deal owner with `sequence_type = 'reengagement_trigger'`
- `reengagement_watchlist.attempt_count` incremented by 1

**Verify in DB**:
```sql
SELECT title, summary, created_at
FROM agent_activities
WHERE sequence_type = 'reengagement_trigger'
ORDER BY created_at DESC
LIMIT 5;
```

---

### Test Case B: Edit email draft before sending

**Steps**:
1. In the re-engagement Slack DM, click **Edit Draft**
2. A modal should open with the subject line and body pre-filled
3. Modify the subject (e.g., add the contact's name)
4. Click **Submit**

**Expected**:
- Modal closes
- Slack message updates to show "Edited and sent" (or similar confirmation)
- Email sent with the modified subject/body

---

### Test Case C: Snooze 30 days

**Steps**:
1. In the Slack DM, click **Snooze 30d**

**Expected**:
- Slack message updates with snooze confirmation
- `reengagement_watchlist.cooldown_until` set to NOW() + 30 days
- The deal will not appear in the next daily scan (cooldown gate blocks it)

**Verify in DB**:
```sql
SELECT deal_id, cooldown_until
FROM reengagement_watchlist
WHERE deal_id = '<your-deal-id>';
-- cooldown_until should be ~30 days from now
```

---

### Test Case D: Dismiss permanently

**Steps**:
1. In the Slack DM, click **Dismiss**

**Expected**:
- Slack message updates with dismissal confirmation
- `reengagement_watchlist.status` set to `'removed'` (or `unsubscribed = true`)
- The deal will never appear in future scans

**Verify in DB**:
```sql
SELECT deal_id, status, unsubscribed
FROM reengagement_watchlist
WHERE deal_id = '<your-deal-id>';
-- status = 'removed' OR unsubscribed = true
```

---

### Test Case E: Cooldown gate blocks re-delivery

**Steps**:
1. Run the pipeline once (deal gets Slack DM, rep approves)
2. Run the pipeline again immediately

**Expected**:
- Second run: deal is blocked by `attempt_count` gate or `cooldown_until`
- No Slack DM sent for the same deal
- Scorer output shows `passed_gates: false` with reason `max_attempts_exhausted` or `on_cooldown_until_*`

**Verify via edge function logs** (Supabase Dashboard → Edge Functions → agent-reengagement → Logs):
```
[reengagement-scorer] <DealName>: score=82/100 ... gates=BLOCKED:on_cooldown_until_...
```

---

### Test Case F: No Slack integration (graceful degradation)

**Steps**:
1. Remove or deactivate the Slack integration for the test org
2. Trigger the pipeline

**Expected**:
- Apollo and Apify scan steps complete normally
- Scorer step qualifies deals normally
- `deliver-reengagement-slack` step returns `{ delivered: 0, skipped_reason: 'no_slack_integration' }`
- No uncaught errors in edge function logs
- `agent-reengagement` returns success with `orgs_dispatched: N`

---

### Test Case G: deal_closed_lost triggers watchlist addition

**Steps**:
1. Move a deal to Closed/Lost status in the app CRM
2. Check that the fleet orchestrator fires the `deal_closed_lost` event
3. Verify `reengagement_watchlist_add` sequence runs

**Expected**:
- New row in `reengagement_watchlist` with `status = 'active'`

**Verify in DB**:
```sql
SELECT deal_id, deal_name, status, created_at
FROM reengagement_watchlist
ORDER BY created_at DESC
LIMIT 5;
```

---

## Troubleshooting

| Symptom | Likely cause | Fix |
|---------|-------------|-----|
| No Slack DM received | No `slack_user_mappings` row for deal owner | Add mapping via Settings → Integrations → Slack |
| All deals skipped | Temperature below `signal_relevance_threshold` (0.6 default) | Check `deal_signal_temperature.temperature` values; run Apollo/Apify scan first |
| Cooldown gate blocks all deals | `attempt_count >= max_attempts` or `cooldown_until` in future | Check watchlist: `SELECT deal_id, attempt_count, cooldown_until, unsubscribed FROM reengagement_watchlist WHERE status = 'active'` |
| Pipeline not triggering daily | Cron job missing or `call_proactive_edge_function` vault secret missing | Check `cron.job` for `reengagement-daily-scan`; verify vault has `service_role_key` |
| Apollo scan returns 0 signals | Missing Apollo API key in `integration_credentials` | Add Apollo credentials: `INSERT INTO integration_credentials (org_id, provider, api_key) VALUES (...)` |
| Apify scan returns 0 results | Missing Apify token or actor timeout | Check `integration_credentials` for `apify` provider; try increasing actor timeout |
| `get_hot_deals` returns empty | No deals above temperature threshold | Manually upsert a temperature row with temperature >= 0.6 for testing |
