-- Add enrichment_source column to track how enrichment was generated
-- Values: 'website' (from scraping), 'manual' (from Q&A), 'enrichment' (from API)
ALTER TABLE public.organization_enrichment
ADD COLUMN IF NOT EXISTS enrichment_source text DEFAULT 'website';
