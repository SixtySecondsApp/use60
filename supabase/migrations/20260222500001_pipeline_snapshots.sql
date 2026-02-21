-- ============================================================================
-- Migration: Pipeline Snapshots + Quota Config
-- Purpose: Store periodic pipeline snapshots per user/org, used by morning
--          briefing pipeline math RPC functions
-- Story: BRF-001
-- Date: 2026-02-22
-- ============================================================================

-- ============================================================================
-- TABLE: pipeline_snapshots (BRF-001)
-- Stores point-in-time pipeline metrics per user/org/period.
-- Written by the weekly cron and on-demand from the morning briefing agent.
-- ============================================================================

CREATE TABLE IF NOT EXISTS pipeline_snapshots (
  id                            UUID        NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  org_id                        UUID        NOT NULL REFERENCES organizations (id) ON DELETE CASCADE,
  user_id                       UUID        NOT NULL REFERENCES auth.users (id) ON DELETE CASCADE,
  snapshot_date                 DATE        NOT NULL,
  period                        TEXT        NOT NULL DEFAULT 'weekly',
  total_pipeline_value          NUMERIC(18, 2) NOT NULL DEFAULT 0,
  weighted_pipeline_value       NUMERIC(18, 2) NOT NULL DEFAULT 0,
  deals_by_stage                JSONB       NOT NULL DEFAULT '{}',
  deals_at_risk                 INT         NOT NULL DEFAULT 0,
  closed_this_period            NUMERIC(18, 2) NOT NULL DEFAULT 0,
  target                        NUMERIC(18, 2),
  coverage_ratio                NUMERIC(8, 4),
  forecast_accuracy_trailing    NUMERIC(8, 4),
  created_at                    TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at                    TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- Unique snapshot per user/org/date — upsert on re-run
CREATE UNIQUE INDEX IF NOT EXISTS idx_pipeline_snapshots_unique
  ON pipeline_snapshots (org_id, user_id, snapshot_date);

-- Fast lookup by org+user for briefing queries
CREATE INDEX IF NOT EXISTS idx_pipeline_snapshots_org_user
  ON pipeline_snapshots (org_id, user_id, snapshot_date DESC);

-- ============================================================================
-- RLS
-- ============================================================================

ALTER TABLE pipeline_snapshots ENABLE ROW LEVEL SECURITY;

-- Users can read their own snapshots
CREATE POLICY "Users can read own pipeline_snapshots"
ON pipeline_snapshots FOR SELECT
TO authenticated
USING (user_id = auth.uid());

-- Users can insert/update their own snapshots
CREATE POLICY "Users can upsert own pipeline_snapshots"
ON pipeline_snapshots FOR INSERT
TO authenticated
WITH CHECK (user_id = auth.uid());

CREATE POLICY "Users can update own pipeline_snapshots"
ON pipeline_snapshots FOR UPDATE
TO authenticated
USING (user_id = auth.uid())
WITH CHECK (user_id = auth.uid());

-- Service role full access (cron, orchestrator)
CREATE POLICY "Service role full access to pipeline_snapshots"
ON pipeline_snapshots FOR ALL
TO service_role
USING (true)
WITH CHECK (true);

-- ============================================================================
-- Trigger: keep updated_at current
-- ============================================================================

CREATE OR REPLACE FUNCTION update_pipeline_snapshots_updated_at()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = now();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS trg_pipeline_snapshots_updated_at ON pipeline_snapshots;
CREATE TRIGGER trg_pipeline_snapshots_updated_at
  BEFORE UPDATE ON pipeline_snapshots
  FOR EACH ROW
  EXECUTE FUNCTION update_pipeline_snapshots_updated_at();

GRANT SELECT, INSERT, UPDATE, DELETE ON pipeline_snapshots TO authenticated;
GRANT ALL ON pipeline_snapshots TO service_role;

COMMENT ON TABLE pipeline_snapshots IS 'Point-in-time pipeline metrics per user/org. Written by weekly cron (BRF-005) and morning briefing agent. Unique per (org_id, user_id, snapshot_date).';
COMMENT ON COLUMN pipeline_snapshots.period IS 'Snapshot period type: weekly | monthly | quarterly.';
COMMENT ON COLUMN pipeline_snapshots.total_pipeline_value IS 'Sum of deal values for all open deals at snapshot time.';
COMMENT ON COLUMN pipeline_snapshots.weighted_pipeline_value IS 'Pipeline value weighted by stage close probability.';
COMMENT ON COLUMN pipeline_snapshots.deals_by_stage IS 'JSONB map of stage_name → {count, total_value}. E.g. {"Discovery": {"count": 3, "total_value": 45000}}.';
COMMENT ON COLUMN pipeline_snapshots.deals_at_risk IS 'Count of deals flagged at-risk at snapshot time (risk_score >= threshold).';
COMMENT ON COLUMN pipeline_snapshots.closed_this_period IS 'Total closed-won value within the snapshot period.';
COMMENT ON COLUMN pipeline_snapshots.target IS 'Revenue target for the period (copied from agent_config at snapshot time).';
COMMENT ON COLUMN pipeline_snapshots.coverage_ratio IS 'total_pipeline_value / target. NULL if target is unset.';
COMMENT ON COLUMN pipeline_snapshots.forecast_accuracy_trailing IS 'Trailing forecast accuracy (0-1) based on prior period predictions vs actuals.';

-- ============================================================================
-- Pipeline Quota Keys in agent_config_org_overrides
-- (BRF-001) — document the expected keys stored per org
-- ============================================================================
-- Org admins set pipeline targets via agent_config_org_overrides with:
--   agent_type = 'morning_briefing'
--   config_key IN (
--     'quota.revenue'             → {"value": 500000, "period": "quarterly", "currency": "USD"}
--     'quota.deals_closed'        → {"value": 12, "period": "quarterly"}
--     'quota.pipeline_generated'  → {"value": 1500000, "period": "quarterly", "currency": "USD"}
--     'quota.coverage_ratio_target' → {"value": 3.0}
--   )
-- These are resolved at runtime via resolve_agent_config() — no separate quota table needed.

-- ============================================================================
-- Migration Summary
-- ============================================================================

DO $$
BEGIN
  RAISE NOTICE '';
  RAISE NOTICE '============================================================================';
  RAISE NOTICE 'Migration: 20260222500001_pipeline_snapshots.sql';
  RAISE NOTICE '============================================================================';
  RAISE NOTICE '';
  RAISE NOTICE 'Story covered: BRF-001';
  RAISE NOTICE '';
  RAISE NOTICE 'Tables created:';
  RAISE NOTICE '  - pipeline_snapshots  — point-in-time pipeline metrics per user/org/date';
  RAISE NOTICE '';
  RAISE NOTICE 'Indexes:';
  RAISE NOTICE '  - idx_pipeline_snapshots_unique  (org_id, user_id, snapshot_date) UNIQUE';
  RAISE NOTICE '  - idx_pipeline_snapshots_org_user (org_id, user_id, snapshot_date DESC)';
  RAISE NOTICE '';
  RAISE NOTICE 'RLS:';
  RAISE NOTICE '  - authenticated: read/insert/update own rows (user_id = auth.uid())';
  RAISE NOTICE '  - service_role:  full access (cron jobs, orchestrator)';
  RAISE NOTICE '';
  RAISE NOTICE 'Quota config keys (stored in agent_config_org_overrides):';
  RAISE NOTICE '  - quota.revenue, quota.deals_closed,';
  RAISE NOTICE '    quota.pipeline_generated, quota.coverage_ratio_target';
  RAISE NOTICE '';
  RAISE NOTICE '============================================================================';
END $$;
