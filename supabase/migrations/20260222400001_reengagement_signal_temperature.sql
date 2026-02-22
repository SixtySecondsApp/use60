-- ============================================================================
-- Migration: Re-engagement Signal Temperature
-- Purpose: Track signal temperature per deal, add cooldown/attempt columns
--          to reengagement_watchlist, and provide hot-deal discovery RPCs
-- Story: REN-001
-- Date: 2026-02-22
-- ============================================================================

-- =============================================================================
-- TABLE: deal_signal_temperature
-- Per-deal aggregate of re-engagement signal strength and trend
-- =============================================================================

CREATE TABLE IF NOT EXISTS deal_signal_temperature (
  id                UUID PRIMARY KEY DEFAULT gen_random_uuid(),

  -- Deal linkage (unique per deal — one temperature row per deal)
  deal_id           UUID NOT NULL REFERENCES deals(id) ON DELETE CASCADE,

  -- Org context for RLS
  org_id            TEXT NOT NULL,

  -- Temperature score: 0.0 (cold) to 1.0 (hot)
  temperature       NUMERIC(4, 3) NOT NULL DEFAULT 0.0
                    CHECK (temperature >= 0.0 AND temperature <= 1.0),

  -- Direction of change: 'rising', 'falling', 'stable'
  trend             TEXT NOT NULL DEFAULT 'stable'
                    CHECK (trend IN ('rising', 'falling', 'stable')),

  -- Timestamp of the most recent signal processed
  last_signal       TIMESTAMPTZ,

  -- Rolling signal counts
  signal_count_24h  INT NOT NULL DEFAULT 0 CHECK (signal_count_24h >= 0),
  signal_count_7d   INT NOT NULL DEFAULT 0 CHECK (signal_count_7d >= 0),

  -- Top signals driving the current temperature (ordered array of signal objects)
  -- Each entry: { type, source, description, score_delta, detected_at }
  top_signals       JSONB NOT NULL DEFAULT '[]'::jsonb,

  -- Timestamps
  created_at        TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at        TIMESTAMPTZ NOT NULL DEFAULT now(),

  -- One temperature row per deal
  CONSTRAINT unique_deal_signal_temperature UNIQUE (deal_id)
);

-- =============================================================================
-- Indexes: deal_signal_temperature
-- =============================================================================

-- Hot-deal queries: find high-temperature deals within an org
CREATE INDEX IF NOT EXISTS idx_deal_signal_temperature_hot
  ON deal_signal_temperature (org_id, temperature DESC)
  WHERE temperature > 0.5;

-- Trend queries: find rising deals
CREATE INDEX IF NOT EXISTS idx_deal_signal_temperature_trend
  ON deal_signal_temperature (org_id, trend)
  WHERE trend = 'rising';

-- Recent signal activity
CREATE INDEX IF NOT EXISTS idx_deal_signal_temperature_last_signal
  ON deal_signal_temperature (last_signal DESC NULLS LAST)
  WHERE last_signal IS NOT NULL;

-- =============================================================================
-- Trigger: updated_at maintenance
-- =============================================================================

CREATE OR REPLACE FUNCTION update_deal_signal_temperature_updated_at()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = now();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS trg_deal_signal_temperature_updated_at ON deal_signal_temperature;
CREATE TRIGGER trg_deal_signal_temperature_updated_at
  BEFORE UPDATE ON deal_signal_temperature
  FOR EACH ROW EXECUTE FUNCTION update_deal_signal_temperature_updated_at();

-- =============================================================================
-- RLS: deal_signal_temperature
-- =============================================================================

ALTER TABLE deal_signal_temperature ENABLE ROW LEVEL SECURITY;

-- Users in the same org can view temperature rows
DROP POLICY IF EXISTS "Users can view org deal_signal_temperature" ON deal_signal_temperature;
CREATE POLICY "Users can view org deal_signal_temperature"
  ON deal_signal_temperature FOR SELECT
  TO authenticated
  USING (
    org_id IN (
      SELECT org_id::text
      FROM organization_memberships
      WHERE user_id = auth.uid()
    )
  );

-- Service role has full access (for edge functions / orchestrator)
DROP POLICY IF EXISTS "Service role full access to deal_signal_temperature" ON deal_signal_temperature;
CREATE POLICY "Service role full access to deal_signal_temperature"
  ON deal_signal_temperature FOR ALL
  TO service_role
  USING (true)
  WITH CHECK (true);

-- =============================================================================
-- ALTER: reengagement_watchlist — add cooldown/attempt columns
-- Each column is added only if it does not already exist (idempotent)
-- =============================================================================

