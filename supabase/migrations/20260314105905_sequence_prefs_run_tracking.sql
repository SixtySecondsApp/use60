-- Migration: sequence_prefs_run_tracking
-- Date: 20260314105905
--
-- What this migration does:
--   TRINITY-009: Adds last_run_at and run_count columns to user_sequence_preferences
--   for tracking per-ability execution stats. Updates RPCs to return new fields.
--
-- Rollback strategy:
--   ALTER TABLE user_sequence_preferences DROP COLUMN IF EXISTS last_run_at;
--   ALTER TABLE user_sequence_preferences DROP COLUMN IF EXISTS run_count;
--   Re-run RPC definitions from 20260314105041_extend_delivery_channel_to_jsonb.sql

-- =============================================================================
-- Step 1: Add last_run_at and run_count columns
-- =============================================================================

DO $$
BEGIN
  ALTER TABLE user_sequence_preferences
    ADD COLUMN last_run_at TIMESTAMPTZ DEFAULT NULL;
EXCEPTION WHEN duplicate_column THEN
  RAISE NOTICE 'Column last_run_at already exists, skipping';
END $$;

DO $$
BEGIN
  ALTER TABLE user_sequence_preferences
    ADD COLUMN run_count INTEGER NOT NULL DEFAULT 0;
EXCEPTION WHEN duplicate_column THEN
  RAISE NOTICE 'Column run_count already exists, skipping';
END $$;

COMMENT ON COLUMN user_sequence_preferences.last_run_at IS
  'Timestamp of the last completed sequence execution for this ability';

COMMENT ON COLUMN user_sequence_preferences.run_count IS
  'Total number of completed sequence executions for this ability';

-- =============================================================================
-- Step 2: Update get_user_sequence_preferences_for_org to return new fields
-- =============================================================================

CREATE OR REPLACE FUNCTION get_user_sequence_preferences_for_org(
  p_user_id UUID,
  p_org_id TEXT
)
RETURNS TABLE (
  sequence_type TEXT,
  is_enabled BOOLEAN,
  delivery_channel TEXT,
  delivery_channels JSONB,
  last_run_at TIMESTAMPTZ,
  run_count INTEGER
)
LANGUAGE sql
STABLE
SECURITY DEFINER
AS $$
  SELECT
    usp.sequence_type,
    usp.is_enabled,
    usp.delivery_channel,
    usp.delivery_channels,
    usp.last_run_at,
    usp.run_count
  FROM user_sequence_preferences usp
  WHERE usp.user_id = p_user_id
    AND usp.org_id = p_org_id
  ORDER BY usp.sequence_type
$$;

COMMENT ON FUNCTION get_user_sequence_preferences_for_org IS 'Returns all sequence preferences for a user in an org, including run tracking fields';

-- =============================================================================
-- Step 3: Update get_user_sequence_preference (single) to return new fields
-- =============================================================================

CREATE OR REPLACE FUNCTION get_user_sequence_preference(
  p_user_id UUID,
  p_org_id TEXT,
  p_sequence_type TEXT
)
RETURNS TABLE (
  is_enabled BOOLEAN,
  delivery_channel TEXT,
  delivery_channels JSONB,
  last_run_at TIMESTAMPTZ,
  run_count INTEGER
)
LANGUAGE sql
STABLE
SECURITY DEFINER
AS $$
  SELECT
    COALESCE(usp.is_enabled, true) as is_enabled,
    usp.delivery_channel,
    usp.delivery_channels,
    usp.last_run_at,
    usp.run_count
  FROM user_sequence_preferences usp
  WHERE usp.user_id = p_user_id
    AND usp.org_id = p_org_id
    AND usp.sequence_type = p_sequence_type
$$;

COMMENT ON FUNCTION get_user_sequence_preference IS 'Returns user preference for a specific sequence type, including run tracking fields';

-- =============================================================================
-- Step 4: RPC to atomically record a sequence run (upsert + increment)
-- Called by the orchestrator runner after sequence completion.
-- =============================================================================

CREATE OR REPLACE FUNCTION record_sequence_run(
  p_user_id UUID,
  p_org_id TEXT,
  p_sequence_type TEXT
)
RETURNS VOID
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
BEGIN
  INSERT INTO user_sequence_preferences (
    user_id,
    org_id,
    sequence_type,
    is_enabled,
    last_run_at,
    run_count
  ) VALUES (
    p_user_id,
    p_org_id,
    p_sequence_type,
    true,
    now(),
    1
  )
  ON CONFLICT (user_id, org_id, sequence_type)
  DO UPDATE SET
    last_run_at = now(),
    run_count = user_sequence_preferences.run_count + 1;
END;
$$;

COMMENT ON FUNCTION record_sequence_run IS 'Atomically records a sequence run: sets last_run_at to now() and increments run_count. Creates the preference row if it does not exist.';

GRANT EXECUTE ON FUNCTION record_sequence_run TO service_role;

-- =============================================================================
-- Migration Summary
-- =============================================================================

DO $$
BEGIN
  RAISE NOTICE '';
  RAISE NOTICE '============================================================================';
  RAISE NOTICE 'Migration: 20260314105905_sequence_prefs_run_tracking.sql';
  RAISE NOTICE '============================================================================';
  RAISE NOTICE '';
  RAISE NOTICE 'TRINITY-009: Add run tracking to user_sequence_preferences';
  RAISE NOTICE '';
  RAISE NOTICE 'Changes:';
  RAISE NOTICE '  1. Added last_run_at TIMESTAMPTZ column (NULL by default)';
  RAISE NOTICE '  2. Added run_count INTEGER column (0 by default)';
  RAISE NOTICE '  3. Updated RPCs to return new fields';
  RAISE NOTICE '  4. Added record_sequence_run RPC for atomic upsert+increment';
  RAISE NOTICE '';
  RAISE NOTICE '============================================================================';
END $$;
