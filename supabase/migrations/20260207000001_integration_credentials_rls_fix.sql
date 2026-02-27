-- Fix: Add INSERT/UPDATE/DELETE RLS policies for integration_credentials
-- Previously only SELECT (org members) and ALL (service_role) existed,
-- so regular users got "new row violates row-level security policy" on upsert.

-- Org admins/owners can insert credentials
DO $$ BEGIN
  CREATE POLICY "Org admins can insert integration credentials"
  ON public.integration_credentials
  FOR INSERT
  WITH CHECK (
    organization_id IN (
      SELECT org_id FROM public.organization_memberships
      WHERE user_id = auth.uid()
        AND role IN ('owner', 'admin')
    )
  );
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

-- Org admins/owners can update credentials
DO $$ BEGIN
  CREATE POLICY "Org admins can update integration credentials"
  ON public.integration_credentials
  FOR UPDATE
  USING (
    organization_id IN (
      SELECT org_id FROM public.organization_memberships
      WHERE user_id = auth.uid()
        AND role IN ('owner', 'admin')
    )
  )
  WITH CHECK (
    organization_id IN (
      SELECT org_id FROM public.organization_memberships
      WHERE user_id = auth.uid()
        AND role IN ('owner', 'admin')
    )
  );
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

-- Org admins/owners can delete credentials
DO $$ BEGIN
  CREATE POLICY "Org admins can delete integration credentials"
  ON public.integration_credentials
  FOR DELETE
  USING (
    organization_id IN (
      SELECT org_id FROM public.organization_memberships
      WHERE user_id = auth.uid()
        AND role IN ('owner', 'admin')
    )
  );
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

NOTIFY pgrst, 'reload schema';
