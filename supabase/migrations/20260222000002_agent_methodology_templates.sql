-- ============================================================================
-- Migration: Agent Methodology Templates
-- Purpose: Methodology template library + apply_methodology() function
-- Stories: CFG-007 (methodology templates table + seed data),
--          CFG-008 (apply_methodology function)
-- Date: 2026-02-22
-- ============================================================================

-- ============================================================================
-- TABLE: agent_methodology_templates (CFG-007)
-- Platform library of sales methodology templates.
-- Each template carries config_overrides that apply_methodology() writes into
-- agent_config_org_overrides for the chosen organisation.
-- ============================================================================

CREATE TABLE IF NOT EXISTS agent_methodology_templates (
  id                     UUID        NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  methodology_key        TEXT        NOT NULL UNIQUE,
  name                   TEXT        NOT NULL,
  description            TEXT,
  config_overrides       JSONB       NOT NULL DEFAULT '{}',
  qualification_criteria JSONB       NOT NULL DEFAULT '{}',
  stage_rules            JSONB       NOT NULL DEFAULT '{}',
  coaching_focus         JSONB       NOT NULL DEFAULT '{}',
  is_active              BOOLEAN     NOT NULL DEFAULT true,
  created_at             TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at             TIMESTAMPTZ NOT NULL DEFAULT now()
);

ALTER TABLE agent_methodology_templates ENABLE ROW LEVEL SECURITY;

-- Service role has full access (for seeding, admin tooling, orchestrator)
DO $$ BEGIN
  CREATE POLICY "Service role full access to agent_methodology_templates"
ON agent_methodology_templates FOR ALL
TO service_role
USING (true)
WITH CHECK (true);
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

-- Authenticated users may read templates (needed for org settings UI)
DO $$ BEGIN
  CREATE POLICY "Authenticated users can read agent_methodology_templates"
ON agent_methodology_templates FOR SELECT
TO authenticated
USING (true);
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

-- Trigger: keep updated_at current
CREATE OR REPLACE FUNCTION update_agent_methodology_templates_updated_at()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = now();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS trg_agent_methodology_templates_updated_at ON agent_methodology_templates;
CREATE TRIGGER trg_agent_methodology_templates_updated_at
  BEFORE UPDATE ON agent_methodology_templates
  FOR EACH ROW
  EXECUTE FUNCTION update_agent_methodology_templates_updated_at();

GRANT SELECT ON agent_methodology_templates TO authenticated;
GRANT ALL    ON agent_methodology_templates TO service_role;

COMMENT ON TABLE agent_methodology_templates IS 'Platform library of sales methodology templates (generic, MEDDIC, BANT, SPIN, Challenger). Each template carries config_overrides applied to an org via apply_methodology().';
COMMENT ON COLUMN agent_methodology_templates.methodology_key       IS 'Unique slug for the methodology, e.g. generic, meddic, bant, spin, challenger.';
COMMENT ON COLUMN agent_methodology_templates.config_overrides       IS 'JSONB object with "agent_type.config_key" dot-notation keys → override values written into agent_config_org_overrides when methodology is applied.';
COMMENT ON COLUMN agent_methodology_templates.qualification_criteria IS 'Structured qualification framework definition: required fields, scoring rules, framework name.';
COMMENT ON COLUMN agent_methodology_templates.stage_rules            IS 'Stage gate criteria and progression rules specific to this methodology.';
COMMENT ON COLUMN agent_methodology_templates.coaching_focus         IS 'Coaching themes and behaviours this methodology emphasises.';
COMMENT ON COLUMN agent_methodology_templates.is_active              IS 'Inactive templates are hidden from org-settings UI and cannot be applied.';

-- ============================================================================
-- SEED DATA: agent_methodology_templates (CFG-007)
-- 5 methodologies: generic, meddic, bant, spin, challenger
-- Idempotent — ON CONFLICT DO UPDATE so migration can re-run safely.
-- config_overrides keys use "agent_type.config_key" dot notation.
-- ============================================================================

INSERT INTO agent_methodology_templates
  (methodology_key, name, description, config_overrides, qualification_criteria, stage_rules, coaching_focus)
VALUES

