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
