-- Migration: Create rejoin_requests table
-- Purpose: Track requests from removed users to rejoin organizations
-- Story: ORGREM-002

-- Create rejoin_requests table
CREATE TABLE IF NOT EXISTS public.rejoin_requests (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  org_id uuid NOT NULL REFERENCES public.organizations(id) ON DELETE CASCADE,
  user_id uuid NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
  status text NOT NULL CHECK (status IN ('pending', 'approved', 'rejected')) DEFAULT 'pending',
  requested_at timestamptz NOT NULL DEFAULT NOW(),
  actioned_by uuid REFERENCES public.profiles(id) ON DELETE SET NULL,
  actioned_at timestamptz,
  rejection_reason text,
  created_at timestamptz DEFAULT NOW(),
  updated_at timestamptz DEFAULT NOW()
);

-- Create unique index to prevent duplicate pending requests
CREATE UNIQUE INDEX idx_rejoin_requests_unique_pending
ON public.rejoin_requests(org_id, user_id)
WHERE status = 'pending';

-- Create index for querying by organization
CREATE INDEX idx_rejoin_requests_org_id
ON public.rejoin_requests(org_id, status);

-- Create index for querying by user
CREATE INDEX idx_rejoin_requests_user_id
ON public.rejoin_requests(user_id, status);

-- Enable RLS
ALTER TABLE public.rejoin_requests ENABLE ROW LEVEL SECURITY;

-- RLS Policy: Users can view their own rejoin requests
DO $$ BEGIN
  CREATE POLICY "Users can view own rejoin requests"
ON public.rejoin_requests
FOR SELECT
USING (auth.uid() = user_id);
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

-- RLS Policy: Users can insert their own rejoin requests
DO $$ BEGIN
  CREATE POLICY "Users can create own rejoin requests"
ON public.rejoin_requests
FOR INSERT
WITH CHECK (auth.uid() = user_id AND status = 'pending');
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

-- RLS Policy: Org admins can view all requests for their org
DO $$ BEGIN
  CREATE POLICY "Org admins can view org rejoin requests"
ON public.rejoin_requests
FOR SELECT
USING (
  EXISTS (
    SELECT 1 FROM public.organization_memberships
    WHERE org_id = rejoin_requests.org_id
      AND user_id = auth.uid()
      AND role IN ('owner', 'admin')
      AND member_status = 'active'
  )
);
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

-- RLS Policy: Org admins can update request status
DO $$ BEGIN
  CREATE POLICY "Org admins can update rejoin requests"
ON public.rejoin_requests
FOR UPDATE
USING (
  EXISTS (
    SELECT 1 FROM public.organization_memberships
    WHERE org_id = rejoin_requests.org_id
      AND user_id = auth.uid()
      AND role IN ('owner', 'admin')
      AND member_status = 'active'
  )
)
WITH CHECK (
  EXISTS (
    SELECT 1 FROM public.organization_memberships
    WHERE org_id = rejoin_requests.org_id
      AND user_id = auth.uid()
      AND role IN ('owner', 'admin')
      AND member_status = 'active'
  )
);
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

-- Add comments
COMMENT ON TABLE public.rejoin_requests IS 'Tracks requests from removed users to rejoin organizations';
COMMENT ON COLUMN public.rejoin_requests.status IS 'pending, approved, or rejected';
COMMENT ON COLUMN public.rejoin_requests.rejection_reason IS 'Optional reason provided by admin when rejecting';
