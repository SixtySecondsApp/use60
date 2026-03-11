-- Add missing INSERT, UPDATE, DELETE policies for platform admins on test_user_magic_links.
-- Previously only SELECT and service_role ALL policies existed, which meant
-- admin delete calls from the frontend were silently blocked by RLS.

-- Platform admins can create magic links
DROP POLICY IF EXISTS "Platform admins can create test links" ON public.test_user_magic_links;
CREATE POLICY "Platform admins can create test links"
  ON public.test_user_magic_links
  AS PERMISSIVE FOR INSERT
  WITH CHECK (
    EXISTS (
      SELECT 1 FROM public.profiles
      WHERE profiles.id = auth.uid()
      AND profiles.is_admin = true
    )
  );

-- Platform admins can update magic links (e.g. mark as used)
DROP POLICY IF EXISTS "Platform admins can update test links" ON public.test_user_magic_links;
CREATE POLICY "Platform admins can update test links"
  ON public.test_user_magic_links
  AS PERMISSIVE FOR UPDATE
  USING (
    EXISTS (
      SELECT 1 FROM public.profiles
      WHERE profiles.id = auth.uid()
      AND profiles.is_admin = true
    )
  )
  WITH CHECK (
    EXISTS (
      SELECT 1 FROM public.profiles
      WHERE profiles.id = auth.uid()
      AND profiles.is_admin = true
    )
  );

-- Platform admins can delete magic links (including used ones)
DROP POLICY IF EXISTS "Platform admins can delete test links" ON public.test_user_magic_links;
CREATE POLICY "Platform admins can delete test links"
  ON public.test_user_magic_links
  AS PERMISSIVE FOR DELETE
  USING (
    EXISTS (
      SELECT 1 FROM public.profiles
      WHERE profiles.id = auth.uid()
      AND profiles.is_admin = true
    )
  );
