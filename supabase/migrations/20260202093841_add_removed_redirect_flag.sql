-- Migration: Add redirect_to_onboarding flag to profiles
-- Purpose: Signal to auth middleware when removed users should see onboarding
-- Story: ORGREM-008

-- Add redirect_to_onboarding flag
ALTER TABLE public.profiles
ADD COLUMN redirect_to_onboarding boolean DEFAULT false NOT NULL;

-- Create index for efficient querying
CREATE INDEX idx_profiles_redirect_onboarding
ON public.profiles(redirect_to_onboarding)
WHERE redirect_to_onboarding = true;

-- Add comment for documentation
COMMENT ON COLUMN public.profiles.redirect_to_onboarding IS 'Set to true when user removed from org and should see onboarding on next login';
