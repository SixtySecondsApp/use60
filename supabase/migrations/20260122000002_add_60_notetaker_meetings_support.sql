-- Migration: Add 60 Notetaker support to meetings table (MeetingBaaS)
-- Date: 2026-01-22
--
-- Purpose:
-- - Allow meetings.source_type = '60_notetaker'
-- - Allow meetings without fathom_recording_id (for non-Fathom sources)
-- - Add MeetingBaaS fields used by edge functions + UI (bot_id, meeting_url, transcript_json, S3 fields, thumbnail fields)
--
-- Notes:
-- - We keep existing Fathom/voice columns intact.
-- - We use IF NOT EXISTS for idempotency.

-- =============================================================================
-- 1) Allow additional source types
-- =============================================================================

ALTER TABLE public.meetings
  DROP CONSTRAINT IF EXISTS meetings_source_type_check;

DO $$ BEGIN
  ALTER TABLE public.meetings
  ADD CONSTRAINT meetings_source_type_check
  CHECK (source_type IN ('fathom', 'voice', '60_notetaker'));
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

-- =============================================================================
-- 2) Allow non-Fathom meetings to exist without a Fathom recording id
-- =============================================================================

-- Historically this column was required for Fathom, but bot/voice meetings do not have one.
ALTER TABLE public.meetings
  ALTER COLUMN fathom_recording_id DROP NOT NULL;

-- =============================================================================
-- 3) MeetingBaaS / 60 Notetaker fields
-- =============================================================================

-- Bot and recording identifiers
ALTER TABLE public.meetings
  ADD COLUMN IF NOT EXISTS bot_id text;

ALTER TABLE public.meetings
  ADD COLUMN IF NOT EXISTS recording_id uuid;

-- S3 storage for bot recordings
ALTER TABLE public.meetings
  ADD COLUMN IF NOT EXISTS recording_s3_key text;

ALTER TABLE public.meetings
  ADD COLUMN IF NOT EXISTS recording_s3_url text;

-- Transcript storage (full diarized payload)
ALTER TABLE public.meetings
  ADD COLUMN IF NOT EXISTS transcript_json jsonb;

-- Meeting platform + join URL
ALTER TABLE public.meetings
  ADD COLUMN IF NOT EXISTS meeting_platform text;

DO $$
BEGIN
  ALTER TABLE public.meetings DROP CONSTRAINT IF EXISTS meetings_meeting_platform_check;
EXCEPTION
  WHEN undefined_object THEN NULL;
END $$;

DO $$ BEGIN
  ALTER TABLE public.meetings
  ADD CONSTRAINT meetings_meeting_platform_check
  CHECK (
    meeting_platform IS NULL OR
    meeting_platform IN ('zoom', 'google_meet', 'microsoft_teams', 'fathom', 'voice')
  );
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

ALTER TABLE public.meetings
  ADD COLUMN IF NOT EXISTS meeting_url text;

-- Speaker mapping (JSONB array)
ALTER TABLE public.meetings
  ADD COLUMN IF NOT EXISTS speakers jsonb;

-- Bot processing lifecycle status (separate from Fathom thumbnail/transcript enums)
ALTER TABLE public.meetings
  ADD COLUMN IF NOT EXISTS processing_status text DEFAULT 'ready';

DO $$
BEGIN
  ALTER TABLE public.meetings DROP CONSTRAINT IF EXISTS meetings_processing_status_check;
EXCEPTION
  WHEN undefined_object THEN NULL;
END $$;

DO $$ BEGIN
  ALTER TABLE public.meetings
  ADD CONSTRAINT meetings_processing_status_check
  CHECK (processing_status IN ('pending', 'bot_joining', 'recording', 'processing', 'ready', 'failed'));
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

ALTER TABLE public.meetings
  ADD COLUMN IF NOT EXISTS error_message text;

-- Thumbnails for bot recordings (real-frame thumbnails stored in S3)
ALTER TABLE public.meetings
  ADD COLUMN IF NOT EXISTS thumbnail_s3_key text;

-- Keep existing thumbnail_url column if present (Fathom uses it as well)
ALTER TABLE public.meetings
  ADD COLUMN IF NOT EXISTS thumbnail_url text;

-- Foreign key to recordings if recordings exists
DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM information_schema.tables WHERE table_schema = 'public' AND table_name = 'recordings') THEN
    ALTER TABLE public.meetings
      ADD CONSTRAINT meetings_recording_id_fkey
      FOREIGN KEY (recording_id) REFERENCES public.recordings(id) ON DELETE SET NULL;
  END IF;
EXCEPTION
  WHEN duplicate_object THEN NULL;
  WHEN undefined_table THEN NULL;
END $$;

-- =============================================================================
-- 4) Indexes to support webhook lookups + filtering
-- =============================================================================

-- Bot lookup from MeetingBaaS webhooks
CREATE UNIQUE INDEX IF NOT EXISTS idx_meetings_bot_id_unique
  ON public.meetings(bot_id) WHERE bot_id IS NOT NULL;

-- Filter notetaker meetings by processing_status quickly
CREATE INDEX IF NOT EXISTS idx_meetings_processing_status
  ON public.meetings(processing_status);