-- --------------------------------------------------------------------------
-- 1. generic (platform default)
-- --------------------------------------------------------------------------
(
  'generic',
  'Generic Sales',
  'Balanced approach for general B2B sales',
  '{
    "deal_risk.playbook": {
      "methodology": "generic",
      "rules": [
        "Score pipeline health across engagement, momentum, and sentiment",
        "Flag deals with no activity in the last 7 days",
        "Always pair a risk flag with a concrete suggested action"
      ]
    },
    "coaching_digest.playbook": {
      "methodology": "generic",
      "rules": [
        "Review discovery quality and next-step clarity",
        "Coach on follow-up speed and pipeline coverage",
        "Celebrate wins and highlight repeatable behaviours"
      ],
      "themes": ["discovery_quality", "follow_up_speed", "pipeline_coverage", "win_rate_improvement"]
    },
    "morning_briefing.playbook": {
      "methodology": "generic",
      "rules": [
        "Open with pipeline vs target delta",
        "Balance priorities across deal stages",
        "Surface the single most time-sensitive action"
      ]
    }
  }'::jsonb,
  '{
    "framework": "custom",
    "key_signals": ["budget_mentioned", "timeline_discussed", "authority_confirmed", "need_expressed"]
  }'::jsonb,
  '{
    "default_stages": ["discovery", "qualification", "proposal", "negotiation", "closed_won", "closed_lost"]
  }'::jsonb,
  '{
    "themes": ["discovery_quality", "follow_up_speed", "pipeline_coverage", "win_rate_improvement"]
  }'::jsonb
),

-- --------------------------------------------------------------------------
-- 2. meddic
-- --------------------------------------------------------------------------
(
  'meddic',
  'MEDDIC',
  'Metrics, Economic Buyer, Decision Criteria, Decision Process, Identify Pain, Champion',
  '{
    "deal_risk.thresholds": {
      "confidence_minimum": 0.8,
      "risk_alert_level": 50,
      "engagement_decay_days": 5,
      "meddic_completeness_minimum": 4
    },
    "coaching_digest.playbook": {
      "methodology": "meddic",
      "rules": [
        "Audit MEDDIC completeness for each active deal",
        "Coach on champion identification and multi-threading",
        "Focus on quantifying metrics and securing economic buyer access",
        "Highlight deals missing decision process mapping"
      ],
      "themes": ["champion_development", "multi_threading", "metrics_quantification", "economic_buyer_access", "decision_process_mapping"]
    },
    "morning_briefing.playbook": {
      "methodology": "meddic",
      "rules": [
        "Lead with MEDDIC gap analysis for top deals",
        "Flag deals missing economic buyer or champion",
        "Prioritise meetings where MEDDIC elements can be advanced"
      ]
    }
  }'::jsonb,
  '{
    "framework": "meddic",
    "required_fields": ["metrics", "economic_buyer", "decision_criteria", "decision_process", "identify_pain", "champion"],
    "scoring": { "complete": 6, "partial": 3, "insufficient": 0 }
  }'::jsonb,
  '{
    "gate_criteria": {
      "qualification": ["identify_pain", "champion"],
      "proposal":      ["metrics", "decision_criteria"],
      "negotiation":   ["economic_buyer", "decision_process"]
    }
  }'::jsonb,
  '{
    "themes": ["champion_development", "multi_threading", "metrics_quantification", "economic_buyer_access", "decision_process_mapping"]
  }'::jsonb
),

-- --------------------------------------------------------------------------
-- 3. bant
-- --------------------------------------------------------------------------
(
  'bant',
  'BANT',
  'Budget, Authority, Need, Timeline — classic qualification framework',
  '{
    "deal_risk.thresholds": {
      "confidence_minimum": 0.6,
      "risk_alert_level": 65,
      "engagement_decay_days": 7,
      "bant_score_minimum": 4
    },
    "coaching_digest.playbook": {
      "methodology": "bant",
      "rules": [
        "Check BANT score for each deal in qualification",
        "Coach on early budget discovery conversations",
        "Focus on mapping authority and decision-maker access",
        "Identify deals with need confirmed but no timeline — push for urgency"
      ],
      "themes": ["budget_discovery", "authority_mapping", "need_articulation", "timeline_urgency"]
    }
  }'::jsonb,
  '{
    "framework": "bant",
    "required_fields": ["budget", "authority", "need", "timeline"],
    "scoring": { "all_four": 10, "three": 7, "two": 4, "one": 1 }
  }'::jsonb,
  '{
    "gate_criteria": {
      "qualification": ["need"],
      "proposal":      ["budget", "authority"],
      "negotiation":   ["timeline"]
    }
  }'::jsonb,
  '{
    "themes": ["budget_discovery", "authority_mapping", "need_articulation", "timeline_urgency"]
  }'::jsonb
),

