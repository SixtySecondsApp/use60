-- Migration: Auto-cleanup empty organizations
-- Problem: When the last member leaves an organization, the empty org remains in database
-- Solution: Automatically delete organizations when they have no members

-- 1. Function to cleanup empty organizations after membership deletion
CREATE OR REPLACE FUNCTION cleanup_empty_organizations()
RETURNS TRIGGER AS $$
BEGIN
  -- Check if the organization now has zero members
  IF NOT EXISTS (
    SELECT 1 FROM organization_memberships
    WHERE org_id = OLD.org_id
  ) THEN
    -- Delete the empty organization
    DELETE FROM organizations
    WHERE id = OLD.org_id;

    RAISE NOTICE 'Deleted empty organization: %', OLD.org_id;
  END IF;

  RETURN OLD;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- 2. Trigger to run cleanup after membership deletion
DROP TRIGGER IF EXISTS trigger_cleanup_empty_orgs ON organization_memberships;
CREATE TRIGGER trigger_cleanup_empty_orgs
  AFTER DELETE ON organization_memberships
  FOR EACH ROW
  EXECUTE FUNCTION cleanup_empty_organizations();

-- 3. Manual cleanup function for existing empty organizations
CREATE OR REPLACE FUNCTION cleanup_existing_empty_orgs()
RETURNS TABLE (
  deleted_org_id uuid,
  org_name text
) AS $$
BEGIN
  RETURN QUERY
  DELETE FROM organizations
  WHERE id IN (
    SELECT o.id
    FROM organizations o
    LEFT JOIN organization_memberships om ON o.id = om.org_id
    WHERE om.org_id IS NULL  -- No memberships
  )
  RETURNING id, name;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- 4. Add comment to explain the cleanup behavior
COMMENT ON FUNCTION cleanup_empty_organizations() IS 'Automatically deletes an organization when its last member is removed. Runs as trigger on membership deletion.';

COMMENT ON FUNCTION cleanup_existing_empty_orgs() IS 'Manual function to clean up historical empty organizations that no longer have any members. Can be called explicitly with: SELECT cleanup_existing_empty_orgs();';
