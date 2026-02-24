-- Make domain column nullable for manual enrichment flows
-- Manual enrichment (Q&A) doesn't have a domain since there's no website to scrape
ALTER TABLE public.organization_enrichment
ALTER COLUMN domain DROP NOT NULL;
