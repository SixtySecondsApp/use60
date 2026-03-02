-- ============================================================================
-- Migration: Proactive Agent Config Table
-- Purpose: Organization-level master switch and sequence configuration for proactive AI agent
-- Story: CONF-001 — Create proactive_agent_config table with org-level master switch
-- Date: 2026-02-16
-- ============================================================================

-- =============================================================================
-- Table: proactive_agent_config
-- Master config for proactive agent at the organization level
-- =============================================================================

CREATE TABLE IF NOT EXISTS proactive_agent_config (
  org_id TEXT PRIMARY KEY,

  -- Master switch: defaults OFF so existing orgs aren't auto-opted-in
  is_enabled BOOLEAN NOT NULL DEFAULT false,

  -- Per-sequence configuration (JSONB structure with enabled flag and delivery channel)
  enabled_sequences JSONB NOT NULL DEFAULT jsonb_build_object(
    'meeting_ended', jsonb_build_object('enabled', true, 'delivery_channel', 'slack'),
    'pre_meeting_90min', jsonb_build_object('enabled', true, 'delivery_channel', 'slack'),
    'deal_risk_scan', jsonb_build_object('enabled', true, 'delivery_channel', 'slack'),
    'stale_deal_revival', jsonb_build_object('enabled', false, 'delivery_channel', 'slack'),
    'coaching_weekly', jsonb_build_object('enabled', false, 'delivery_channel', 'slack'),
    'campaign_daily_check', jsonb_build_object('enabled', false, 'delivery_channel', 'slack'),
    'email_received', jsonb_build_object('enabled', false, 'delivery_channel', 'slack'),
    'proposal_generation', jsonb_build_object('enabled', false, 'delivery_channel', 'slack'),
    'calendar_find_times', jsonb_build_object('enabled', false, 'delivery_channel', 'slack')
  ),

  -- Default delivery channel for sequences: 'slack' | 'in_app' | 'both'
  default_delivery TEXT NOT NULL DEFAULT 'slack' CHECK (default_delivery IN ('slack', 'in_app', 'both')),

  -- Security: allowed webhook domains for custom abilities
  allowed_webhook_domains TEXT[] DEFAULT '{}',

  -- Security: hashed API keys for webhook triggers
  webhook_api_keys JSONB DEFAULT '[]'::jsonb,

  -- Timestamps
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- Index: Primary key on org_id is sufficient (it's the only lookup pattern)
-- Already created implicitly by PRIMARY KEY constraint

-- =============================================================================
-- RLS Policies
-- =============================================================================

ALTER TABLE proactive_agent_config ENABLE ROW LEVEL SECURITY;

-- Organization admins can manage config (SELECT/INSERT/UPDATE/DELETE)
DO $$ BEGIN
  CREATE POLICY "Org admins can manage proactive agent config"
ON proactive_agent_config FOR ALL
TO authenticated
USING (
  EXISTS (
    SELECT 1
    FROM organization_memberships
    WHERE org_id::text = proactive_agent_config.org_id
      AND user_id = auth.uid()
      AND role IN ('owner', 'admin')
  )
)
WITH CHECK (
  EXISTS (
    SELECT 1
    FROM organization_memberships
    WHERE org_id::text = proactive_agent_config.org_id
      AND user_id = auth.uid()
      AND role IN ('owner', 'admin')
  )
);
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

-- Organization members can read config (SELECT only)
DO $$ BEGIN
  CREATE POLICY "Org members can read proactive agent config"
ON proactive_agent_config FOR SELECT
TO authenticated
USING (
  EXISTS (
    SELECT 1
    FROM organization_memberships
    WHERE org_id::text = proactive_agent_config.org_id
      AND user_id = auth.uid()
  )
);
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

-- Service role has full access (for edge functions and orchestrator)
DO $$ BEGIN
  CREATE POLICY "Service role full access to proactive agent config"
ON proactive_agent_config FOR ALL
TO service_role
USING (true)
WITH CHECK (true);
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

-- =============================================================================
-- Trigger: Update updated_at on row changes
-- =============================================================================

CREATE OR REPLACE FUNCTION update_proactive_agent_config_updated_at()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = now();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS update_proactive_agent_config_updated_at ON proactive_agent_config;
CREATE TRIGGER update_proactive_agent_config_updated_at
  BEFORE UPDATE ON proactive_agent_config
  FOR EACH ROW
  EXECUTE FUNCTION update_proactive_agent_config_updated_at();

-- =============================================================================
-- Permissions
-- =============================================================================

GRANT SELECT, INSERT, UPDATE, DELETE ON proactive_agent_config TO authenticated;
GRANT ALL ON proactive_agent_config TO service_role;

-- =============================================================================
-- Comments
-- =============================================================================

COMMENT ON TABLE proactive_agent_config IS 'Organization-level master switch and per-sequence configuration for the proactive AI agent. Defaults to disabled for all orgs.';

COMMENT ON COLUMN proactive_agent_config.org_id IS 'Organization identifier (clerk_org_id). Primary key linking to organizations.';

COMMENT ON COLUMN proactive_agent_config.is_enabled IS 'Master switch for proactive agent feature. Defaults to false so existing orgs are not auto-opted-in.';

COMMENT ON COLUMN proactive_agent_config.enabled_sequences IS 'Per-sequence configuration as JSONB. Each key is a sequence name with {enabled: boolean, delivery_channel: string} structure.';

COMMENT ON COLUMN proactive_agent_config.default_delivery IS 'Default delivery channel for sequences: slack, in_app, or both. Individual sequences can override this.';

COMMENT ON COLUMN proactive_agent_config.allowed_webhook_domains IS 'Security: list of allowed domains for webhook triggers in custom abilities.';

COMMENT ON COLUMN proactive_agent_config.webhook_api_keys IS 'Security: array of hashed API keys for webhook authentication and trigger validation.';

COMMENT ON COLUMN proactive_agent_config.created_at IS 'Timestamp when config was created.';

COMMENT ON COLUMN proactive_agent_config.updated_at IS 'Timestamp when config was last updated.';

COMMENT ON FUNCTION update_proactive_agent_config_updated_at IS 'Trigger function: Automatically updates updated_at timestamp when a proactive_agent_config row is modified.';

-- =============================================================================
-- Migration Summary
-- =============================================================================

DO $$
BEGIN
  RAISE NOTICE '';
  RAISE NOTICE '============================================================================';
  RAISE NOTICE 'Migration: 20260216000003_add_proactive_agent_config.sql';
  RAISE NOTICE '============================================================================';
  RAISE NOTICE '';
  RAISE NOTICE 'Created table: proactive_agent_config';
  RAISE NOTICE '  - Primary key: org_id (TEXT / clerk_org_id)';
  RAISE NOTICE '  - Master switch: is_enabled (defaults OFF)';
  RAISE NOTICE '  - Per-sequence config: enabled_sequences (JSONB)';
  RAISE NOTICE '  - Default delivery: slack, in_app, or both';
  RAISE NOTICE '  - Security: allowed_webhook_domains (TEXT[])';
  RAISE NOTICE '  - Security: webhook_api_keys (JSONB hashed keys)';
  RAISE NOTICE '';
  RAISE NOTICE 'RLS Policies:';
  RAISE NOTICE '  - Org admins: Full access (SELECT/INSERT/UPDATE/DELETE)';
  RAISE NOTICE '  - Org members: Read-only (SELECT)';
  RAISE NOTICE '  - Service role: Full access';
  RAISE NOTICE '';
  RAISE NOTICE 'Trigger:';
  RAISE NOTICE '  - update_proactive_agent_config_updated_at: Updates updated_at on row changes';
  RAISE NOTICE '';
  RAISE NOTICE 'Enabled sequences (default configuration):';
  RAISE NOTICE '  - meeting_ended: enabled=true, delivery=slack';
  RAISE NOTICE '  - pre_meeting_90min: enabled=true, delivery=slack';
  RAISE NOTICE '  - deal_risk_scan: enabled=true, delivery=slack';
  RAISE NOTICE '  - stale_deal_revival: enabled=false, delivery=slack';
  RAISE NOTICE '  - coaching_weekly: enabled=false, delivery=slack';
  RAISE NOTICE '  - campaign_daily_check: enabled=false, delivery=slack';
  RAISE NOTICE '  - email_received: enabled=false, delivery=slack';
  RAISE NOTICE '  - proposal_generation: enabled=false, delivery=slack';
  RAISE NOTICE '  - calendar_find_times: enabled=false, delivery=slack';
  RAISE NOTICE '';
  RAISE NOTICE '============================================================================';
END $$;
