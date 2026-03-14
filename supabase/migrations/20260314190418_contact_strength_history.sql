-- Migration: contact_strength_history
-- Date: 20260314190418
--
-- What this migration does:
--   Adds strength_history JSONB column to contact_memory.
--   Tracks relationship strength snapshots over time (decay + events).
--   Each entry: { "strength": 0.72, "date": "2026-03-14", "event": "meeting" }
--
-- Rollback strategy:
--   ALTER TABLE contact_memory DROP COLUMN IF EXISTS strength_history;

DO $$
BEGIN
  ALTER TABLE contact_memory ADD COLUMN strength_history JSONB DEFAULT '[]';
EXCEPTION
  WHEN duplicate_column THEN
    RAISE NOTICE 'Column strength_history already exists on contact_memory, skipping.';
END $$;
