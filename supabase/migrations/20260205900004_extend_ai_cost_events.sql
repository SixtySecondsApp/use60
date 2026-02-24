-- ============================================================================
-- Extend AI Cost Events Table
-- ============================================================================
-- Add feature_key column for standardized feature identification
-- This enables proper aggregation by feature across all usage data

-- Add feature_key column (matches ai_feature_config.feature_key)
ALTER TABLE ai_cost_events
ADD COLUMN IF NOT EXISTS feature_key TEXT;

-- Add provider column to support new providers
-- First check if we need to update the check constraint
DO $$
BEGIN
  -- Try to add kimi and openrouter to the provider check
  ALTER TABLE ai_cost_events DROP CONSTRAINT IF EXISTS ai_cost_events_provider_check;
  ALTER TABLE ai_cost_events ADD CONSTRAINT ai_cost_events_provider_check
    CHECK (provider IN ('anthropic', 'gemini', 'google', 'openrouter', 'kimi'));
EXCEPTION
  WHEN others THEN
    RAISE NOTICE 'Could not update provider check constraint: %', SQLERRM;
END $$;

-- Add index on feature_key for aggregation queries
CREATE INDEX IF NOT EXISTS idx_ai_cost_events_feature_key
  ON ai_cost_events(feature_key)
  WHERE feature_key IS NOT NULL;

-- Composite index for feature + time range queries
CREATE INDEX IF NOT EXISTS idx_ai_cost_events_feature_date
  ON ai_cost_events(feature_key, created_at);

-- Composite index for org + feature queries
CREATE INDEX IF NOT EXISTS idx_ai_cost_events_org_feature
  ON ai_cost_events(org_id, feature_key);

-- ============================================================================
-- Migrate Existing Feature Values to Standardized Feature Keys
-- ============================================================================

-- Map old feature names to new standardized keys
UPDATE ai_cost_events SET feature_key = CASE
  -- Copilot features
  WHEN feature ILIKE '%copilot%' AND feature NOT ILIKE '%autonomous%' THEN 'copilot_chat'
  WHEN feature ILIKE '%autonomous%' THEN 'copilot_autonomous'
  WHEN feature ILIKE '%entity%' OR feature ILIKE '%resolve%' THEN 'entity_resolution'

  -- Enrichment features
  WHEN feature ILIKE '%crm%enrich%' OR feature ILIKE '%enrich%crm%' THEN 'enrich_crm_record'
  WHEN feature ILIKE '%deep%org%' OR feature ILIKE '%org%deep%' THEN 'deep_enrich_organization'
  WHEN feature ILIKE '%org%enrich%' OR feature ILIKE '%enrich%org%' THEN 'enrich_organization'
  WHEN feature ILIKE '%dynamic%table%' OR feature ILIKE '%table%enrich%' THEN 'enrich_dynamic_table'

  -- Meeting features
  WHEN feature ILIKE '%action%item%extract%' OR feature ILIKE '%extract%action%' THEN 'extract_action_items'
  WHEN feature ILIKE '%action%item%analy%' OR feature ILIKE '%analy%action%' THEN 'analyze_action_item'
  WHEN feature ILIKE '%meeting%summar%' OR feature ILIKE '%summar%meet%' OR feature ILIKE '%condense%' THEN 'condense_meeting_summary'
  WHEN feature ILIKE '%scorecard%' THEN 'meeting_scorecard'
  WHEN feature ILIKE '%transcript%' THEN 'condense_meeting_summary'

  -- Content features
  WHEN feature ILIKE '%email%categor%' OR feature ILIKE '%categor%email%' THEN 'categorize_email'
  WHEN feature ILIKE '%email%analy%' OR feature ILIKE '%analy%email%' THEN 'analyze_email'
  WHEN feature ILIKE '%writing%style%' OR feature ILIKE '%style%analy%' THEN 'analyze_writing_style'
  WHEN feature ILIKE '%marketing%' THEN 'generate_marketing_content'

  -- Document features
  WHEN feature ILIKE '%proposal%' THEN 'generate_proposal'

  -- Skills features
  WHEN feature ILIKE '%skill%build%' OR feature ILIKE '%build%skill%' THEN 'skill_builder'

  -- Intelligence features
  WHEN feature ILIKE '%next%action%' OR feature ILIKE '%suggest%' THEN 'suggest_next_actions'

  -- Default: keep original value as feature_key
  ELSE LOWER(REPLACE(REPLACE(COALESCE(feature, 'unknown'), ' ', '_'), '-', '_'))
