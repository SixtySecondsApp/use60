-- Backfill meeting_id on leads table by matching owner + meeting_start (±30 min).
-- Links historical leads (created before meeting_id FK existed) to their meetings.
-- Also updates meeting_outcome based on meeting presence.

-- Step 1: Link leads to meetings by owner + time overlap
UPDATE leads l
SET meeting_id = sub.meeting_id
FROM (
  SELECT DISTINCT ON (l2.id) l2.id AS lead_id, m.id AS meeting_id
  FROM leads l2
  JOIN meetings m
    ON l2.owner_id = m.owner_user_id
    AND ABS(EXTRACT(EPOCH FROM (l2.meeting_start - m.meeting_start))) <= 1800
  WHERE l2.meeting_id IS NULL
    AND l2.meeting_start IS NOT NULL
  ORDER BY l2.id, ABS(EXTRACT(EPOCH FROM (l2.meeting_start - m.meeting_start)))
) sub
WHERE l.id = sub.lead_id;

-- Step 2: Mark past leads WITH a linked meeting as 'completed'
UPDATE leads
SET meeting_outcome = 'completed'
WHERE meeting_id IS NOT NULL
  AND meeting_outcome = 'scheduled'
  AND meeting_start < NOW();

-- Step 3: Mark past leads WITHOUT a linked meeting as 'no_show'
UPDATE leads
SET meeting_outcome = 'no_show'
WHERE meeting_id IS NULL
  AND meeting_outcome = 'scheduled'
  AND meeting_start IS NOT NULL
  AND meeting_start < NOW();
