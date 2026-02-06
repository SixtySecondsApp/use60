-- Fix: Add INSERT/UPDATE/DELETE RLS policies for integration_credentials
-- Previously only SELECT (org members) and ALL (service_role) existed,
-- so regular users got "new row violates row-level security policy" on upsert.

-- Org admins/owners can insert credentials
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

-- Org admins/owners can update credentials
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

-- Org admins/owners can delete credentials
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

NOTIFY pgrst, 'reload schema';
