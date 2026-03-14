-- Migration: extend_sequence_types_v2
-- Date: 20260314202227
--
-- What this migration does:
--   SBI-009: Extends the user_sequence_preferences CHECK constraint and
--   update_user_sequence_preference RPC validation to include all orchestrator
--   event types — the 10 V1 types migrated in SBI-008, plus the cron-job types
--   consolidated in SBI-009 (which were already present).
--
-- New types added to CHECK constraint:
--   overdue_deal_scan, ghost_deal_scan, morning_brief, sales_assistant_digest,
--   pre_meeting_nudge, post_call_summary, hitl_followup_email, stale_deal_alert,
--   email_reply_alert, ai_smart_suggestion
--
-- Rollback strategy:
--   Re-run Step 6 from 20260314105041_extend_delivery_channel_to_jsonb.sql
--   to restore the previous CHECK constraint without the 10 V1 types.

-- =============================================================================
-- Step 1: Extend sequence_type CHECK constraint
-- =============================================================================

ALTER TABLE user_sequence_preferences DROP CONSTRAINT IF EXISTS user_seq_prefs_sequence_type_check;

ALTER TABLE user_sequence_preferences ADD CONSTRAINT user_seq_prefs_sequence_type_check CHECK (
  sequence_type IN (
    -- Original 9 orchestrator sequence types
    'meeting_ended',
    'pre_meeting_90min',
    'deal_risk_scan',
    'stale_deal_revival',
    'coaching_weekly',
    'campaign_daily_check',
    'email_received',
    'proposal_generation',
    'calendar_find_times',
    -- Proactive Sales Teammate (PST) — formerly cron-job, now orchestrator
    'deal_heartbeat_scan',
    'pipeline_hygiene_digest',
    'learning_preference_extract',
    -- Audit gap fill abilities
    'deal_temperature_alert',
    'reengagement_trigger',
    'email_signal_alert',
    'reply_gap_detection',
    'sent_received_ratio',
    'document_linking',
    'attendee_enrichment',
    -- V1-simulate types migrated to orchestrator (SBI-008)
    'overdue_deal_scan',
    'ghost_deal_scan',
    'morning_brief',
    'sales_assistant_digest',
    'pre_meeting_nudge',
    'post_call_summary',
    'hitl_followup_email',
    'stale_deal_alert',
    'email_reply_alert',
    'ai_smart_suggestion'
  )
);

-- =============================================================================
-- Step 2: Update the update_user_sequence_preference RPC validation list
-- =============================================================================

CREATE OR REPLACE FUNCTION update_user_sequence_preference(
  p_user_id UUID,
  p_org_id TEXT,
  p_sequence_type TEXT,
  p_is_enabled BOOLEAN DEFAULT true,
  p_delivery_channel TEXT DEFAULT NULL,
  p_delivery_channels JSONB DEFAULT NULL
)
RETURNS UUID
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
  v_pref_id UUID;
BEGIN
  -- Validate sequence_type
  IF p_sequence_type NOT IN (
    'meeting_ended', 'pre_meeting_90min', 'deal_risk_scan', 'stale_deal_revival',
    'coaching_weekly', 'campaign_daily_check', 'email_received',
    'proposal_generation', 'calendar_find_times',
    'deal_heartbeat_scan', 'pipeline_hygiene_digest', 'learning_preference_extract',
    'deal_temperature_alert', 'reengagement_trigger', 'email_signal_alert',
    'reply_gap_detection', 'sent_received_ratio', 'document_linking',
    'attendee_enrichment',
    'overdue_deal_scan', 'ghost_deal_scan', 'morning_brief',
    'sales_assistant_digest', 'pre_meeting_nudge', 'post_call_summary',
    'hitl_followup_email', 'stale_deal_alert', 'email_reply_alert',
    'ai_smart_suggestion'
  ) THEN
    RAISE EXCEPTION 'Invalid sequence_type: %', p_sequence_type;
  END IF;

  -- Validate delivery_channel (legacy, kept for backwards compatibility)
  IF p_delivery_channel IS NOT NULL AND
     p_delivery_channel NOT IN ('slack', 'in_app', 'both') THEN
    RAISE EXCEPTION 'Invalid delivery_channel: %', p_delivery_channel;
  END IF;

  -- Upsert the preference
  INSERT INTO user_sequence_preferences (
    user_id,
    org_id,
    sequence_type,
    is_enabled,
    delivery_channel,
    delivery_channels
  ) VALUES (
    p_user_id,
    p_org_id,
    p_sequence_type,
    p_is_enabled,
    p_delivery_channel,
    p_delivery_channels
  )
  ON CONFLICT (user_id, org_id, sequence_type)
  DO UPDATE SET
    is_enabled = EXCLUDED.is_enabled,
    delivery_channel = EXCLUDED.delivery_channel,
    delivery_channels = EXCLUDED.delivery_channels,
    updated_at = now()
  RETURNING id INTO v_pref_id;

  RETURN v_pref_id;
END;
$$;

COMMENT ON FUNCTION update_user_sequence_preference IS 'Creates or updates a user sequence preference (upsert pattern). Supports both legacy delivery_channel and new delivery_channels JSONB. Extended in SBI-009 with V1 + consolidated cron-job types.';

-- =============================================================================
-- Migration Summary
-- =============================================================================

DO $$
BEGIN
  RAISE NOTICE '';
  RAISE NOTICE '============================================================================';
  RAISE NOTICE 'Migration: 20260314202227_extend_sequence_types_v2.sql';
  RAISE NOTICE '============================================================================';
  RAISE NOTICE '';
  RAISE NOTICE 'SBI-009: Consolidate cron-job abilities into orchestrator event types';
  RAISE NOTICE '';
  RAISE NOTICE 'Changes:';
  RAISE NOTICE '  1. Extended CHECK constraint with 10 V1-simulate types from SBI-008';
  RAISE NOTICE '  2. Updated RPC validation to match CHECK constraint';
  RAISE NOTICE '  3. All 29 ability types now valid for user_sequence_preferences';
  RAISE NOTICE '';
  RAISE NOTICE '============================================================================';
END $$;
