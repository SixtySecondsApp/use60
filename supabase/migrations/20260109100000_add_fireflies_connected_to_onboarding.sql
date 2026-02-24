-- Add fireflies_connected column to user_onboarding_progress table
-- This tracks whether the user has connected their Fireflies account during onboarding

ALTER TABLE public.user_onboarding_progress
ADD COLUMN IF NOT EXISTS fireflies_connected boolean DEFAULT false;

-- Update the column comment
COMMENT ON COLUMN public.user_onboarding_progress.fireflies_connected IS 'Tracks whether the user connected their Fireflies.ai account during onboarding';
