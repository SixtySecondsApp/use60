-- Migration: Add member_status tracking to organization_memberships
-- Purpose: Enable soft-delete of users from organizations while preserving account and data
-- Story: ORGREM-001

-- Add member_status column with enum constraint
ALTER TABLE public.organization_memberships
ADD COLUMN member_status text
CHECK (member_status IN ('active', 'removed'))
DEFAULT 'active'
NOT NULL;

-- Add removed_at timestamp for audit trail
ALTER TABLE public.organization_memberships
ADD COLUMN removed_at timestamptz;

-- Add removed_by to track who removed the user
ALTER TABLE public.organization_memberships
ADD COLUMN removed_by uuid
REFERENCES public.profiles(id) ON DELETE SET NULL;

-- Create index for efficient filtering by status
CREATE INDEX idx_memberships_org_status
ON public.organization_memberships(org_id, member_status);

-- Create index for querying removed members
CREATE INDEX idx_memberships_removed_at
ON public.organization_memberships(removed_at)
WHERE member_status = 'removed';

-- Add comment for documentation
COMMENT ON COLUMN public.organization_memberships.member_status IS 'Status of membership: active or removed (soft delete)';
COMMENT ON COLUMN public.organization_memberships.removed_at IS 'Timestamp when user was removed from organization';
COMMENT ON COLUMN public.organization_memberships.removed_by IS 'Profile ID of admin who removed the user';
