-- Migration: Add organization context to notifications table
-- Story: ORG-NOTIF-001
-- Description: Add org_id and org-wide flags to support organization-level notifications

-- Step 1: Add new columns to notifications table
ALTER TABLE notifications
ADD COLUMN IF NOT EXISTS org_id UUID REFERENCES organizations(id) ON DELETE CASCADE,
ADD COLUMN IF NOT EXISTS is_org_wide BOOLEAN DEFAULT FALSE NOT NULL,
ADD COLUMN IF NOT EXISTS is_private BOOLEAN DEFAULT FALSE NOT NULL;

-- Step 2: Create index for efficient org-wide notification queries
CREATE INDEX IF NOT EXISTS idx_notifications_org_id
ON notifications(org_id);

CREATE INDEX IF NOT EXISTS idx_notifications_org_wide
ON notifications(org_id, is_org_wide)
WHERE is_org_wide = TRUE;

-- Step 3: Backfill existing notifications with org_id
-- Get org_id from the user's organization membership
UPDATE notifications n
SET org_id = om.org_id
FROM organization_memberships om
WHERE n.user_id = om.user_id
  AND n.org_id IS NULL
  AND om.member_status = 'active';

-- Step 4: Add comment for documentation
COMMENT ON COLUMN notifications.org_id IS 'Organization context for the notification (null for system/global notifications)';
COMMENT ON COLUMN notifications.is_org_wide IS 'Whether this notification should be visible to org admins/owners (not just the recipient)';
COMMENT ON COLUMN notifications.is_private IS 'Whether this notification contains sensitive information that should not be shared with admins';

-- Step 5: Verify the changes
DO $$
DECLARE
  total_count INTEGER;
  backfilled_count INTEGER;
  null_count INTEGER;
BEGIN
  SELECT COUNT(*) INTO total_count FROM notifications;
  SELECT COUNT(*) INTO backfilled_count FROM notifications WHERE org_id IS NOT NULL;
  SELECT COUNT(*) INTO null_count FROM notifications WHERE org_id IS NULL;

  RAISE NOTICE 'Migration complete:';
  RAISE NOTICE '  Total notifications: %', total_count;
  RAISE NOTICE '  With org_id: %', backfilled_count;
  RAISE NOTICE '  Without org_id (system notifications): %', null_count;
END $$;
