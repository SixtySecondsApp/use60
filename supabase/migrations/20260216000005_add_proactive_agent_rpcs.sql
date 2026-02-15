-- ============================================================================
-- Migration: Proactive Agent Config and Merged Preferences RPCs
-- Purpose: Create RPCs for org-level config and merged user preference querying
-- Story: CONF-003 — Create RPCs for proactive agent settings CRUD
-- Date: 2026-02-16
-- ============================================================================

-- =============================================================================
-- RPC: Get proactive agent config for organization
-- Purpose: Retrieve org config with defaults if not yet configured
-- =============================================================================

CREATE OR REPLACE FUNCTION get_proactive_agent_config(
  p_org_id TEXT
)
RETURNS TABLE (
  org_id TEXT,
  is_enabled BOOLEAN,
  enabled_sequences JSONB,
  default_delivery TEXT,
  allowed_webhook_domains TEXT[],
  webhook_api_keys JSONB,
  created_at TIMESTAMPTZ,
  updated_at TIMESTAMPTZ
)
LANGUAGE sql
STABLE
SECURITY DEFINER
AS $$
  SELECT
    COALESCE(pac.org_id, p_org_id) as org_id,
    COALESCE(pac.is_enabled, false) as is_enabled,
    COALESCE(pac.enabled_sequences, jsonb_build_object(
      'meeting_ended', jsonb_build_object('enabled', true, 'delivery_channel', 'slack'),
      'pre_meeting_90min', jsonb_build_object('enabled', true, 'delivery_channel', 'slack'),
      'deal_risk_scan', jsonb_build_object('enabled', true, 'delivery_channel', 'slack'),
      'stale_deal_revival', jsonb_build_object('enabled', false, 'delivery_channel', 'slack'),
      'coaching_weekly', jsonb_build_object('enabled', false, 'delivery_channel', 'slack'),
      'campaign_daily_check', jsonb_build_object('enabled', false, 'delivery_channel', 'slack'),
      'email_received', jsonb_build_object('enabled', false, 'delivery_channel', 'slack'),
      'proposal_generation', jsonb_build_object('enabled', false, 'delivery_channel', 'slack'),
      'calendar_find_times', jsonb_build_object('enabled', false, 'delivery_channel', 'slack')
    )) as enabled_sequences,
    COALESCE(pac.default_delivery, 'slack') as default_delivery,
    COALESCE(pac.allowed_webhook_domains, '{}') as allowed_webhook_domains,
    COALESCE(pac.webhook_api_keys, '[]'::jsonb) as webhook_api_keys,
    COALESCE(pac.created_at, now()) as created_at,
    COALESCE(pac.updated_at, now()) as updated_at
  FROM proactive_agent_config pac
  WHERE pac.org_id = p_org_id
  UNION ALL
  SELECT
    p_org_id as org_id,
    false as is_enabled,
    jsonb_build_object(
      'meeting_ended', jsonb_build_object('enabled', true, 'delivery_channel', 'slack'),
      'pre_meeting_90min', jsonb_build_object('enabled', true, 'delivery_channel', 'slack'),
      'deal_risk_scan', jsonb_build_object('enabled', true, 'delivery_channel', 'slack'),
      'stale_deal_revival', jsonb_build_object('enabled', false, 'delivery_channel', 'slack'),
      'coaching_weekly', jsonb_build_object('enabled', false, 'delivery_channel', 'slack'),
      'campaign_daily_check', jsonb_build_object('enabled', false, 'delivery_channel', 'slack'),
      'email_received', jsonb_build_object('enabled', false, 'delivery_channel', 'slack'),
      'proposal_generation', jsonb_build_object('enabled', false, 'delivery_channel', 'slack'),
      'calendar_find_times', jsonb_build_object('enabled', false, 'delivery_channel', 'slack')
    ) as enabled_sequences,
    'slack' as default_delivery,
    '{}' as allowed_webhook_domains,
    '[]'::jsonb as webhook_api_keys,
    now() as created_at,
    now() as updated_at
  WHERE NOT EXISTS (
    SELECT 1 FROM proactive_agent_config WHERE org_id = p_org_id
  )
  LIMIT 1;
$$;

COMMENT ON FUNCTION get_proactive_agent_config IS
  'Returns organization-level proactive agent config. If no row exists, returns defaults (is_enabled=false, core sequences enabled, all other sequences disabled).';

GRANT EXECUTE ON FUNCTION get_proactive_agent_config TO authenticated;
GRANT EXECUTE ON FUNCTION get_proactive_agent_config TO service_role;

