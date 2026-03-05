-- Migration: Create invite_attempts tracking table
-- Purpose: Track invitation attempts for rate limiting and audit
-- Story: ONBOARD-018

-- Create invite_attempts table
CREATE TABLE IF NOT EXISTS public.invite_attempts (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  admin_id uuid NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
  invited_email text NOT NULL,
  organization_id uuid REFERENCES public.organizations(id) ON DELETE CASCADE,
  attempted_at timestamptz NOT NULL DEFAULT NOW(),
  success boolean DEFAULT false,
  error_message text,
  created_at timestamptz DEFAULT NOW()
);

-- Create index on (admin_id, attempted_at) for rate limiting queries
-- This supports queries like: "How many invites has this admin sent in the last 24 hours?"
CREATE INDEX idx_invite_attempts_admin_time
ON public.invite_attempts(admin_id, attempted_at DESC);

-- Create index on (organization_id, attempted_at) for organization-level rate limits
-- This supports queries like: "How many invites has this org sent in the last 24 hours?"
CREATE INDEX idx_invite_attempts_org_time
ON public.invite_attempts(organization_id, attempted_at DESC);

-- Create index on email for tracking invitation history per email
CREATE INDEX idx_invite_attempts_email
ON public.invite_attempts(invited_email, attempted_at DESC);

-- Enable RLS
ALTER TABLE public.invite_attempts ENABLE ROW LEVEL SECURITY;

-- RLS Policy: Org admins can view their org's invite attempts
DO $$ BEGIN
  CREATE POLICY "Org admins can view org invite attempts"
ON public.invite_attempts
FOR SELECT
USING (
  EXISTS (
    SELECT 1 FROM public.organization_memberships
    WHERE org_id = invite_attempts.organization_id
      AND user_id = auth.uid()
      AND role IN ('owner', 'admin')
      AND member_status = 'active'
  )
);
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

-- RLS Policy: Service role can insert invite attempts (for API tracking)
-- This allows the invite-user API to track all attempts
-- Note: Regular users cannot insert directly - this happens via API

-- Add comments
COMMENT ON TABLE public.invite_attempts IS 'Tracks all invitation attempts for rate limiting and audit purposes';
COMMENT ON COLUMN public.invite_attempts.admin_id IS 'The admin/owner who initiated the invitation';
COMMENT ON COLUMN public.invite_attempts.invited_email IS 'Email address that was invited';
COMMENT ON COLUMN public.invite_attempts.organization_id IS 'Organization the invitation was for';
COMMENT ON COLUMN public.invite_attempts.attempted_at IS 'Timestamp of the invitation attempt';
COMMENT ON COLUMN public.invite_attempts.success IS 'Whether the invitation was successfully sent';
COMMENT ON COLUMN public.invite_attempts.error_message IS 'Error message if invitation failed';
