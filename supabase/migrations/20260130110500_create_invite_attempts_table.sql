-- Create invite_attempts table for rate limiting
-- ONBOARD-018: Track invitation attempts for rate limiting

CREATE TABLE IF NOT EXISTS invite_attempts (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  admin_id uuid REFERENCES profiles(id) ON DELETE CASCADE NOT NULL,
  invited_email text NOT NULL,
  organization_id uuid REFERENCES organizations(id) ON DELETE CASCADE,
  attempted_at timestamptz DEFAULT NOW() NOT NULL,
  success boolean DEFAULT false,
  error_message text
);

-- Index for admin rate limiting queries (10/day per admin)
CREATE INDEX idx_invite_attempts_admin
ON invite_attempts(admin_id, attempted_at);

-- Index for organization rate limiting queries (50/day per org)
CREATE INDEX idx_invite_attempts_org
ON invite_attempts(organization_id, attempted_at);

-- Index for cleanup of old attempts (optional)
CREATE INDEX idx_invite_attempts_cleanup
ON invite_attempts(attempted_at)
WHERE attempted_at < NOW() - INTERVAL '30 days';

-- Enable RLS
ALTER TABLE invite_attempts ENABLE ROW LEVEL SECURITY;

-- Admins can view their own attempts
CREATE POLICY "Admins can view own attempts"
ON invite_attempts FOR SELECT
USING (auth.uid() = admin_id);

-- Function to check rate limit
CREATE OR REPLACE FUNCTION check_invite_rate_limit(
  p_admin_id uuid,
  p_org_id uuid
)
RETURNS json
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
  admin_count integer;
  org_count integer;
BEGIN
  -- Check admin limit (10 per day)
  SELECT COUNT(*) INTO admin_count
  FROM invite_attempts
  WHERE admin_id = p_admin_id
    AND attempted_at > NOW() - INTERVAL '24 hours';

  IF admin_count >= 10 THEN
    RETURN json_build_object(
      'allowed', false,
      'reason', 'admin_limit',
      'message', 'You have reached the limit of 10 invitations per day'
    );
  END IF;

  -- Check org limit (50 per day)
  SELECT COUNT(*) INTO org_count
  FROM invite_attempts
  WHERE organization_id = p_org_id
    AND attempted_at > NOW() - INTERVAL '24 hours';

  IF org_count >= 50 THEN
    RETURN json_build_object(
      'allowed', false,
      'reason', 'org_limit',
      'message', 'Your organization has reached the limit of 50 invitations per day'
    );
  END IF;

  RETURN json_build_object('allowed', true);
END;
$$;

COMMENT ON TABLE invite_attempts IS 'Tracks invitation attempts for rate limiting (10/day per admin, 50/day per org)';
COMMENT ON FUNCTION check_invite_rate_limit IS 'Checks if admin/org has exceeded invitation rate limits';
