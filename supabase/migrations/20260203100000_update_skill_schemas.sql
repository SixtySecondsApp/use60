-- Migration: Update skill frontmatter with proper tool schemas
-- Purpose: Add inputs/outputs to key skills for autonomous copilot tool use
-- Date: 2026-02-03

-- =============================================================================
-- Update deal-scoring skill
-- =============================================================================

UPDATE platform_skills
SET frontmatter = jsonb_set(
  frontmatter,
  '{inputs}',
  '[
    {"name": "deal_id", "type": "string", "description": "The ID of the deal to analyze", "required": true},
    {"name": "company_name", "type": "string", "description": "Company name for context", "required": false},
    {"name": "include_recommendations", "type": "boolean", "description": "Include action recommendations", "required": false}
  ]'::jsonb
)
WHERE skill_key = 'deal-scoring'
  AND frontmatter->>'inputs' IS NULL;

UPDATE platform_skills
SET frontmatter = jsonb_set(
  frontmatter,
  '{outputs}',
  '[
    {"name": "health_score", "type": "number", "description": "Deal health score 0-100"},
    {"name": "win_probability", "type": "number", "description": "Estimated win probability 0-1"},
    {"name": "risk_flags", "type": "array", "description": "List of identified risks"},
    {"name": "recommended_actions", "type": "array", "description": "Suggested next steps"}
  ]'::jsonb
)
WHERE skill_key = 'deal-scoring'
  AND frontmatter->>'outputs' IS NULL;

-- =============================================================================
-- Update get-contact-context skill (if exists)
-- =============================================================================

UPDATE platform_skills
SET frontmatter = jsonb_set(
  frontmatter,
  '{inputs}',
  '[
    {"name": "contact_id", "type": "string", "description": "The ID of the contact", "required": false},
    {"name": "company_name", "type": "string", "description": "Company name to look up contact", "required": false},
    {"name": "email", "type": "string", "description": "Contact email address", "required": false}
  ]'::jsonb
)
WHERE skill_key = 'get-contact-context'
  AND frontmatter->>'inputs' IS NULL;

UPDATE platform_skills
SET frontmatter = jsonb_set(
  frontmatter,
  '{outputs}',
  '[
    {"name": "contact", "type": "object", "description": "Contact details including name, title, company"},
    {"name": "recent_activities", "type": "array", "description": "Recent interactions with this contact"},
    {"name": "related_deals", "type": "array", "description": "Deals associated with this contact"},
    {"name": "communication_history", "type": "array", "description": "Recent emails and meetings"}
  ]'::jsonb
)
WHERE skill_key = 'get-contact-context'
  AND frontmatter->>'outputs' IS NULL;

-- =============================================================================
-- Update slack-briefing-format skill (if exists)
-- =============================================================================

UPDATE platform_skills
SET frontmatter = jsonb_set(
  frontmatter,
  '{inputs}',
  '[
    {"name": "content", "type": "string", "description": "The content to format for Slack", "required": true},
    {"name": "channel", "type": "string", "description": "Target Slack channel", "required": false},
    {"name": "format_type", "type": "string", "description": "Format type: summary, detailed, or action-items", "required": false},
    {"name": "include_cta", "type": "boolean", "description": "Include call-to-action buttons", "required": false}
  ]'::jsonb
)
WHERE skill_key = 'slack-briefing-format'
  AND frontmatter->>'inputs' IS NULL;

UPDATE platform_skills
SET frontmatter = jsonb_set(
  frontmatter,
  '{outputs}',
  '[
    {"name": "blocks", "type": "array", "description": "Slack Block Kit blocks"},
    {"name": "text", "type": "string", "description": "Fallback plain text"},
    {"name": "attachments", "type": "array", "description": "Slack attachments if any"}
  ]'::jsonb
)
WHERE skill_key = 'slack-briefing-format'
  AND frontmatter->>'outputs' IS NULL;

-- =============================================================================
-- Update meeting-prep skill (if exists)
-- =============================================================================

UPDATE platform_skills
SET frontmatter = jsonb_set(
  frontmatter,
  '{inputs}',
  '[
    {"name": "meeting_id", "type": "string", "description": "The ID of the upcoming meeting", "required": false},
    {"name": "contact_id", "type": "string", "description": "Contact ID for the meeting", "required": false},
    {"name": "company_name", "type": "string", "description": "Company name for context", "required": false},
    {"name": "meeting_date", "type": "string", "description": "Date of the meeting (ISO format)", "required": false}
  ]'::jsonb
)
WHERE skill_key = 'meeting-prep'
  AND frontmatter->>'inputs' IS NULL;

UPDATE platform_skills
SET frontmatter = jsonb_set(
  frontmatter,
  '{outputs}',
  '[
    {"name": "briefing", "type": "object", "description": "Meeting briefing with key talking points"},
    {"name": "attendees", "type": "array", "description": "List of attendees with background info"},
    {"name": "talking_points", "type": "array", "description": "Suggested talking points"},
    {"name": "recent_context", "type": "object", "description": "Recent interactions and deal status"}
  ]'::jsonb
)
WHERE skill_key = 'meeting-prep'
  AND frontmatter->>'outputs' IS NULL;

-- =============================================================================
-- Update any agent-sequence skills to have workflow_description
-- =============================================================================

UPDATE platform_skills
SET frontmatter = jsonb_set(
  frontmatter,
  '{execution_mode}',
  '"async"'::jsonb
)
WHERE category = 'agent-sequence'
  AND frontmatter->>'execution_mode' IS NULL;

-- Add workflow metadata to sequences
UPDATE platform_skills
SET frontmatter = jsonb_set(
  frontmatter,
  '{skill_type}',
  '"sequence"'::jsonb
)
WHERE category = 'agent-sequence'
  AND frontmatter->>'skill_type' IS NULL;

-- Notify PostgREST to reload schema
NOTIFY pgrst, 'reload schema';
