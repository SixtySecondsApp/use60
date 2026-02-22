-- ============================================================================
-- KNW-014: Knowledge & Memory — Agent Config Defaults
-- Seeds agent_config_defaults for 3 new agent types:
--   relationship_graph, competitive_intelligence, pipeline_patterns
-- ============================================================================

-- Relationship Graph defaults
INSERT INTO agent_config_defaults (agent_type, config_key, config_value, description)
VALUES
  ('relationship_graph', 'enabled', 'true', 'Master toggle for relationship graph processing'),
  ('relationship_graph', 'batch_frequency', '"weekly"', 'How often to run full batch recalculation'),
  ('relationship_graph', 'interaction_weight', '40', 'Weight for interaction count in strength score'),
  ('relationship_graph', 'recency_weight', '30', 'Weight for recency in strength score'),
  ('relationship_graph', 'sentiment_weight', '20', 'Weight for sentiment in strength score'),
  ('relationship_graph', 'deal_value_weight', '10', 'Weight for deal value in strength score')
ON CONFLICT (agent_type, config_key) DO NOTHING;

-- Competitive Intelligence defaults
INSERT INTO agent_config_defaults (agent_type, config_key, config_value, description)
VALUES
  ('competitive_intelligence', 'enabled', 'true', 'Master toggle for competitive intelligence extraction'),
  ('competitive_intelligence', 'auto_battlecard_threshold', '5', 'Mentions before auto-generating battlecard'),
  ('competitive_intelligence', 'extract_from_emails', 'true', 'Also extract from email signals'),
  ('competitive_intelligence', 'slack_alerts', 'true', 'Send Slack alerts on competitor mentions')
ON CONFLICT (agent_type, config_key) DO NOTHING;

-- Pipeline Patterns defaults
INSERT INTO agent_config_defaults (agent_type, config_key, config_value, description)
VALUES
  ('pipeline_patterns', 'enabled', 'true', 'Master toggle for pipeline pattern detection'),
  ('pipeline_patterns', 'min_deals', '5', 'Minimum deals in stage before detecting patterns'),
  ('pipeline_patterns', 'confidence_threshold', '60', 'Minimum confidence percentage to surface patterns'),
  ('pipeline_patterns', 'expiry_days', '14', 'Auto-expire patterns after this many days'),
  ('pipeline_patterns', 'include_in_briefings', 'true', 'Include pattern insights in daily briefings')
ON CONFLICT (agent_type, config_key) DO NOTHING;
