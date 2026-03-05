-- ============================================================================
-- Migration: Role-Based Autonomy Preset Definitions
-- AE2-010: Add role-based preset seeds and get_autonomy_presets() RPC
-- Date: 2026-03-03
-- ============================================================================
-- Adds four role presets alongside the existing style presets
-- (conservative / balanced / autonomous). Role presets use the key pattern
-- autonomy.presets.role.<role_name> to distinguish them from style presets.
--
-- Roles seeded:
--   sdr       — Sales Development Rep, aggressive automation
--   ae        — Account Executive, balanced
--   vp_sales  — VP Sales, oversight / approval-heavy
--   cs        — Customer Success, high automation for renewals
--
-- RPC: get_autonomy_presets(p_preset_type TEXT)
--   'style'  → conservative, balanced, autonomous
--   'role'   → sdr, ae, vp_sales, cs
--   NULL     → all presets
-- ============================================================================

-- ============================================================================
-- SEED: Role preset — SDR (Sales Development Rep)
-- Aggressive automation: heavy outreach cadence, low-risk actions auto-run
-- ============================================================================
INSERT INTO agent_config_defaults (agent_type, config_key, config_value, description)
VALUES (
  'global',
  'autonomy.presets.role.sdr',
  '{
    "label": "SDR",
    "full_label": "Sales Development Rep",
    "preset_type": "role",
    "description": "Aggressive automation tuned for high-volume outbound. Low-risk prospecting actions run automatically; outbound emails and CRM writes require approval.",
    "policies": {
      "create_task":        "auto",
      "enrich_contact":     "auto",
      "send_slack":         "auto",
      "send_email":         "approve",
      "crm_field_update":   "approve",
      "crm_contact_create": "approve",
      "crm_stage_change":   "suggest",
      "draft_proposal":     "suggest"
    }
  }',
  'Role preset — SDR: aggressive automation for high-volume outbound reps'
)
ON CONFLICT (agent_type, config_key) DO UPDATE
  SET config_value = EXCLUDED.config_value,
      description  = EXCLUDED.description,
      updated_at   = now();

-- ============================================================================
-- SEED: Role preset — AE (Account Executive)
-- Balanced: mirrors the style-based "balanced" preset but role-contextualised
-- ============================================================================
INSERT INTO agent_config_defaults (agent_type, config_key, config_value, description)
VALUES (
  'global',
  'autonomy.presets.role.ae',
  '{
    "label": "AE",
    "full_label": "Account Executive",
    "preset_type": "role",
    "description": "Balanced automation for deal-focused reps. Admin and enrichment tasks run automatically; emails, field updates, and stage changes require approval. Proposals are suggested only.",
    "policies": {
      "create_task":        "auto",
      "enrich_contact":     "auto",
      "send_slack":         "auto",
      "send_email":         "approve",
      "crm_field_update":   "approve",
      "crm_stage_change":   "approve",
      "draft_proposal":     "suggest",
      "crm_contact_create": "suggest"
    }
  }',
  'Role preset — AE: balanced automation for deal-focused account executives'
)
ON CONFLICT (agent_type, config_key) DO UPDATE
  SET config_value = EXCLUDED.config_value,
      description  = EXCLUDED.description,
      updated_at   = now();

-- ============================================================================
-- SEED: Role preset — VP Sales
-- Oversight mode: minimal automation, everything significant needs approval
-- ============================================================================
INSERT INTO agent_config_defaults (agent_type, config_key, config_value, description)
VALUES (
  'global',
  'autonomy.presets.role.vp_sales',
  '{
    "label": "VP Sales",
    "full_label": "VP of Sales",
    "preset_type": "role",
    "description": "Oversight mode for sales leaders. Only low-risk Slack notifications run automatically. All other actions require explicit approval or are surfaced as suggestions.",
    "policies": {
      "send_slack":         "auto",
      "create_task":        "approve",
      "enrich_contact":     "approve",
      "send_email":         "suggest",
      "crm_field_update":   "suggest",
      "crm_stage_change":   "suggest",
      "crm_contact_create": "suggest",
      "draft_proposal":     "suggest"
    }
  }',
  'Role preset — VP Sales: oversight mode, maximum human approval gates'
)
ON CONFLICT (agent_type, config_key) DO UPDATE
  SET config_value = EXCLUDED.config_value,
      description  = EXCLUDED.description,
      updated_at   = now();

-- ============================================================================
-- SEED: Role preset — CS (Customer Success)
-- High automation for renewals: CRM field updates and enrichment auto-run
-- ============================================================================
INSERT INTO agent_config_defaults (agent_type, config_key, config_value, description)
VALUES (
  'global',
  'autonomy.presets.role.cs',
  '{
    "label": "CS",
    "full_label": "Customer Success",
    "preset_type": "role",
    "description": "High automation for renewal and expansion workflows. Routine admin and enrichment run automatically. Outbound email and proposal drafts require approval; stage changes and new contact creation are suggested only.",
    "policies": {
      "create_task":        "auto",
      "enrich_contact":     "auto",
      "send_slack":         "auto",
      "crm_field_update":   "auto",
      "send_email":         "approve",
      "draft_proposal":     "approve",
      "crm_stage_change":   "suggest",
      "crm_contact_create": "suggest"
    }
  }',
  'Role preset — CS: high automation for customer success and renewal workflows'
)
ON CONFLICT (agent_type, config_key) DO UPDATE
  SET config_value = EXCLUDED.config_value,
      description  = EXCLUDED.description,
      updated_at   = now();

