-- Fix: Auto-deactivate organizations with no members
-- Problem: Organizations with 0 members and no owner remain active
-- Solution: Mark existing empty orgs as inactive + add trigger for future removals

-- Step 1: Find and mark existing organizations with no active members as inactive
DO $$
DECLARE
  v_empty_count integer;
BEGIN
  UPDATE organizations
  SET is_active = false
  WHERE id NOT IN (
    SELECT DISTINCT org_id
    FROM organization_memberships
    WHERE member_status = 'active'
  )
  AND is_active = true;

  GET DIAGNOSTICS v_empty_count = ROW_COUNT;
  RAISE NOTICE '✅ Marked % empty organizations as inactive', v_empty_count;
END $$;

-- Step 2: Create trigger to auto-deactivate when last member is removed
DROP TRIGGER IF EXISTS auto_deactivate_empty_org ON organization_memberships;
DROP FUNCTION IF EXISTS auto_deactivate_empty_org();

CREATE FUNCTION auto_deactivate_empty_org()
RETURNS TRIGGER AS $$
DECLARE
  v_active_count integer;
BEGIN
  -- Only process if this is a DELETE or a status change to 'removed'
  IF (TG_OP = 'DELETE') OR (NEW.member_status = 'removed' AND OLD.member_status = 'active') THEN
    -- Count remaining active members in this org
    SELECT COUNT(*)
    INTO v_active_count
    FROM organization_memberships
    WHERE org_id = COALESCE(NEW.org_id, OLD.org_id)
    AND member_status = 'active';

    -- If no active members left, deactivate the organization
    IF v_active_count = 0 THEN
      UPDATE organizations
      SET is_active = false
      WHERE id = COALESCE(NEW.org_id, OLD.org_id)
      AND is_active = true;

      RAISE NOTICE 'ℹ️  Organization % deactivated (no active members remaining)', COALESCE(NEW.org_id, OLD.org_id);
    END IF;
  END IF;

  RETURN COALESCE(NEW, OLD);
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER auto_deactivate_empty_org
AFTER UPDATE OR DELETE ON organization_memberships
FOR EACH ROW
EXECUTE FUNCTION auto_deactivate_empty_org();

-- Step 3: Add verification
DO $$
DECLARE
  v_empty_org_count integer;
BEGIN
  SELECT COUNT(*)
  INTO v_empty_org_count
  FROM organizations o
  WHERE NOT EXISTS (
    SELECT 1
    FROM organization_memberships om
    WHERE om.org_id = o.id
    AND om.member_status = 'active'
  )
  AND o.is_active = true;

  RAISE NOTICE '✅ Auto-deactivate system configured:';
  RAISE NOTICE '  ✓ Existing empty orgs marked as inactive';
  RAISE NOTICE '  ✓ Trigger will auto-deactivate when all members removed';
  IF v_empty_org_count > 0 THEN
    RAISE NOTICE '  ⚠️  WARNING: Found % active orgs with no active members', v_empty_org_count;
  END IF;
END $$;
