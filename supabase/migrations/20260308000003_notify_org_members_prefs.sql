-- Migration: Wire notification preferences into notify_org_members RPC
-- Story: NOTIF-007
-- Description: Check user_settings.preferences->'notifications'->'in_app_enabled'
--   before inserting notifications. Opt-out model: if no setting or null, deliver.
-- Rollback: Re-run 20260205000003_notify_org_members_function.sql to restore original.

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
  v_in_app_enabled BOOLEAN;
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
    -- Check notification preference (opt-out model: default is TRUE)
    SELECT COALESCE(
      (preferences->'notifications'->>'in_app_enabled')::boolean,
      TRUE
    ) INTO v_in_app_enabled
    FROM user_settings
    WHERE user_id = v_user_id;

    -- If no settings row exists, default to enabled
    IF NOT FOUND THEN
      v_in_app_enabled := TRUE;
    END IF;

    -- Skip if user has explicitly disabled in-app notifications
    IF NOT v_in_app_enabled THEN
      CONTINUE;
    END IF;

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

-- Update comment to reflect preference check
COMMENT ON FUNCTION notify_org_members IS
'Broadcast a notification to all active members of an organization matching the specified roles. '
'Respects user_settings.preferences->notifications->in_app_enabled (opt-out model: delivers by default). '
'Returns array of created notification IDs.';

-- Preserve grants
GRANT EXECUTE ON FUNCTION notify_org_members TO authenticated;
GRANT EXECUTE ON FUNCTION notify_org_members TO service_role;
