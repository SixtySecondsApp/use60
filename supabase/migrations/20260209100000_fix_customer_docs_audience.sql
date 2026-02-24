-- Fix duplicate articles on internal view
-- Customer-facing articles were showing to both internal and external users,
-- duplicating content that already exists in the detailed internal docs.
-- Change customer-* articles to external-only.

UPDATE docs_articles
SET metadata = jsonb_set(metadata, '{target_audience}', '["external"]'::jsonb)
WHERE slug IN (
  'customer-getting-started',
  'customer-meeting-intelligence',
  'customer-team-analytics',
  'customer-dashboard',
  'customer-settings'
);
