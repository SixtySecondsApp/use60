-- Fix: entity_id type mismatch in join request notification triggers
-- Problem: notifications.entity_id is uuid but triggers cast NEW.id::text
-- Error: column "entity_id" is of type uuid but expression is of type text
-- Solution: Remove ::text cast since NEW.id is already uuid

-- Fix notify_admins_on_join_request
CREATE OR REPLACE FUNCTION notify_admins_on_join_request()
RETURNS TRIGGER AS $function$
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
    'A user'
  ) INTO v_user_name
  FROM profiles
  WHERE id = NEW.user_id;

  IF v_user_name IS NULL THEN
    v_user_name := COALESCE(NEW.email, 'A user');
  END IF;

  SELECT ARRAY_AGG(user_id) INTO v_admin_ids
  FROM organization_memberships
  WHERE org_id = NEW.org_id
    AND role IN ('owner', 'admin')
    AND member_status = 'active';

  IF v_admin_ids IS NOT NULL THEN
    FOREACH v_admin_id IN ARRAY v_admin_ids
    LOOP
      INSERT INTO notifications (
        user_id, title, message, type, category,
        entity_type, entity_id, action_url, metadata
      ) VALUES (
        v_admin_id,
        'New Join Request',
        v_user_name || ' wants to join ' || COALESCE(v_org_name, 'your organization'),
        'info',
        'team',
        'join_request',
        NEW.id,
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
$function$ LANGUAGE plpgsql SECURITY DEFINER;

-- Fix notify_user_on_join_approval
CREATE OR REPLACE FUNCTION notify_user_on_join_approval()
RETURNS TRIGGER AS $function$
DECLARE
  v_org_name text;
BEGIN
  IF NEW.status != 'approved' OR OLD.status = 'approved' THEN
    RETURN NEW;
  END IF;

  SELECT name INTO v_org_name
  FROM organizations
  WHERE id = NEW.org_id;

  INSERT INTO notifications (
    user_id, title, message, type, category,
    entity_type, entity_id, action_url, metadata
  ) VALUES (
    NEW.user_id,
    'Welcome to ' || COALESCE(v_org_name, 'your new organization') || '!',
    'Your request to join has been approved. Click to start exploring.',
    'success',
    'team',
    'join_approval',
    NEW.id,
    '/',
    jsonb_build_object(
      'org_id', NEW.org_id,
      'org_name', v_org_name,
      'approved_at', NOW()
    )
  );

  RETURN NEW;
END;
$function$ LANGUAGE plpgsql SECURITY DEFINER;

-- Fix notify_user_on_join_rejection
CREATE OR REPLACE FUNCTION notify_user_on_join_rejection()
RETURNS TRIGGER AS $function$
DECLARE
  v_org_name text;
BEGIN
  IF NEW.status != 'rejected' OR OLD.status = 'rejected' THEN
    RETURN NEW;
  END IF;

  SELECT name INTO v_org_name
  FROM organizations
  WHERE id = NEW.org_id;

  INSERT INTO notifications (
    user_id, title, message, type, category,
    entity_type, entity_id, action_url, metadata
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
    NEW.id,
    '/onboarding',
    jsonb_build_object(
      'org_id', NEW.org_id,
      'org_name', v_org_name,
      'rejection_reason', NEW.rejection_reason
    )
  );

  RETURN NEW;
END;
$function$ LANGUAGE plpgsql SECURITY DEFINER;

-- Fix notify_admins_on_rejoin_request
CREATE OR REPLACE FUNCTION notify_admins_on_rejoin_request()
RETURNS TRIGGER AS $function$
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
        user_id, title, message, type, category,
        entity_type, entity_id, action_url, metadata
      ) VALUES (
        v_admin_id,
        'Rejoin Request',
        v_user_name || ' wants to rejoin ' || COALESCE(v_org_name, 'your organization'),
        'info',
        'team',
        'rejoin_request',
        NEW.id,
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
$function$ LANGUAGE plpgsql SECURITY DEFINER;
