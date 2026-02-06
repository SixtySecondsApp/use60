-- Migration: Fix entity_id type mismatch in rejoin notification trigger
-- Bug: entity_id column is UUID but was being cast to text
-- Error: column "entity_id" is of type uuid but expression is of type text

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
        NEW.id,  -- FIX: Pass UUID directly without casting to text
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

-- Verification
DO $$
BEGIN
  RAISE NOTICE '✅ Fixed entity_id type mismatch in notify_admins_on_rejoin_request';
END $$;
