-- ============================================================================
-- AI Models Table - Synced from Provider APIs
-- ============================================================================
-- Stores available AI models from all providers (Anthropic, Google, OpenRouter, Kimi)
-- Synced via cron job or manual trigger

-- Create provider enum type
DO $$ BEGIN
  CREATE TYPE ai_provider AS ENUM ('anthropic', 'google', 'openrouter', 'kimi');
EXCEPTION
  WHEN duplicate_object THEN NULL;
END $$;

-- ============================================================================
-- AI Models Table
-- ============================================================================

CREATE TABLE IF NOT EXISTS ai_models (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),

  -- Provider and model identification
  provider ai_provider NOT NULL,
  model_id TEXT NOT NULL,  -- Provider's model identifier (e.g., 'claude-3-5-sonnet-20241022')
  display_name TEXT NOT NULL,  -- Human-readable name (e.g., 'Claude 3.5 Sonnet')

  -- Pricing (per million tokens, in USD for consistency)
  input_cost_per_million DECIMAL(10, 6) NOT NULL DEFAULT 0,
  output_cost_per_million DECIMAL(10, 6) NOT NULL DEFAULT 0,

  -- Model capabilities
  context_window INTEGER,  -- Max context size in tokens
  max_output_tokens INTEGER,  -- Max output tokens
  supports_vision BOOLEAN DEFAULT false,
  supports_function_calling BOOLEAN DEFAULT true,
  supports_streaming BOOLEAN DEFAULT true,

  -- Availability
  is_available BOOLEAN DEFAULT true,
  is_deprecated BOOLEAN DEFAULT false,

  -- Metadata from provider
  provider_metadata JSONB DEFAULT '{}',

  -- Sync tracking
  last_synced_at TIMESTAMPTZ DEFAULT NOW(),
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW(),

  -- Unique constraint on provider + model_id
  UNIQUE(provider, model_id)
);

-- ============================================================================
-- Indexes
-- ============================================================================

-- Index for available models lookup (most common query)
CREATE INDEX IF NOT EXISTS idx_ai_models_available
  ON ai_models(provider, is_available)
  WHERE is_available = true AND is_deprecated = false;

-- Index for model lookup by provider
CREATE INDEX IF NOT EXISTS idx_ai_models_provider
  ON ai_models(provider);

-- Index for last sync time (for cron job)
CREATE INDEX IF NOT EXISTS idx_ai_models_last_synced
  ON ai_models(last_synced_at);

-- ============================================================================
-- Triggers
-- ============================================================================

-- Update updated_at on changes
CREATE OR REPLACE FUNCTION update_ai_models_updated_at()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = NOW();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS trigger_ai_models_updated_at ON ai_models;
CREATE TRIGGER trigger_ai_models_updated_at
  BEFORE UPDATE ON ai_models
  FOR EACH ROW
  EXECUTE FUNCTION update_ai_models_updated_at();

-- ============================================================================
-- RLS Policies
-- ============================================================================

ALTER TABLE ai_models ENABLE ROW LEVEL SECURITY;

-- Everyone can read available models
DROP POLICY IF EXISTS "Anyone can read available ai_models" ON ai_models;
CREATE POLICY "Anyone can read available ai_models"
  ON ai_models FOR SELECT
  USING (auth.role() = 'authenticated');

-- Only platform admins can modify
DROP POLICY IF EXISTS "Platform admins can manage ai_models" ON ai_models;
CREATE POLICY "Platform admins can manage ai_models"
  ON ai_models FOR ALL
  USING (
    EXISTS (
      SELECT 1 FROM profiles
      WHERE profiles.id = auth.uid()
      AND profiles.is_admin = true
    )
  );

-- ============================================================================
-- Seed Data - Initial Models
-- ============================================================================

-- Anthropic Models
INSERT INTO ai_models (provider, model_id, display_name, input_cost_per_million, output_cost_per_million, context_window, max_output_tokens, supports_vision, supports_function_calling)
VALUES
  ('anthropic', 'claude-3-5-sonnet-20241022', 'Claude 3.5 Sonnet', 3.00, 15.00, 200000, 8192, true, true),
  ('anthropic', 'claude-3-5-haiku-20241022', 'Claude 3.5 Haiku', 0.80, 4.00, 200000, 8192, true, true),
  ('anthropic', 'claude-3-opus-20240229', 'Claude 3 Opus', 15.00, 75.00, 200000, 4096, true, true),
  ('anthropic', 'claude-sonnet-4-5-20250929', 'Claude Sonnet 4.5', 3.00, 15.00, 200000, 64000, true, true),
  ('anthropic', 'claude-sonnet-4-6-20250929', 'Claude Sonnet 4.6', 3.00, 15.00, 200000, 64000, true, true),
  ('anthropic', 'claude-haiku-4-5-20251001', 'Claude Haiku 4.5', 1.00, 5.00, 200000, 64000, true, true)
