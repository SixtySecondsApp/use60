-- Migration: add_deal_observations_table
-- Date: 20260310210231
--
-- What this migration does:
--   Creates the deal_observations table for the proactive sales teammate heartbeat system.
--   Stores observations like stale deals, missing next steps, follow-up gaps, competitor mentions,
--   engagement drops, and improvement suggestions. Each observation has severity routing and
--   deduplication via a unique partial index.
--
-- Rollback strategy:
--   DROP TABLE IF EXISTS deal_observations CASCADE;

-- ============================================================================
-- Table: deal_observations
-- ============================================================================

CREATE TABLE IF NOT EXISTS deal_observations (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  org_id TEXT NOT NULL,
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  deal_id UUID NOT NULL REFERENCES deals(id) ON DELETE CASCADE,
  category TEXT NOT NULL CHECK (category IN (
    'stale_deal',
    'missing_next_step',
    'follow_up_gap',
    'single_threaded',
    'proposal_delay',
    'engagement_drop',
    'competitor_mention',
    'stage_regression',
    'improvement_suggestion',
    'cross_deal_conflict'
  )),
  severity TEXT NOT NULL CHECK (severity IN ('high', 'medium', 'low')),
  title TEXT NOT NULL,
  description TEXT,
  affected_contacts UUID[],
  proposed_action JSONB,
  status TEXT NOT NULL DEFAULT 'open' CHECK (status IN (
    'open',
    'acted_on',
    'dismissed',
    'snoozed',
    'auto_resolved'
  )),
  snooze_until TIMESTAMPTZ,
  first_observed_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  last_observed_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  resolved_at TIMESTAMPTZ,
  resolution_type TEXT CHECK (resolution_type IN (
    'user_action',
    'auto_resolved',
    'dismissed',
    'snoozed'
  )),
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- Dedup: only one open observation per deal per category
CREATE UNIQUE INDEX IF NOT EXISTS idx_deal_obs_dedup
  ON deal_observations (org_id, deal_id, category)
  WHERE status = 'open';

-- Query by user (morning brief, Slack DMs)
CREATE INDEX IF NOT EXISTS idx_deal_obs_user_status
  ON deal_observations (user_id, status, severity)
  WHERE status = 'open';

-- Query by org (nightly scan, daily digest)
CREATE INDEX IF NOT EXISTS idx_deal_obs_org_status
  ON deal_observations (org_id, status, created_at DESC)
  WHERE status = 'open';

-- Query by deal (deal page, Command Centre)
CREATE INDEX IF NOT EXISTS idx_deal_obs_deal
  ON deal_observations (deal_id, status)
  WHERE status = 'open';

-- Snoozed observations (check snooze expiry)
CREATE INDEX IF NOT EXISTS idx_deal_obs_snoozed
  ON deal_observations (snooze_until)
  WHERE status = 'snoozed' AND snooze_until IS NOT NULL;

COMMENT ON TABLE deal_observations IS
  'Proactive sales teammate observations. Heartbeat system stores deal-level findings with severity routing and dedup.';

-- ============================================================================
-- RLS Policies
-- ============================================================================

ALTER TABLE deal_observations ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Users can view own org observations" ON deal_observations;
CREATE POLICY "Users can view own org observations"
  ON deal_observations FOR SELECT
  USING (
    org_id IN (
      SELECT om.org_id FROM organization_memberships om
      WHERE om.user_id = auth.uid()
    )
  );

DROP POLICY IF EXISTS "Users can update own observations" ON deal_observations;
CREATE POLICY "Users can update own observations"
  ON deal_observations FOR UPDATE
  USING (user_id = auth.uid())
  WITH CHECK (user_id = auth.uid());

DROP POLICY IF EXISTS "Service role can manage all observations" ON deal_observations;
CREATE POLICY "Service role can manage all observations"
  ON deal_observations FOR ALL
  USING (auth.role() = 'service_role');
