-- ============================================================================
-- V2 Architecture Foundations
-- MODEL-001: Model Configuration & Health Tables
--
-- Creates model_config (provider/model routing matrix) and model_health
-- (circuit-breaker state) tables for the AI model selection layer.
--
-- Story: MODEL-001
-- Date: 2026-02-22
-- ============================================================================

-- ---------------------------------------------------------------------------
-- 1. Tables
-- ---------------------------------------------------------------------------

CREATE TABLE IF NOT EXISTS public.model_config (
  id               UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
  provider         TEXT        NOT NULL,
  model_id         TEXT        NOT NULL,
  intelligence_tier TEXT       NOT NULL CHECK (intelligence_tier IN ('low', 'medium', 'high')),
  feature          TEXT        NOT NULL CHECK (feature IN ('copilot', 'fleet_agent', 'recording', 'embedding', 'enrichment')),
  is_primary       BOOLEAN     NOT NULL DEFAULT false,
  is_fallback      BOOLEAN     NOT NULL DEFAULT false,
  fallback_order   INTEGER     NOT NULL DEFAULT 0,
  credit_cost      DECIMAL(8,4) NOT NULL DEFAULT 0,
  max_tokens       INTEGER     NOT NULL DEFAULT 4096,
  is_active        BOOLEAN     NOT NULL DEFAULT true,
  updated_at       TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

COMMENT ON TABLE public.model_config IS
  'AI model routing matrix. Defines which model/provider handles each feature at each intelligence tier, '
  'including primary selections and ordered fallbacks for circuit-breaker failover (MODEL-001).';

COMMENT ON COLUMN public.model_config.provider         IS 'AI provider identifier, e.g. ''anthropic'', ''google'', ''openai'', ''openrouter''.';
COMMENT ON COLUMN public.model_config.model_id         IS 'Provider-specific model identifier, e.g. ''claude-haiku-4-5-20251001''.';
COMMENT ON COLUMN public.model_config.intelligence_tier IS 'Tier of intelligence: low (fast/cheap), medium (balanced), high (best quality).';
COMMENT ON COLUMN public.model_config.feature          IS 'Platform feature this model serves: copilot, fleet_agent, recording, embedding, enrichment.';
COMMENT ON COLUMN public.model_config.is_primary        IS 'True for the preferred model at this (tier, feature) combination.';
COMMENT ON COLUMN public.model_config.is_fallback       IS 'True for models used when the primary is circuit-broken.';
COMMENT ON COLUMN public.model_config.fallback_order    IS 'Ascending order in which fallbacks are attempted (1 first, 2 second, …).';
COMMENT ON COLUMN public.model_config.credit_cost       IS 'Internal credit cost per request, used for billing estimates.';
COMMENT ON COLUMN public.model_config.max_tokens        IS 'Maximum output token budget for requests using this model.';
COMMENT ON COLUMN public.model_config.is_active         IS 'Soft-disable a model without removing its config row.';
COMMENT ON COLUMN public.model_config.updated_at        IS 'Last time this row was modified (auto-maintained by trigger).';

-- ---------------------------------------------------------------------------

CREATE TABLE IF NOT EXISTS public.model_health (
  model_id          TEXT        PRIMARY KEY,
  failure_count     INTEGER     NOT NULL DEFAULT 0,
  last_failure_at   TIMESTAMPTZ,
  window_start      TIMESTAMPTZ,
  is_circuit_open   BOOLEAN     NOT NULL DEFAULT false
);

COMMENT ON TABLE public.model_health IS
  'Circuit-breaker state per model. Tracked by the model selection layer; '
  'when is_circuit_open = true the router skips this model and tries the next fallback (MODEL-001).';

COMMENT ON COLUMN public.model_health.model_id         IS 'Provider model identifier — matches model_config.model_id.';
COMMENT ON COLUMN public.model_health.failure_count    IS 'Number of consecutive failures within the current window.';
COMMENT ON COLUMN public.model_health.last_failure_at  IS 'Timestamp of the most recent failure.';
COMMENT ON COLUMN public.model_health.window_start     IS 'Start of the current failure-counting window.';
COMMENT ON COLUMN public.model_health.is_circuit_open  IS 'True when the model is tripped and should not receive new requests.';

-- ---------------------------------------------------------------------------
-- 2. Indexes
-- ---------------------------------------------------------------------------

-- Fast lookup of the primary model for a given (tier, feature) pair
CREATE INDEX IF NOT EXISTS idx_model_config_tier_feature
  ON public.model_config (intelligence_tier, feature);

-- Fast listing of all active fallbacks for a feature, in order
CREATE INDEX IF NOT EXISTS idx_model_config_fallback_lookup
  ON public.model_config (feature, fallback_order)
  WHERE is_fallback = true AND is_active = true;

-- Enforce at most one primary per (intelligence_tier, feature)
CREATE UNIQUE INDEX IF NOT EXISTS uidx_model_config_primary_per_tier_feature
  ON public.model_config (intelligence_tier, feature)
  WHERE is_primary = true;

-- ---------------------------------------------------------------------------
-- 3. updated_at trigger
-- ---------------------------------------------------------------------------

CREATE OR REPLACE FUNCTION public.set_model_config_updated_at()
RETURNS TRIGGER
LANGUAGE plpgsql
AS $$
BEGIN
  NEW.updated_at := NOW();
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_model_config_updated_at ON public.model_config;
CREATE TRIGGER trg_model_config_updated_at
  BEFORE UPDATE ON public.model_config
  FOR EACH ROW
  EXECUTE FUNCTION public.set_model_config_updated_at();

-- ---------------------------------------------------------------------------
-- 4. Seed Data — Default Model Matrix
-- ---------------------------------------------------------------------------

-- Low tier primaries
INSERT INTO public.model_config (provider, model_id, intelligence_tier, feature, is_primary, is_fallback, fallback_order, credit_cost, max_tokens)
VALUES
  ('anthropic', 'claude-haiku-4-5-20251001',  'low', 'copilot',     true, false, 0, 0.25, 4096),
  ('anthropic', 'claude-haiku-4-5-20251001',  'low', 'fleet_agent', true, false, 0, 0.25, 4096),
  ('google',    'gemini-2.0-flash',            'low', 'recording',   true, false, 0, 0.10, 8192),
  ('openai',    'text-embedding-3-small',      'low', 'embedding',   true, false, 0, 0.02, 8191),
  ('anthropic', 'claude-haiku-4-5-20251001',  'low', 'enrichment',  true, false, 0, 0.25, 4096)
ON CONFLICT DO NOTHING;

-- Medium tier primaries
INSERT INTO public.model_config (provider, model_id, intelligence_tier, feature, is_primary, is_fallback, fallback_order, credit_cost, max_tokens)
VALUES
  ('anthropic', 'claude-sonnet-4-6-20250929', 'medium', 'copilot',     true, false, 0, 1.50, 4096),
  ('anthropic', 'claude-sonnet-4-6-20250929', 'medium', 'fleet_agent', true, false, 0, 1.50, 4096),
  ('google',    'gemini-2.5-flash',            'medium', 'recording',   true, false, 0, 0.50, 8192),
  ('openai',    'text-embedding-3-large',      'medium', 'embedding',   true, false, 0, 0.13, 8191),
  ('anthropic', 'claude-sonnet-4-6-20250929', 'medium', 'enrichment',  true, false, 0, 1.50, 4096)
ON CONFLICT DO NOTHING;

-- High tier primaries
INSERT INTO public.model_config (provider, model_id, intelligence_tier, feature, is_primary, is_fallback, fallback_order, credit_cost, max_tokens)
VALUES
  ('anthropic', 'claude-opus-4-6',             'high', 'copilot',     true, false, 0, 5.00, 4096),
  ('anthropic', 'claude-opus-4-6',             'high', 'fleet_agent', true, false, 0, 5.00, 4096),
  ('anthropic', 'claude-sonnet-4-6-20250929',  'high', 'recording',   true, false, 0, 1.50, 8192),
  ('openai',    'text-embedding-3-large',       'high', 'embedding',   true, false, 0, 0.13, 8191),
  ('anthropic', 'claude-opus-4-6',             'high', 'enrichment',  true, false, 0, 5.00, 4096)
ON CONFLICT DO NOTHING;

-- Cross-tier fallbacks: copilot and fleet_agent fall back to gemini-2.5-flash
-- These rows are NOT tied to a specific tier (is_primary = false, is_fallback = true).
-- The router queries by feature + is_fallback = true, ordered by fallback_order.
INSERT INTO public.model_config (provider, model_id, intelligence_tier, feature, is_primary, is_fallback, fallback_order, credit_cost, max_tokens)
VALUES
  ('google', 'gemini-2.5-flash', 'low',    'copilot',     false, true, 1, 0.50, 4096),
  ('google', 'gemini-2.5-flash', 'low',    'fleet_agent', false, true, 1, 0.50, 4096),
  ('google', 'gemini-2.5-flash', 'medium', 'copilot',     false, true, 1, 0.50, 4096),
  ('google', 'gemini-2.5-flash', 'medium', 'fleet_agent', false, true, 1, 0.50, 4096),
  ('google', 'gemini-2.5-flash', 'high',   'copilot',     false, true, 1, 0.50, 4096),
  ('google', 'gemini-2.5-flash', 'high',   'fleet_agent', false, true, 1, 0.50, 4096)
ON CONFLICT DO NOTHING;

-- ---------------------------------------------------------------------------
-- 5. RLS
-- ---------------------------------------------------------------------------

ALTER TABLE public.model_config  ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.model_health  ENABLE ROW LEVEL SECURITY;

-- model_config policies
DROP POLICY IF EXISTS "model_config_authenticated_read" ON public.model_config;
CREATE POLICY "model_config_authenticated_read"
  ON public.model_config FOR SELECT
  TO authenticated
  USING (true);

DROP POLICY IF EXISTS "model_config_service_all" ON public.model_config;
CREATE POLICY "model_config_service_all"
  ON public.model_config FOR ALL
  TO service_role
  USING (true)
  WITH CHECK (true);

DROP POLICY IF EXISTS "model_config_admin_update" ON public.model_config;
CREATE POLICY "model_config_admin_update"
  ON public.model_config FOR UPDATE
  TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM public.organization_memberships om
      WHERE om.user_id = auth.uid()
        AND om.role IN ('admin', 'owner')
    )
  )
  WITH CHECK (
    EXISTS (
      SELECT 1 FROM public.organization_memberships om
      WHERE om.user_id = auth.uid()
        AND om.role IN ('admin', 'owner')
    )
  );

-- model_health policies
DROP POLICY IF EXISTS "model_health_authenticated_read" ON public.model_health;
CREATE POLICY "model_health_authenticated_read"
  ON public.model_health FOR SELECT
  TO authenticated
  USING (true);

DROP POLICY IF EXISTS "model_health_service_all" ON public.model_health;
CREATE POLICY "model_health_service_all"
  ON public.model_health FOR ALL
  TO service_role
  USING (true)
  WITH CHECK (true);

-- ---------------------------------------------------------------------------
-- 6. Grants
-- ---------------------------------------------------------------------------

GRANT SELECT ON public.model_config TO authenticated;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.model_config TO service_role;

GRANT SELECT ON public.model_health TO authenticated;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.model_health TO service_role;
