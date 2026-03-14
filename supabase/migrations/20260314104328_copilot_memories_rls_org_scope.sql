-- Migration: copilot_memories_rls_org_scope
-- Date: 20260314104328
--
-- What this migration does:
--   Fix copilot_memories RLS to add org scoping. Multi-org users will only
--   see memories tagged with orgs they belong to. Memories without clerk_org_id
--   remain visible to the owning user (backward compatibility).
--
-- Rollback strategy:
--   DROP POLICY IF EXISTS "Users can view own memories within org" ON copilot_memories;
--   Re-create original: CREATE POLICY "Users can view own memories" ON copilot_memories FOR SELECT TO authenticated USING (auth.uid() = user_id);

-- Drop existing SELECT policy
DROP POLICY IF EXISTS "Users can view own memories" ON copilot_memories;

-- New org-scoped SELECT policy
CREATE POLICY "Users can view own memories within org"
  ON copilot_memories
  FOR SELECT
  TO authenticated
  USING (
    auth.uid() = user_id
    AND (
      clerk_org_id IS NULL
      OR
      clerk_org_id IN (
        SELECT om.org_id::text
        FROM organization_memberships om
        WHERE om.user_id = auth.uid()
      )
    )
  );
