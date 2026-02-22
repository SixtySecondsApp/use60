-- ============================================================================
-- Migration: Enable Proactive Agents by Default
-- Purpose: Flip is_enabled default from false to true for new orgs
-- Story: ASSERT-000 — Enable proactive agents by default
-- Date: 2026-02-22
-- ============================================================================

-- 1. Flip the column default so new rows get is_enabled = true
ALTER TABLE proactive_agent_config ALTER COLUMN is_enabled SET DEFAULT true;

-- 2. Recreate get_proactive_agent_config with is_enabled defaulting to true
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
    COALESCE(pac.is_enabled, true) as is_enabled,
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
    true as is_enabled,
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
  'Returns organization-level proactive agent config. If no row exists, returns defaults (is_enabled=true — assertive autonomy, core sequences enabled, all other sequences disabled). Existing orgs with explicit is_enabled=false keep their setting.';

GRANT EXECUTE ON FUNCTION get_proactive_agent_config TO authenticated;
GRANT EXECUTE ON FUNCTION get_proactive_agent_config TO service_role;
