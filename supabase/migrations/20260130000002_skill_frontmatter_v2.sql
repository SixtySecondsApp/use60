-- Migration: Skill Frontmatter V2
-- Purpose: Update frontmatter structure for better AI agent matching
-- Feature: skills-remap (SKILL-005)
-- Date: 2026-01-30

-- =============================================================================
-- Update platform_skills frontmatter structure
-- Add new fields for better AI matching while maintaining backward compatibility
-- =============================================================================

-- Add comment documenting the new frontmatter schema
COMMENT ON COLUMN platform_skills.frontmatter IS 'Skill metadata (V2 schema):
{
  "name": "string - Display name",
  "description": "string - Brief description",
  "category": "string - sales-ai|writing|enrichment|workflows|data-access|output-format",
  "version": "number - Schema version",

  "skill_type": "string - atomic|sequence|composite",

  "triggers": [
    {
      "pattern": "string - Trigger pattern or keyword",
      "intent": "string - Intent category",
      "confidence": "number - Match threshold 0-1",
      "examples": ["string - Example phrases"]
    }
  ],

  "intent_patterns": ["string - Regex patterns for intent matching"],
  "keywords": ["string - Search keywords"],

  "required_context": ["string - Required variable names"],
  "optional_context": ["string - Optional variable names"],

  "inputs": [
    {
      "name": "string",
      "type": "string|number|boolean|array|object",
      "description": "string",
      "required": "boolean",
      "default": "any",
      "example": "any"
    }
  ],

  "outputs": [
    {
      "name": "string",
      "type": "string|number|boolean|array|object",
      "description": "string"
    }
  ],

  "dependencies": ["string - Other skill keys this depends on"],
  "child_skills": ["string - Skills this composite can invoke"],

  "execution_mode": "string - sync|async|streaming",
  "timeout_ms": "number - Execution timeout",
  "retry_count": "number - Retry attempts",

  "author": "string",
  "tags": ["string"]
}';

-- =============================================================================
-- Function: Validate frontmatter V2 schema
-- Returns validation errors if any
-- =============================================================================

CREATE OR REPLACE FUNCTION validate_skill_frontmatter(p_frontmatter JSONB)
RETURNS TABLE (
  field TEXT,
  error TEXT
) AS $$
BEGIN
  -- Check required fields
  IF p_frontmatter->>'name' IS NULL OR p_frontmatter->>'name' = '' THEN
    field := 'name';
    error := 'Name is required';
    RETURN NEXT;
  END IF;

  IF p_frontmatter->>'description' IS NULL OR p_frontmatter->>'description' = '' THEN
    field := 'description';
    error := 'Description is required';
    RETURN NEXT;
  END IF;

  -- Validate skill_type if present
  IF p_frontmatter->>'skill_type' IS NOT NULL
     AND p_frontmatter->>'skill_type' NOT IN ('atomic', 'sequence', 'composite') THEN
    field := 'skill_type';
    error := 'skill_type must be: atomic, sequence, or composite';
    RETURN NEXT;
  END IF;

  -- Validate execution_mode if present
  IF p_frontmatter->>'execution_mode' IS NOT NULL
     AND p_frontmatter->>'execution_mode' NOT IN ('sync', 'async', 'streaming') THEN
    field := 'execution_mode';
    error := 'execution_mode must be: sync, async, or streaming';
    RETURN NEXT;
  END IF;

  -- Validate triggers array structure if present
  IF p_frontmatter->'triggers' IS NOT NULL AND jsonb_typeof(p_frontmatter->'triggers') = 'array' THEN
    -- Check each trigger has at least a pattern
    IF EXISTS (
      SELECT 1 FROM jsonb_array_elements(p_frontmatter->'triggers') t
      WHERE t->>'pattern' IS NULL OR t->>'pattern' = ''
    ) THEN
      field := 'triggers';
      error := 'Each trigger must have a pattern';
      RETURN NEXT;
    END IF;
  END IF;

  RETURN;
END;
$$ LANGUAGE plpgsql;

-- =============================================================================
-- Function: Migrate V1 frontmatter to V2 format
-- Converts old string arrays to new structured format
-- =============================================================================

CREATE OR REPLACE FUNCTION migrate_frontmatter_v1_to_v2(p_frontmatter JSONB)
RETURNS JSONB AS $$
DECLARE
  v_result JSONB;
  v_triggers JSONB := '[]'::JSONB;
  v_trigger TEXT;
