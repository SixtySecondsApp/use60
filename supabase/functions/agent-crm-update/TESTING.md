# CRM Update Agent — Testing Guide

**PRD**: PRD-03 Auto CRM Update Agent
**Stories covered**: CRM-011

This document covers both automated test execution and manual Slack HITL
testing for the full meeting → CRM update → Slack → approve → HubSpot chain.

---

## Automated Tests

### Running the tests

```bash
# From repo root
npm run test -- supabase/functions/agent-crm-update/test.ts

# With coverage
npm run test -- --coverage supabase/functions/agent-crm-update/test.ts
```

### Test scenarios (automated)

| Scenario | What is tested |
|----------|----------------|
| 1 — Happy path | Classifier routes, Slack Block Kit structure, auto-apply audit trail, approval queue entries |
| 2 — Low confidence skip | All fields below `confidence_minimum` go to `skipLowConfidence` |
| 3 — HubSpot disabled | `syncToHubSpot` exits early; no credential lookup; graceful no-connection handling |
| 4 — Missing deal | `autoApplyFields` returns `errors[]`; no crash; DB query error propagated |
| 5 — Fleet handoff | `fleet_handoff_routes` contract; context_mapping shape |
| 6 — Edge cases | Unknown fields → requireApproval; approval_required overrides high confidence; strict mode skips medium |

---

## Database Verification Checklist

After running migrations (`20260222300001` through `20260222300003`), verify
in Supabase Studio or via psql:

```sql
-- 1. crm_approval_queue exists with correct schema
SELECT column_name, data_type, is_nullable
FROM information_schema.columns
WHERE table_name = 'crm_approval_queue'
ORDER BY ordinal_position;
-- Expected: id, org_id, user_id, deal_id, meeting_id, field_name,
--           current_value, proposed_value, confidence, reason, status,
--           slack_message_ts, approved_by, approved_at, expires_at, created_at

-- 2. Trigger auto-sets expires_at
INSERT INTO crm_approval_queue (org_id, user_id, field_name, confidence, status)
VALUES (
  (SELECT id FROM organizations LIMIT 1),
  (SELECT id FROM profiles LIMIT 1),
  'stage', 'high', 'pending'
)
RETURNING id, created_at, expires_at;
-- expires_at must be created_at + 48h

-- 3. crm_field_updates has new columns
SELECT column_name FROM information_schema.columns
WHERE table_name = 'crm_field_updates'
  AND column_name IN ('previous_value', 'change_source', 'confidence_score', 'meeting_id');
-- Must return all 4 rows

-- 4. Fleet event route: meeting_ended → crm_update
SELECT event_type, sequence_key, priority, is_active
FROM fleet_event_routes
WHERE sequence_key = 'crm_update';
-- Expected: meeting_ended, crm_update, 30, true

-- 5. Fleet sequence definition: crm_update with 5 steps
SELECT sequence_key, jsonb_array_length(steps) AS step_count
FROM fleet_sequence_definitions
WHERE sequence_key = 'crm_update';
-- Expected: crm_update, 5

-- 6. Fleet handoff: crm_update → deal_risk_rescore
SELECT source_sequence_key, source_step_skill, target_event_type, is_active
FROM fleet_handoff_routes
WHERE source_sequence_key = 'crm_update';
-- Expected: crm_update, slack-crm-notify, deal_risk_rescore, true

-- 7. Agent config defaults seeded (CRM-002)
SELECT config_key, config_value
FROM agent_config_defaults
WHERE agent_type = 'crm_update'
ORDER BY config_key;
-- Expected 7 rows: auto_approve_fields, approval_required_fields,
-- confidence_minimum, approval_expiry_hours, max_pending_approvals,
-- slack_notification_enabled, hubspot_sync_enabled
```

---

## Manual Slack HITL Testing

### Prerequisites

1. Slack integration configured for the test user (Settings → Integrations → Slack)
2. `slack_user_mappings` row present for the test user
3. `agent-crm-approval` edge function deployed to staging:
   ```bash
   npx supabase functions deploy agent-crm-approval \
     --project-ref caerqjzvuerejfrdtygb --no-verify-jwt
   ```
4. A deal in the local CRM with an associated meeting that has a transcript
5. `slack_notification_enabled = true` in `agent_config_defaults` for `crm_update`

### Triggering a test run

Insert a synthetic `meeting_ended` event into the fleet queue, or use the
Skill Test Console (Settings → Developer → Skill Test Console) to trigger
the `crm_update` sequence with a real meeting ID.

---

### Test Case A: Approve single field

**Steps**:
1. Wait for CRM update Slack DM to arrive after a meeting
2. Locate a field in the "Needs your review" section (e.g., `stage`)
3. Click the **Approve** button for that field

**Expected**:
- Slack message updates: the approved field moves from "Needs review" to "Applied" (or disappears from the pending list)
- `crm_approval_queue` row: `status = 'approved'`, `approved_by` set, `approved_at` set
- `crm_field_updates` row: `change_source = 'approved'`, `new_value` matches approved value
- Deals table: the field is updated with the approved value
- HubSpot (if connected + enabled): PATCH to `/crm/v3/objects/deals/{id}` with updated property

**Verify in DB**:
```sql
SELECT status, approved_by, approved_at, field_name
FROM crm_approval_queue
WHERE status = 'approved'
ORDER BY approved_at DESC
LIMIT 5;
```

---

### Test Case B: Reject single field

**Steps**:
1. In the CRM update Slack DM, click **Reject** for a pending field (e.g., `close_date`)

