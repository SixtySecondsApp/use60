-- Fix RLS policies for org-logos bucket
-- The filename format is: {orgId}_{timestamp}.{ext}
-- So we split by underscore to extract the orgId

-- Drop old policies if they exist
DROP POLICY IF EXISTS "Org owners and admins can upload logos" ON storage.objects;
DROP POLICY IF EXISTS "Org owners and admins can delete logos" ON storage.objects;
DROP POLICY IF EXISTS "Everyone can view org logos" ON storage.objects;

-- Create corrected policies using underscore as delimiter
CREATE POLICY "Org owners and admins can upload logos"
  ON storage.objects FOR INSERT
  TO authenticated
  WITH CHECK (
    bucket_id = 'org-logos'
    AND EXISTS (
      SELECT 1
      FROM public.organization_memberships om
      WHERE om.user_id = auth.uid()
        AND om.org_id = (split_part(name, '_', 1))::uuid
        AND om.role IN ('owner', 'admin')
        AND (om.member_status IS NULL OR om.member_status = 'active')
    )
  );

CREATE POLICY "Org owners and admins can delete logos"
  ON storage.objects FOR DELETE
  TO authenticated
  USING (
    bucket_id = 'org-logos'
    AND EXISTS (
      SELECT 1
      FROM public.organization_memberships om
      WHERE om.user_id = auth.uid()
        AND om.org_id = (split_part(name, '_', 1))::uuid
        AND om.role IN ('owner', 'admin')
        AND (om.member_status IS NULL OR om.member_status = 'active')
    )
  );

CREATE POLICY "Everyone can view org logos"
  ON storage.objects FOR SELECT
  USING (bucket_id = 'org-logos');
