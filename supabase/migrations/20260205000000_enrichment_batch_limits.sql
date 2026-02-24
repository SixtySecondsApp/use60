-- Migration: Enrichment Batch Limits & Checkpointing
-- Purpose: Add batch processing support so enrichment jobs can resume across invocations.
-- Date: 2026-02-05

-- Add last_processed_row_index to track progress for batch resumption
ALTER TABLE public.enrichment_jobs
  ADD COLUMN IF NOT EXISTS last_processed_row_index INTEGER DEFAULT 0;

COMMENT ON COLUMN public.enrichment_jobs.last_processed_row_index
  IS 'Tracks the last row_index that was processed, enabling batch resumption.';

-- Add batch_size to record the batch size used
ALTER TABLE public.enrichment_jobs
  ADD COLUMN IF NOT EXISTS batch_size INTEGER DEFAULT 50;

COMMENT ON COLUMN public.enrichment_jobs.batch_size
  IS 'Number of rows processed per invocation.';

-- Add composite index for efficient row pagination within a table
CREATE INDEX IF NOT EXISTS idx_dynamic_table_rows_table_row_index
  ON public.dynamic_table_rows(table_id, row_index);

NOTIFY pgrst, 'reload schema';
