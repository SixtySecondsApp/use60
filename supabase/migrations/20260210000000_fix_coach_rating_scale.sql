-- Fix 60 Notetaker meetings where coach_rating was written as 10-100 instead of 1-10
-- The process-recording code was doing `rating * 10` before the Phase 4 adapter layer fix.
-- Fathom and Fireflies always wrote 1-10 scale.

UPDATE meetings
SET coach_rating = coach_rating / 10.0,
    updated_at = now()
WHERE provider = '60_notetaker'
  AND coach_rating > 10;

-- Also fix in recordings table (same issue)
UPDATE recordings
SET coach_rating = coach_rating / 10.0,
    updated_at = now()
WHERE coach_rating > 10;
