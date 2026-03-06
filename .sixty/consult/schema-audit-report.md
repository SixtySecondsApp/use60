# Schema/Column Bug Audit Report
**Generated**: 2026-03-03
**Context**: ENRICH-006 — Scan for edge functions referencing columns added by unapplied migrations
**Trigger**: `deep-enrich-organization` crashed on `change_summary`, `enrichment_version`, `previous_hash` — columns that only existed in a migration, not in the baseline deployed to staging.

---

## Summary

| Risk | Count | Pattern |
|------|-------|---------|
| HIGH | 2 | Edge functions writing columns only added by post-baseline migrations |
| MEDIUM | 3 | Edge functions reading triage/sync columns added in recent migrations |
| LOW | 2 | Edge functions referencing columns in tables created post-baseline |
| SAFE | many | Functions referencing columns that already exist in baseline_fixed |

---

## HIGH RISK: Edge Functions Writing Unapplied Migration Columns

### 1. `_shared/costTracking.ts` — `ai_cost_events.provider_cost_usd` + `credits_charged`

**Migration**: `20260221060000_provider_cost_column.sql`
**What it adds**: `provider_cost_usd DECIMAL(12,6)`, `credits_charged DECIMAL(12,4)` to `ai_cost_events`
**Baseline state**: `ai_cost_events` exists in baseline, but WITHOUT these two columns.
**Risk**: Every AI cost tracking call (`logTokenCostEvent`, `logFlatRateCostEvent`) writes both columns. If migration not deployed, ALL AI operations fail.

**Functions affected** (via `_shared/costTracking.ts`):
- Every function using `logTokenCostEvent()` or `logFlatRateCostEvent()`
- `_shared/orchestrator/runner.ts` — all orchestrated agent runs
- `check-credit-alerts/index.ts` — reads `credits_charged`
- `get-credit-usage-summary/index.ts` — reads `credits_charged`
- `purge-credit-logs/index.ts` — references `credits_charged`

**Impact if not applied**: All AI operations (copilot, agents, enrichment) will fail silently or error. Credit tracking broken.

**Status check**: costTracking.ts has error-swallowing logic:
```ts
if (!insertError.message.includes('relation') && !insertError.message.includes('does not exist')) {
  console.warn('[CostTracking] Error logging cost event:', insertError);
}
```
This means a missing COLUMN error (not a missing relation) will NOT be swallowed — it will log the error but the insert fails, so credits may not be deducted.

**Recommended Action**: **Verify `20260221060000_provider_cost_column.sql` is applied to staging.**

---

### 2. `instant-replay/index.ts` — `user_onboarding_progress.instant_replay_completed` + `instant_replay_meeting_id`

**Migration**: `20260227160003_instant_replay_flag.sql`
**What it adds**: `instant_replay_completed BOOLEAN`, `instant_replay_meeting_id UUID` to `user_onboarding_progress`
**Baseline state**: Neither column exists in baseline.
**Risk**: The `instant-replay` edge function writes both columns at lines 304-305. If migration not applied, the function fails at the final step (flagging completion).

**Functions affected**:
- `supabase/functions/instant-replay/index.ts:304-312`

**Mitigation**: The function has a `console.warn` on failure but does NOT throw — so the rest of the replay still completes; only the onboarding flag fails silently.

**Recommended Action**: **Verify `20260227160003_instant_replay_flag.sql` is applied to staging before deploying `instant-replay`.**

---

## MEDIUM RISK: Functions Reading Triage/Sync Columns Added Post-Baseline

### 3. `notification_queue` — triage columns

**Migration**: `20260223600002_extend_notification_queue_triage.sql`
**What it adds**: `triage_status`, `delivery_channel`, `entity_type`, `entity_id`, `batch_id`, `triaged_at`, `source_job_id` (Note: `batch_id` already exists in baseline_fixed; `notification_type` also already exists)
**Baseline state**: `notification_queue` in baseline_fixed has `notification_type` and `batch_id`, but NOT `triage_status`, `delivery_channel`, `entity_type`, `entity_id`, `triaged_at`, `source_job_id`.

**Functions affected** (18 total, writing to triage columns):
- `agent-morning-briefing/index.ts` — reads `notification_type`, `triage_status`; updates `triage_status`
- `notification-triage/index.ts` — core triage logic
- `_shared/proactive/deliveryInApp.ts` — writes `triage_status`, `entity_type`, `entity_id`
- `_shared/proactive/deliverySlack.ts` — writes `delivery_channel`, `triage_status`
- `_shared/proactive/triageRules.ts` — reads/writes multiple triage columns
- `_shared/orchestrator/runner.ts` — writes `triage_status`
- Plus 12 more functions listed above

**Impact**: Agent morning briefing, proactive delivery, notification triage all fail or behave incorrectly.

**Recommended Action**: **Verify `20260223600002_extend_notification_queue_triage.sql` and `20260223600003_add_triage_enabled_flag.sql` are applied to staging.**

---

### 4. `dynamic_table_cells` — `source_updated_at` + `last_source`

**Migration**: `20260218000003_sync_conflict_resolution.sql`
**What it adds**: `source_updated_at TIMESTAMPTZ`, `last_source TEXT` to `dynamic_table_cells`
**Baseline state**: `dynamic_table_cells` was created in migration `20260204180001` without these columns.

**Functions affected**:
- `_shared/conflictResolver.ts:86-87` — writes both columns
- `_shared/standardTableSync.ts:282` — selects both columns in query
- `_shared/standardTableSync.ts:329-330, 373-374` — writes both columns

