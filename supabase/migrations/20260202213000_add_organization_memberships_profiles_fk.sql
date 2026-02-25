-- Add foreign key constraint from organization_memberships.user_id to profiles.id
-- This allows Supabase PostgREST to automatically detect the relationship
-- and enables join queries like: profiles!user_id(...)

-- First, clean up any orphaned memberships where the user_id doesn't exist in profiles
DELETE FROM public.organization_memberships
WHERE user_id NOT IN (SELECT id FROM public.profiles);

-- Now add the foreign key constraint
DO $$ BEGIN
  ALTER TABLE public.organization_memberships
ADD CONSTRAINT organization_memberships_profiles_fk
FOREIGN KEY (user_id) REFERENCES public.profiles(id) ON DELETE CASCADE;
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;
