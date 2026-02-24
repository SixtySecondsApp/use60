-- Ensure logo_url column exists on organizations table
-- The org_settings_notifications trigger references OLD.logo_url,
-- but the column may not exist on all environments, causing:
--   ERROR 42703: record "old" has no field "logo_url"

ALTER TABLE public.organizations
ADD COLUMN IF NOT EXISTS logo_url text;

ALTER TABLE public.organizations
ADD COLUMN IF NOT EXISTS remove_logo boolean DEFAULT false;

COMMENT ON COLUMN public.organizations.logo_url IS 'Public URL to organization logo. NULL if no logo uploaded.';
COMMENT ON COLUMN public.organizations.remove_logo IS 'When true, organization profile reverts to initials instead of displaying logo_url';
