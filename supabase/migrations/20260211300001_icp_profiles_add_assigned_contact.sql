-- Migration: Supplementary — Add assigned_to_contact_id to icp_profiles
-- Purpose: Allow ICP profiles to be linked to a specific contact record
--          (e.g. the client contact this ICP was built for).
-- Date: 2026-02-11

ALTER TABLE public.icp_profiles
  ADD COLUMN IF NOT EXISTS assigned_to_contact_id UUID REFERENCES public.contacts(id) ON DELETE SET NULL;

CREATE INDEX IF NOT EXISTS idx_icp_profiles_assigned_contact
  ON public.icp_profiles(assigned_to_contact_id)
  WHERE assigned_to_contact_id IS NOT NULL;

COMMENT ON COLUMN public.icp_profiles.assigned_to_contact_id IS 'Optional reference to the client contact this ICP profile was created for.';
