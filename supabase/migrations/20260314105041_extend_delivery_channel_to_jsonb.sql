-- Migration: extend_delivery_channel_to_jsonb
-- Date: 20260314105041
--
-- What this migration does:
--   TRINITY-008: Adds delivery_channels JSONB column to user_sequence_preferences
--   for per-channel toggle persistence (slack, email, in_app).
--   Migrates existing delivery_channel values. Updates RPCs to support new column.
--   Extends sequence_type CHECK constraint for new ability types.
--
-- Rollback strategy:
--   ALTER TABLE user_sequence_preferences DROP COLUMN IF EXISTS delivery_channels;
--   Re-run original RPC definitions from 20260216000004_add_user_sequence_preferences.sql

-- =============================================================================
-- Step 1: Add new delivery_channels JSONB column
-- Stores per-channel booleans, e.g. {"slack": true, "email": false, "in_app": true}
-- NULL means inherit ability defaults
-- =============================================================================

ALTER TABLE user_sequence_preferences
  ADD COLUMN IF NOT EXISTS delivery_channels JSONB DEFAULT NULL;

COMMENT ON COLUMN user_sequence_preferences.delivery_channels IS
  'Per-channel delivery toggles as JSONB, e.g. {"slack": true, "email": false, "in_app": true}. NULL means inherit ability defaults.';

-- =============================================================================
-- Step 2: Migrate existing delivery_channel values to delivery_channels JSONB
-- =============================================================================

UPDATE user_sequence_preferences
SET delivery_channels = CASE
  WHEN delivery_channel = 'slack' THEN '{"slack": true, "email": false, "in_app": false}'::jsonb
  WHEN delivery_channel = 'in_app' THEN '{"slack": false, "email": false, "in_app": true}'::jsonb
  WHEN delivery_channel = 'both' THEN '{"slack": true, "email": false, "in_app": true}'::jsonb
  ELSE NULL
END
WHERE delivery_channel IS NOT NULL AND delivery_channels IS NULL;

-- =============================================================================
-- Step 3: Update the update_user_sequence_preference RPC to accept delivery_channels
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
    'attendee_enrichment'
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

COMMENT ON FUNCTION update_user_sequence_preference IS 'Creates or updates a user sequence preference (upsert pattern). Supports both legacy delivery_channel and new delivery_channels JSONB.';

-- =============================================================================
-- Step 4: Update get_user_sequence_preferences_for_org to return delivery_channels
-- =============================================================================

CREATE OR REPLACE FUNCTION get_user_sequence_preferences_for_org(
  p_user_id UUID,
  p_org_id TEXT
)
RETURNS TABLE (
  sequence_type TEXT,
  is_enabled BOOLEAN,
  delivery_channel TEXT,
  delivery_channels JSONB
)
LANGUAGE sql
STABLE
SECURITY DEFINER
AS $$
  SELECT
    usp.sequence_type,
    usp.is_enabled,
    usp.delivery_channel,
    usp.delivery_channels
  FROM user_sequence_preferences usp
  WHERE usp.user_id = p_user_id
    AND usp.org_id = p_org_id
  ORDER BY usp.sequence_type
$$;

COMMENT ON FUNCTION get_user_sequence_preferences_for_org IS 'Returns all sequence preferences for a user in an org, including delivery_channels JSONB';

-- =============================================================================
-- Step 5: Update get_user_sequence_preference (single) to return delivery_channels
-- =============================================================================

CREATE OR REPLACE FUNCTION get_user_sequence_preference(
  p_user_id UUID,
  p_org_id TEXT,
  p_sequence_type TEXT
)
RETURNS TABLE (
  is_enabled BOOLEAN,
  delivery_channel TEXT,
  delivery_channels JSONB
)
LANGUAGE sql
STABLE
SECURITY DEFINER
AS $$
  SELECT
    COALESCE(usp.is_enabled, true) as is_enabled,
    usp.delivery_channel,
    usp.delivery_channels
  FROM user_sequence_preferences usp
  WHERE usp.user_id = p_user_id
    AND usp.org_id = p_org_id
    AND usp.sequence_type = p_sequence_type
$$;

COMMENT ON FUNCTION get_user_sequence_preference IS 'Returns user preference for a specific sequence type, including delivery_channels JSONB';

-- =============================================================================
-- Step 6: Extend sequence_type CHECK constraint for new ability types
-- =============================================================================

ALTER TABLE user_sequence_preferences DROP CONSTRAINT IF EXISTS user_seq_prefs_sequence_type_check;

ALTER TABLE user_sequence_preferences ADD CONSTRAINT user_seq_prefs_sequence_type_check CHECK (
  sequence_type IN (
    'meeting_ended',
    'pre_meeting_90min',
    'deal_risk_scan',
    'stale_deal_revival',
    'coaching_weekly',
    'campaign_daily_check',
    'email_received',
    'proposal_generation',
    'calendar_find_times',
    'deal_heartbeat_scan',
    'pipeline_hygiene_digest',
    'learning_preference_extract',
    'deal_temperature_alert',
    'reengagement_trigger',
    'email_signal_alert',
    'reply_gap_detection',
    'sent_received_ratio',
    'document_linking',
    'attendee_enrichment'
  )
);

-- =============================================================================
-- Migration Summary
-- =============================================================================

DO $$
BEGIN
  RAISE NOTICE '';
  RAISE NOTICE '============================================================================';
  RAISE NOTICE 'Migration: 20260314105041_extend_delivery_channel_to_jsonb.sql';
  RAISE NOTICE '============================================================================';
  RAISE NOTICE '';
  RAISE NOTICE 'TRINITY-008: Persist delivery channel preferences to DB';
  RAISE NOTICE '';
  RAISE NOTICE 'Changes:';
  RAISE NOTICE '  1. Added delivery_channels JSONB column to user_sequence_preferences';
  RAISE NOTICE '  2. Migrated existing delivery_channel values to delivery_channels';
  RAISE NOTICE '  3. Updated RPCs to accept/return delivery_channels JSONB';
  RAISE NOTICE '  4. Extended sequence_type constraint for new ability types';
  RAISE NOTICE '';
  RAISE NOTICE 'Format: {"slack": true, "email": false, "in_app": true}';
  RAISE NOTICE 'NULL means inherit ability defaults from abilityRegistry';
  RAISE NOTICE '';
  RAISE NOTICE '============================================================================';
END $$;
