-- =============================================================================
-- Re-apply missing columns from 20260122000002_add_60_notetaker_meetings_support
-- =============================================================================
-- The original migration was recorded as applied but columns were missing on
-- production (likely failed mid-way). This re-applies the column additions.
-- All statements are idempotent (ADD COLUMN IF NOT EXISTS).
-- =============================================================================

-- S3 storage for bot recordings
ALTER TABLE public.meetings ADD COLUMN IF NOT EXISTS recording_s3_key text;
ALTER TABLE public.meetings ADD COLUMN IF NOT EXISTS recording_s3_url text;

-- Transcript storage (full diarized payload)
ALTER TABLE public.meetings ADD COLUMN IF NOT EXISTS transcript_json jsonb;

-- Meeting platform + join URL
ALTER TABLE public.meetings ADD COLUMN IF NOT EXISTS meeting_platform text;
ALTER TABLE public.meetings ADD COLUMN IF NOT EXISTS meeting_url text;

-- Speaker mapping (JSONB array)
ALTER TABLE public.meetings ADD COLUMN IF NOT EXISTS speakers jsonb;

-- Bot processing lifecycle status
ALTER TABLE public.meetings ADD COLUMN IF NOT EXISTS processing_status text DEFAULT 'ready';

-- Error tracking
ALTER TABLE public.meetings ADD COLUMN IF NOT EXISTS error_message text;

-- Thumbnails for bot recordings
ALTER TABLE public.meetings ADD COLUMN IF NOT EXISTS thumbnail_s3_key text;

-- External identifier
ALTER TABLE public.meetings ADD COLUMN IF NOT EXISTS external_id text;

-- Constraints
DO $$ BEGIN
  ALTER TABLE public.meetings DROP CONSTRAINT IF EXISTS meetings_meeting_platform_check;
EXCEPTION WHEN undefined_object THEN NULL;
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

DO $$ BEGIN
  ALTER TABLE public.meetings DROP CONSTRAINT IF EXISTS meetings_processing_status_check;
EXCEPTION WHEN undefined_object THEN NULL;
END $$;

DO $$ BEGIN
  ALTER TABLE public.meetings
  ADD CONSTRAINT meetings_processing_status_check
  CHECK (processing_status IN ('pending', 'bot_joining', 'recording', 'processing', 'ready', 'failed'));
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

-- FK to recordings table
DO $$ BEGIN
  IF EXISTS (SELECT 1 FROM information_schema.tables WHERE table_schema = 'public' AND table_name = 'recordings') THEN
    ALTER TABLE public.meetings
      ADD CONSTRAINT meetings_recording_id_fkey
      FOREIGN KEY (recording_id) REFERENCES public.recordings(id) ON DELETE SET NULL;
  END IF;
EXCEPTION
  WHEN duplicate_object THEN NULL;
  WHEN undefined_table THEN NULL;
END $$;

-- Indexes
CREATE INDEX IF NOT EXISTS idx_meetings_processing_status
  ON public.meetings(processing_status);
