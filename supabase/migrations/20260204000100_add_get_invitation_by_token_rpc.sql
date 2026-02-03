-- RPC to fetch invitation details including org name
-- Uses SECURITY DEFINER to bypass RLS (safe because token is cryptographically random)
-- This ensures the org name is always returned regardless of the caller's auth state

CREATE OR REPLACE FUNCTION get_invitation_by_token(p_token TEXT)
RETURNS TABLE(
  id UUID,
  org_id UUID,
  email TEXT,
  role TEXT,
  token TEXT,
  expires_at TIMESTAMPTZ,
  accepted_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ,
  org_name TEXT
) AS $$
BEGIN
  RETURN QUERY
  SELECT
    oi.id,
    oi.org_id,
    oi.email,
    oi.role::TEXT,
    oi.token,
    oi.expires_at,
    oi.accepted_at,
    oi.created_at,
    o.name AS org_name
  FROM organization_invitations oi
  LEFT JOIN organizations o ON o.id = oi.org_id
  WHERE oi.token = p_token
    AND oi.accepted_at IS NULL
    AND oi.expires_at > NOW();
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;
