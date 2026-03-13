-- Migration: add_meeting_email_share_access
-- Date: 20260312142803
--
-- What this migration does:
--   Adds email-gated sharing for meetings. Two modes: 'public' (anyone with link)
--   and 'private' (only verified emails can view). Creates meeting_share_access table
--   for tracking invited emails and their access tokens.
--
-- Rollback strategy:
--   DROP TABLE IF EXISTS meeting_share_access;
--   ALTER TABLE meetings DROP COLUMN IF EXISTS share_mode;
--   DROP FUNCTION IF EXISTS verify_meeting_share_access(uuid, uuid, text);
--   DROP FUNCTION IF EXISTS add_meeting_share_email(uuid, text);
--   DROP FUNCTION IF EXISTS remove_meeting_share_email(uuid, text);
--   DROP FUNCTION IF EXISTS get_meeting_share_emails(uuid);

-- Add share_mode column to meetings (default 'public' for backward compat)
DO $$ BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_name = 'meetings' AND column_name = 'share_mode'
  ) THEN
    ALTER TABLE meetings ADD COLUMN share_mode text DEFAULT 'public';
    ALTER TABLE meetings ADD CONSTRAINT meetings_share_mode_check
      CHECK (share_mode IN ('public', 'private'));
  END IF;
END $$;

COMMENT ON COLUMN meetings.share_mode IS 'Sharing mode: public (anyone with link) or private (email-verified only)';

-- Table for email-gated meeting access
CREATE TABLE IF NOT EXISTS meeting_share_access (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  meeting_id uuid NOT NULL REFERENCES meetings(id) ON DELETE CASCADE,
  email citext NOT NULL,
  access_token uuid DEFAULT gen_random_uuid() UNIQUE,
  invited_by uuid REFERENCES auth.users(id) ON DELETE SET NULL,
  invited_at timestamptz DEFAULT now(),
  verified_at timestamptz,
  expires_at timestamptz DEFAULT (now() + interval '30 days'),
  last_accessed_at timestamptz,
  created_at timestamptz DEFAULT now(),
  UNIQUE(meeting_id, email)
);

-- Index for token lookups (most common query path)
CREATE INDEX IF NOT EXISTS idx_meeting_share_access_token
ON meeting_share_access(access_token);

-- Index for meeting + email lookups
CREATE INDEX IF NOT EXISTS idx_meeting_share_access_meeting_email
ON meeting_share_access(meeting_id, email);

-- Enable RLS
ALTER TABLE meeting_share_access ENABLE ROW LEVEL SECURITY;

-- Authenticated users can manage share access for meetings they own
DROP POLICY IF EXISTS "Meeting owners can manage share access" ON meeting_share_access;
CREATE POLICY "Meeting owners can manage share access" ON meeting_share_access
FOR ALL
USING (
  meeting_id IN (
    SELECT id FROM meetings WHERE owner_user_id = auth.uid()
  )
);

-- Anon users can verify access by token
DROP POLICY IF EXISTS "Anyone can verify access by token" ON meeting_share_access;
CREATE POLICY "Anyone can verify access by token" ON meeting_share_access
FOR SELECT
USING (access_token IS NOT NULL);