BEGIN
  v_result := p_frontmatter;

  -- Convert old string triggers to new structured format
  IF p_frontmatter->'triggers' IS NOT NULL
     AND jsonb_typeof(p_frontmatter->'triggers') = 'array'
     AND (SELECT jsonb_typeof(elem) FROM jsonb_array_elements(p_frontmatter->'triggers') elem LIMIT 1) = 'string' THEN

    -- Convert each string trigger to object format
    FOR v_trigger IN SELECT jsonb_array_elements_text(p_frontmatter->'triggers')
    LOOP
      v_triggers := v_triggers || jsonb_build_object(
        'pattern', v_trigger,
        'confidence', 0.7
      );
    END LOOP;

    v_result := jsonb_set(v_result, '{triggers}', v_triggers);
  END IF;

  -- Rename requires_context to required_context if present
  IF p_frontmatter->'requires_context' IS NOT NULL THEN
    v_result := jsonb_set(v_result, '{required_context}', p_frontmatter->'requires_context');
    v_result := v_result - 'requires_context';
  END IF;

  -- Set default skill_type if not present
  IF v_result->>'skill_type' IS NULL THEN
    v_result := jsonb_set(v_result, '{skill_type}', '"atomic"'::JSONB);
  END IF;

  -- Set default execution_mode if not present
  IF v_result->>'execution_mode' IS NULL THEN
    v_result := jsonb_set(v_result, '{execution_mode}', '"sync"'::JSONB);
  END IF;

  RETURN v_result;
END;
$$ LANGUAGE plpgsql;

-- =============================================================================
-- Function: Get skills matching an intent
-- Used by AI agents to find relevant skills
-- =============================================================================

CREATE OR REPLACE FUNCTION get_skills_by_intent(
  p_intent TEXT,
  p_category TEXT DEFAULT NULL,
  p_limit INT DEFAULT 10
)
RETURNS TABLE (
  skill_key TEXT,
  category TEXT,
  name TEXT,
  description TEXT,
  match_score FLOAT,
  triggers JSONB
) AS $$
BEGIN
  RETURN QUERY
  SELECT
    ps.skill_key,
    ps.category,
    ps.frontmatter->>'name' as name,
    ps.frontmatter->>'description' as description,
    -- Calculate match score based on:
    -- 1. Exact keyword match in skill_key
    -- 2. Match in name/description
    -- 3. Match in triggers
    -- 4. Match in keywords array
    CASE
      WHEN ps.skill_key ILIKE '%' || p_intent || '%' THEN 1.0
      WHEN ps.frontmatter->>'name' ILIKE '%' || p_intent || '%' THEN 0.9
      WHEN ps.frontmatter->>'description' ILIKE '%' || p_intent || '%' THEN 0.7
      WHEN EXISTS (
        SELECT 1 FROM jsonb_array_elements(ps.frontmatter->'triggers') t
        WHERE t->>'pattern' ILIKE '%' || p_intent || '%'
      ) THEN 0.8
      WHEN EXISTS (
        SELECT 1 FROM jsonb_array_elements_text(ps.frontmatter->'keywords') k
        WHERE k ILIKE '%' || p_intent || '%'
      ) THEN 0.6
      ELSE 0.3
    END as match_score,
    ps.frontmatter->'triggers' as triggers
  FROM platform_skills ps
  WHERE ps.is_active = true
    AND (p_category IS NULL OR ps.category = p_category)
    AND (
      ps.skill_key ILIKE '%' || p_intent || '%'
      OR ps.frontmatter->>'name' ILIKE '%' || p_intent || '%'
      OR ps.frontmatter->>'description' ILIKE '%' || p_intent || '%'
      OR EXISTS (
        SELECT 1 FROM jsonb_array_elements(ps.frontmatter->'triggers') t
        WHERE t->>'pattern' ILIKE '%' || p_intent || '%'
      )
      OR EXISTS (
        SELECT 1 FROM jsonb_array_elements_text(ps.frontmatter->'keywords') k
        WHERE k ILIKE '%' || p_intent || '%'
      )
    )
  ORDER BY match_score DESC, ps.skill_key
  LIMIT p_limit;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- =============================================================================
-- Grant permissions
-- =============================================================================

GRANT EXECUTE ON FUNCTION validate_skill_frontmatter TO authenticated;
GRANT EXECUTE ON FUNCTION migrate_frontmatter_v1_to_v2 TO authenticated;
GRANT EXECUTE ON FUNCTION get_skills_by_intent TO authenticated;
