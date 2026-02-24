# agent-eod-synthesis — Manual Testing Guide

End-to-day synthesis edge function (EOD-007).
Cron-triggered every 15 minutes; delivers a Slack DM to users whose `eod_time` falls within the current 15-minute window.

---

## Prerequisites

- Supabase CLI installed (`npx supabase`)
- Valid env vars: `SUPABASE_URL`, `SUPABASE_SERVICE_ROLE_KEY`, `CRON_SECRET`
- A user with a linked Slack account (`slack_connections` row with `bot_token`)
- `user_time_preferences` row for that user

---

## 1. Unit Tests (Vitest)

```bash
npm run test -- supabase/functions/agent-eod-synthesis/test.ts
```

Covers:
- Scorecard block counts (busy day / quiet day)
- Tomorrow preview with/without meetings
- Weekend skip logic
- Timezone-aware delivery window (Chicago CST, London GMT, Tokyo JST)
- Slack message structure (section ordering, 50-block limit, footer buttons)
- Fleet route and adapter registry contracts
- Edge cases (no optional sections, long name truncation, currency formatting)

---

## 2. On-Demand Delivery (Single User)

Bypass the timezone window entirely and force delivery to a specific user.

```bash
curl -X POST \
  "${SUPABASE_URL}/functions/v1/agent-eod-synthesis" \
  -H "Authorization: Bearer ${SUPABASE_SERVICE_ROLE_KEY}" \
  -H "Content-Type: application/json" \
  -d '{"action": "deliver", "user_id": "<YOUR_USER_ID>"}'
```

Expected response:
```json
{
  "ok": true,
  "delivered": 1,
  "skipped": 0,
  "errors": 0
}
```

Check your Slack DM — you should receive the EOD synthesis message within a few seconds.

---

## 3. Cron-Style Delivery (Timezone Window)

Fires the same logic the cron uses. Eligible users are those whose `eod_time` in `user_time_preferences` falls within the next 15 minutes in their timezone.

```bash
curl -X POST \
  "${SUPABASE_URL}/functions/v1/agent-eod-synthesis" \
  -H "x-cron-secret: ${CRON_SECRET}" \
  -H "Content-Type: application/json" \
  -d '{"action": "deliver"}'
```

To test this path end-to-end:

1. Find your current UTC time.
2. Calculate what `eod_time` you need in `user_time_preferences` for your timezone.
3. Update the row:
   ```sql
   UPDATE user_time_preferences
   SET eod_time = '<HH:MM>'
   WHERE user_id = '<YOUR_USER_ID>';
   ```
4. Fire the curl above within the next 15 minutes.

---

## 4. Idempotency Check

Sending a second request with the same `user_id` on the same calendar date should NOT send a duplicate Slack message.

```bash
# First call — delivers the message
curl -X POST "${SUPABASE_URL}/functions/v1/agent-eod-synthesis" \
  -H "Authorization: Bearer ${SUPABASE_SERVICE_ROLE_KEY}" \
  -H "Content-Type: application/json" \
  -d '{"action": "deliver", "user_id": "<YOUR_USER_ID>"}'

# Second call — skipped (eod_deliveries row already has delivered_at)
curl -X POST "${SUPABASE_URL}/functions/v1/agent-eod-synthesis" \
  -H "Authorization: Bearer ${SUPABASE_SERVICE_ROLE_KEY}" \
  -H "Content-Type: application/json" \
  -d '{"action": "deliver", "user_id": "<YOUR_USER_ID>"}'
```

Second response should show `"delivered": 0, "skipped": 1`.

Reset for re-testing:
```sql
DELETE FROM eod_deliveries
WHERE user_id = '<YOUR_USER_ID>'
  AND delivery_date = CURRENT_DATE;
```

---

## 5. Slack Message Sections

Verify each section renders correctly in Slack:

