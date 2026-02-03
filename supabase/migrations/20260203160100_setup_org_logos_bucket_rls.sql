-- ORG-LOGOS: Setup org-logos bucket and RLS policies
-- This migration creates the storage bucket for organization profile photos
-- and sets up RLS policies for org owners/admins to upload

-- ============================================================================
-- Part 1: Create org-logos bucket
-- ============================================================================

INSERT INTO storage.buckets (id, name, public, file_size_limit, allowed_mime_types, created_at, updated_at)
VALUES (
  'org-logos',
  'org-logos',
  true,  -- Public read access (anyone can view org logos)
  5242880,  -- 5MB limit
  ARRAY['image/jpeg', 'image/png', 'image/gif', 'image/webp']::text[],
  now(),
  now()
)
ON CONFLICT (id) DO UPDATE SET
  public = true,
  file_size_limit = 5242880,
  allowed_mime_types = ARRAY['image/jpeg', 'image/png', 'image/gif', 'image/webp']::text[],
  updated_at = now();

-- ============================================================================
-- Part 2: RLS Policies for org-logos bucket
-- ============================================================================

-- Policy 1: Public read access for all org logos
-- Anyone can view organization logos (they are non-sensitive)
CREATE POLICY "Public read access for org logos"
  ON storage.objects FOR SELECT
  TO public
  USING (bucket_id = 'org-logos');

-- Policy 2: Org owners/admins can upload logos
-- Files must be named as {orgId}-{timestamp}.{ext}
-- We check if the user has owner or admin role in the organization
CREATE POLICY "Org owners and admins can upload logos"
  ON storage.objects FOR INSERT
  TO authenticated
  WITH CHECK (
    bucket_id = 'org-logos'
    AND (
      -- Extract orgId from filename (format: {orgId}-{timestamp}.{ext})
      -- Check if user is owner or admin of that org
      EXISTS (
        SELECT 1
        FROM public.organization_memberships om
        WHERE om.user_id = auth.uid()
          AND om.org_id = (split_part(name, '-', 1))::uuid
          AND om.role IN ('owner', 'admin')
          AND (om.member_status IS NULL OR om.member_status = 'active')
      )
    )
  );

-- Policy 3: Org owners/admins can update their org's logos
CREATE POLICY "Org owners and admins can update their org logos"
  ON storage.objects FOR UPDATE
  TO authenticated
  USING (
    bucket_id = 'org-logos'
    AND EXISTS (
      SELECT 1
      FROM public.organization_memberships om
      WHERE om.user_id = auth.uid()
        AND om.org_id = (split_part(name, '-', 1))::uuid
        AND om.role IN ('owner', 'admin')
        AND (om.member_status IS NULL OR om.member_status = 'active')
    )
  )
  WITH CHECK (
    bucket_id = 'org-logos'
    AND EXISTS (
      SELECT 1
      FROM public.organization_memberships om
      WHERE om.user_id = auth.uid()
        AND om.org_id = (split_part(name, '-', 1))::uuid
        AND om.role IN ('owner', 'admin')
        AND (om.member_status IS NULL OR om.member_status = 'active')
    )
  );

-- Policy 4: Org owners/admins can delete their org's logos
CREATE POLICY "Org owners and admins can delete their org logos"
  ON storage.objects FOR DELETE
  TO authenticated
  USING (
    bucket_id = 'org-logos'
    AND EXISTS (
      SELECT 1
      FROM public.organization_memberships om
      WHERE om.user_id = auth.uid()
        AND om.org_id = (split_part(name, '-', 1))::uuid
        AND om.role IN ('owner', 'admin')
        AND (om.member_status IS NULL OR om.member_status = 'active')
    )
  );

-- ============================================================================
-- Comments for documentation
-- ============================================================================

COMMENT ON POLICY "Public read access for org logos" ON storage.objects IS 'Anyone can view organization logos';
COMMENT ON POLICY "Org owners and admins can upload logos" ON storage.objects IS 'Only org owners and admins can upload logos. Filename must start with orgId.';
COMMENT ON POLICY "Org owners and admins can update their org logos" ON storage.objects IS 'Only org owners and admins can update their org logos';
COMMENT ON POLICY "Org owners and admins can delete their org logos" ON storage.objects IS 'Only org owners and admins can delete their org logos';
