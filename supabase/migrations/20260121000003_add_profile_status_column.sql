-- Add profile_status column to profiles table for join request approval workflow
-- Values: active (default), pending_approval (awaiting admin approval), rejected (request was rejected)

ALTER TABLE public.profiles
ADD COLUMN IF NOT EXISTS profile_status text DEFAULT 'active'
CHECK (profile_status IN ('active', 'pending_approval', 'rejected'));

-- Create index for filtering by profile status
CREATE INDEX IF NOT EXISTS idx_profiles_profile_status ON public.profiles(profile_status);

-- Add comment
COMMENT ON COLUMN public.profiles.profile_status IS 'User profile status for organization join requests. active = fully approved, pending_approval = awaiting admin approval to join org, rejected = join request was rejected';
