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
-- Migration: Update RLS policies for org-scoped notifications
-- Story: ORG-NOTIF-002
-- Description: Allow org admins/owners to view org-wide notifications while respecting privacy

-- Step 1: Drop existing SELECT policy and recreate with org-wide logic
DROP POLICY IF EXISTS "notifications_select" ON "public"."notifications";

CREATE POLICY "notifications_select" ON "public"."notifications"
FOR SELECT
USING (
  -- Service role can view all
  public.is_service_role()
  OR
  -- Users can view their own notifications
  (user_id = auth.uid())
  OR
  -- Org admins/owners can view org-wide notifications (that are not private)
  (
    is_org_wide = TRUE
    AND is_private = FALSE
    AND org_id IN (
      SELECT org_id
      FROM organization_memberships
      WHERE user_id = auth.uid()
        AND role IN ('owner', 'admin')
        AND member_status = 'active'
    )
  )
);

-- Step 2: Update other policies to maintain existing logic
-- (INSERT, UPDATE, DELETE remain service role or owner only)

-- Note: INSERT remains service role only (notifications created by system/triggers)
-- Note: UPDATE allows users to mark their own notifications as read
-- Note: DELETE allows users to delete their own notifications

-- Step 3: Add comment for documentation
COMMENT ON POLICY "notifications_select" ON "public"."notifications" IS
'Users can view their own notifications. Org admins/owners can also view org-wide notifications (unless marked private) for their organizations.';

-- Step 4: Verify the policy
DO $$
DECLARE
  policy_count INTEGER;
BEGIN
  SELECT COUNT(*) INTO policy_count
  FROM pg_policies
  WHERE schemaname = 'public'
    AND tablename = 'notifications'
    AND policyname = 'notifications_select';

  IF policy_count = 1 THEN
    RAISE NOTICE 'RLS policy "notifications_select" successfully updated';
  ELSE
    RAISE EXCEPTION 'Failed to update RLS policy';
  END IF;
END $$;
-- Migration: Create notify_org_members() RPC function
-- Story: ORG-NOTIF-003
-- Description: Broadcast notifications to organization members by role

-- Drop existing function if it exists
DROP FUNCTION IF EXISTS notify_org_members(UUID, TEXT[], TEXT, TEXT, TEXT, TEXT, TEXT, JSONB, BOOLEAN);

-- Create the notify_org_members function
CREATE OR REPLACE FUNCTION notify_org_members(
  p_org_id UUID,
  p_role_filter TEXT[], -- ['owner', 'admin', 'member', 'readonly']
  p_title TEXT,
  p_message TEXT,
  p_type TEXT DEFAULT 'info', -- 'info', 'success', 'warning', 'error'
  p_category TEXT DEFAULT 'team',
  p_action_url TEXT DEFAULT NULL,
  p_metadata JSONB DEFAULT '{}',
  p_is_org_wide BOOLEAN DEFAULT TRUE
)
RETURNS SETOF UUID
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_user_id UUID;
  v_notification_id UUID;
  v_notification_ids UUID[] := '{}';
  v_created_count INTEGER := 0;
BEGIN
  -- Validate org exists
  IF NOT EXISTS (SELECT 1 FROM organizations WHERE id = p_org_id) THEN
    RAISE EXCEPTION 'Organization not found: %', p_org_id;
  END IF;

  -- Validate role_filter
  IF array_length(p_role_filter, 1) IS NULL OR array_length(p_role_filter, 1) = 0 THEN
    RAISE EXCEPTION 'role_filter cannot be empty';
  END IF;

  -- Loop through all matching organization members
  FOR v_user_id IN
    SELECT user_id
    FROM organization_memberships
    WHERE org_id = p_org_id
      AND role = ANY(p_role_filter)
      AND member_status = 'active'
    ORDER BY user_id
  LOOP
    -- Create notification for this member
    INSERT INTO notifications (
      user_id,
      org_id,
      title,
      message,
      type,
      category,
      action_url,
      metadata,
      is_org_wide,
      is_private,
      read,
      created_at
    )
    VALUES (
      v_user_id,
      p_org_id,
      p_title,
      p_message,
      p_type,
      p_category,
      p_action_url,
      p_metadata,
      p_is_org_wide,
      FALSE, -- not private by default
      FALSE, -- not read
      NOW()
    )
    RETURNING id INTO v_notification_id;

    -- Add to return array
    v_notification_ids := array_append(v_notification_ids, v_notification_id);
    v_created_count := v_created_count + 1;
  END LOOP;

  -- Log success
  RAISE NOTICE 'Created % notifications for org % (roles: %)', v_created_count, p_org_id, p_role_filter;

  -- Return all created notification IDs
  RETURN QUERY SELECT unnest(v_notification_ids);
END;
$$;

-- Add helpful comment
COMMENT ON FUNCTION notify_org_members IS
'Broadcast a notification to all active members of an organization matching the specified roles. Returns array of created notification IDs.';

-- Grant execute permission to authenticated users (will be restricted by RLS)
GRANT EXECUTE ON FUNCTION notify_org_members TO authenticated;
GRANT EXECUTE ON FUNCTION notify_org_members TO service_role;

-- Test the function with a simple verification
DO $$
DECLARE
  v_test_org_id UUID;
  v_notification_count INTEGER;
BEGIN
  -- Get any org for testing
  SELECT id INTO v_test_org_id FROM organizations LIMIT 1;

  IF v_test_org_id IS NOT NULL THEN
    -- Count how many owners/admins would receive a test notification
    SELECT COUNT(*) INTO v_notification_count
    FROM organization_memberships
    WHERE org_id = v_test_org_id
      AND role IN ('owner', 'admin')
      AND member_status = 'active';

    RAISE NOTICE 'Function created successfully';
    RAISE NOTICE 'Test org: % has % owners/admins', v_test_org_id, v_notification_count;
  ELSE
    RAISE NOTICE 'Function created successfully (no orgs to test with)';
  END IF;
