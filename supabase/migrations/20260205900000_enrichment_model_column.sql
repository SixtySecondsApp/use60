-- Migration: Add enrichment_model column to dynamic_table_columns
-- Purpose: Store the OpenRouter model ID for AI enrichment columns
-- Date: 2026-02-05

-- =============================================================================
-- Add enrichment_model column
-- =============================================================================

ALTER TABLE public.dynamic_table_columns
  ADD COLUMN IF NOT EXISTS enrichment_model TEXT;

COMMENT ON COLUMN public.dynamic_table_columns.enrichment_model IS 'OpenRouter model ID for AI enrichment (e.g., anthropic/claude-3.5-sonnet). NULL means use default.';

-- =============================================================================
-- Notify PostgREST
-- =============================================================================

NOTIFY pgrst, 'reload schema';