ON CONFLICT (provider, model_id) DO UPDATE SET
  display_name = EXCLUDED.display_name,
  input_cost_per_million = EXCLUDED.input_cost_per_million,
  output_cost_per_million = EXCLUDED.output_cost_per_million,
  context_window = EXCLUDED.context_window,
  max_output_tokens = EXCLUDED.max_output_tokens,
  supports_vision = EXCLUDED.supports_vision,
  supports_function_calling = EXCLUDED.supports_function_calling,
  last_synced_at = NOW();

-- Google Models
INSERT INTO ai_models (provider, model_id, display_name, input_cost_per_million, output_cost_per_million, context_window, max_output_tokens, supports_vision, supports_function_calling)
VALUES
  ('google', 'gemini-2.5-flash', 'Gemini 2.5 Flash', 0.075, 0.30, 1000000, 8192, true, true),
  ('google', 'gemini-2.5-pro', 'Gemini 2.5 Pro', 1.25, 5.00, 1000000, 8192, true, true),
  ('google', 'gemini-1.5-pro', 'Gemini 1.5 Pro', 1.25, 5.00, 2000000, 8192, true, true),
  ('google', 'gemini-1.5-flash', 'Gemini 1.5 Flash', 0.075, 0.30, 1000000, 8192, true, true)
ON CONFLICT (provider, model_id) DO UPDATE SET
  display_name = EXCLUDED.display_name,
  input_cost_per_million = EXCLUDED.input_cost_per_million,
  output_cost_per_million = EXCLUDED.output_cost_per_million,
  context_window = EXCLUDED.context_window,
  max_output_tokens = EXCLUDED.max_output_tokens,
  supports_vision = EXCLUDED.supports_vision,
  supports_function_calling = EXCLUDED.supports_function_calling,
  last_synced_at = NOW();

-- OpenRouter placeholder (will be synced from API)
INSERT INTO ai_models (provider, model_id, display_name, input_cost_per_million, output_cost_per_million, context_window, supports_function_calling)
VALUES
  ('openrouter', 'anthropic/claude-3.5-sonnet', 'Claude 3.5 Sonnet (via OpenRouter)', 3.00, 15.00, 200000, true),
  ('openrouter', 'google/gemini-2.5-flash', 'Gemini 2.5 Flash (via OpenRouter)', 0.075, 0.30, 1000000, true),
  ('openrouter', 'meta-llama/llama-3.1-405b', 'Llama 3.1 405B', 2.70, 2.70, 131072, true),
  ('openrouter', 'deepseek/deepseek-r1', 'DeepSeek R1', 0.55, 2.19, 65536, true)
ON CONFLICT (provider, model_id) DO UPDATE SET
  display_name = EXCLUDED.display_name,
  input_cost_per_million = EXCLUDED.input_cost_per_million,
  output_cost_per_million = EXCLUDED.output_cost_per_million,
  context_window = EXCLUDED.context_window,
  supports_function_calling = EXCLUDED.supports_function_calling,
  last_synced_at = NOW();

-- Kimi K2 Models
INSERT INTO ai_models (provider, model_id, display_name, input_cost_per_million, output_cost_per_million, context_window, supports_function_calling)
VALUES
  ('kimi', 'moonshot-v1-128k', 'Kimi Moonshot 128K', 0.80, 0.80, 128000, true),
  ('kimi', 'kimi-k2', 'Kimi K2', 1.00, 1.00, 200000, true)
ON CONFLICT (provider, model_id) DO UPDATE SET
  display_name = EXCLUDED.display_name,
  input_cost_per_million = EXCLUDED.input_cost_per_million,
  output_cost_per_million = EXCLUDED.output_cost_per_million,
  context_window = EXCLUDED.context_window,
  supports_function_calling = EXCLUDED.supports_function_calling,
  last_synced_at = NOW();

-- ============================================================================
-- Comments
-- ============================================================================

COMMENT ON TABLE ai_models IS 'Available AI models from all providers, synced via cron job';
COMMENT ON COLUMN ai_models.provider IS 'AI provider: anthropic, google, openrouter, kimi';
COMMENT ON COLUMN ai_models.model_id IS 'Provider-specific model identifier';
COMMENT ON COLUMN ai_models.input_cost_per_million IS 'Cost per million input tokens in USD';
COMMENT ON COLUMN ai_models.output_cost_per_million IS 'Cost per million output tokens in USD';
COMMENT ON COLUMN ai_models.provider_metadata IS 'Additional metadata from provider API';