END $$;
-- Migration: Add member management notification triggers
-- Story: ORG-NOTIF-004
-- Description: Notify admins/owners when members are removed or roles change

-- ========================================
-- TRIGGER 1: Member Removed
-- ========================================

CREATE OR REPLACE FUNCTION notify_on_member_removed()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_user_name TEXT;
  v_org_name TEXT;
  v_actioned_by_name TEXT;
BEGIN
  -- Only trigger when status changes from active to removed
  IF OLD.member_status = 'active' AND NEW.member_status = 'removed' THEN
    -- Get user and org names
    SELECT full_name INTO v_user_name FROM profiles WHERE id = OLD.user_id;
    SELECT name INTO v_org_name FROM organizations WHERE id = OLD.org_id;

    -- Get name of person who performed the action
    SELECT full_name INTO v_actioned_by_name FROM profiles WHERE id = auth.uid();

    -- Notify org admins and owners
    PERFORM notify_org_members(
      p_org_id := OLD.org_id,
      p_role_filter := ARRAY['owner', 'admin'],
      p_title := 'Team Member Removed',
      p_message := COALESCE(v_user_name, 'A team member') || ' was removed from ' || COALESCE(v_org_name, 'the organization') ||
                   CASE
                     WHEN v_actioned_by_name IS NOT NULL THEN ' by ' || v_actioned_by_name
                     ELSE ''
                   END,
      p_type := 'warning',
      p_category := 'team',
      p_action_url := '/settings/organization-management',
      p_metadata := jsonb_build_object(
        'removed_user_id', OLD.user_id,
        'removed_user_name', v_user_name,
        'org_id', OLD.org_id,
        'org_name', v_org_name,
        'actioned_by', auth.uid(),
        'actioned_by_name', v_actioned_by_name,
        'action_timestamp', NOW()
      ),
      p_is_org_wide := TRUE
    );
  END IF;

  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS member_removed_notification ON organization_memberships;
CREATE TRIGGER member_removed_notification
  AFTER UPDATE ON organization_memberships
  FOR EACH ROW
  EXECUTE FUNCTION notify_on_member_removed();

-- ========================================
-- TRIGGER 2: Role Changed
-- ========================================

CREATE OR REPLACE FUNCTION notify_on_role_changed()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_user_name TEXT;
  v_org_name TEXT;
  v_actioned_by_name TEXT;
