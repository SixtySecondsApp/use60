-- ORG-LOGO: Add logo_url and remove_logo columns to organizations
-- This migration supports organization profile photo functionality
-- Follows the same pattern as profiles.avatar_url and profiles.remove_avatar

-- ============================================================================
-- ORG-LOGO: Add logo_url and remove_logo columns to organizations table
-- ============================================================================

ALTER TABLE public.organizations
ADD COLUMN IF NOT EXISTS logo_url text;

ALTER TABLE public.organizations
ADD COLUMN IF NOT EXISTS remove_logo boolean DEFAULT false;

-- Comments for clarity
COMMENT ON COLUMN public.organizations.logo_url IS 'Public URL to organization logo stored in org-logos storage bucket. NULL if no logo uploaded.';
COMMENT ON COLUMN public.organizations.remove_logo IS 'When true, organization profile reverts to initials instead of displaying logo_url';

-- Update updated_at trigger to track logo changes (if not already present)
-- The organizations table should already have an updated_at trigger from baseline migration
-- This is just a safety check to ensure it exists
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_trigger
    WHERE tgname = 'handle_updated_at'
    AND tgrelid = 'public.organizations'::regclass
  ) THEN
    CREATE TRIGGER handle_updated_at
      BEFORE UPDATE ON public.organizations
      FOR EACH ROW
      EXECUTE FUNCTION public.handle_updated_at();
  END IF;
END$$;
