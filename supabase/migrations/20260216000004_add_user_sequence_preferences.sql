-- ============================================================================
-- Migration: User Sequence Preferences Table
-- Purpose: Per-user opt-in/out for orchestrator event sequences
-- Feature: Proactive Agent V2 - User Preference Override
-- Date: 2026-02-16
-- ============================================================================

-- =============================================================================
-- Table: user_sequence_preferences
-- Per-user preference overrides for orchestrator event sequences
-- =============================================================================

CREATE TABLE IF NOT EXISTS user_sequence_preferences (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),

  -- User and organization context
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  org_id TEXT NOT NULL,

  -- Sequence type (one of the 9 orchestrator event types)
  sequence_type TEXT NOT NULL,

  -- Preference state
  is_enabled BOOLEAN NOT NULL DEFAULT true,
  delivery_channel TEXT DEFAULT NULL,

  -- Timestamps
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),

  -- One preference per user per org per sequence
  CONSTRAINT user_seq_prefs_unique UNIQUE (user_id, org_id, sequence_type),

  -- Validate sequence_type is one of the 9 orchestrator event types
  CONSTRAINT user_seq_prefs_sequence_type_check CHECK (
    sequence_type IN (
      'meeting_ended',
      'pre_meeting_90min',
      'deal_risk_scan',
      'stale_deal_revival',
      'coaching_weekly',
      'campaign_daily_check',
      'email_received',
      'proposal_generation',
      'calendar_find_times'
    )
  ),

  -- Validate delivery_channel (null means inherit org default)
  CONSTRAINT user_seq_prefs_delivery_channel_check CHECK (
    delivery_channel IS NULL OR delivery_channel IN ('slack', 'in_app', 'both')
  )
);

-- =============================================================================
-- Indexes
-- =============================================================================

-- Fetch all preferences for a user in an org
CREATE INDEX IF NOT EXISTS idx_user_seq_prefs_user_org
  ON user_sequence_preferences(user_id, org_id);

-- Query preferences by sequence type (for delivery layer)
CREATE INDEX IF NOT EXISTS idx_user_seq_prefs_sequence_type
  ON user_sequence_preferences(org_id, sequence_type, is_enabled);

-- =============================================================================
-- RLS Policies
-- =============================================================================

ALTER TABLE user_sequence_preferences ENABLE ROW LEVEL SECURITY;

-- Users can read own preferences
DROP POLICY IF EXISTS "Users can read own sequence preferences" ON user_sequence_preferences;
DO $$ BEGIN
  CREATE POLICY "Users can read own sequence preferences"
  ON user_sequence_preferences FOR SELECT
  TO authenticated
  USING (user_id = auth.uid());
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

-- Users can create own preferences
DROP POLICY IF EXISTS "Users can create own sequence preferences" ON user_sequence_preferences;
DO $$ BEGIN
  CREATE POLICY "Users can create own sequence preferences"
  ON user_sequence_preferences FOR INSERT
  TO authenticated
  WITH CHECK (user_id = auth.uid());
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

-- Users can update own preferences
DROP POLICY IF EXISTS "Users can update own sequence preferences" ON user_sequence_preferences;
DO $$ BEGIN
  CREATE POLICY "Users can update own sequence preferences"
  ON user_sequence_preferences FOR UPDATE
  TO authenticated
  USING (user_id = auth.uid())
  WITH CHECK (user_id = auth.uid());
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

-- Users can delete own preferences
DROP POLICY IF EXISTS "Users can delete own sequence preferences" ON user_sequence_preferences;
DO $$ BEGIN
  CREATE POLICY "Users can delete own sequence preferences"
  ON user_sequence_preferences FOR DELETE
  TO authenticated
  USING (user_id = auth.uid());
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

-- Service role has full access (for edge functions)
DROP POLICY IF EXISTS "Service role has full access to sequence preferences" ON user_sequence_preferences;
DO $$ BEGIN
  CREATE POLICY "Service role has full access to sequence preferences"
  ON user_sequence_preferences FOR ALL
  TO service_role
  USING (true)
  WITH CHECK (true);
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

-- =============================================================================
-- Trigger: Update updated_at timestamp
-- =============================================================================

CREATE OR REPLACE FUNCTION update_user_sequence_preferences_updated_at()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = now();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS trigger_update_user_sequence_preferences_updated_at ON user_sequence_preferences;
CREATE TRIGGER trigger_update_user_sequence_preferences_updated_at
  BEFORE UPDATE ON user_sequence_preferences
  FOR EACH ROW
  EXECUTE FUNCTION update_user_sequence_preferences_updated_at();

-- =============================================================================
-- Grants
-- =============================================================================

GRANT SELECT, INSERT, UPDATE, DELETE ON user_sequence_preferences TO authenticated;
GRANT ALL ON user_sequence_preferences TO service_role;

-- =============================================================================
-- Comments
-- =============================================================================

COMMENT ON TABLE user_sequence_preferences IS 'Per-user opt-in/out preferences for orchestrator event sequences. When no row exists for a (user_id, org_id, sequence_type), the user inherits the org default from proactive_agent_config.enabled_sequences.';