-- --------------------------------------------------------------------------
-- 4. spin
-- --------------------------------------------------------------------------
(
  'spin',
  'SPIN Selling',
  'Situation, Problem, Implication, Need-Payoff questioning methodology',
  '{
    "coaching_digest.playbook": {
      "methodology": "spin",
      "rules": [
        "Review question quality across SPIN dimensions in meeting transcripts",
        "Coach on crafting implication questions that deepen pain awareness",
        "Identify moments where need-payoff questions were missed",
        "Reward active listening and silence after implication questions"
      ],
      "themes": ["question_quality", "implication_chains", "need_payoff_articulation", "active_listening", "research_preparation"]
    },
    "morning_briefing.playbook": {
      "methodology": "spin",
      "rules": [
        "Flag meetings today where research prep is required for SPIN questions",
        "Highlight deals where implication or need-payoff questions are overdue",
        "Surface situation data gaps that need filling before today''s calls"
      ]
    }
  }'::jsonb,
  '{
    "framework": "spin",
    "question_types": ["situation", "problem", "implication", "need_payoff"],
    "progression_score": {
      "advanced":    "implication+need_payoff",
      "developing":  "situation+problem"
    }
  }'::jsonb,
  '{
    "question_targets": {
      "discovery":     ["situation", "problem"],
      "qualification": ["implication"],
      "proposal":      ["need_payoff"]
    }
  }'::jsonb,
  '{
    "themes": ["question_quality", "implication_chains", "need_payoff_articulation", "active_listening", "research_preparation"]
  }'::jsonb
),

-- --------------------------------------------------------------------------
-- 5. challenger
-- --------------------------------------------------------------------------
(
  'challenger',
  'Challenger Sale',
  'Teach, Tailor, Take Control — challenging customer assumptions',
  '{
    "coaching_digest.playbook": {
      "methodology": "challenger",
      "rules": [
        "Review commercial teaching moments in meeting transcripts",
        "Coach on tailoring insight delivery to the buyer''s specific business context",
        "Identify moments where control was ceded unnecessarily — coach on assertive redirection",
        "Celebrate constructive tension and reframing of buyer assumptions"
      ],
      "themes": ["commercial_teaching", "tailored_messaging", "constructive_tension", "taking_control", "insight_delivery"]
    },
    "reengagement.voice": {
      "tone": "assertive",
      "formality": "balanced",
      "brevity": "concise"
    },
    "morning_briefing.playbook": {
      "methodology": "challenger",
      "rules": [
        "Lead with the commercial insight you will teach in today''s meetings",
        "Flag deals where rep has not introduced a reframe — prioritise these",
        "Surface competitor intel or market data that can fuel teaching moments today"
      ]
    }
  }'::jsonb,
  '{
    "framework": "challenger",
    "key_behaviors": ["teaching", "tailoring", "taking_control"],
    "commercial_insight_required": true
  }'::jsonb,
  '{
    "teaching_moments": {
      "discovery":     "reframe_problem",
      "qualification": "introduce_insight",
      "proposal":      "tailored_solution",
      "negotiation":   "maintain_control"
    }
  }'::jsonb,
  '{
    "themes": ["commercial_teaching", "tailored_messaging", "constructive_tension", "taking_control", "insight_delivery"]
  }'::jsonb
)

ON CONFLICT (methodology_key) DO UPDATE
  SET name                   = EXCLUDED.name,
      description            = EXCLUDED.description,
      config_overrides       = EXCLUDED.config_overrides,
      qualification_criteria = EXCLUDED.qualification_criteria,
      stage_rules            = EXCLUDED.stage_rules,
      coaching_focus         = EXCLUDED.coaching_focus,
      updated_at             = now();

-- ============================================================================
-- FUNCTION: apply_methodology (CFG-008)
-- Writes a methodology's config_overrides into agent_config_org_overrides
-- for the specified organisation. Returns the number of rows upserted.
--
-- config_overrides keys use "agent_type.config_key" dot notation.
-- Also writes the active methodology key to the global agent type.
--
-- SECURITY DEFINER: bypasses RLS so the orchestrator/edge function can
-- apply a methodology on behalf of an org admin without needing direct
-- write access to agent_config_org_overrides from the client.
-- ============================================================================

CREATE OR REPLACE FUNCTION apply_methodology(
  p_org_id          UUID,
  p_methodology_key TEXT,
  p_applied_by      UUID
)
RETURNS INTEGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = 'public'
AS $$
DECLARE
  v_template      RECORD;
  v_override_key  TEXT;
  v_override_value JSONB;
  v_agent_type    TEXT;
  v_config_key    TEXT;
  v_count         INTEGER := 0;