| Section | Condition | What to check |
|---------|-----------|---------------|
| **Scorecard** | Always shown | Meetings, emails, tasks, pipeline value |
| **Open Items** | Shown when pending replies / overdue tasks exist | Count badges, item descriptions |
| **Tomorrow Preview** | Shown when meetings exist tomorrow | Meeting titles, attendee names, prep status |
| **Overnight Plan** | Shown when `include_overnight_plan = true` in config | Plan item list, morning briefing preview |
| **Footer** | Always shown | Three buttons: "Looks good", "Adjust priorities", "Add task" |

To force an empty overnight plan (no tasks):
- Ensure no contacts with `enrichment_status = 'pending'`
- Ensure no active reengagement watchlist entries
- Ensure no deals with `deal_signal_temperature.temperature > 0.3`
- Ensure no tomorrow meetings without meeting prep activities

---

## 6. Slack Interactive Actions

After receiving the EOD Slack DM, test the footer buttons:

| Button | `action_id` | Expected behaviour |
|--------|------------|-------------------|
| Looks good | `eod_looks_good` | Ephemeral confirmation: "Great! See you in the morning." |
| Adjust priorities | `eod_adjust_priorities` | Ephemeral message with deep-link to copilot |
| Add task | `eod_add_task` | Opens the Add Task modal in Slack |

Verify via `slack-interactive` function logs in Supabase Dashboard → Edge Functions → Logs.

---

## 7. Delivery Config Overrides

The function respects per-user config in `agent_config_overrides`:

```sql
-- Disable overnight plan for a specific user
INSERT INTO agent_config_overrides (user_id, org_id, agent_type, key, value)
VALUES ('<USER_ID>', '<ORG_ID>', 'eod_synthesis', 'include_overnight_plan', 'false')
ON CONFLICT (user_id, org_id, agent_type, key) DO UPDATE SET value = EXCLUDED.value;
```

Trigger delivery and verify the "Tonight's Agent Work Plan" section is absent.

Restore:
```sql
DELETE FROM agent_config_overrides
WHERE user_id = '<USER_ID>' AND agent_type = 'eod_synthesis' AND key = 'include_overnight_plan';
```

---

## 8. Common Failure Modes

| Symptom | Likely cause | Fix |
|---------|-------------|-----|
| `"delivered": 0, "skipped": 1` (unexpected) | `eod_deliveries` row from earlier today | Delete the row (see §4) |
| No Slack message received | Missing `slack_connections` row or invalid `bot_token` | Reconnect Slack in Settings |
| Empty scorecard (all zeros) | No `user_time_preferences` timezone or wrong `owner_user_id` | Check `user_time_preferences.timezone` |
| `eod_enabled: false` | Config override disabling delivery | Check `agent_config_overrides` for `eod_synthesis / eod_enabled` |
| 401 on staging | Deploy with `--no-verify-jwt` | `npx supabase functions deploy agent-eod-synthesis --project-ref caerqjzvuerejfrdtygb --no-verify-jwt` |

---

## 9. Deploy Commands

```bash
# Development
npx supabase functions deploy agent-eod-synthesis --project-ref wbgmnyekgqklggilgqag --no-verify-jwt

# Staging
npx supabase functions deploy agent-eod-synthesis --project-ref caerqjzvuerejfrdtygb --no-verify-jwt

# Production
npx supabase functions deploy agent-eod-synthesis --project-ref ygdpgliavpxeugaajgrb --no-verify-jwt
```

---

## 10. Related Migrations

| File | Purpose |
|------|---------|
| `20260222600001_eod_synthesis_schema.sql` | `user_time_preferences` + `eod_deliveries` tables |
| `20260222600002_eod_synthesis_agent_config.sql` | Default config for `eod_synthesis` agent |
| `20260222600003_daily_scorecard_rpc.sql` | `get_daily_scorecard()` RPC |
| `20260222600004_eod_synthesis_fleet_routes.sql` | Fleet event route + 5-step sequence definition |
| `20260222600005_schedule_eod_synthesis_cron.sql` | pg_cron job (every 15 minutes) |
