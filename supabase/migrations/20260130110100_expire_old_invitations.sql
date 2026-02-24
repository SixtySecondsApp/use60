-- Expire old invitations (>7 days) and add status tracking
-- This prevents accumulation of orphaned invitations

-- Add status column if it doesn't exist
ALTER TABLE organization_invitations
ADD COLUMN IF NOT EXISTS status text
CHECK (status IN ('pending', 'accepted', 'expired', 'cancelled'))
DEFAULT 'pending';

-- Mark old pending invitations as expired
-- Only affect invitations that haven't been accepted
UPDATE organization_invitations
SET status = 'expired'
WHERE accepted_at IS NULL
  AND created_at < NOW() - INTERVAL '7 days'
  AND (status = 'pending' OR status IS NULL);

-- Create composite index for efficient expiration queries
CREATE INDEX IF NOT EXISTS idx_invitations_status_created
ON organization_invitations(status, created_at)
WHERE status IN ('pending', 'expired');

-- Create index for cleanup job queries
CREATE INDEX IF NOT EXISTS idx_invitations_pending_old
ON organization_invitations(created_at)
WHERE status = 'pending' AND accepted_at IS NULL;

-- Add comment for documentation
COMMENT ON COLUMN organization_invitations.status IS 'Invitation lifecycle status: pending (awaiting acceptance), accepted (user joined), expired (>7 days old), cancelled (manually cancelled)';

-- Log how many invitations were expired
DO $$
DECLARE
  expired_count integer;
BEGIN
  SELECT COUNT(*) INTO expired_count
  FROM organization_invitations
  WHERE status = 'expired';

  RAISE NOTICE '% invitations marked as expired', expired_count;
END $$;
