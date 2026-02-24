-- ============================================================================
-- Fix AI Model Pricing - February 2026
-- ============================================================================
-- Several models had incorrect pricing from the initial seed.
-- This migration corrects them to current provider-published rates.

-- ============================================================================
-- 1. Fix Anthropic Haiku pricing ($0.80/$4.00 → $1.00/$5.00)
-- ============================================================================
UPDATE ai_models
SET input_cost_per_million = 1.00,
    output_cost_per_million = 5.00,
    last_synced_at = NOW()
WHERE provider = 'anthropic'
  AND model_id IN ('claude-3-5-haiku-20241022', 'claude-haiku-4-5-20250514');

-- ============================================================================
-- 2. Fix Gemini 2.5 Flash pricing ($0.075/$0.30 → $0.30/$2.50)
-- ============================================================================
UPDATE ai_models
SET input_cost_per_million = 0.30,
    output_cost_per_million = 2.50,
    last_synced_at = NOW()
WHERE provider = 'google'
  AND model_id = 'gemini-2.5-flash';

-- Also fix the OpenRouter mirror
UPDATE ai_models
SET input_cost_per_million = 0.30,
    output_cost_per_million = 2.50,
    last_synced_at = NOW()
WHERE provider = 'openrouter'
  AND model_id = 'google/gemini-2.5-flash';

-- ============================================================================
-- 3. Fix Gemini 2.5 Pro output pricing ($5.00 → $10.00)
-- ============================================================================
UPDATE ai_models
SET output_cost_per_million = 10.00,
    last_synced_at = NOW()
WHERE provider = 'google'
  AND model_id = 'gemini-2.5-pro';

-- ============================================================================
-- 4. Add missing Claude Sonnet 4.5
-- ============================================================================
INSERT INTO ai_models (provider, model_id, display_name, input_cost_per_million, output_cost_per_million, context_window, max_output_tokens, supports_vision, supports_function_calling)
VALUES
  ('anthropic', 'claude-sonnet-4-5-20250929', 'Claude Sonnet 4.5', 3.00, 15.00, 200000, 64000, true, true)
ON CONFLICT (provider, model_id) DO UPDATE SET
  display_name = EXCLUDED.display_name,
  input_cost_per_million = EXCLUDED.input_cost_per_million,
  output_cost_per_million = EXCLUDED.output_cost_per_million,
  context_window = EXCLUDED.context_window,
  max_output_tokens = EXCLUDED.max_output_tokens,
  supports_vision = EXCLUDED.supports_vision,
  supports_function_calling = EXCLUDED.supports_function_calling,
  last_synced_at = NOW();

-- ============================================================================
-- 5. Mark Claude 3 Opus as deprecated (superseded by Sonnet 4/4.5)
-- ============================================================================
UPDATE ai_models
SET is_deprecated = true,
    last_synced_at = NOW()
WHERE provider = 'anthropic'
  AND model_id = 'claude-3-opus-20240229';
