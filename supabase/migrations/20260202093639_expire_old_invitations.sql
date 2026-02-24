-- Add status column to organization_invitations if not exists
-- Status tracks invitation lifecycle: pending, accepted, expired, cancelled
ALTER TABLE organization_invitations
ADD COLUMN IF NOT EXISTS status text
CHECK (status IN ('pending', 'accepted', 'expired', 'cancelled'))
DEFAULT 'pending';

-- Mark old pending invitations as expired (>7 days old)
-- Only affects invitations that were never accepted (accepted_at IS NULL)
-- This is a soft expire - no data is deleted
UPDATE organization_invitations
SET status = 'expired'
WHERE accepted_at IS NULL
  AND created_at < NOW() - INTERVAL '7 days'
  AND status = 'pending';

-- Add index for efficient filtering and querying by status and date
-- Useful for cleanup operations and reporting
CREATE INDEX IF NOT EXISTS idx_invitations_status_created
ON organization_invitations(status, created_at);
