-- ============================================================================
-- Migration: model_preferences + feature_model_map
-- Purpose: Per-org quality tier preferences and static feature→tier→model map
-- Feature: PRD-112 AI Model Routing End-to-End (ROUTE-001, ROUTE-003)
-- Date: 2026-03-04
-- ============================================================================

-- =============================================================================
-- Enum: quality_tier
-- Economy (fastest/cheapest), Standard (balanced), Premium (best quality)
-- Maps to existing IntelligenceTier (low, medium, high)
-- =============================================================================

DO $$ BEGIN
  CREATE TYPE quality_tier AS ENUM ('economy', 'standard', 'premium');
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

-- =============================================================================
-- Enum: feature_category
-- The 6 routable feature areas
-- =============================================================================

DO $$ BEGIN
  CREATE TYPE feature_category AS ENUM (
    'copilot_chat',
    'meeting_summary',
    'research_enrichment',
    'content_generation',
    'crm_update',
    'task_execution'
  );
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

-- =============================================================================
-- Table: model_preferences
-- Per-org quality tier selection per feature category.
-- One row per (org_id, feature_category).
-- =============================================================================

CREATE TABLE IF NOT EXISTS model_preferences (
  id                UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  org_id            TEXT NOT NULL,
  feature           feature_category NOT NULL,
  tier              quality_tier NOT NULL DEFAULT 'standard',
  created_at        TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at        TIMESTAMPTZ NOT NULL DEFAULT NOW(),

  CONSTRAINT model_preferences_unique_org_feature UNIQUE (org_id, feature)
);

CREATE INDEX IF NOT EXISTS idx_model_preferences_org_id
  ON model_preferences(org_id);

-- Auto-update updated_at
CREATE OR REPLACE FUNCTION update_model_preferences_updated_at()
RETURNS TRIGGER LANGUAGE plpgsql AS $$
BEGIN NEW.updated_at = NOW(); RETURN NEW; END; $$;

DROP TRIGGER IF EXISTS trg_model_preferences_updated_at ON model_preferences;
DROP TRIGGER IF EXISTS trg_model_preferences_updated_at ON model_preferences;
CREATE TRIGGER trg_model_preferences_updated_at
  BEFORE UPDATE ON model_preferences
  FOR EACH ROW EXECUTE FUNCTION update_model_preferences_updated_at();

-- RLS
ALTER TABLE model_preferences ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Org members can read model_preferences" ON model_preferences;
DO $$ BEGIN
  DROP POLICY IF EXISTS "Org members can read model_preferences" ON model_preferences;
CREATE POLICY "Org members can read model_preferences"
    ON model_preferences FOR SELECT TO authenticated
    USING (org_id IN (
      SELECT org_id::text FROM organization_memberships WHERE user_id = auth.uid()
    ));
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

DROP POLICY IF EXISTS "Org admins can upsert model_preferences" ON model_preferences;
DO $$ BEGIN
  DROP POLICY IF EXISTS "Org admins can upsert model_preferences" ON model_preferences;
CREATE POLICY "Org admins can upsert model_preferences"
    ON model_preferences FOR ALL TO authenticated
    USING (org_id IN (
      SELECT org_id::text FROM organization_memberships
      WHERE user_id = auth.uid() AND role IN ('admin', 'owner')
    ))
    WITH CHECK (org_id IN (
      SELECT org_id::text FROM organization_memberships
      WHERE user_id = auth.uid() AND role IN ('admin', 'owner')
    ));
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

DROP POLICY IF EXISTS "Service role full access to model_preferences" ON model_preferences;
DO $$ BEGIN
  DROP POLICY IF EXISTS "Service role full access to model_preferences" ON model_preferences;
CREATE POLICY "Service role full access to model_preferences"
    ON model_preferences FOR ALL TO service_role
    USING (true) WITH CHECK (true);
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

-- =============================================================================
-- Table: feature_model_map
-- Static config: feature × tier → provider + model.
-- Seeded with current hardcoded values.
-- =============================================================================