-- ============================================================================
-- RPC: get_autonomy_presets
-- Returns preset rows filtered by type:
--   'style' → autonomy.presets.conservative / balanced / autonomous
--   'role'  → autonomy.presets.role.*
--   NULL    → all of the above
-- ============================================================================
CREATE OR REPLACE FUNCTION public.get_autonomy_presets(
  p_preset_type TEXT DEFAULT NULL
)
RETURNS TABLE (
  config_key   TEXT,
  preset_type  TEXT,
  label        TEXT,
  full_label   TEXT,
  description  TEXT,
  policies     JSONB
)
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT
    d.config_key,
    -- Derive preset_type from key structure:
    --   'autonomy.presets.role.*' → 'role'
    --   'autonomy.presets.*'      → 'style'
    CASE
      WHEN d.config_key LIKE 'autonomy.presets.role.%' THEN 'role'
      ELSE 'style'
    END AS preset_type,
    (d.config_value->>'label')       AS label,
    (d.config_value->>'full_label')  AS full_label,
    (d.config_value->>'description') AS description,
    (d.config_value->'policies')     AS policies
  FROM agent_config_defaults d
  WHERE
    d.agent_type = 'global'
    AND d.config_key ~ '^autonomy\.presets\.(conservative|balanced|autonomous|role\..+)$'
    AND (
      p_preset_type IS NULL
      OR (
        p_preset_type = 'style'
        AND d.config_key ~ '^autonomy\.presets\.(conservative|balanced|autonomous)$'
      )
      OR (
        p_preset_type = 'role'
        AND d.config_key LIKE 'autonomy.presets.role.%'
      )
    )
  ORDER BY
    -- Style presets first (conservative → balanced → autonomous), then role presets alpha
    CASE
      WHEN d.config_key = 'autonomy.presets.conservative' THEN 1
      WHEN d.config_key = 'autonomy.presets.balanced'     THEN 2
      WHEN d.config_key = 'autonomy.presets.autonomous'   THEN 3
      ELSE 4
    END,
    d.config_key;
$$;

COMMENT ON FUNCTION public.get_autonomy_presets(TEXT) IS
  'AE2-010: Returns autonomy preset definitions filtered by type. '
  'p_preset_type = ''style'' returns conservative/balanced/autonomous; '
  '''role'' returns sdr/ae/vp_sales/cs; NULL returns all presets. '
  'Preset type is derived from the config_key structure.';

GRANT EXECUTE ON FUNCTION public.get_autonomy_presets(TEXT) TO authenticated;
GRANT EXECUTE ON FUNCTION public.get_autonomy_presets(TEXT) TO service_role;

-- ============================================================================
-- Migration Summary
-- ============================================================================
DO $$
BEGIN
  RAISE NOTICE '';
  RAISE NOTICE '============================================================================';
  RAISE NOTICE 'Migration: 20260303200003_role_based_presets.sql';
  RAISE NOTICE '============================================================================';
  RAISE NOTICE '';
  RAISE NOTICE 'Ticket: AE2-010';
  RAISE NOTICE '';
  RAISE NOTICE 'Seed data added to agent_config_defaults (agent_type = global):';
  RAISE NOTICE '  Key pattern: autonomy.presets.role.<name>';
  RAISE NOTICE '';
  RAISE NOTICE '  autonomy.presets.role.sdr      — aggressive automation (outbound-heavy)';
  RAISE NOTICE '    auto:    create_task, enrich_contact, send_slack';
  RAISE NOTICE '    approve: send_email, crm_field_update, crm_contact_create';
  RAISE NOTICE '    suggest: crm_stage_change, draft_proposal';
  RAISE NOTICE '';
  RAISE NOTICE '  autonomy.presets.role.ae       — balanced (deal-focused)';
  RAISE NOTICE '    auto:    create_task, enrich_contact, send_slack';
  RAISE NOTICE '    approve: send_email, crm_field_update, crm_stage_change';
  RAISE NOTICE '    suggest: draft_proposal, crm_contact_create';
  RAISE NOTICE '';
  RAISE NOTICE '  autonomy.presets.role.vp_sales — oversight mode';
  RAISE NOTICE '    auto:    send_slack';
  RAISE NOTICE '    approve: create_task, enrich_contact';
  RAISE NOTICE '    suggest: send_email, crm_field_update, crm_stage_change,';
  RAISE NOTICE '             crm_contact_create, draft_proposal';
  RAISE NOTICE '';
  RAISE NOTICE '  autonomy.presets.role.cs       — high automation (renewals)';
  RAISE NOTICE '    auto:    create_task, enrich_contact, send_slack, crm_field_update';
  RAISE NOTICE '    approve: send_email, draft_proposal';
  RAISE NOTICE '    suggest: crm_stage_change, crm_contact_create';
  RAISE NOTICE '';
  RAISE NOTICE 'RPC created:';
  RAISE NOTICE '  get_autonomy_presets(p_preset_type TEXT)';
  RAISE NOTICE '    p_preset_type = ''style'' → conservative, balanced, autonomous';
  RAISE NOTICE '    p_preset_type = ''role''  → sdr, ae, vp_sales, cs';
  RAISE NOTICE '    p_preset_type IS NULL    → all presets';
  RAISE NOTICE '    Returns: config_key, preset_type, label, full_label, description, policies';
  RAISE NOTICE '';
  RAISE NOTICE 'Convention:';
  RAISE NOTICE '  Style presets: autonomy.presets.<name>';
  RAISE NOTICE '  Role presets:  autonomy.presets.role.<name>';
  RAISE NOTICE '  Preset type derived at query time from config_key structure.';
  RAISE NOTICE '  No schema change required — existing style presets are unmodified.';
  RAISE NOTICE '';
  RAISE NOTICE 'Idempotent: ON CONFLICT (agent_type, config_key) DO UPDATE';
  RAISE NOTICE '';
  RAISE NOTICE '============================================================================';
END $$;
