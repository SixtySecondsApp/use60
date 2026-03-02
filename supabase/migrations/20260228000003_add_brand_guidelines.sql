-- Add brand_guidelines JSONB column to organizations table
-- Stores brand colors, typography, tone, and visual style for AI agents
ALTER TABLE organizations ADD COLUMN IF NOT EXISTS brand_guidelines JSONB DEFAULT '{}';

COMMENT ON COLUMN organizations.brand_guidelines IS 'Brand guidelines: colors, typography, tone, visual_style — used by AI agents for consistent brand output';