CREATE TABLE IF NOT EXISTS feature_model_map (
  id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  feature         feature_category NOT NULL,
  tier            quality_tier NOT NULL,
  provider        TEXT NOT NULL,          -- e.g. 'anthropic', 'google', 'openai'
  model_id        TEXT NOT NULL,          -- provider-specific model identifier
  display_name    TEXT NOT NULL,          -- human-readable label
  notes           TEXT,

  CONSTRAINT feature_model_map_unique_feature_tier UNIQUE (feature, tier)
);

-- No RLS needed — read-only platform config, accessible to all authenticated users
ALTER TABLE feature_model_map ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "All authenticated users can read feature_model_map" ON feature_model_map;
DO $$ BEGIN
  DROP POLICY IF EXISTS "All authenticated users can read feature_model_map" ON feature_model_map;
CREATE POLICY "All authenticated users can read feature_model_map"
    ON feature_model_map FOR SELECT TO authenticated USING (true);
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

DROP POLICY IF EXISTS "Service role full access to feature_model_map" ON feature_model_map;
DO $$ BEGIN
  DROP POLICY IF EXISTS "Service role full access to feature_model_map" ON feature_model_map;
CREATE POLICY "Service role full access to feature_model_map"
    ON feature_model_map FOR ALL TO service_role USING (true) WITH CHECK (true);
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

-- =============================================================================
-- Seed: feature_model_map
-- Economy = fastest/cheapest, Standard = current default, Premium = best quality
-- =============================================================================

INSERT INTO feature_model_map (feature, tier, provider, model_id, display_name, notes) VALUES
  -- copilot_chat
  ('copilot_chat', 'economy',  'anthropic', 'claude-haiku-4-5-20251001',  'Claude Haiku 4.5',     'Fast, low-cost chat'),
  ('copilot_chat', 'standard', 'anthropic', 'claude-sonnet-4-6',          'Claude Sonnet 4.6',    'Balanced quality'),
  ('copilot_chat', 'premium',  'anthropic', 'claude-opus-4-6',            'Claude Opus 4.6',      'Highest quality'),

  -- meeting_summary
  ('meeting_summary', 'economy',  'google',    'gemini-2.0-flash',         'Gemini 2.0 Flash',     'Fast transcript analysis'),
  ('meeting_summary', 'standard', 'anthropic', 'claude-haiku-4-5-20251001','Claude Haiku 4.5',     'Reliable summaries'),
  ('meeting_summary', 'premium',  'anthropic', 'claude-sonnet-4-6',        'Claude Sonnet 4.6',    'Rich structured output'),

  -- research_enrichment
  ('research_enrichment', 'economy',  'google',    'gemini-2.0-flash',        'Gemini 2.0 Flash',     'Fast enrichment'),
  ('research_enrichment', 'standard', 'google',    'gemini-2.5-flash',        'Gemini 2.5 Flash',     'Better reasoning'),
  ('research_enrichment', 'premium',  'anthropic', 'claude-sonnet-4-6',       'Claude Sonnet 4.6',    'Deep research quality'),

  -- content_generation
  ('content_generation', 'economy',  'anthropic', 'claude-haiku-4-5-20251001','Claude Haiku 4.5',    'Fast drafts'),
  ('content_generation', 'standard', 'anthropic', 'claude-sonnet-4-6',        'Claude Sonnet 4.6',   'Quality content'),
  ('content_generation', 'premium',  'anthropic', 'claude-opus-4-6',          'Claude Opus 4.6',     'Best writing quality'),

  -- crm_update
  ('crm_update', 'economy',  'anthropic', 'claude-haiku-4-5-20251001', 'Claude Haiku 4.5',     'Fast field extraction'),
  ('crm_update', 'standard', 'anthropic', 'claude-haiku-4-5-20251001', 'Claude Haiku 4.5',     'Standard extraction'),
  ('crm_update', 'premium',  'anthropic', 'claude-sonnet-4-6',         'Claude Sonnet 4.6',    'Accurate field mapping'),

  -- task_execution
  ('task_execution', 'economy',  'anthropic', 'claude-haiku-4-5-20251001', 'Claude Haiku 4.5',  'Fast task planning'),
  ('task_execution', 'standard', 'anthropic', 'claude-sonnet-4-6',         'Claude Sonnet 4.6', 'Reliable task execution'),
  ('task_execution', 'premium',  'anthropic', 'claude-opus-4-6',           'Claude Opus 4.6',   'Complex task reasoning')