DO $$
BEGIN
  -- max_attempts: upper bound on how many times we can reach out before giving up
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_name = 'reengagement_watchlist'
      AND column_name = 'max_attempts'
  ) THEN
    ALTER TABLE reengagement_watchlist
      ADD COLUMN max_attempts INT NOT NULL DEFAULT 3
        CHECK (max_attempts > 0);
  END IF;

  -- attempt_count: how many outreach attempts have been made so far
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_name = 'reengagement_watchlist'
      AND column_name = 'attempt_count'
  ) THEN
    ALTER TABLE reengagement_watchlist
      ADD COLUMN attempt_count INT NOT NULL DEFAULT 0
        CHECK (attempt_count >= 0);
  END IF;

  -- cooldown_until: do not attempt outreach before this timestamp
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_name = 'reengagement_watchlist'
      AND column_name = 'cooldown_until'
  ) THEN
    ALTER TABLE reengagement_watchlist
      ADD COLUMN cooldown_until TIMESTAMPTZ DEFAULT NULL;
  END IF;

  -- unsubscribed: contact has opted out — never attempt outreach
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_name = 'reengagement_watchlist'
      AND column_name = 'unsubscribed'
  ) THEN
    ALTER TABLE reengagement_watchlist
      ADD COLUMN unsubscribed BOOLEAN NOT NULL DEFAULT false;
  END IF;
END $$;

-- Index: quickly exclude cooling-down and exhausted entries
CREATE INDEX IF NOT EXISTS idx_reengagement_watchlist_cooldown
  ON reengagement_watchlist (cooldown_until)
  WHERE cooldown_until IS NOT NULL;

CREATE INDEX IF NOT EXISTS idx_reengagement_watchlist_attempts
  ON reengagement_watchlist (org_id, attempt_count, max_attempts)
  WHERE status = 'active';

-- =============================================================================
-- RPC: upsert_signal_temperature
-- Insert or update a deal's signal temperature atomically
-- =============================================================================

CREATE OR REPLACE FUNCTION upsert_signal_temperature(
  p_deal_id          UUID,
  p_org_id           TEXT,
  p_temperature      NUMERIC,
  p_trend            TEXT DEFAULT 'stable',
  p_last_signal      TIMESTAMPTZ DEFAULT NULL,
  p_signal_count_24h INT DEFAULT NULL,
  p_signal_count_7d  INT DEFAULT NULL,
  p_top_signals      JSONB DEFAULT NULL
)
RETURNS UUID
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $$
DECLARE
  v_id UUID;
BEGIN
  -- Validate inputs
  IF p_temperature < 0.0 OR p_temperature > 1.0 THEN
    RAISE EXCEPTION 'temperature must be between 0.0 and 1.0, got %', p_temperature;
  END IF;

  IF p_trend NOT IN ('rising', 'falling', 'stable') THEN
    RAISE EXCEPTION 'trend must be rising, falling, or stable, got %', p_trend;
  END IF;

  INSERT INTO deal_signal_temperature (
    deal_id,
    org_id,
    temperature,
    trend,
    last_signal,
    signal_count_24h,
    signal_count_7d,
    top_signals
  ) VALUES (
    p_deal_id,
    p_org_id,
    p_temperature,
    p_trend,
    COALESCE(p_last_signal, now()),
    COALESCE(p_signal_count_24h, 0),
    COALESCE(p_signal_count_7d, 0),
    COALESCE(p_top_signals, '[]'::jsonb)
  )
  ON CONFLICT (deal_id) DO UPDATE SET
    org_id           = EXCLUDED.org_id,
    temperature      = EXCLUDED.temperature,
    trend            = EXCLUDED.trend,
    last_signal      = COALESCE(EXCLUDED.last_signal, deal_signal_temperature.last_signal),
    signal_count_24h = COALESCE(p_signal_count_24h, deal_signal_temperature.signal_count_24h),
    signal_count_7d  = COALESCE(p_signal_count_7d,  deal_signal_temperature.signal_count_7d),
    top_signals      = COALESCE(EXCLUDED.top_signals, deal_signal_temperature.top_signals),
    updated_at       = now()
  RETURNING id INTO v_id;

  RETURN v_id;
END;
$$;

COMMENT ON FUNCTION upsert_signal_temperature IS
  'Inserts or updates a deal signal temperature row. Use COALESCE semantics — passing NULL for count/signal fields preserves the existing value.';

GRANT EXECUTE ON FUNCTION upsert_signal_temperature TO authenticated;
GRANT EXECUTE ON FUNCTION upsert_signal_temperature TO service_role;

-- =============================================================================
-- RPC: get_hot_deals
-- Returns deals above a temperature threshold ordered by heat descending
-- =============================================================================

