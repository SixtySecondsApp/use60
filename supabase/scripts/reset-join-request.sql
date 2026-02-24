-- Reset stuck join request for testing
-- This resets the join request back to 'pending' status so you can test approve/reject

-- First, let's see the current state
SELECT
  id,
  email,
  status,
  org_id,
  actioned_by,
  actioned_at,
  rejection_reason,
  requested_at
FROM organization_join_requests
WHERE org_id = 'c7ab1120-d52c-4144-94e9-8c7fbaf27ca6'
ORDER BY requested_at DESC
LIMIT 5;

-- Reset all join requests for this org back to pending
-- This allows you to test approve/reject functionality
UPDATE organization_join_requests
SET
  status = 'pending',
  actioned_by = NULL,
  actioned_at = NULL,
  rejection_reason = NULL,
  updated_at = NOW()
WHERE org_id = 'c7ab1120-d52c-4144-94e9-8c7fbaf27ca6'
  AND status IN ('approved', 'rejected');

-- Show what was reset
SELECT
  id,
  email,
  status,
  'Reset to pending' as action
FROM organization_join_requests
WHERE org_id = 'c7ab1120-d52c-4144-94e9-8c7fbaf27ca6'
  AND status = 'pending';