ON CONFLICT (feature, tier) DO NOTHING;

-- =============================================================================
-- Table: org_model_restrictions
-- Admin-level org-wide provider/model restrictions (ROUTE-008)
-- =============================================================================

CREATE TABLE IF NOT EXISTS org_model_restrictions (
  id                UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  org_id            TEXT NOT NULL UNIQUE,
  allowed_providers TEXT[] NOT NULL DEFAULT '{}',     -- empty = all allowed
  blocked_model_ids TEXT[] NOT NULL DEFAULT '{}',     -- specific model_ids blocked
  max_tier          quality_tier,                     -- null = no cap
  created_at        TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at        TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_org_model_restrictions_org_id
  ON org_model_restrictions(org_id);

CREATE OR REPLACE FUNCTION update_org_model_restrictions_updated_at()
RETURNS TRIGGER LANGUAGE plpgsql AS $$
BEGIN NEW.updated_at = NOW(); RETURN NEW; END; $$;

DROP TRIGGER IF EXISTS trg_org_model_restrictions_updated_at ON org_model_restrictions;
DROP TRIGGER IF EXISTS trg_org_model_restrictions_updated_at ON org_model_restrictions;
CREATE TRIGGER trg_org_model_restrictions_updated_at
  BEFORE UPDATE ON org_model_restrictions
  FOR EACH ROW EXECUTE FUNCTION update_org_model_restrictions_updated_at();

ALTER TABLE org_model_restrictions ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Org admins can manage restrictions" ON org_model_restrictions;
DO $$ BEGIN
  DROP POLICY IF EXISTS "Org admins can manage restrictions" ON org_model_restrictions;
CREATE POLICY "Org admins can manage restrictions"
    ON org_model_restrictions FOR ALL TO authenticated
    USING (org_id IN (
      SELECT org_id::text FROM organization_memberships
      WHERE user_id = auth.uid() AND role IN ('admin', 'owner')
    ))
    WITH CHECK (org_id IN (
      SELECT org_id::text FROM organization_memberships
      WHERE user_id = auth.uid() AND role IN ('admin', 'owner')
    ));
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

DROP POLICY IF EXISTS "Org members can read restrictions" ON org_model_restrictions;
DO $$ BEGIN
  DROP POLICY IF EXISTS "Org members can read restrictions" ON org_model_restrictions;
CREATE POLICY "Org members can read restrictions"
    ON org_model_restrictions FOR SELECT TO authenticated
    USING (org_id IN (
      SELECT org_id::text FROM organization_memberships WHERE user_id = auth.uid()
    ));
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

DROP POLICY IF EXISTS "Service role full access to org_model_restrictions" ON org_model_restrictions;
DO $$ BEGIN
  DROP POLICY IF EXISTS "Service role full access to org_model_restrictions" ON org_model_restrictions;
CREATE POLICY "Service role full access to org_model_restrictions"
    ON org_model_restrictions FOR ALL TO service_role USING (true) WITH CHECK (true);
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

COMMENT ON TABLE model_preferences IS 'Per-org quality tier selection per AI feature category. Drives modelResolver in edge functions.';
COMMENT ON TABLE feature_model_map IS 'Static mapping: feature × quality_tier → provider + model_id. Seeded with platform defaults.';
COMMENT ON TABLE org_model_restrictions IS 'Org-level admin restrictions on which AI providers/models are allowed.';
