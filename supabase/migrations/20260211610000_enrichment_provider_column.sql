-- Migration: Add enrichment_provider to dynamic_table_columns (if missing)
-- Purpose: Allow Ops enrichment columns to explicitly choose provider (e.g., exa)

ALTER TABLE public.dynamic_table_columns
  ADD COLUMN IF NOT EXISTS enrichment_provider TEXT;

COMMENT ON COLUMN public.dynamic_table_columns.enrichment_provider IS
  'Provider hint for enrichment execution (e.g., exa, anthropic, openrouter). NULL uses default behavior.';