-- =============================================================================
-- RPC: Upsert proactive agent config for organization
-- Purpose: Create or update org-level configuration
-- =============================================================================

CREATE OR REPLACE FUNCTION upsert_proactive_agent_config(
  p_org_id TEXT,
  p_is_enabled BOOLEAN DEFAULT false,
  p_enabled_sequences JSONB DEFAULT NULL,
  p_default_delivery TEXT DEFAULT 'slack'
)
RETURNS TABLE (
  org_id TEXT,
  is_enabled BOOLEAN,
  enabled_sequences JSONB,
  default_delivery TEXT,
  created_at TIMESTAMPTZ,
  updated_at TIMESTAMPTZ
)
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
  v_enabled_sequences JSONB;
BEGIN
  -- Validate default_delivery
  IF p_default_delivery NOT IN ('slack', 'in_app', 'both') THEN
    RAISE EXCEPTION 'Invalid default_delivery: %', p_default_delivery;
  END IF;

  -- Use provided sequences or fall back to defaults
  v_enabled_sequences := COALESCE(p_enabled_sequences, jsonb_build_object(
    'meeting_ended', jsonb_build_object('enabled', true, 'delivery_channel', 'slack'),
    'pre_meeting_90min', jsonb_build_object('enabled', true, 'delivery_channel', 'slack'),
    'deal_risk_scan', jsonb_build_object('enabled', true, 'delivery_channel', 'slack'),
    'stale_deal_revival', jsonb_build_object('enabled', false, 'delivery_channel', 'slack'),
    'coaching_weekly', jsonb_build_object('enabled', false, 'delivery_channel', 'slack'),
    'campaign_daily_check', jsonb_build_object('enabled', false, 'delivery_channel', 'slack'),
    'email_received', jsonb_build_object('enabled', false, 'delivery_channel', 'slack'),
    'proposal_generation', jsonb_build_object('enabled', false, 'delivery_channel', 'slack'),
    'calendar_find_times', jsonb_build_object('enabled', false, 'delivery_channel', 'slack')
  ));

  -- Upsert the config
  INSERT INTO proactive_agent_config (
    org_id,
    is_enabled,
    enabled_sequences,
    default_delivery
  ) VALUES (
    p_org_id,
    p_is_enabled,
    v_enabled_sequences,
    p_default_delivery
  )
  ON CONFLICT (org_id)
  DO UPDATE SET
    is_enabled = EXCLUDED.is_enabled,
    enabled_sequences = EXCLUDED.enabled_sequences,
    default_delivery = EXCLUDED.default_delivery,
    updated_at = now()
  RETURNING
    org_id,
    is_enabled,
    enabled_sequences,
    default_delivery,
    created_at,
    updated_at;
END;
$$;

COMMENT ON FUNCTION upsert_proactive_agent_config IS
  'Creates or updates organization-level proactive agent config. If enabled_sequences is null, uses system defaults.';

GRANT EXECUTE ON FUNCTION upsert_proactive_agent_config TO authenticated;
GRANT EXECUTE ON FUNCTION upsert_proactive_agent_config TO service_role;

-- =============================================================================
-- RPC: Get merged sequence preferences for user
-- Purpose: Return all 9 sequence types with effective settings (user override → org default → system default)
-- Returns: sequence_type, is_enabled, delivery_channel, source (user|org|default)
-- =============================================================================

