-- Migration: Add progress tracking to apify_runs
-- Purpose: Track real-time progress percentage for long-running Apify actors
-- Date: 2026-02-12

-- Add progress_percent column to apify_runs table
ALTER TABLE public.apify_runs
  ADD COLUMN IF NOT EXISTS progress_percent INTEGER DEFAULT 0
  CHECK (progress_percent >= 0 AND progress_percent <= 100);

COMMENT ON COLUMN public.apify_runs.progress_percent IS 'Real-time progress percentage (0-100) for running actors. Updated via webhook callbacks.';

-- Create index for querying running actors by progress
CREATE INDEX IF NOT EXISTS idx_apify_runs_progress
  ON public.apify_runs(org_id, status, progress_percent)
  WHERE status = 'running';