BEGIN
  -- Fetch the methodology template
  SELECT * INTO v_template
  FROM agent_methodology_templates
  WHERE methodology_key = p_methodology_key
    AND is_active = true;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'Methodology not found or inactive: %', p_methodology_key;
  END IF;

  -- Write active_methodology to the global agent type
  INSERT INTO agent_config_org_overrides (org_id, agent_type, config_key, config_value, updated_by)
  VALUES (p_org_id, 'global', 'active_methodology', to_jsonb(p_methodology_key), p_applied_by)
  ON CONFLICT (org_id, agent_type, config_key)
  DO UPDATE SET
    config_value = to_jsonb(p_methodology_key),
    updated_by   = p_applied_by,
    updated_at   = now();

  v_count := v_count + 1;

  -- Iterate through config_overrides JSONB object.
  -- Expected key format: "agent_type.config_key"
  FOR v_override_key, v_override_value IN
    SELECT key, value FROM jsonb_each(v_template.config_overrides)
  LOOP
    -- Parse "agent_type.config_key" — everything before the first dot is agent_type,
    -- everything after (including any further dots) is config_key.
    v_agent_type := split_part(v_override_key, '.', 1);
    v_config_key := substring(v_override_key FROM position('.' IN v_override_key) + 1);

    -- Upsert into org overrides
    INSERT INTO agent_config_org_overrides (org_id, agent_type, config_key, config_value, updated_by)
    VALUES (p_org_id, v_agent_type, v_config_key, v_override_value, p_applied_by)
    ON CONFLICT (org_id, agent_type, config_key)
    DO UPDATE SET
      config_value = v_override_value,
      updated_by   = p_applied_by,
      updated_at   = now();

    v_count := v_count + 1;
  END LOOP;

  RETURN v_count;
END;
$$;

GRANT EXECUTE ON FUNCTION apply_methodology(UUID, TEXT, UUID) TO authenticated;
GRANT EXECUTE ON FUNCTION apply_methodology(UUID, TEXT, UUID) TO service_role;

COMMENT ON FUNCTION apply_methodology IS 'Applies a sales methodology to an organisation by writing the template''s config_overrides into agent_config_org_overrides. Also records the active methodology on the global agent type. Returns the number of config rows upserted. SECURITY DEFINER — callable by authenticated users; org admin check should be enforced by the caller (edge function or RPC wrapper).';

-- ============================================================================
-- Migration Summary
-- ============================================================================

DO $$
BEGIN
  RAISE NOTICE '';
  RAISE NOTICE '============================================================================';
  RAISE NOTICE 'Migration: 20260222000002_agent_methodology_templates.sql';
  RAISE NOTICE '============================================================================';
  RAISE NOTICE '';
  RAISE NOTICE 'Stories covered: CFG-007, CFG-008';
  RAISE NOTICE '';
  RAISE NOTICE 'Tables created:';
  RAISE NOTICE '  - agent_methodology_templates (CFG-007)';
  RAISE NOTICE '    Columns: id, methodology_key (unique), name, description,';
  RAISE NOTICE '             config_overrides, qualification_criteria,';
  RAISE NOTICE '             stage_rules, coaching_focus, is_active,';
  RAISE NOTICE '             created_at, updated_at';
  RAISE NOTICE '';
  RAISE NOTICE 'Seed data (5 methodologies):';
  RAISE NOTICE '  - generic    — Balanced B2B default';
  RAISE NOTICE '  - meddic     — Metrics, Economic Buyer, Decision Criteria/Process, Pain, Champion';
  RAISE NOTICE '  - bant       — Budget, Authority, Need, Timeline';
  RAISE NOTICE '  - spin       — Situation, Problem, Implication, Need-Payoff';
  RAISE NOTICE '  - challenger — Teach, Tailor, Take Control';
  RAISE NOTICE '';
  RAISE NOTICE 'Functions created:';
  RAISE NOTICE '  - apply_methodology(org_id, methodology_key, applied_by) → INTEGER';
  RAISE NOTICE '    Writes config_overrides to agent_config_org_overrides';
  RAISE NOTICE '    Sets global.active_methodology for the org';
  RAISE NOTICE '    Returns count of rows upserted';
  RAISE NOTICE '    SECURITY DEFINER — bypasses RLS for orchestrator access';
  RAISE NOTICE '';
  RAISE NOTICE 'RLS summary:';
  RAISE NOTICE '  - agent_methodology_templates: service_role full | authenticated read';
  RAISE NOTICE '';
  RAISE NOTICE '============================================================================';
END $$;
