-- Migration: deduplicate_meeting_attendees
-- Date: 20260309113418
--
-- What this migration does:
--   Removes duplicate attendee rows per meeting (same email) and adds a unique
--   index on (meeting_id, lower(email)) to prevent future duplicates.
--
-- Rollback strategy:
--   DROP INDEX IF EXISTS idx_meeting_attendees_unique_email;

-- Step 1: Delete duplicate rows, keeping the first inserted (smallest id)
DELETE FROM meeting_attendees a
USING meeting_attendees b
WHERE a.meeting_id = b.meeting_id
  AND lower(a.email) = lower(b.email)
  AND a.id > b.id;

-- Step 2: Add unique index to prevent future duplicates
CREATE UNIQUE INDEX IF NOT EXISTS idx_meeting_attendees_unique_email
  ON meeting_attendees (meeting_id, lower(email));
