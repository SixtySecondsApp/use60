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
    SELECT COALESCE(NULLIF(trim(first_name || ' ' || last_name), ''), email) INTO v_user_name FROM profiles WHERE id = OLD.user_id;
    SELECT name INTO v_org_name FROM organizations WHERE id = OLD.org_id;

    -- Get name of person who performed the action
    SELECT COALESCE(NULLIF(trim(first_name || ' ' || last_name), ''), email) INTO v_actioned_by_name FROM profiles WHERE id = auth.uid();

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
    SELECT COALESCE(NULLIF(trim(first_name || ' ' || last_name), ''), email) INTO v_user_name FROM profiles WHERE id = NEW.user_id;
    SELECT name INTO v_org_name FROM organizations WHERE id = NEW.org_id;

    -- Get name of person who performed the action
    SELECT COALESCE(NULLIF(trim(first_name || ' ' || last_name), ''), email) INTO v_actioned_by_name FROM profiles WHERE id = auth.uid();

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
