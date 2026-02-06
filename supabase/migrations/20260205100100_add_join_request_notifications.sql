-- Migration: Add notifications for join requests
-- Creates notifications when:
-- 1. A new join request is created → notify org admins/owners
-- 2. A join request is approved → notify the requesting user

-- ============================================================================
-- Function: Notify admins when join request is created
-- ============================================================================

CREATE OR REPLACE FUNCTION notify_admins_on_join_request()
RETURNS TRIGGER AS $$
DECLARE
  v_admin_ids uuid[];
  v_org_name text;
  v_user_name text;
  v_admin_id uuid;
BEGIN
  -- Only trigger on new pending requests
  IF NEW.status != 'pending' THEN
    RETURN NEW;
  END IF;

  -- Get organization name
  SELECT name INTO v_org_name
  FROM organizations
  WHERE id = NEW.org_id;

  -- Get requesting user's name
  SELECT COALESCE(
    NULLIF(TRIM(first_name || ' ' || last_name), ''),
    email,
    'A user'
  ) INTO v_user_name
  FROM profiles
  WHERE id = NEW.user_id;

  -- If profile doesn't exist, use email from join request
  IF v_user_name IS NULL THEN
    v_user_name := COALESCE(NEW.email, 'A user');
  END IF;

  -- Get all admin/owner user IDs for this org
  SELECT ARRAY_AGG(user_id) INTO v_admin_ids
  FROM organization_memberships
  WHERE org_id = NEW.org_id
    AND role IN ('owner', 'admin')
    AND member_status = 'active';

  -- Create notification for each admin
  IF v_admin_ids IS NOT NULL THEN
    FOREACH v_admin_id IN ARRAY v_admin_ids
    LOOP
      INSERT INTO notifications (
        user_id,
        title,
        message,
        type,
        category,
        entity_type,
        entity_id,
        action_url,
        metadata
      ) VALUES (
        v_admin_id,
        'New Join Request',
        v_user_name || ' wants to join ' || COALESCE(v_org_name, 'your organization'),
        'info',
        'team',
        'join_request',
        NEW.id::text,
        '/settings/organization-management?tab=requests',
        jsonb_build_object(
          'org_id', NEW.org_id,
          'org_name', v_org_name,
          'requester_email', NEW.email,
          'requester_name', v_user_name
        )
      );
    END LOOP;
  END IF;

  RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- ============================================================================
-- Function: Notify user when join request is approved
-- ============================================================================

CREATE OR REPLACE FUNCTION notify_user_on_join_approval()
RETURNS TRIGGER AS $$
DECLARE
  v_org_name text;
BEGIN
  -- Only trigger when status changes to 'approved'
  IF NEW.status != 'approved' OR OLD.status = 'approved' THEN
    RETURN NEW;
  END IF;

  -- Get organization name
  SELECT name INTO v_org_name
  FROM organizations
  WHERE id = NEW.org_id;

  -- Create notification for the user
  INSERT INTO notifications (
    user_id,
    title,
    message,
    type,
    category,
    entity_type,
    entity_id,
    action_url,
    metadata
  ) VALUES (
    NEW.user_id,
    'Welcome to ' || COALESCE(v_org_name, 'your new organization') || '!',
    'Your request to join has been approved. Click to start exploring.',
    'success',
    'team',
    'join_approval',
    NEW.id::text,
    '/',
    jsonb_build_object(
      'org_id', NEW.org_id,
      'org_name', v_org_name,
      'approved_at', NOW()
    )
  );

  RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- ============================================================================
-- Function: Notify user when join request is rejected
-- ============================================================================

CREATE OR REPLACE FUNCTION notify_user_on_join_rejection()
RETURNS TRIGGER AS $$
DECLARE
  v_org_name text;
BEGIN
  -- Only trigger when status changes to 'rejected'
  IF NEW.status != 'rejected' OR OLD.status = 'rejected' THEN
    RETURN NEW;
  END IF;

  -- Get organization name
  SELECT name INTO v_org_name
  FROM organizations
  WHERE id = NEW.org_id;

  -- Create notification for the user
  INSERT INTO notifications (
    user_id,
    title,
    message,
    type,
    category,
    entity_type,
    entity_id,
    action_url,
    metadata
  ) VALUES (
    NEW.user_id,
    'Join Request Update',
    'Your request to join ' || COALESCE(v_org_name, 'the organization') || ' was not approved.' ||
    CASE WHEN NEW.rejection_reason IS NOT NULL
      THEN ' Reason: ' || NEW.rejection_reason
      ELSE ''
    END,
    'warning',
    'team',
    'join_rejection',
    NEW.id::text,
    '/onboarding',
    jsonb_build_object(
      'org_id', NEW.org_id,
      'org_name', v_org_name,
      'rejection_reason', NEW.rejection_reason
    )
  );

  RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- ============================================================================
