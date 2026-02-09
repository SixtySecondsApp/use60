-- Tag all existing docs articles with target_audience metadata
-- Internal-only articles get ["internal"], shared articles get ["internal", "external"]

-- First, set ALL existing articles as internal-only (safe default)
UPDATE docs_articles
SET metadata = COALESCE(metadata, '{}'::jsonb) || '{"target_audience": ["internal"]}'::jsonb
WHERE metadata IS NULL OR NOT (metadata ? 'target_audience');

-- Now mark shared articles (relevant to both internal and external users)
-- Getting Started & Onboarding
UPDATE docs_articles
SET metadata = jsonb_set(metadata, '{target_audience}', '["internal", "external"]'::jsonb)
WHERE slug IN ('getting-started', 'onboarding-guide');

-- Meetings (core external feature)
UPDATE docs_articles
SET metadata = jsonb_set(metadata, '{target_audience}', '["internal", "external"]'::jsonb)
WHERE slug IN ('meetings-guide', 'meeting-recording-setup');

-- Integrations available to external users
UPDATE docs_articles
SET metadata = jsonb_set(metadata, '{target_audience}', '["internal", "external"]'::jsonb)
WHERE slug IN (
  'integration-slack',
  'integration-fathom',
  'integration-60-notetaker',
  'integration-fireflies',
  'integration-justcall'
);
