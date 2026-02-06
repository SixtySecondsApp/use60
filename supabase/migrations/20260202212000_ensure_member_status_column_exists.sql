-- Safely add member_status column if it doesn't exist
-- This migration is idempotent and won't fail if the column already exists

-- Check and add member_status column
ALTER TABLE public.organization_memberships
ADD COLUMN IF NOT EXISTS member_status text
CHECK (member_status IN ('active', 'removed'))
DEFAULT 'active'
NOT NULL;

-- Add removed_at timestamp if it doesn't exist
ALTER TABLE public.organization_memberships
ADD COLUMN IF NOT EXISTS removed_at timestamptz;

-- Add removed_by if it doesn't exist
ALTER TABLE public.organization_memberships
ADD COLUMN IF NOT EXISTS removed_by uuid
REFERENCES public.profiles(id) ON DELETE SET NULL;

-- Create index if it doesn't exist
CREATE INDEX IF NOT EXISTS idx_memberships_org_status
ON public.organization_memberships(org_id, member_status);

-- Create index for removed members if it doesn't exist
CREATE INDEX IF NOT EXISTS idx_memberships_removed_at
ON public.organization_memberships(removed_at)
WHERE member_status = 'removed';

-- Add comments for documentation
COMMENT ON COLUMN public.organization_memberships.member_status IS 'Status of membership: active or removed (soft delete)';
COMMENT ON COLUMN public.organization_memberships.removed_at IS 'Timestamp when user was removed from organization';
COMMENT ON COLUMN public.organization_memberships.removed_by IS 'Profile ID of admin who removed the user';
