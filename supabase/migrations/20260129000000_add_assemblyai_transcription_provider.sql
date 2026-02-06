-- Migration: Add AssemblyAI as transcription provider option
-- Purpose: Enable AssemblyAI transcription for meeting recordings
-- Date: 2026-01-29

-- Update transcription_provider CHECK constraint to include 'assemblyai'
ALTER TABLE recordings
  DROP CONSTRAINT IF EXISTS recordings_transcription_provider_check;

ALTER TABLE recordings
  ADD CONSTRAINT recordings_transcription_provider_check
    CHECK (transcription_provider IN ('whisperx', 'gladia', 'deepgram', 'meetingbaas', 'assemblyai'));

-- Add comment for documentation
COMMENT ON COLUMN recordings.transcription_provider IS 
  'Transcription provider used: whisperx, gladia, deepgram, meetingbaas, or assemblyai';
