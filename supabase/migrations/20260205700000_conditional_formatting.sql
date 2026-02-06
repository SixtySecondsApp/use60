-- Migration: OPS-026 — Add formatting_rules to views
-- Date: 2026-02-05

-- Add formatting_rules JSONB column to saved views
ALTER TABLE public.dynamic_table_views
  ADD COLUMN IF NOT EXISTS formatting_rules JSONB DEFAULT '[]';

-- Comment for schema documentation
COMMENT ON COLUMN public.dynamic_table_views.formatting_rules IS
  'Array of conditional formatting rules: [{ column_key, operator, value, style }]';

NOTIFY pgrst, 'reload schema';
