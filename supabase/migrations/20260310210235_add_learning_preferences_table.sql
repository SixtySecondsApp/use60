-- Migration: add_learning_preferences_table
-- Date: 20260310210235
--
-- What this migration does:
--   Creates the learning_preferences table for the sales learning loop.
--   Stores extracted user preferences derived from edit diffs (e.g., "prefers shorter emails",
--   "casual greeting style", "removes PS line"). These preferences are fed back into
--   draft generation prompts to improve output quality over time.
--
-- Rollback strategy:
--   DROP TABLE IF EXISTS learning_preferences CASCADE;

-- ============================================================================
-- Table: learning_preferences
-- ============================================================================

CREATE TABLE IF NOT EXISTS learning_preferences (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  org_id TEXT NOT NULL,
  preference_key TEXT NOT NULL,
  preference_value TEXT NOT NULL,
  confidence NUMERIC(3,2) NOT NULL DEFAULT 0.50 CHECK (confidence >= 0 AND confidence <= 1),
  sample_count INTEGER NOT NULL DEFAULT 1,
  category TEXT NOT NULL DEFAULT 'general' CHECK (category IN (
    'tone',
    'length',
    'greeting',
    'sign_off',
    'structure',
    'content',
    'general'
  )),
  source_action_type TEXT,
  last_evidence JSONB,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- Upsert-friendly: one preference per user per key
CREATE UNIQUE INDEX IF NOT EXISTS idx_learning_prefs_user_key
  ON learning_preferences (user_id, preference_key);

-- Query by user + category (for draft generation)
CREATE INDEX IF NOT EXISTS idx_learning_prefs_user_category
  ON learning_preferences (user_id, category, confidence DESC);

-- Query by org (analytics)
CREATE INDEX IF NOT EXISTS idx_learning_prefs_org
  ON learning_preferences (org_id, created_at DESC);

COMMENT ON TABLE learning_preferences IS
  'Extracted user preferences from edit diffs. Fed into draft generation prompts for personalization. Part of the sales learning loop.';

-- ============================================================================
-- RLS Policies
-- ============================================================================

ALTER TABLE learning_preferences ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Users can view own preferences" ON learning_preferences;
CREATE POLICY "Users can view own preferences"
  ON learning_preferences FOR SELECT
  USING (user_id = auth.uid());

DROP POLICY IF EXISTS "Users can update own preferences" ON learning_preferences;
CREATE POLICY "Users can update own preferences"
  ON learning_preferences FOR UPDATE
  USING (user_id = auth.uid())
  WITH CHECK (user_id = auth.uid());

DROP POLICY IF EXISTS "Service role can manage all preferences" ON learning_preferences;
CREATE POLICY "Service role can manage all preferences"
  ON learning_preferences FOR ALL
  USING (auth.role() = 'service_role');

-- ============================================================================
-- Auto-update updated_at trigger
-- ============================================================================

CREATE OR REPLACE FUNCTION update_learning_preferences_updated_at()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = now();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS trg_learning_preferences_updated_at ON learning_preferences;
CREATE TRIGGER trg_learning_preferences_updated_at
  BEFORE UPDATE ON learning_preferences
  FOR EACH ROW
  EXECUTE FUNCTION update_learning_preferences_updated_at();