**Impact**: All CRM sync operations (HubSpot, Attio, Salesforce) that use `standardTableSync` will fail when writing conflict resolution data.

**Recommended Action**: **Verify `20260218000003_sync_conflict_resolution.sql` is applied to staging.**

---

### 5. `organization_enrichment` — `enrichment_version`, `previous_hash`, `change_summary`

**Migration**: `20260124100002_add_last_enriched_at.sql` (THE ORIGINAL BUG)
**Functions affected**:
- `deep-enrich-organization/index.ts:1237-1239` — NOW HANDLED (ENRICH-002 added defensive check)
- `demo-convert-account/index.ts:277` — writes `enrichment_version: 1` directly

**Impact on demo-convert-account**: `demo-convert-account` hardcodes `enrichment_version: 1` in an upsert. If migration not applied, the entire demo account conversion will fail with a column-not-found error.

**Recommended Action**: Verify migration is applied. Check `demo-convert-account` needs the same defensive check as `deep-enrich-organization`.

---

## LOW RISK: Functions Using Tables Created Post-Baseline

### 6. `trial-expiry-cron` — grace period columns on `organization_subscriptions`

**Migration**: `20260227160000_trial_grace_period.sql`
**What it adds**: `grace_period_started_at`, `grace_period_ends_at` to `organization_subscriptions`; `deactivation_reason` to `organizations`
**Baseline state**: These columns do NOT exist in baseline_fixed.

**Functions affected**:
- `trial-expiry-cron/index.ts` — reads and writes all three columns extensively
- `send-org-deactivation-email/index.ts` — reads `deactivation_reason` from payload
- `send-org-member-deactivation-email/index.ts` — reads `deactivation_reason`
- `start-free-trial/index.ts` — reads `grace_period` status
- `update-subscription/index.ts` — reads `grace_period` status

**Risk Level**: LOW for production (migration likely applied when feature was built), but HIGH for staging if these migrations are in this feature branch and haven't been deployed yet.

**Recommended Action**: **These are the Feb 27 trial/grace period migrations. Verify all are deployed to staging before testing the trial flow.**

---

## Migration Deployment Status Summary

| Migration | Columns Added | Table | Edge Functions Using | Deploy Risk |
|-----------|--------------|-------|---------------------|-------------|
| `20260124100002_add_last_enriched_at.sql` | `enrichment_version`, `previous_hash`, `change_summary` | `organization_enrichment` | `deep-enrich-organization` (FIXED), `demo-convert-account` (NOT FIXED) | HIGH |
| `20260218000003_sync_conflict_resolution.sql` | `source_updated_at`, `last_source` | `dynamic_table_cells` | `_shared/conflictResolver.ts`, `_shared/standardTableSync.ts` | MEDIUM |
| `20260221060000_provider_cost_column.sql` | `provider_cost_usd`, `credits_charged` | `ai_cost_events` | `_shared/costTracking.ts` (all AI operations) | HIGH |
| `20260223600002_extend_notification_queue_triage.sql` | `triage_status`, `delivery_channel`, `entity_type`, etc. | `notification_queue` | 18 functions | MEDIUM |
| `20260223600003_add_triage_enabled_flag.sql` | `triage_enabled` | `organization_agent_preferences` (or similar) | notification triage | MEDIUM |
| `20260227160000_trial_grace_period.sql` | `grace_period_started_at`, `grace_period_ends_at`, `deactivation_reason` | `organization_subscriptions`, `organizations` | `trial-expiry-cron`, email functions | HIGH (new feature) |
| `20260227160003_instant_replay_flag.sql` | `instant_replay_completed`, `instant_replay_meeting_id` | `user_onboarding_progress` | `instant-replay` function | HIGH (new feature) |

---

## Key Patterns for Future Prevention

1. **The original bug pattern**: Migration adds columns to existing table → edge function writes those columns → migration not deployed to staging → edge function fails.

2. **Error swallowing hides the bug**: `costTracking.ts` swallows missing-relation errors but NOT missing-column errors. The original `deep-enrich-organization` didn't swallow at all — it threw. Both fail silently until someone notices.

3. **The fix applied in ENRICH-002**: Defensive try/catch on the upsert with column-error detection. The same pattern should be applied to `demo-convert-account` for `enrichment_version`.

4. **New features = new migration requirements**: The trial/grace period feature (Feb 27 migrations) introduces 3 columns across 2 tables used by multiple edge functions. All must be deployed together.

## Recommended Actions (Priority Order)

1. **[URGENT]** Verify `20260221060000_provider_cost_column.sql` is on staging — if not, ALL AI operations are broken.
2. **[HIGH]** Apply all 8 `20260227160000–160007` trial/grace period migrations to staging before testing trial flow.
3. **[HIGH]** Apply `20260227160003_instant_replay_flag.sql` before deploying `instant-replay` function.
4. **[MEDIUM]** Verify `20260218000003_sync_conflict_resolution.sql` is on staging (affects CRM sync).
5. **[MEDIUM]** Verify `20260223600002` and `20260223600003` are on staging (affects notification triage / morning briefing).
6. **[MEDIUM]** Add defensive check to `demo-convert-account/index.ts` for `enrichment_version` column (same pattern as ENRICH-002 fix).
7. **[PROCESS]** When adding columns to existing tables in migrations: always add a defensive try/catch in the edge function OR use `ADD COLUMN IF NOT EXISTS` (already done in most migrations, good).