-- RPC: Verify email access for private meeting shares
CREATE OR REPLACE FUNCTION verify_meeting_share_access(
  p_share_token uuid,
  p_access_token uuid DEFAULT NULL,
  p_email text DEFAULT NULL
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, extensions
AS $$
DECLARE
  v_meeting_id uuid;
  v_share_mode text;
  v_access record;
BEGIN
  -- Find the meeting
  SELECT id, share_mode INTO v_meeting_id, v_share_mode
  FROM meetings
  WHERE share_token = p_share_token
    AND is_public = true;

  IF NOT FOUND THEN
    RETURN jsonb_build_object('authorized', false, 'reason', 'meeting_not_found');
  END IF;

  -- Public mode: always authorized
  IF v_share_mode IS NULL OR v_share_mode = 'public' THEN
    RETURN jsonb_build_object('authorized', true, 'mode', 'public');
  END IF;

  -- Private mode: check access token first (from URL param)
  IF p_access_token IS NOT NULL THEN
    SELECT * INTO v_access
    FROM meeting_share_access
    WHERE meeting_id = v_meeting_id
      AND access_token = p_access_token
      AND (expires_at IS NULL OR expires_at > now());

    -- Use FOUND instead of IS NOT NULL — record IS NOT NULL returns false
    -- when any column (e.g. verified_at) is NULL, which is a PL/pgSQL gotcha.
    IF FOUND THEN
      -- Mark as verified and update last access
      UPDATE meeting_share_access
      SET verified_at = COALESCE(verified_at, now()),
          last_accessed_at = now()
      WHERE id = v_access.id;

      RETURN jsonb_build_object(
        'authorized', true,
        'mode', 'private',
        'email', v_access.email
      );
    END IF;
  END IF;

  -- Private mode: check email
  IF p_email IS NOT NULL THEN
    SELECT * INTO v_access
    FROM meeting_share_access
    WHERE meeting_id = v_meeting_id
      AND lower(email::text) = lower(p_email)
      AND (expires_at IS NULL OR expires_at > now());

    IF FOUND THEN
      RETURN jsonb_build_object(
        'authorized', true,
        'mode', 'private',
        'email', v_access.email,
        'access_token', v_access.access_token
      );
    END IF;
  END IF;

  -- Not authorized
  RETURN jsonb_build_object('authorized', false, 'reason', 'not_authorized');
END;
$$;

GRANT EXECUTE ON FUNCTION verify_meeting_share_access(uuid, uuid, text) TO anon;
GRANT EXECUTE ON FUNCTION verify_meeting_share_access(uuid, uuid, text) TO authenticated;

-- Helper: check if current user can manage a meeting (owner or same-org member)
CREATE OR REPLACE FUNCTION can_manage_meeting(p_meeting_id uuid)
RETURNS boolean
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, extensions
AS $$
DECLARE
  v_meeting record;
  v_user_org_id uuid;
BEGIN
  SELECT id, org_id, owner_user_id INTO v_meeting
  FROM meetings WHERE id = p_meeting_id;

  IF NOT FOUND THEN RETURN false; END IF;
  IF v_meeting.owner_user_id = auth.uid() THEN RETURN true; END IF;

  SELECT org_id INTO v_user_org_id
  FROM organization_memberships WHERE user_id = auth.uid() LIMIT 1;

  RETURN v_user_org_id IS NOT NULL AND v_user_org_id = v_meeting.org_id;
END;
$$;

-- RPC: Add email access to a meeting
CREATE OR REPLACE FUNCTION add_meeting_share_email(
  p_meeting_id uuid,
  p_email text
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
  v_access record;
BEGIN
  IF NOT can_manage_meeting(p_meeting_id) THEN
    RETURN jsonb_build_object('success', false, 'error', 'not_authorized');
  END IF;

  INSERT INTO meeting_share_access (meeting_id, email, invited_by)
  VALUES (p_meeting_id, p_email, auth.uid())
  ON CONFLICT (meeting_id, email)
  DO UPDATE SET
    expires_at = now() + interval '30 days',
    access_token = gen_random_uuid()
  RETURNING * INTO v_access;

  RETURN jsonb_build_object(
    'success', true,
    'access_token', v_access.access_token,
    'email', v_access.email
  );
END;
$$;

GRANT EXECUTE ON FUNCTION add_meeting_share_email(uuid, text) TO authenticated;

-- RPC: Remove email access from a meeting
CREATE OR REPLACE FUNCTION remove_meeting_share_email(
  p_meeting_id uuid,
  p_email text
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
BEGIN
  IF NOT can_manage_meeting(p_meeting_id) THEN
    RETURN jsonb_build_object('success', false, 'error', 'not_authorized');
  END IF;

  DELETE FROM meeting_share_access
  WHERE meeting_id = p_meeting_id AND lower(email) = lower(p_email);

  RETURN jsonb_build_object('success', true);
END;
$$;

GRANT EXECUTE ON FUNCTION remove_meeting_share_email(uuid, text) TO authenticated;

-- RPC: Get all email access records for a meeting
CREATE OR REPLACE FUNCTION get_meeting_share_emails(p_meeting_id uuid)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
BEGIN
  IF NOT can_manage_meeting(p_meeting_id) THEN
    RETURN jsonb_build_object('success', false, 'error', 'not_authorized');
  END IF;

  RETURN jsonb_build_object(
    'success', true,
    'emails', (
      SELECT COALESCE(jsonb_agg(jsonb_build_object(
        'id', id,
        'email', email,
        'invited_at', invited_at,
        'verified_at', verified_at,
        'last_accessed_at', last_accessed_at,
        'expires_at', expires_at
      ) ORDER BY invited_at DESC), '[]'::jsonb)
      FROM meeting_share_access
      WHERE meeting_id = p_meeting_id
    )
  );
END;
$$;

GRANT EXECUTE ON FUNCTION get_meeting_share_emails(uuid) TO authenticated;

-- RPC: Toggle meeting sharing (SECURITY DEFINER bypasses RLS)
-- Allows org members to share meetings from their org (not just owner)
CREATE OR REPLACE FUNCTION toggle_meeting_sharing(
  p_meeting_id uuid,
  p_is_public boolean,
  p_share_mode text DEFAULT 'public',
  p_share_options jsonb DEFAULT NULL
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, extensions
AS $$
DECLARE
  v_meeting record;
  v_user_org_id uuid;
BEGIN
  -- Get the meeting
  SELECT id, org_id, owner_user_id, share_token INTO v_meeting
  FROM meetings WHERE id = p_meeting_id;

  IF NOT FOUND THEN
    RETURN jsonb_build_object('success', false, 'error', 'meeting_not_found');
  END IF;

  -- Check authorization: owner, or org member in same org
  IF v_meeting.owner_user_id != auth.uid() THEN
    SELECT org_id INTO v_user_org_id
    FROM organization_memberships
    WHERE user_id = auth.uid()
    LIMIT 1;

    IF v_user_org_id IS NULL OR v_user_org_id != v_meeting.org_id THEN
      RETURN jsonb_build_object('success', false, 'error', 'not_authorized');
    END IF;
  END IF;

  -- Update meeting sharing
  UPDATE meetings SET
    is_public = p_is_public,
    share_mode = COALESCE(p_share_mode, share_mode, 'public'),
    share_options = COALESCE(p_share_options, share_options)
  WHERE id = p_meeting_id;

  RETURN jsonb_build_object(
    'success', true,
    'share_token', v_meeting.share_token,
    'is_public', p_is_public
  );
END;
$$;

GRANT EXECUTE ON FUNCTION toggle_meeting_sharing(uuid, boolean, text, jsonb) TO authenticated;
