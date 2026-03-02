-- Fix incorrect Claude Sonnet 4.6 model ID
-- The model ID 'claude-sonnet-4-6-20250929' does not exist.
-- Correct ID is 'claude-sonnet-4-6' (no date suffix).

-- Fix ai_models table
UPDATE public.ai_models
SET model_id = 'claude-sonnet-4-6'
WHERE model_id IN ('claude-sonnet-4-6-20250929', 'claude-sonnet-4-6-20250514');

-- Fix model_config table
UPDATE public.model_config
SET model_id = 'claude-sonnet-4-6'
WHERE model_id IN ('claude-sonnet-4-6-20250929', 'claude-sonnet-4-6-20250514');