END
WHERE feature_key IS NULL AND feature IS NOT NULL;

-- Set unknown for null features
UPDATE ai_cost_events SET feature_key = 'unknown'
WHERE feature_key IS NULL AND feature IS NULL;

-- ============================================================================
-- Add View for Usage Aggregation
-- ============================================================================

CREATE OR REPLACE VIEW ai_usage_by_feature AS
SELECT
  feature_key,
  fc.display_name AS feature_name,
  fc.category,
  provider,
  model,
  DATE_TRUNC('day', created_at) AS usage_date,
  COUNT(*) AS call_count,
  SUM(input_tokens) AS total_input_tokens,
  SUM(output_tokens) AS total_output_tokens,
  SUM(estimated_cost) AS total_cost
FROM ai_cost_events ace
LEFT JOIN ai_feature_config fc ON fc.feature_key = ace.feature_key
GROUP BY ace.feature_key, fc.display_name, fc.category, provider, model, DATE_TRUNC('day', created_at);

CREATE OR REPLACE VIEW ai_usage_by_org AS
SELECT
  org_id,
  o.name AS org_name,
  feature_key,
  fc.display_name AS feature_name,
  fc.category,
  provider,
  model,
  DATE_TRUNC('day', created_at) AS usage_date,
  COUNT(*) AS call_count,
  SUM(input_tokens) AS total_input_tokens,
  SUM(output_tokens) AS total_output_tokens,
  SUM(estimated_cost) AS total_cost
FROM ai_cost_events ace
LEFT JOIN organizations o ON o.id = ace.org_id
LEFT JOIN ai_feature_config fc ON fc.feature_key = ace.feature_key
GROUP BY org_id, o.name, ace.feature_key, fc.display_name, fc.category, provider, model, DATE_TRUNC('day', created_at);

CREATE OR REPLACE VIEW ai_usage_by_user AS
SELECT
  user_id,
  p.email AS user_email,
  p.full_name AS user_name,
  ace.org_id,
  feature_key,
  fc.display_name AS feature_name,
  provider,
  model,
  DATE_TRUNC('day', created_at) AS usage_date,
  COUNT(*) AS call_count,
  SUM(input_tokens) AS total_input_tokens,
  SUM(output_tokens) AS total_output_tokens,
  SUM(estimated_cost) AS total_cost
FROM ai_cost_events ace
LEFT JOIN profiles p ON p.id = ace.user_id
LEFT JOIN ai_feature_config fc ON fc.feature_key = ace.feature_key
WHERE ace.user_id IS NOT NULL
GROUP BY user_id, p.email, p.full_name, ace.org_id, ace.feature_key, fc.display_name, provider, model, DATE_TRUNC('day', created_at);

-- ============================================================================
-- Comments
-- ============================================================================

COMMENT ON COLUMN ai_cost_events.feature_key IS 'Standardized feature identifier matching ai_feature_config.feature_key';
COMMENT ON VIEW ai_usage_by_feature IS 'Aggregated AI usage statistics by feature and day';
COMMENT ON VIEW ai_usage_by_org IS 'Aggregated AI usage statistics by organization, feature, and day';
COMMENT ON VIEW ai_usage_by_user IS 'Aggregated AI usage statistics by user, feature, and day';