**Expected**:
- Slack message updates: rejected field no longer shows approve/reject buttons
- `crm_approval_queue` row: `status = 'rejected'`, `approved_by` set
- No `crm_field_updates` record created (rejection means no write)
- Deals table: field value unchanged

**Verify in DB**:
```sql
SELECT status, field_name, approved_at
FROM crm_approval_queue
WHERE status = 'rejected'
ORDER BY approved_at DESC
LIMIT 5;
```

---

### Test Case C: Edit field value before approving

**Steps**:
1. Click **Edit** on a pending field (e.g., `deal_value` shows `$50,000`)
2. A modal opens with a text input pre-filled with the proposed value
3. Change the value (e.g., type `75000`)
4. Click **Submit**

**Expected**:
- Modal closes
- Slack message updates to show the edited value as applied
- `crm_approval_queue` row: `status = 'edited'`, `approved_by` set
- `crm_field_updates` row: `change_source = 'approved'`, `new_value = 75000` (edited value, not original 50000)
- Deals table: `value` column updated to `75000`

**Verify in DB**:
```sql
SELECT status, field_name, approved_at
FROM crm_approval_queue
WHERE status = 'edited'
ORDER BY approved_at DESC
LIMIT 5;

-- Check the field update used the edited value
SELECT new_value, change_source
FROM crm_field_updates
WHERE change_source = 'approved'
ORDER BY created_at DESC
LIMIT 5;
```

---

### Test Case D: Approve all pending fields at once

**Steps**:
1. In the CRM update Slack DM, locate the **Approve All** button at the bottom
2. Click **Approve All**

**Expected**:
- All pending fields for that deal are approved in one action
- Slack message updates to show all fields as applied
- `crm_approval_queue`: all pending rows for this deal → `status = 'approved'`
- `crm_field_updates`: one row per field, all with `change_source = 'approved'`
- Deals table: all approval-required fields updated simultaneously

**Verify in DB**:
```sql
SELECT field_name, status, approved_at
FROM crm_approval_queue
WHERE deal_id = '<your-deal-id>'
ORDER BY approved_at DESC;
```

---

### Test Case E: Test expired approval

**Steps**:
1. Manually expire a pending approval by updating `expires_at` to the past:
   ```sql
   UPDATE crm_approval_queue
   SET expires_at = now() - INTERVAL '1 hour'
   WHERE status = 'pending'
   LIMIT 1
   RETURNING id;
   ```
2. Trigger `agent-crm-heartbeat` manually (or wait for its 4-hour cron):
   ```bash
   curl -X POST https://caerqjzvuerejfrdtygb.supabase.co/functions/v1/agent-crm-heartbeat \
     -H "x-cron-secret: $CRON_SECRET"
   ```

**Expected**:
- `crm_approval_queue` row: `status = 'expired'`
- Deals table: field value unchanged (no write on expiry)
- (Optional) Rep receives a Slack DM informing them the approval expired

**Verify in DB**:
```sql
SELECT id, field_name, status, expires_at
FROM crm_approval_queue
WHERE status = 'expired'
ORDER BY expires_at DESC
LIMIT 5;
```

---

### Test Case F: HubSpot sync after approval

**Prerequisites**: HubSpot connected for the test org; deal has a matching
row in `hubspot_object_mappings` with `object_type = 'deal'`.

**Steps**:
1. Approve a field that maps to a HubSpot property (e.g., `close_date` → `closedate`)
2. Check HubSpot CRM for the deal — navigate to the deal record

**Expected**:
- HubSpot deal `closedate` property updated to the approved value (YYYY-MM-DD format)
- No duplicate entries created

**Verify via HubSpot API**:
```bash
curl https://api.hubapi.com/crm/v3/objects/deals/<hubspot-deal-id>?properties=closedate \
  -H "Authorization: Bearer $HUBSPOT_ACCESS_TOKEN"
```

---

### Test Case G: Slack not connected (graceful degradation)

**Steps**:
1. Remove or deactivate the Slack integration for the test user
2. Trigger a meeting_ended event that produces CRM field changes

**Expected**:
- `crmSlackNotify` returns `{ sent: false, error: 'No Slack integration found' }`
- Auto-applied changes are still written to the deals table (Slack failure is non-fatal)
- Approval-required fields are still queued in `crm_approval_queue` (can be reviewed via app UI)
- No uncaught exceptions in edge function logs

**Verify in DB**:
```sql
-- Auto-apply should still have written
SELECT field_name, change_source, created_at
FROM crm_field_updates
ORDER BY created_at DESC
LIMIT 10;

-- Approval queue should still have pending entries
SELECT field_name, status
FROM crm_approval_queue
ORDER BY created_at DESC
LIMIT 10;
```

---

## Troubleshooting

| Symptom | Likely cause | Fix |
|---------|-------------|-----|
| Slack DM not received | No `slack_user_mappings` row | Add mapping via Settings → Integrations → Slack |
| All fields skipped | `confidence_minimum` set to `high` but extraction returns `medium` | Check `agent_config_defaults` for `crm_update` → `confidence_minimum` |
| HubSpot not syncing | `hubspot_sync_enabled = false` or deal not in `hubspot_object_mappings` | Check config and run a manual HubSpot sync |
| Approval buttons do nothing | `agent-crm-approval` not deployed or wrong Slack signing secret | Deploy function; verify `SLACK_SIGNING_SECRET` env var |
| `expires_at` not set automatically | Trigger `trg_crm_approval_queue_set_expiry` missing | Re-run migration `20260222300001_crm_approval_queue.sql` |
| `change_source` column missing | `crm_field_updates` not yet migrated | Re-run migration `20260222300001_crm_approval_queue.sql` |