CREATE OR REPLACE FUNCTION get_merged_sequence_preferences(
  p_user_id UUID,
  p_org_id TEXT
)
RETURNS TABLE (
  sequence_type TEXT,
  is_enabled BOOLEAN,
  delivery_channel TEXT,
  source TEXT
)
LANGUAGE sql
STABLE
SECURITY DEFINER
AS $$
  WITH system_defaults AS (
    SELECT
      'meeting_ended'::TEXT as sequence_type,
      true as is_enabled,
      'slack'::TEXT as delivery_channel
    UNION ALL SELECT 'pre_meeting_90min', true, 'slack'
    UNION ALL SELECT 'deal_risk_scan', true, 'slack'
    UNION ALL SELECT 'stale_deal_revival', false, 'slack'
    UNION ALL SELECT 'coaching_weekly', false, 'slack'
    UNION ALL SELECT 'campaign_daily_check', false, 'slack'
    UNION ALL SELECT 'email_received', false, 'slack'
    UNION ALL SELECT 'proposal_generation', false, 'slack'
    UNION ALL SELECT 'calendar_find_times', false, 'slack'
  ),
  org_sequences AS (
    SELECT
      sd.sequence_type,
      COALESCE(
        (pac.enabled_sequences ->> sd.sequence_type)::jsonb ->> 'enabled',
        'false'
      )::BOOLEAN as is_enabled,
      COALESCE(
        (pac.enabled_sequences ->> sd.sequence_type)::jsonb ->> 'delivery_channel',
        pac.default_delivery,
        'slack'
      ) as delivery_channel,
      'org'::TEXT as source
    FROM system_defaults sd
    LEFT JOIN proactive_agent_config pac ON pac.org_id = p_org_id
  )
  SELECT
    COALESCE(usp.sequence_type, os.sequence_type) as sequence_type,
    COALESCE(usp.is_enabled, os.is_enabled) as is_enabled,
    COALESCE(usp.delivery_channel, os.delivery_channel) as delivery_channel,
    CASE
      WHEN usp.sequence_type IS NOT NULL THEN 'user'::TEXT
      ELSE 'org'::TEXT
    END as source
  FROM org_sequences os
  LEFT JOIN user_sequence_preferences usp
    ON usp.user_id = p_user_id
    AND usp.org_id = p_org_id
    AND usp.sequence_type = os.sequence_type
  ORDER BY os.sequence_type;
$$;

COMMENT ON FUNCTION get_merged_sequence_preferences IS
  'Returns all 9 sequence types with effective settings for a user. Merges: user override (if exists) → org default (from proactive_agent_config) → system default. Also returns source field indicating where each setting came from (user, org, or default).';

GRANT EXECUTE ON FUNCTION get_merged_sequence_preferences TO authenticated;
GRANT EXECUTE ON FUNCTION get_merged_sequence_preferences TO service_role;

-- =============================================================================
-- Migration Summary
-- =============================================================================

DO $$
BEGIN
  RAISE NOTICE '';
  RAISE NOTICE '============================================================================';
  RAISE NOTICE 'Migration: 20260216000005_add_proactive_agent_rpcs.sql';
  RAISE NOTICE '============================================================================';
  RAISE NOTICE '';
  RAISE NOTICE 'Created RPCs for proactive agent settings management:';
  RAISE NOTICE '';
  RAISE NOTICE '1. get_proactive_agent_config(p_org_id TEXT)';
  RAISE NOTICE '   - Returns org config with full defaults if no row exists';
  RAISE NOTICE '   - Default: is_enabled=false, core sequences enabled, others disabled';
  RAISE NOTICE '';
  RAISE NOTICE '2. upsert_proactive_agent_config(...)';
  RAISE NOTICE '   - Creates or updates org config';
  RAISE NOTICE '   - Validates default_delivery (slack|in_app|both)';
  RAISE NOTICE '   - Uses system defaults if enabled_sequences is null';
  RAISE NOTICE '';
  RAISE NOTICE '3. get_merged_sequence_preferences(p_user_id UUID, p_org_id TEXT)';
  RAISE NOTICE '   - Returns all 9 sequence types with effective settings';
  RAISE NOTICE '   - Merges: user override → org default → system default';
  RAISE NOTICE '   - Returns: sequence_type, is_enabled, delivery_channel, source';
  RAISE NOTICE '   - Source field: user, org, or default';
  RAISE NOTICE '';
  RAISE NOTICE 'All RPCs:';
  RAISE NOTICE '  - Use SECURITY DEFINER pattern';
  RAISE NOTICE '  - Granted to authenticated and service_role';
  RAISE NOTICE '  - Stable queries (SQL-based for performance)';
  RAISE NOTICE '';
  RAISE NOTICE '9 Sequence Types (from orchestrator):';
  RAISE NOTICE '  - meeting_ended (enabled by default)';
  RAISE NOTICE '  - pre_meeting_90min (enabled by default)';
  RAISE NOTICE '  - deal_risk_scan (enabled by default)';
  RAISE NOTICE '  - stale_deal_revival (disabled by default)';
  RAISE NOTICE '  - coaching_weekly (disabled by default)';
  RAISE NOTICE '  - campaign_daily_check (disabled by default)';
  RAISE NOTICE '  - email_received (disabled by default)';
  RAISE NOTICE '  - proposal_generation (disabled by default)';
  RAISE NOTICE '  - calendar_find_times (disabled by default)';
  RAISE NOTICE '';
  RAISE NOTICE '============================================================================';
END $$;