COMMENT ON COLUMN user_sequence_preferences.user_id IS 'User identifier';
COMMENT ON COLUMN user_sequence_preferences.org_id IS 'Organization identifier (clerk_org_id)';
COMMENT ON COLUMN user_sequence_preferences.sequence_type IS 'Type of orchestrator event sequence (one of 9 supported types)';
COMMENT ON COLUMN user_sequence_preferences.is_enabled IS 'Whether this sequence is enabled for the user (true = enabled, false = opted out)';
COMMENT ON COLUMN user_sequence_preferences.delivery_channel IS 'Override delivery channel (slack, in_app, both). NULL means inherit org default.';

-- =============================================================================
-- RPC: Get user preference for a sequence
-- =============================================================================

CREATE OR REPLACE FUNCTION get_user_sequence_preference(
  p_user_id UUID,
  p_org_id TEXT,
  p_sequence_type TEXT
)
RETURNS TABLE (
  is_enabled BOOLEAN,
  delivery_channel TEXT
)
LANGUAGE sql
STABLE
SECURITY DEFINER
AS $$
  SELECT
    COALESCE(usp.is_enabled, true) as is_enabled,
    usp.delivery_channel
  FROM user_sequence_preferences usp
  WHERE usp.user_id = p_user_id
    AND usp.org_id = p_org_id
    AND usp.sequence_type = p_sequence_type
$$;

COMMENT ON FUNCTION get_user_sequence_preference IS 'Returns user preference for a specific sequence type (returns defaults if no row exists)';

GRANT EXECUTE ON FUNCTION get_user_sequence_preference TO authenticated;
GRANT EXECUTE ON FUNCTION get_user_sequence_preference TO service_role;

-- =============================================================================
-- RPC: Get all sequence preferences for user in org
-- =============================================================================

CREATE OR REPLACE FUNCTION get_user_sequence_preferences_for_org(
  p_user_id UUID,
  p_org_id TEXT
)
RETURNS TABLE (
  sequence_type TEXT,
  is_enabled BOOLEAN,
  delivery_channel TEXT
)
LANGUAGE sql
STABLE
SECURITY DEFINER
AS $$
  SELECT
    usp.sequence_type,
    usp.is_enabled,
    usp.delivery_channel
  FROM user_sequence_preferences usp
  WHERE usp.user_id = p_user_id
    AND usp.org_id = p_org_id
  ORDER BY usp.sequence_type
$$;

COMMENT ON FUNCTION get_user_sequence_preferences_for_org IS 'Returns all sequence preferences for a user in an org';

GRANT EXECUTE ON FUNCTION get_user_sequence_preferences_for_org TO authenticated;
GRANT EXECUTE ON FUNCTION get_user_sequence_preferences_for_org TO service_role;

-- =============================================================================
-- RPC: Update user sequence preference
-- =============================================================================

CREATE OR REPLACE FUNCTION update_user_sequence_preference(
  p_user_id UUID,
  p_org_id TEXT,
  p_sequence_type TEXT,
  p_is_enabled BOOLEAN DEFAULT true,
  p_delivery_channel TEXT DEFAULT NULL
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
    'proposal_generation', 'calendar_find_times'
  ) THEN
    RAISE EXCEPTION 'Invalid sequence_type: %', p_sequence_type;
  END IF;

  -- Validate delivery_channel
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
    delivery_channel
  ) VALUES (
    p_user_id,
    p_org_id,
    p_sequence_type,
    p_is_enabled,
    p_delivery_channel
  )
  ON CONFLICT (user_id, org_id, sequence_type)
  DO UPDATE SET
    is_enabled = EXCLUDED.is_enabled,
    delivery_channel = EXCLUDED.delivery_channel,
    updated_at = now()
  RETURNING id INTO v_pref_id;

  RETURN v_pref_id;
END;
$$;

COMMENT ON FUNCTION update_user_sequence_preference IS 'Creates or updates a user sequence preference (upsert pattern)';

GRANT EXECUTE ON FUNCTION update_user_sequence_preference TO authenticated;
GRANT EXECUTE ON FUNCTION update_user_sequence_preference TO service_role;

-- =============================================================================
-- RPC: Delete user sequence preference (revert to org default)
-- =============================================================================

CREATE OR REPLACE FUNCTION delete_user_sequence_preference(
  p_user_id UUID,
  p_org_id TEXT,
  p_sequence_type TEXT
)
RETURNS BOOLEAN
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
BEGIN
  DELETE FROM user_sequence_preferences
  WHERE user_id = p_user_id
    AND org_id = p_org_id
    AND sequence_type = p_sequence_type;

  RETURN FOUND;
END;
$$;

COMMENT ON FUNCTION delete_user_sequence_preference IS 'Deletes a user preference, reverting to org default';

GRANT EXECUTE ON FUNCTION delete_user_sequence_preference TO authenticated;
GRANT EXECUTE ON FUNCTION delete_user_sequence_preference TO service_role;
