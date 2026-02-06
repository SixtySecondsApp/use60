-- Add group_config and summary_config to dynamic_table_views
-- These enable row grouping and summary/aggregate row per view

ALTER TABLE dynamic_table_views
  ADD COLUMN IF NOT EXISTS group_config jsonb DEFAULT NULL,
  ADD COLUMN IF NOT EXISTS summary_config jsonb DEFAULT NULL;

COMMENT ON COLUMN dynamic_table_views.group_config IS 'Row grouping config: { column_key, collapsed_by_default, sort_groups_by }';
COMMENT ON COLUMN dynamic_table_views.summary_config IS 'Summary row config: Record<column_key, aggregate_type> where aggregate_type is count|sum|average|min|max|filled_percent|unique_count|none';
