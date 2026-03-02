-- Migration: OPS-004, OPS-005, OPS-006 — New column types
-- Adds dropdown, tags, phone, checkbox, formula to column_type CHECK constraint
-- Adds dropdown_options JSONB and formula_expression TEXT to dynamic_table_columns
-- Date: 2026-02-05

-- =============================================================================
-- Step 1: Drop existing CHECK constraint and recreate with new types
-- =============================================================================

ALTER TABLE public.dynamic_table_columns
  DROP CONSTRAINT IF EXISTS dynamic_table_columns_column_type_check;

DO $$ BEGIN
  ALTER TABLE public.dynamic_table_columns
  ADD CONSTRAINT dynamic_table_columns_column_type_check
  CHECK (column_type IN (
    'text', 'email', 'url', 'number', 'boolean', 'enrichment',
    'status', 'person', 'company', 'linkedin', 'date',
    'dropdown', 'tags', 'phone', 'checkbox', 'formula'
  ));
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

-- =============================================================================
-- Step 2: Add new columns for dropdown options and formula expressions
-- =============================================================================

-- dropdown_options: JSONB array of { value: string, label: string, color?: string }
-- Used by both 'dropdown' (single-select) and 'tags' (multi-select) column types
ALTER TABLE public.dynamic_table_columns
  ADD COLUMN IF NOT EXISTS dropdown_options JSONB DEFAULT NULL;

COMMENT ON COLUMN public.dynamic_table_columns.dropdown_options IS
  'Options for dropdown/tags column types. Array of { value, label, color } objects.';

-- formula_expression: Text expression for formula columns
-- Supports @column_key references, IF(), CONCAT(), basic math
ALTER TABLE public.dynamic_table_columns
  ADD COLUMN IF NOT EXISTS formula_expression TEXT DEFAULT NULL;

COMMENT ON COLUMN public.dynamic_table_columns.formula_expression IS
  'Expression for formula columns. Supports @column_key refs, IF(), CONCAT(), math operators.';

-- =============================================================================
-- Notify PostgREST
-- =============================================================================

NOTIFY pgrst, 'reload schema';
