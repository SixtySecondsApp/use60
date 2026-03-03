-- Migration: WB-001 — Partial index for warmth signal backfill cleanup
-- Purpose: Speeds up DELETE of backfill-tagged signals for idempotent re-runs.
-- Date: 2026-03-03

CREATE INDEX IF NOT EXISTS idx_warmth_signals_backfill
  ON public.contact_warmth_signals (org_id)
  WHERE (metadata->>'source') = 'backfill';
