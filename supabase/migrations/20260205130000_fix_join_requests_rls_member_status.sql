-- Fix RLS policies for organization_join_requests to check member_status = 'active'
--
-- Bug: The org_admins_view_join_requests and org_admins_update_join_requests policies
-- were created before the member_status column existed (Jan 17) and were never updated
-- when soft-delete was implemented (Feb 2). This causes removed admins to see empty
-- results instead of proper permission errors.
--
-- Fix: Add member_status = 'active' check to both policies, consistent with the pattern
-- used in rejoin_requests table and other org-scoped tables.

-- Drop old policies
DROP POLICY IF EXISTS "org_admins_view_join_requests" ON organization_join_requests;
DROP POLICY IF EXISTS "org_admins_update_join_requests" ON organization_join_requests;

-- Recreate SELECT policy with member_status check
CREATE POLICY "org_admins_view_join_requests"
  ON organization_join_requests
  FOR SELECT
  USING (
    org_id IN (
      SELECT org_id FROM organization_memberships
      WHERE user_id = auth.uid()
      AND role IN ('owner', 'admin')
      AND member_status = 'active'  -- CRITICAL FIX: Only active admins can view
    )
  );

-- Recreate UPDATE policy with member_status check
CREATE POLICY "org_admins_update_join_requests"
  ON organization_join_requests
  FOR UPDATE
  USING (
    org_id IN (
      SELECT org_id FROM organization_memberships
      WHERE user_id = auth.uid()
      AND role IN ('owner', 'admin')
      AND member_status = 'active'  -- CRITICAL FIX: Only active admins can update
    )
  );

-- Add comment for documentation
COMMENT ON POLICY "org_admins_view_join_requests" ON organization_join_requests IS
  'Allow organization owners and admins with active membership status to view join requests for their organization';

COMMENT ON POLICY "org_admins_update_join_requests" ON organization_join_requests IS
  'Allow organization owners and admins with active membership status to approve/reject join requests for their organization';
