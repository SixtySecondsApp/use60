-- Add status field to profiles table to track user account completion
-- pending: User has initialized signup but hasn't set password yet
-- active: User has completed signup and can use the app

ALTER TABLE public.profiles
ADD COLUMN status TEXT NOT NULL DEFAULT 'active' CHECK (status IN ('pending', 'active'));

-- Create an index for filtering pending users in admin panel
CREATE INDEX idx_profiles_status ON public.profiles(status);

-- Add comment
COMMENT ON COLUMN public.profiles.status IS 'User account status. pending = invited but not yet activated, active = fully set up';
