-- Add enrichment_data JSONB and enriched_at columns to companies table
-- Stores structured company intelligence from parallel Gemini research queries

ALTER TABLE companies ADD COLUMN IF NOT EXISTS enrichment_data JSONB DEFAULT NULL;
ALTER TABLE companies ADD COLUMN IF NOT EXISTS enriched_at TIMESTAMPTZ DEFAULT NULL;
