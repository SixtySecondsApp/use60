-- Migration: linkedin_integration_rls_write_policies
-- Date: 20260310090740
--
-- What this migration does:
--   Add INSERT/UPDATE RLS policies so authenticated org members can
--   connect, disconnect, and manage LinkedIn integrations from the frontend.
--   Previously only SELECT was allowed, causing silent write failures.
--
-- Rollback strategy:
--   DROP POLICY "auth_insert_linkedin_org_integrations" ON linkedin_org_integrations;
--   DROP POLICY "auth_update_linkedin_org_integrations" ON linkedin_org_integrations;
--   DROP POLICY "auth_insert_linkedin_lead_sources" ON linkedin_lead_sources;
--   DROP POLICY "auth_update_linkedin_lead_sources" ON linkedin_lead_sources;

-- linkedin_org_integrations: INSERT (connect)
DROP POLICY IF EXISTS "auth_insert_linkedin_org_integrations" ON linkedin_org_integrations;
CREATE POLICY "auth_insert_linkedin_org_integrations" ON linkedin_org_integrations
  FOR INSERT WITH CHECK (
    auth.role() = 'authenticated'
    AND EXISTS (
      SELECT 1 FROM organization_memberships
      WHERE organization_memberships.org_id = linkedin_org_integrations.org_id
        AND organization_memberships.user_id = auth.uid()
    )
  );

-- linkedin_org_integrations: UPDATE (disconnect, reconnect, toggle)
DROP POLICY IF EXISTS "auth_update_linkedin_org_integrations" ON linkedin_org_integrations;
CREATE POLICY "auth_update_linkedin_org_integrations" ON linkedin_org_integrations
  FOR UPDATE USING (
    auth.role() = 'authenticated'
    AND EXISTS (
      SELECT 1 FROM organization_memberships
      WHERE organization_memberships.org_id = linkedin_org_integrations.org_id
        AND organization_memberships.user_id = auth.uid()
    )
  );

-- linkedin_lead_sources: INSERT (register new form/event source)
DROP POLICY IF EXISTS "auth_insert_linkedin_lead_sources" ON linkedin_lead_sources;
CREATE POLICY "auth_insert_linkedin_lead_sources" ON linkedin_lead_sources
  FOR INSERT WITH CHECK (
    auth.role() = 'authenticated'
    AND EXISTS (
      SELECT 1 FROM organization_memberships
      WHERE organization_memberships.org_id = linkedin_lead_sources.org_id
        AND organization_memberships.user_id = auth.uid()
    )
  );

-- linkedin_lead_sources: UPDATE (toggle active/inactive)
DROP POLICY IF EXISTS "auth_update_linkedin_lead_sources" ON linkedin_lead_sources;
CREATE POLICY "auth_update_linkedin_lead_sources" ON linkedin_lead_sources
  FOR UPDATE USING (
    auth.role() = 'authenticated'
    AND EXISTS (
      SELECT 1 FROM organization_memberships
      WHERE organization_memberships.org_id = linkedin_lead_sources.org_id
        AND organization_memberships.user_id = auth.uid()
    )
  );
