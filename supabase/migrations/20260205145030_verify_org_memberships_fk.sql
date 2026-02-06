-- Verify organization_memberships → profiles FK exists
-- This prevents FK constraint mismatches from going undetected
-- See: .sixty/bugs/organization-deactivation-foreign-key-mismatch.md (BUG-003)

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint
    WHERE conname = 'organization_memberships_profiles_fk'
    AND conrelid = 'organization_memberships'::regclass
  ) THEN
    RAISE EXCEPTION 'Missing FK constraint: organization_memberships_profiles_fk. This constraint is required for organization deactivation functionality.';
  END IF;
END $$;