-- Triggers
-- ============================================================================

-- Drop existing triggers if they exist
DROP TRIGGER IF EXISTS trigger_notify_admins_on_join_request ON organization_join_requests;
DROP TRIGGER IF EXISTS trigger_notify_user_on_join_approval ON organization_join_requests;
DROP TRIGGER IF EXISTS trigger_notify_user_on_join_rejection ON organization_join_requests;

-- Create triggers
CREATE TRIGGER trigger_notify_admins_on_join_request
  AFTER INSERT ON organization_join_requests
  FOR EACH ROW
  EXECUTE FUNCTION notify_admins_on_join_request();

CREATE TRIGGER trigger_notify_user_on_join_approval
  AFTER UPDATE ON organization_join_requests
  FOR EACH ROW
  EXECUTE FUNCTION notify_user_on_join_approval();

CREATE TRIGGER trigger_notify_user_on_join_rejection
  AFTER UPDATE ON organization_join_requests
  FOR EACH ROW
  EXECUTE FUNCTION notify_user_on_join_rejection();

-- ============================================================================
-- Also handle rejoin_requests table
-- ============================================================================

CREATE OR REPLACE FUNCTION notify_admins_on_rejoin_request()
RETURNS TRIGGER AS $$
DECLARE
  v_admin_ids uuid[];
  v_org_name text;
  v_user_name text;
  v_admin_id uuid;
BEGIN
  IF NEW.status != 'pending' THEN
    RETURN NEW;
  END IF;

  SELECT name INTO v_org_name
  FROM organizations
  WHERE id = NEW.org_id;

  SELECT COALESCE(
    NULLIF(TRIM(first_name || ' ' || last_name), ''),
    email,
    'A former member'
  ) INTO v_user_name
  FROM profiles
  WHERE id = NEW.user_id;

  SELECT ARRAY_AGG(user_id) INTO v_admin_ids
  FROM organization_memberships
  WHERE org_id = NEW.org_id
    AND role IN ('owner', 'admin')
    AND member_status = 'active';

  IF v_admin_ids IS NOT NULL THEN
    FOREACH v_admin_id IN ARRAY v_admin_ids
    LOOP
      INSERT INTO notifications (
        user_id,
        title,
        message,
        type,
        category,
        entity_type,
        entity_id,
        action_url,
        metadata
      ) VALUES (
        v_admin_id,
        'Rejoin Request',
        v_user_name || ' wants to rejoin ' || COALESCE(v_org_name, 'your organization'),
        'info',
        'team',
        'rejoin_request',
        NEW.id::text,
        '/settings/organization-management?tab=requests',
        jsonb_build_object(
          'org_id', NEW.org_id,
          'org_name', v_org_name,
          'requester_name', v_user_name
        )
      );
    END LOOP;
  END IF;

  RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

DROP TRIGGER IF EXISTS trigger_notify_admins_on_rejoin_request ON rejoin_requests;

CREATE TRIGGER trigger_notify_admins_on_rejoin_request
  AFTER INSERT ON rejoin_requests
  FOR EACH ROW
  EXECUTE FUNCTION notify_admins_on_rejoin_request();

-- ============================================================================
-- Comments
-- ============================================================================

COMMENT ON FUNCTION notify_admins_on_join_request() IS
'Notifies organization admins/owners when a new join request is submitted';

COMMENT ON FUNCTION notify_user_on_join_approval() IS
'Notifies the user when their join request is approved';

COMMENT ON FUNCTION notify_user_on_join_rejection() IS
'Notifies the user when their join request is rejected';

-- ============================================================================
-- Verification
-- ============================================================================

DO $$
BEGIN
  RAISE NOTICE '✅ Created notification triggers for join requests';
  RAISE NOTICE '  - Admins notified on new join/rejoin requests';
  RAISE NOTICE '  - Users notified on approval/rejection';
END $$;
