-- =============================================================================
-- Phase 3: Fix 60 Notetaker meetings table integration
-- =============================================================================
-- Problem: deploy-recording-bot inserts into meetings with source_type='60_notetaker'
-- but fathom_recording_id is NOT NULL, causing silent insert failures.
-- Also, provider column was never set (defaulting to 'fathom').

-- 1a. Make fathom_recording_id nullable (required for 60 Notetaker + Fireflies meetings)
ALTER TABLE meetings ALTER COLUMN fathom_recording_id DROP NOT NULL;

-- 1b. Backfill provider for any existing 60 Notetaker meetings that slipped through
UPDATE meetings SET provider = '60_notetaker' WHERE source_type = '60_notetaker' AND (provider = 'fathom' OR provider IS NULL);
