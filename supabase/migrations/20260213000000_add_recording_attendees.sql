-- Add attendees column to recordings table for speaker identification
-- Stores the attendee list provided at deploy time (from calendar or manual input)
-- Used by process-recording to match speakers to real names/emails
ALTER TABLE recordings ADD COLUMN IF NOT EXISTS attendees jsonb;