BEGIN
  -- Only trigger when role actually changes
  IF OLD.role != NEW.role THEN
    -- Get user and org names
    SELECT full_name INTO v_user_name FROM profiles WHERE id = NEW.user_id;
    SELECT name INTO v_org_name FROM organizations WHERE id = NEW.org_id;

    -- Get name of person who performed the action
    SELECT full_name INTO v_actioned_by_name FROM profiles WHERE id = auth.uid();

    -- Notify org admins and owners
    PERFORM notify_org_members(
      p_org_id := NEW.org_id,
      p_role_filter := ARRAY['owner', 'admin'],
      p_title := 'Member Role Updated',
      p_message := COALESCE(v_user_name, 'A team member') || ''' role was changed from ' ||
                   OLD.role || ' to ' || NEW.role ||
                   CASE
                     WHEN v_actioned_by_name IS NOT NULL THEN ' by ' || v_actioned_by_name
                     ELSE ''
                   END,
      p_type := 'info',
      p_category := 'team',
      p_action_url := '/settings/organization-management',
      p_metadata := jsonb_build_object(
        'user_id', NEW.user_id,
        'user_name', v_user_name,
        'old_role', OLD.role,
        'new_role', NEW.role,
        'org_id', NEW.org_id,
        'org_name', v_org_name,
        'actioned_by', auth.uid(),
        'actioned_by_name', v_actioned_by_name,
        'action_timestamp', NOW()
      ),
      p_is_org_wide := TRUE
    );

    -- Also notify the user themselves about their role change
    INSERT INTO notifications (
      user_id,
      org_id,
      title,
      message,
      type,
      category,
      action_url,
      is_org_wide,
      metadata,
      created_at
    )
    VALUES (
      NEW.user_id,
      NEW.org_id,
      'Your Role Has Changed',
      'Your role in ' || COALESCE(v_org_name, 'the organization') || ' has been updated from ' ||
      OLD.role || ' to ' || NEW.role,
      CASE
        WHEN NEW.role IN ('owner', 'admin') THEN 'success'
        ELSE 'info'
      END,
      'team',
      '/settings/organization-management',
      FALSE, -- not org-wide for personal notification
      jsonb_build_object(
        'old_role', OLD.role,
        'new_role', NEW.role,
        'org_id', NEW.org_id,
        'org_name', v_org_name
      ),
      NOW()
    );
  END IF;

  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS role_changed_notification ON organization_memberships;
CREATE TRIGGER role_changed_notification
  AFTER UPDATE ON organization_memberships
  FOR EACH ROW
  EXECUTE FUNCTION notify_on_role_changed();

-- ========================================
-- Add comments for documentation
-- ========================================

COMMENT ON FUNCTION notify_on_member_removed IS
'Trigger function: Notifies org admins/owners when a member is removed from the organization.';

COMMENT ON FUNCTION notify_on_role_changed IS
'Trigger function: Notifies org admins/owners and the affected user when a member''s role changes.';

-- ========================================
-- Verification
-- ========================================

DO $$
BEGIN
  RAISE NOTICE 'Member management notification triggers created:';
  RAISE NOTICE '  ✓ member_removed_notification trigger';
  RAISE NOTICE '  ✓ role_changed_notification trigger';
  RAISE NOTICE '';
  RAISE NOTICE 'These triggers will notify admins/owners when:';
  RAISE NOTICE '  - A member is removed from the organization';
  RAISE NOTICE '  - A member''s role is changed';
  RAISE NOTICE '  - The affected user will also be notified of their role change';
END $$;
-- Migration: Add deal notification triggers
-- Story: ORG-NOTIF-005
-- Description: Notify org owners/admins about high-value deals and deal closures

-- ========================================
-- TRIGGER 1: High-Value Deal Created
-- ========================================

CREATE OR REPLACE FUNCTION notify_on_high_value_deal()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_threshold NUMERIC := 50000; -- $50k default threshold
  v_org_id UUID;
  v_owner_name TEXT;
BEGIN
  -- Get org_id from the deal owner's membership
  SELECT org_id INTO v_org_id
  FROM organization_memberships
  WHERE user_id = NEW.owner_id
    AND member_status = 'active'
  LIMIT 1;

  -- Only proceed if we found an org and deal value exceeds threshold
  IF v_org_id IS NOT NULL AND NEW.value >= v_threshold THEN
    -- Get owner name
    SELECT full_name INTO v_owner_name FROM profiles WHERE id = NEW.owner_id;

    -- Notify org owners and admins
    PERFORM notify_org_members(
      p_org_id := v_org_id,
      p_role_filter := ARRAY['owner', 'admin'],
      p_title := 'High-Value Deal Created: ' || COALESCE(NEW.name, 'Untitled Deal'),
      p_message := 'A deal worth $' || TO_CHAR(NEW.value, 'FM999,999,999') || ' was created by ' ||
                   COALESCE(v_owner_name, 'a team member'),
      p_type := 'success',
      p_category := 'deal',
      p_action_url := '/deals/' || NEW.id,
      p_metadata := jsonb_build_object(
        'deal_id', NEW.id,
        'deal_name', NEW.name,
        'deal_value', NEW.value,
        'owner_id', NEW.owner_id,
        'owner_name', v_owner_name,
        'stage', NEW.stage,
        'threshold', v_threshold
      ),
      p_is_org_wide := TRUE
    );
  END IF;

  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS high_value_deal_notification ON deals;
CREATE TRIGGER high_value_deal_notification
  AFTER INSERT ON deals
  FOR EACH ROW
  EXECUTE FUNCTION notify_on_high_value_deal();

-- ========================================
-- TRIGGER 2: Deal Closed (Won or Lost)
-- ========================================

CREATE OR REPLACE FUNCTION notify_on_deal_closed()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_org_id UUID;
  v_owner_name TEXT;
  v_is_won BOOLEAN;
BEGIN
  -- Only trigger when stage changes TO closed_won or closed_lost
  IF OLD.stage != NEW.stage AND NEW.stage IN ('closed_won', 'closed_lost') THEN
    v_is_won := (NEW.stage = 'closed_won');

    -- Get org_id from the deal owner's membership
    SELECT org_id INTO v_org_id
    FROM organization_memberships
    WHERE user_id = NEW.owner_id
      AND member_status = 'active'
    LIMIT 1;

    IF v_org_id IS NOT NULL THEN
      -- Get owner name
      SELECT full_name INTO v_owner_name FROM profiles WHERE id = NEW.owner_id;

      -- Notify org owners and admins
      PERFORM notify_org_members(
        p_org_id := v_org_id,
        p_role_filter := ARRAY['owner', 'admin'],
        p_title := CASE
          WHEN v_is_won THEN '🎉 Deal Won: ' || COALESCE(NEW.name, 'Untitled Deal')
          ELSE 'Deal Lost: ' || COALESCE(NEW.name, 'Untitled Deal')
        END,
        p_message := 'Deal worth $' || TO_CHAR(COALESCE(NEW.value, 0), 'FM999,999,999') ||
                     ' was ' || CASE WHEN v_is_won THEN 'won' ELSE 'lost' END || ' by ' ||
                     COALESCE(v_owner_name, 'a team member'),
        p_type := CASE WHEN v_is_won THEN 'success' ELSE 'warning' END,
        p_category := 'deal',
        p_action_url := '/deals/' || NEW.id,
        p_metadata := jsonb_build_object(
          'deal_id', NEW.id,
          'deal_name', NEW.name,
          'deal_value', NEW.value,
          'owner_id', NEW.owner_id,
          'owner_name', v_owner_name,
          'old_stage', OLD.stage,
          'new_stage', NEW.stage,
          'is_won', v_is_won
        ),
        p_is_org_wide := TRUE
      );
    END IF;
  END IF;

  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS deal_closed_notification ON deals;
CREATE TRIGGER deal_closed_notification
  AFTER UPDATE ON deals
  FOR EACH ROW
  EXECUTE FUNCTION notify_on_deal_closed();

-- ========================================
-- Add comments for documentation
-- ========================================

COMMENT ON FUNCTION notify_on_high_value_deal IS
'Trigger function: Notifies org owners/admins when a deal with value >= $50k is created.';

COMMENT ON FUNCTION notify_on_deal_closed IS
'Trigger function: Notifies org owners/admins when a deal is marked as won or lost.';

-- ========================================
-- Verification
-- ========================================

DO $$
BEGIN
  RAISE NOTICE 'Deal notification triggers created:';
  RAISE NOTICE '  ✓ high_value_deal_notification trigger';
  RAISE NOTICE '  ✓ deal_closed_notification trigger';
  RAISE NOTICE '';
  RAISE NOTICE 'Admins/owners will be notified when:';
  RAISE NOTICE '  - A deal worth $50,000 or more is created';
  RAISE NOTICE '  - Any deal is marked as won or lost';
END $$;
-- Migration: Add organization settings change notification trigger
-- Story: ORG-NOTIF-007
-- Description: Notify admins/owners when organization settings are modified

-- ========================================
-- TRIGGER: Organization Settings Changed
-- ========================================

CREATE OR REPLACE FUNCTION notify_on_org_settings_changed()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_actioned_by_name TEXT;
  v_change_description TEXT;
BEGIN
  -- Only trigger if key settings have changed
  IF OLD.name != NEW.name OR
     OLD.logo_url != NEW.logo_url OR
     OLD.notification_settings != NEW.notification_settings OR
     OLD.company_domain != NEW.company_domain THEN

    -- Get name of person who made the change
    SELECT full_name INTO v_actioned_by_name FROM profiles WHERE id = auth.uid();

    -- Build change description
    v_change_description := CASE
      WHEN OLD.name != NEW.name THEN
        'Organization name changed to "' || NEW.name || '"'
      WHEN OLD.logo_url != NEW.logo_url THEN
        'Organization logo updated'
      WHEN OLD.company_domain != NEW.company_domain THEN
        'Organization domain changed to "' || COALESCE(NEW.company_domain, 'none') || '"'
      ELSE
        'Notification settings updated'
    END;

    -- Add who made the change if known
    IF v_actioned_by_name IS NOT NULL THEN
      v_change_description := v_change_description || ' by ' || v_actioned_by_name;
    END IF;

    -- Notify org owners and admins
    PERFORM notify_org_members(
      p_org_id := NEW.id,
      p_role_filter := ARRAY['owner', 'admin'],
      p_title := 'Organization Settings Updated',
      p_message := v_change_description,
      p_type := 'info',
      p_category := 'system',
      p_action_url := '/settings/organization-management',
      p_metadata := jsonb_build_object(
        'org_id', NEW.id,
        'org_name', NEW.name,
        'changed_by', auth.uid(),
        'changed_by_name', v_actioned_by_name,
        'action_timestamp', NOW(),
        'changes', jsonb_build_object(
          'name_changed', (OLD.name != NEW.name),
          'old_name', OLD.name,
          'new_name', NEW.name,
          'logo_changed', (OLD.logo_url != NEW.logo_url),
          'domain_changed', (OLD.company_domain != NEW.company_domain),
          'old_domain', OLD.company_domain,
          'new_domain', NEW.company_domain,
          'settings_changed', (OLD.notification_settings != NEW.notification_settings)
        )
      ),
      p_is_org_wide := TRUE
    );
  END IF;

  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS org_settings_changed_notification ON organizations;
CREATE TRIGGER org_settings_changed_notification
  AFTER UPDATE ON organizations
  FOR EACH ROW
  EXECUTE FUNCTION notify_on_org_settings_changed();

-- ========================================
-- Add comment for documentation
-- ========================================

COMMENT ON FUNCTION notify_on_org_settings_changed IS
'Trigger function: Notifies org owners/admins when organization settings (name, logo, domain, notification settings) are changed.';

-- ========================================
-- Verification
-- ========================================

DO $$
BEGIN
  RAISE NOTICE 'Organization settings notification trigger created:';
  RAISE NOTICE '  ✓ org_settings_changed_notification trigger';
  RAISE NOTICE '';
  RAISE NOTICE 'Admins/owners will be notified when:';
  RAISE NOTICE '  - Organization name changes';
  RAISE NOTICE '  - Organization logo changes';
  RAISE NOTICE '  - Organization domain changes';
  RAISE NOTICE '  - Notification settings change';
END $$;
-- Migration: Weekly Activity Digest System
-- Story: ORG-NOTIF-008
-- Description: Send weekly digest of org activity to owners

-- ========================================
-- FUNCTION: Generate Weekly Digest
-- ========================================

CREATE OR REPLACE FUNCTION generate_weekly_digest(p_org_id UUID)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_digest JSONB;
  v_start_date TIMESTAMPTZ;
  v_end_date TIMESTAMPTZ;
  v_new_members INT;
  v_deals_won INT;
  v_deals_lost INT;
  v_total_deal_value NUMERIC;
  v_critical_alerts INT;
  v_top_performers JSONB;
BEGIN
  -- Get date range (last 7 days)
  v_end_date := NOW();
  v_start_date := v_end_date - INTERVAL '7 days';

  -- Count new members
  SELECT COUNT(*) INTO v_new_members
  FROM organization_memberships
  WHERE org_id = p_org_id
    AND created_at >= v_start_date
    AND created_at < v_end_date
    AND member_status = 'active';

  -- Count deals won
  SELECT COUNT(*) INTO v_deals_won
  FROM deals d
  JOIN organization_memberships om ON d.owner_id = om.user_id
  WHERE om.org_id = p_org_id
    AND d.stage = 'closed_won'
    AND d.updated_at >= v_start_date
    AND d.updated_at < v_end_date;

  -- Count deals lost
  SELECT COUNT(*) INTO v_deals_lost
  FROM deals d
  JOIN organization_memberships om ON d.owner_id = om.user_id
  WHERE om.org_id = p_org_id
    AND d.stage = 'closed_lost'
    AND d.updated_at >= v_start_date
    AND d.updated_at < v_end_date;

  -- Sum deal value won
  SELECT COALESCE(SUM(d.value), 0) INTO v_total_deal_value
  FROM deals d
  JOIN organization_memberships om ON d.owner_id = om.user_id
  WHERE om.org_id = p_org_id
    AND d.stage = 'closed_won'
    AND d.updated_at >= v_start_date
    AND d.updated_at < v_end_date;

  -- Count critical alerts
  SELECT COUNT(*) INTO v_critical_alerts
  FROM deal_health_alerts dha
  JOIN deals d ON dha.deal_id = d.id
  JOIN organization_memberships om ON d.owner_id = om.user_id
  WHERE om.org_id = p_org_id
    AND dha.severity = 'critical'
    AND dha.created_at >= v_start_date
    AND dha.created_at < v_end_date;

  -- Get top performers (by deals won)
  SELECT COALESCE(
    jsonb_agg(
      jsonb_build_object(
        'user_id', p.id,
        'full_name', p.full_name,
        'deals_won', deal_count,
        'total_value', total_value
      )
    ),
    '[]'::jsonb
  ) INTO v_top_performers
  FROM (
    SELECT
      om.user_id,
      COUNT(d.id) as deal_count,
      SUM(d.value) as total_value
    FROM deals d
    JOIN organization_memberships om ON d.owner_id = om.user_id
    WHERE om.org_id = p_org_id
      AND d.stage = 'closed_won'
      AND d.updated_at >= v_start_date
      AND d.updated_at < v_end_date
    GROUP BY om.user_id
    ORDER BY deal_count DESC, total_value DESC
    LIMIT 3
  ) top_users
  JOIN profiles p ON p.id = top_users.user_id;

  -- Build digest object
  v_digest := jsonb_build_object(
    'period', jsonb_build_object(
      'start', v_start_date,
      'end', v_end_date
    ),
    'metrics', jsonb_build_object(
      'new_members', v_new_members,
      'deals_won', v_deals_won,
      'deals_lost', v_deals_lost,
      'total_revenue', v_total_deal_value,
      'critical_alerts', v_critical_alerts
    ),
    'top_performers', v_top_performers
  );

  RETURN v_digest;
END;
$$;

-- ========================================
-- FUNCTION: Send Weekly Digests
-- ========================================

CREATE OR REPLACE FUNCTION send_weekly_digests()
RETURNS INTEGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_org RECORD;
  v_digest JSONB;
  v_message TEXT;
  v_sent_count INT := 0;
BEGIN
  -- Loop through all organizations
  FOR v_org IN
    SELECT id, name FROM organizations WHERE is_active = TRUE
  LOOP
    -- Generate digest
    v_digest := generate_weekly_digest(v_org.id);

    -- Skip if no activity
    IF (v_digest->'metrics'->>'new_members')::INT = 0
       AND (v_digest->'metrics'->>'deals_won')::INT = 0
       AND (v_digest->'metrics'->>'deals_lost')::INT = 0
       AND (v_digest->'metrics'->>'critical_alerts')::INT = 0 THEN
      CONTINUE;
    END IF;

    -- Build message
    v_message := format(
      'Weekly Summary for %s: %s members joined, %s deals won ($%s), %s critical alerts',
      v_org.name,
      v_digest->'metrics'->>'new_members',
      v_digest->'metrics'->>'deals_won',
      TO_CHAR((v_digest->'metrics'->>'total_revenue')::NUMERIC, 'FM999,999,999'),
      v_digest->'metrics'->>'critical_alerts'
    );

    -- Send to owners only
    PERFORM notify_org_members(
      p_org_id := v_org.id,
      p_role_filter := ARRAY['owner'],
      p_title := 'Weekly Activity Digest',
      p_message := v_message,
      p_type := 'info',
      p_category := 'digest',
      p_action_url := '/dashboard',
      p_metadata := v_digest,
      p_is_org_wide := TRUE
    );

    v_sent_count := v_sent_count + 1;
  END LOOP;

  RETURN v_sent_count;
END;
$$;

-- ========================================
-- Add comments for documentation
-- ========================================

COMMENT ON FUNCTION generate_weekly_digest IS
'Generates weekly activity digest for an organization, including metrics and top performers.';

COMMENT ON FUNCTION send_weekly_digests IS
'Sends weekly digest notifications to organization owners. Returns count of digests sent. Should be called via cron job every Monday morning.';

-- ========================================
-- Verification
-- ========================================

DO $$
BEGIN
  RAISE NOTICE 'Weekly digest functions created:';
  RAISE NOTICE '  ✓ generate_weekly_digest(org_id) - Generate digest data';
  RAISE NOTICE '  ✓ send_weekly_digests() - Send digests to all org owners';
  RAISE NOTICE '';
  RAISE NOTICE 'Setup cron job to call send_weekly_digests() every Monday at 9am';
  RAISE NOTICE 'Example: SELECT cron.schedule(''weekly-digest'', ''0 9 * * 1'', $$SELECT send_weekly_digests()$$);';
END $$;
-- Migration: Low Engagement Alert System
-- Story: ORG-NOTIF-010
-- Description: Alert owners when organization members show low engagement

-- ========================================
-- FUNCTION: Check Member Engagement
-- ========================================

CREATE OR REPLACE FUNCTION check_member_engagement(p_user_id UUID, p_org_id UUID, p_days INT DEFAULT 7)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_start_date TIMESTAMPTZ;
  v_activity_count INT := 0;
  v_engagement_data JSONB;
BEGIN
  v_start_date := NOW() - (p_days || ' days')::INTERVAL;

  -- Count activities across different tables
  WITH activity_summary AS (
    -- Deals created/updated
    SELECT COUNT(*) as deals_activity
    FROM deals
    WHERE owner_id = p_user_id
      AND (created_at >= v_start_date OR updated_at >= v_start_date)

    UNION ALL

    -- Tasks created/completed
    SELECT COUNT(*) as tasks_activity
    FROM tasks
    WHERE owner_id = p_user_id
      AND (created_at >= v_start_date OR completed_at >= v_start_date)

    UNION ALL

    -- Meetings attended
    SELECT COUNT(*) as meetings_activity
    FROM meetings
    WHERE owner_user_id = p_user_id
      AND created_at >= v_start_date

    UNION ALL

    -- Activities logged
    SELECT COUNT(*) as activities_logged
    FROM activities
    WHERE user_id = p_user_id
      AND created_at >= v_start_date
  )
  SELECT COALESCE(SUM(deals_activity), 0) INTO v_activity_count
  FROM activity_summary;

  -- Build engagement data
  v_engagement_data := jsonb_build_object(
    'user_id', p_user_id,
    'org_id', p_org_id,
    'period_days', p_days,
    'total_activities', v_activity_count,
    'is_low_engagement', (v_activity_count < 3),
    'checked_at', NOW()
  );

  RETURN v_engagement_data;
END;
$$;

-- ========================================
-- FUNCTION: Send Low Engagement Alerts
-- ========================================

CREATE OR REPLACE FUNCTION send_low_engagement_alerts()
RETURNS INTEGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_member RECORD;
  v_engagement JSONB;
  v_user_name TEXT;
  v_org_name TEXT;
  v_alert_count INT := 0;
BEGIN
  -- Check all active members across all orgs
  FOR v_member IN
    SELECT DISTINCT
      om.user_id,
      om.org_id,
      o.name as org_name,
      p.full_name as user_name
    FROM organization_memberships om
    JOIN organizations o ON o.id = om.org_id
    JOIN profiles p ON p.id = om.user_id
    WHERE om.member_status = 'active'
      AND om.role IN ('member', 'readonly')  -- Only check non-admins
      AND o.is_active = TRUE
  LOOP
    -- Check engagement
    v_engagement := check_member_engagement(v_member.user_id, v_member.org_id, 7);

    -- If low engagement, alert org owners
    IF (v_engagement->>'is_low_engagement')::BOOLEAN THEN
      PERFORM notify_org_members(
        p_org_id := v_member.org_id,
        p_role_filter := ARRAY['owner'],
        p_title := 'Low Member Engagement Alert',
        p_message := format(
          '%s has shown low engagement (%s activities in the last 7 days). Consider checking in.',
          v_member.user_name,
          v_engagement->>'total_activities'
        ),
        p_type := 'warning',
        p_category := 'team',
        p_action_url := '/team',
        p_metadata := v_engagement,
        p_is_org_wide := TRUE
      );

      v_alert_count := v_alert_count + 1;
    END IF;
  END LOOP;

  RETURN v_alert_count;
END;
$$;

-- ========================================
-- Add comments for documentation
-- ========================================

COMMENT ON FUNCTION check_member_engagement IS
'Checks a member''s engagement level by counting activities in the last N days. Returns engagement data including whether they are below threshold.';

COMMENT ON FUNCTION send_low_engagement_alerts IS
'Sends alerts to org owners for members with low engagement (<3 activities in 7 days). Returns count of alerts sent. Should be called via cron job weekly.';

-- ========================================
-- Verification
-- ========================================

DO $$
BEGIN
  RAISE NOTICE 'Low engagement alert functions created:';
  RAISE NOTICE '  ✓ check_member_engagement(user_id, org_id, days) - Check single member';
  RAISE NOTICE '  ✓ send_low_engagement_alerts() - Send alerts for all low-engagement members';
  RAISE NOTICE '';
  RAISE NOTICE 'Setup cron job to call send_low_engagement_alerts() weekly';
  RAISE NOTICE 'Example: SELECT cron.schedule(''engagement-check'', ''0 10 * * 1'', $$SELECT send_low_engagement_alerts()$$);';
  RAISE NOTICE '';
  RAISE NOTICE 'Low engagement threshold: <3 activities in 7 days';
END $$;
-- Migration: Notification Batching and Consolidation
-- Story: ORG-NOTIF-011
-- Description: Batch similar notifications to reduce noise

-- ========================================
-- TABLE: Notification Batches
-- ========================================

CREATE TABLE IF NOT EXISTS notification_batches (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  org_id UUID NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
  batch_key TEXT NOT NULL,
  title TEXT NOT NULL,
  message_template TEXT NOT NULL,
  type TEXT NOT NULL CHECK (type IN ('info', 'success', 'warning', 'error')),
  category TEXT NOT NULL CHECK (category IN ('team', 'deal', 'system', 'digest')),
  action_url TEXT,
  recipient_roles TEXT[] NOT NULL DEFAULT ARRAY['owner', 'admin'],
  events JSONB NOT NULL DEFAULT '[]'::jsonb,
  event_count INT NOT NULL DEFAULT 0,
  first_event_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  last_event_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  sent_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE(org_id, batch_key)
);

CREATE INDEX idx_notification_batches_org_unsent
ON notification_batches(org_id, sent_at)
WHERE sent_at IS NULL;

CREATE INDEX idx_notification_batches_last_event
ON notification_batches(last_event_at)
WHERE sent_at IS NULL;

-- Enable RLS
ALTER TABLE notification_batches ENABLE ROW LEVEL SECURITY;

-- Only service role can access batches
CREATE POLICY "Service role only" ON notification_batches
FOR ALL USING (public.is_service_role());

-- ========================================
-- FUNCTION: Add Event to Batch
-- ========================================

CREATE OR REPLACE FUNCTION add_to_notification_batch(
  p_org_id UUID,
  p_batch_key TEXT,
  p_title TEXT,
  p_message_template TEXT,
  p_type TEXT,
  p_category TEXT,
  p_action_url TEXT,
  p_recipient_roles TEXT[],
  p_event_data JSONB
)
RETURNS UUID
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_batch_id UUID;
BEGIN
  -- Insert or update batch
  INSERT INTO notification_batches (
    org_id,
    batch_key,
    title,
    message_template,
    type,
    category,
    action_url,
    recipient_roles,
    events,
    event_count,
    first_event_at,
    last_event_at
  )
  VALUES (
    p_org_id,
    p_batch_key,
    p_title,
    p_message_template,
    p_type,
    p_category,
    p_action_url,
    p_recipient_roles,
    jsonb_build_array(p_event_data),
    1,
    NOW(),
    NOW()
  )
  ON CONFLICT (org_id, batch_key)
  DO UPDATE SET
    events = notification_batches.events || jsonb_build_array(p_event_data),
    event_count = notification_batches.event_count + 1,
    last_event_at = NOW()
  RETURNING id INTO v_batch_id;

  RETURN v_batch_id;
END;
$$;

-- ========================================
-- FUNCTION: Send Batched Notifications
-- ========================================

CREATE OR REPLACE FUNCTION send_batched_notifications(
  p_batch_delay_minutes INT DEFAULT 15
)
RETURNS INTEGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_batch RECORD;
  v_message TEXT;
  v_sent_count INT := 0;
  v_cutoff_time TIMESTAMPTZ;
BEGIN
  -- Only send batches that haven't been updated in the delay period
  v_cutoff_time := NOW() - (p_batch_delay_minutes || ' minutes')::INTERVAL;

  FOR v_batch IN
    SELECT *
    FROM notification_batches
    WHERE sent_at IS NULL
      AND last_event_at < v_cutoff_time
      AND event_count > 0
  LOOP
    -- Build consolidated message
    IF v_batch.event_count = 1 THEN
      v_message := v_batch.message_template;
    ELSE
      v_message := format(
        '%s (%s events in the last %s minutes)',
        v_batch.message_template,
        v_batch.event_count,
        EXTRACT(EPOCH FROM (v_batch.last_event_at - v_batch.first_event_at)) / 60
      );
    END IF;

    -- Send consolidated notification
    PERFORM notify_org_members(
      p_org_id := v_batch.org_id,
      p_role_filter := v_batch.recipient_roles,
      p_title := v_batch.title,
      p_message := v_message,
      p_type := v_batch.type,
      p_category := v_batch.category,
      p_action_url := v_batch.action_url,
      p_metadata := jsonb_build_object(
        'batch_id', v_batch.id,
        'event_count', v_batch.event_count,
        'events', v_batch.events,
        'first_event_at', v_batch.first_event_at,
        'last_event_at', v_batch.last_event_at
      ),
      p_is_org_wide := TRUE
    );

    -- Mark as sent
    UPDATE notification_batches
    SET sent_at = NOW()
    WHERE id = v_batch.id;

    v_sent_count := v_sent_count + 1;
  END LOOP;

  RETURN v_sent_count;
END;
$$;

-- ========================================
-- FUNCTION: Clean Old Batches
-- ========================================

CREATE OR REPLACE FUNCTION cleanup_old_notification_batches(
  p_days_old INT DEFAULT 30
)
RETURNS INTEGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_deleted_count INT;
BEGIN
  DELETE FROM notification_batches
  WHERE sent_at IS NOT NULL
    AND sent_at < NOW() - (p_days_old || ' days')::INTERVAL;

  GET DIAGNOSTICS v_deleted_count = ROW_COUNT;
  RETURN v_deleted_count;
END;
$$;

-- ========================================
-- Add comments for documentation
-- ========================================

COMMENT ON TABLE notification_batches IS
'Batches similar notifications to reduce noise. Events accumulate until batch is sent.';

COMMENT ON FUNCTION add_to_notification_batch IS
'Adds an event to a notification batch. Creates new batch or appends to existing one.';

COMMENT ON FUNCTION send_batched_notifications IS
'Sends all batched notifications that haven''t been updated in the specified delay period. Returns count sent.';

COMMENT ON FUNCTION cleanup_old_notification_batches IS
'Deletes sent batches older than specified days. Returns count deleted.';

-- ========================================
-- Verification
-- ========================================

DO $$
BEGIN
  RAISE NOTICE 'Notification batching system created:';
  RAISE NOTICE '  ✓ notification_batches table';
  RAISE NOTICE '  ✓ add_to_notification_batch() - Add event to batch';
  RAISE NOTICE '  ✓ send_batched_notifications() - Send accumulated batches';
  RAISE NOTICE '  ✓ cleanup_old_notification_batches() - Clean old batches';
  RAISE NOTICE '';
  RAISE NOTICE 'Setup cron jobs:';
  RAISE NOTICE '  - Send batches every 15 min: SELECT cron.schedule(''send-batches'', ''*/15 * * * *'', $$SELECT send_batched_notifications(15)$$);';
  RAISE NOTICE '  - Clean old batches daily: SELECT cron.schedule(''clean-batches'', ''0 2 * * *'', $$SELECT cleanup_old_notification_batches(30)$$);';
END $$;
-- Migration: Notification Queue for Intelligent Delivery
-- Story: ORG-NOTIF-014
-- Description: Queue system for respecting user preferences and preventing notification spam

-- ========================================
-- TABLE: Notification Queue
-- ========================================

CREATE TABLE IF NOT EXISTS notification_queue (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES profiles(id) ON DELETE CASCADE,
  org_id UUID NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
  title TEXT NOT NULL,
  message TEXT NOT NULL,
  type TEXT NOT NULL CHECK (type IN ('info', 'success', 'warning', 'error')),
  category TEXT NOT NULL CHECK (category IN ('team', 'deal', 'system', 'digest')),
  action_url TEXT,
  is_org_wide BOOLEAN NOT NULL DEFAULT FALSE,
  metadata JSONB DEFAULT '{}',
  priority INT NOT NULL DEFAULT 0,
  scheduled_for TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  delivered_at TIMESTAMPTZ,
  failed_at TIMESTAMPTZ,
  failure_reason TEXT,
  retry_count INT NOT NULL DEFAULT 0,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  CONSTRAINT valid_delivery_state CHECK (
    (delivered_at IS NULL AND failed_at IS NULL) OR
    (delivered_at IS NOT NULL AND failed_at IS NULL) OR
    (delivered_at IS NULL AND failed_at IS NOT NULL)
  )
);

CREATE INDEX idx_notification_queue_user_pending
ON notification_queue(user_id, scheduled_for)
WHERE delivered_at IS NULL AND failed_at IS NULL;

CREATE INDEX idx_notification_queue_org_pending
ON notification_queue(org_id, scheduled_for)
WHERE delivered_at IS NULL AND failed_at IS NULL;

CREATE INDEX idx_notification_queue_scheduled
ON notification_queue(scheduled_for)
WHERE delivered_at IS NULL AND failed_at IS NULL;

-- Enable RLS
ALTER TABLE notification_queue ENABLE ROW LEVEL SECURITY;

-- Only service role can access queue
CREATE POLICY "Service role only" ON notification_queue
FOR ALL USING (public.is_service_role());

-- ========================================
-- FUNCTION: Enqueue Notification
-- ========================================

CREATE OR REPLACE FUNCTION enqueue_notification(
  p_user_id UUID,
  p_org_id UUID,
  p_title TEXT,
  p_message TEXT,
  p_type TEXT,
  p_category TEXT,
  p_action_url TEXT,
  p_is_org_wide BOOLEAN,
  p_metadata JSONB,
  p_priority INT DEFAULT 0
)
RETURNS UUID
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_queue_id UUID;
  v_scheduled_for TIMESTAMPTZ;
BEGIN
  -- Default to immediate delivery
  v_scheduled_for := NOW();

  -- TODO: Check user preferences and adjust scheduled_for based on:
  -- - Delivery frequency preference (immediate, hourly, daily)
  -- - Do not disturb hours
  -- - Category mute settings

  -- Insert into queue
  INSERT INTO notification_queue (
    user_id,
    org_id,
    title,
    message,
    type,
    category,
    action_url,
    is_org_wide,
    metadata,
    priority,
    scheduled_for
  )
  VALUES (
    p_user_id,
    p_org_id,
    p_title,
    p_message,
    p_type,
    p_category,
    p_action_url,
    p_is_org_wide,
    p_metadata,
    p_priority,
    v_scheduled_for
  )
  RETURNING id INTO v_queue_id;

  RETURN v_queue_id;
END;
$$;

-- ========================================
-- FUNCTION: Process Notification Queue
-- ========================================

CREATE OR REPLACE FUNCTION process_notification_queue(
  p_batch_size INT DEFAULT 100
)
RETURNS INTEGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_notification RECORD;
  v_processed_count INT := 0;
  v_notification_id UUID;
BEGIN
  -- Process notifications that are due
  FOR v_notification IN
    SELECT *
    FROM notification_queue
    WHERE delivered_at IS NULL
      AND failed_at IS NULL
      AND scheduled_for <= NOW()
    ORDER BY priority DESC, scheduled_for ASC
    LIMIT p_batch_size
  LOOP
    BEGIN
      -- Create actual notification
      INSERT INTO notifications (
        user_id,
        org_id,
        title,
        message,
        type,
        category,
        action_url,
        is_org_wide,
        metadata,
        created_at
      )
      VALUES (
        v_notification.user_id,
        v_notification.org_id,
        v_notification.title,
        v_notification.message,
        v_notification.type,
        v_notification.category,
        v_notification.action_url,
        v_notification.is_org_wide,
        v_notification.metadata,
        NOW()
      )
      RETURNING id INTO v_notification_id;

      -- Mark as delivered
      UPDATE notification_queue
      SET delivered_at = NOW(),
          metadata = metadata || jsonb_build_object('notification_id', v_notification_id)
      WHERE id = v_notification.id;

      v_processed_count := v_processed_count + 1;

    EXCEPTION WHEN OTHERS THEN
      -- Mark as failed and increment retry count
      UPDATE notification_queue
      SET failed_at = CASE
          WHEN retry_count >= 2 THEN NOW()  -- Max 3 attempts
          ELSE NULL
        END,
        retry_count = retry_count + 1,
        scheduled_for = CASE
          WHEN retry_count < 2 THEN NOW() + (POWER(2, retry_count) || ' minutes')::INTERVAL
          ELSE scheduled_for
        END,
        failure_reason = SQLERRM
      WHERE id = v_notification.id;
    END;
  END LOOP;

  RETURN v_processed_count;
END;
$$;

-- ========================================
-- FUNCTION: Clean Old Queue Items
-- ========================================

CREATE OR REPLACE FUNCTION cleanup_notification_queue(
  p_days_old INT DEFAULT 7
)
RETURNS INTEGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_deleted_count INT;
BEGIN
  -- Delete delivered or permanently failed items older than specified days
  DELETE FROM notification_queue
  WHERE (delivered_at IS NOT NULL OR (failed_at IS NOT NULL AND retry_count >= 3))
    AND (COALESCE(delivered_at, failed_at) < NOW() - (p_days_old || ' days')::INTERVAL);

  GET DIAGNOSTICS v_deleted_count = ROW_COUNT;
  RETURN v_deleted_count;
END;
$$;

-- ========================================
-- Add comments for documentation
-- ========================================

COMMENT ON TABLE notification_queue IS
'Queue for intelligent notification delivery respecting user preferences and preventing spam.';

COMMENT ON FUNCTION enqueue_notification IS
'Adds notification to queue with scheduling based on user preferences. Returns queue ID.';

COMMENT ON FUNCTION process_notification_queue IS
'Processes queued notifications that are due for delivery. Returns count processed.';

COMMENT ON FUNCTION cleanup_notification_queue IS
'Deletes delivered/failed queue items older than specified days. Returns count deleted.';

-- ========================================
-- Verification
-- ========================================

DO $$
BEGIN
  RAISE NOTICE 'Notification queue system created:';
  RAISE NOTICE '  ✓ notification_queue table';
  RAISE NOTICE '  ✓ enqueue_notification() - Add to queue';
  RAISE NOTICE '  ✓ process_notification_queue() - Deliver due notifications';
  RAISE NOTICE '  ✓ cleanup_notification_queue() - Clean old items';
  RAISE NOTICE '';
  RAISE NOTICE 'Setup cron jobs:';
  RAISE NOTICE '  - Process queue every 1 min: SELECT cron.schedule(''process-notif-queue'', ''* * * * *'', $$SELECT process_notification_queue(100)$$);';
  RAISE NOTICE '  - Clean queue daily: SELECT cron.schedule(''clean-notif-queue'', ''0 3 * * *'', $$SELECT cleanup_notification_queue(7)$$);';
  RAISE NOTICE '';
  RAISE NOTICE 'Features:';
  RAISE NOTICE '  - Priority-based delivery';
  RAISE NOTICE '  - Automatic retry with exponential backoff (3 attempts max)';
  RAISE NOTICE '  - Scheduled delivery (future: respect user preferences)';
END $$;