CREATE OR REPLACE FUNCTION get_hot_deals(
  p_org_id    TEXT,
  p_threshold NUMERIC DEFAULT 0.6,
  p_limit     INT DEFAULT 10
)
RETURNS TABLE (
  deal_id           UUID,
  deal_name         TEXT,
  deal_value        NUMERIC,
  owner_name        TEXT,
  temperature       NUMERIC,
  trend             TEXT,
  last_signal       TIMESTAMPTZ,
  signal_count_24h  INT,
  signal_count_7d   INT,
  top_signals       JSONB,
  watchlist_status  TEXT,
  cooldown_until    TIMESTAMPTZ,
  attempt_count     INT,
  max_attempts      INT
)
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path TO 'public'
AS $$
  SELECT
    dst.deal_id,
    d.name                                              AS deal_name,
    d.value                                             AS deal_value,
    COALESCE(
      CONCAT_WS(' ', p.first_name, p.last_name),
      p.email
    )                                                   AS owner_name,
    dst.temperature,
    dst.trend,
    dst.last_signal,
    dst.signal_count_24h,
    dst.signal_count_7d,
    dst.top_signals,
    rw.status                                           AS watchlist_status,
    rw.cooldown_until,
    rw.attempt_count,
    rw.max_attempts
  FROM deal_signal_temperature dst
  INNER JOIN deals d ON d.id = dst.deal_id
  LEFT JOIN  profiles p ON p.id = d.owner_id
  LEFT JOIN  reengagement_watchlist rw ON rw.deal_id = dst.deal_id
  WHERE dst.org_id = p_org_id
    AND dst.temperature >= p_threshold
    -- Exclude deals on cooldown or over attempt limit
    AND (rw.cooldown_until IS NULL OR rw.cooldown_until <= now())
    AND (rw.unsubscribed IS NULL OR rw.unsubscribed = false)
    AND (rw.attempt_count IS NULL OR rw.attempt_count < rw.max_attempts)
  ORDER BY dst.temperature DESC, dst.last_signal DESC NULLS LAST
  LIMIT p_limit;
$$;

COMMENT ON FUNCTION get_hot_deals IS
  'Returns deals with signal temperature at or above the threshold, excluding those on cooldown, unsubscribed, or exhausted of attempts. Ordered hottest first.';

GRANT EXECUTE ON FUNCTION get_hot_deals TO authenticated;
GRANT EXECUTE ON FUNCTION get_hot_deals TO service_role;

-- =============================================================================
-- Table and column comments
-- =============================================================================

COMMENT ON TABLE deal_signal_temperature IS
  'Tracks aggregated re-engagement signal strength per deal. One row per deal. Updated by the signal scorer as new signals arrive.';

COMMENT ON COLUMN deal_signal_temperature.temperature IS
  'Signal strength 0.0–1.0. Decays over time; boosted by new buying signals.';
COMMENT ON COLUMN deal_signal_temperature.trend IS
  'Direction of change since last update: rising, falling, or stable.';
COMMENT ON COLUMN deal_signal_temperature.last_signal IS
  'Timestamp of the most recent signal that updated this row.';
COMMENT ON COLUMN deal_signal_temperature.signal_count_24h IS
  'Number of signals detected in the last 24 hours. Reset on each scorer run.';
COMMENT ON COLUMN deal_signal_temperature.signal_count_7d IS
  'Number of signals detected in the last 7 days. Rolling window.';
COMMENT ON COLUMN deal_signal_temperature.top_signals IS
  'Ordered JSON array of top signals: [{type, source, description, score_delta, detected_at}].';

COMMENT ON COLUMN reengagement_watchlist.max_attempts IS
  'Maximum number of outreach attempts allowed before this entry is auto-retired.';
COMMENT ON COLUMN reengagement_watchlist.attempt_count IS
  'Number of outreach attempts made so far. Incremented by the outreach agent.';
COMMENT ON COLUMN reengagement_watchlist.cooldown_until IS
  'Do not attempt outreach before this timestamp. Set by the scorer after each attempt.';
COMMENT ON COLUMN reengagement_watchlist.unsubscribed IS
  'Contact has opted out of all re-engagement outreach. Never cleared automatically.';

-- =============================================================================
-- Migration summary
-- =============================================================================

DO $$
BEGIN
  RAISE NOTICE '';
  RAISE NOTICE '============================================================================';
  RAISE NOTICE 'Migration: 20260222400001_reengagement_signal_temperature.sql';
  RAISE NOTICE '============================================================================';
  RAISE NOTICE 'Story: REN-001';
  RAISE NOTICE '';
  RAISE NOTICE 'New table:';
  RAISE NOTICE '  deal_signal_temperature — per-deal aggregate signal strength';
  RAISE NOTICE '';
  RAISE NOTICE 'Altered table:';
  RAISE NOTICE '  reengagement_watchlist += max_attempts, attempt_count,';
  RAISE NOTICE '                            cooldown_until, unsubscribed';
  RAISE NOTICE '';
  RAISE NOTICE 'New RPCs:';
  RAISE NOTICE '  upsert_signal_temperature(deal_id, org_id, temperature, ...)';
  RAISE NOTICE '  get_hot_deals(org_id, threshold, limit)';
  RAISE NOTICE '';
  RAISE NOTICE 'RLS: org-isolated SELECT for authenticated, full for service_role';
  RAISE NOTICE '============================================================================';
END $$;
