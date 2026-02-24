-- Migration: Update reject_join_request RPC to send rejection email
-- Purpose: Automatically notify users when their join request is rejected
-- Story: ONBOARD-013

-- Drop existing function to recreate with email sending logic
DROP FUNCTION IF EXISTS "public"."reject_join_request"(uuid, text);

-- Recreate reject_join_request with email notification
CREATE OR REPLACE FUNCTION "public"."reject_join_request"(
  p_request_id uuid,
  p_reason text DEFAULT NULL
)
RETURNS TABLE (
  success boolean,
  message text
)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $$
DECLARE
  v_request record;
  v_org_name text;
  v_user_first_name text;
  v_supabase_url text;
  v_service_role_key text;
  v_email_payload jsonb;
  v_email_response record;
BEGIN
  -- Get the request with related data
  SELECT
    jr.*,
    o.name as org_name
  INTO v_request
  FROM organization_join_requests jr
  JOIN organizations o ON o.id = jr.org_id
  WHERE jr.id = p_request_id
  AND jr.status = 'pending';

  IF NOT FOUND THEN
    RETURN QUERY SELECT
      false,
      'Join request not found or already processed'::text;
    RETURN;
  END IF;

  -- Verify caller is admin of the org
  IF NOT EXISTS (
    SELECT 1 FROM organization_memberships om
    WHERE om.org_id = v_request.org_id
    AND om.user_id = auth.uid()
    AND om.role IN ('owner', 'admin')
  ) THEN
    RETURN QUERY SELECT
      false,
      'Unauthorized: only org admins can reject requests'::text;
    RETURN;
  END IF;

  -- Update request status
  UPDATE organization_join_requests
  SET status = 'rejected',
      actioned_by = auth.uid(),
      actioned_at = NOW(),
      rejection_reason = p_reason
  WHERE id = p_request_id;

  -- Extract user first name from user_profile JSONB or use email prefix as fallback
  v_user_first_name := COALESCE(
    v_request.user_profile->>'firstName',
    v_request.user_profile->>'first_name',
    split_part(v_request.email, '@', 1)
  );

  -- Send rejection email (non-blocking - don't fail the rejection if email fails)
  BEGIN
    -- Get Supabase configuration from settings
    v_supabase_url := current_setting('app.settings.supabase_url', true);
    v_service_role_key := current_setting('app.settings.service_role_key', true);

    -- Only attempt to send email if configuration is available
    IF v_supabase_url IS NOT NULL AND v_service_role_key IS NOT NULL THEN
      -- Build email payload
      v_email_payload := jsonb_build_object(
        'template_type', 'join_request_rejected',
        'to_email', v_request.email,
        'to_name', v_user_first_name,
        'user_id', v_request.user_id::text,
        'variables', jsonb_build_object(
          'first_name', v_user_first_name,
          'org_name', v_request.org_name,
          'rejection_reason', COALESCE(p_reason, 'No specific reason provided.')
        )
      );

      -- Call encharge-send-email edge function via pg_net
      SELECT status, body INTO v_email_response
      FROM net.http_post(
        url := v_supabase_url || '/functions/v1/encharge-send-email',
        headers := jsonb_build_object(
          'Content-Type', 'application/json',
          'Authorization', 'Bearer ' || v_service_role_key
        ),
        body := v_email_payload::text
      );

      -- Log email sending result (but don't fail the rejection)
      IF v_email_response.status = 200 THEN
        RAISE NOTICE 'Rejection email sent successfully to %', v_request.email;
      ELSE
        RAISE WARNING 'Failed to send rejection email to %. Status: %, Response: %',
          v_request.email, v_email_response.status, v_email_response.body;
      END IF;
    ELSE
      RAISE WARNING 'Email configuration not available - skipping rejection email';
    END IF;

  EXCEPTION WHEN OTHERS THEN
    -- Log error but don't fail the rejection
    RAISE WARNING 'Error sending rejection email: %', SQLERRM;
  END;

  RETURN QUERY SELECT
    true,
    'Join request rejected'::text;
END;
$$;

-- Add comment documenting the function
COMMENT ON FUNCTION "public"."reject_join_request"(uuid, text) IS
'Rejects a pending join request and sends rejection email notification to the user. Email sending is non-blocking and will not cause the rejection to fail.';
