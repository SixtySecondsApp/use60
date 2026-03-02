-- Restrict organizations table visibility to members only
--
-- Previously: "Allow public organization view" policy with USING(true)
-- let any authenticated user enumerate all organizations.
--
-- Fix: Replace with member-only SELECT policy.
-- The find_similar_organizations_by_domain RPC is SECURITY DEFINER
-- so it bypasses RLS and still works for onboarding domain matching.

-- Drop the overly-permissive policy
DROP POLICY IF EXISTS "Allow public organization view" ON organizations;

-- Also drop any other broad SELECT policies that may exist
DROP POLICY IF EXISTS "Anyone can view organizations" ON organizations;
DROP POLICY IF EXISTS "allow_public_select" ON organizations;
DROP POLICY IF EXISTS "Allow platform admins to view all organizations" ON organizations;

-- Members can view organizations they belong to
DO $$ BEGIN
  CREATE POLICY "Members can view their organizations"
  ON organizations
  FOR SELECT
  USING (
    id IN (
      SELECT org_id FROM organization_memberships
      WHERE user_id = auth.uid()
    )
  );
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

-- Platform admins can view all organizations (for admin panel)
DO $$ BEGIN
  CREATE POLICY "Platform admins can view all organizations"
  ON organizations
  FOR SELECT
  USING (
    auth.uid() IN (
      SELECT id FROM profiles WHERE is_platform_admin = true
    )
  );
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

-- Users with pending join requests can see the org they requested to join
DO $$ BEGIN
  CREATE POLICY "Users can view orgs they have pending join requests for"
  ON organizations
  FOR SELECT
  USING (
    id IN (
      SELECT org_id FROM organization_join_requests
      WHERE user_id = auth.uid()
      AND status = 'pending'
    )
  );
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;
