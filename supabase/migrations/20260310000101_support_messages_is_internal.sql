-- Migration: Add is_internal column to support_messages
-- Date: 20260310000001
--
-- What this migration does:
--   Adds is_internal boolean column to support_messages table.
--   Used by admin agents to send internal notes that customers cannot see.
--   Updates existing user/org SELECT policies to filter out internal messages.
--
-- Rollback strategy:
--   Restore original policies, then DROP COLUMN:
--   ALTER TABLE support_messages DROP COLUMN IF EXISTS is_internal;

-- 1. Add the column
ALTER TABLE support_messages
  ADD COLUMN IF NOT EXISTS is_internal BOOLEAN NOT NULL DEFAULT false;

-- 2. Update user SELECT policy to exclude internal messages
DROP POLICY IF EXISTS "support_messages_user_select" ON support_messages;
CREATE POLICY "support_messages_user_select"
  ON support_messages FOR SELECT
  USING (
    NOT is_internal
    AND ticket_id IN (
      SELECT id FROM support_tickets WHERE user_id = auth.uid()
    )
  );

-- 3. Update org admin SELECT policy to exclude internal messages
DROP POLICY IF EXISTS "support_messages_org_admin_select" ON support_messages;
CREATE POLICY "support_messages_org_admin_select"
  ON support_messages FOR SELECT
  USING (
    NOT is_internal
    AND ticket_id IN (
      SELECT st.id
      FROM support_tickets st
      JOIN organization_memberships om ON om.org_id = st.org_id
      WHERE om.user_id = auth.uid()
        AND om.role IN ('owner', 'admin')
    )
  );

-- 4. Platform admin SELECT policy stays as-is (can see all including internal)
-- Already: USING (is_admin_optimized()) — no filter on is_internal needed

-- 5. Platform admin INSERT policy (agents can send internal notes)
DROP POLICY IF EXISTS "support_messages_platform_admin_insert" ON support_messages;
CREATE POLICY "support_messages_platform_admin_insert"
  ON support_messages FOR INSERT
  WITH CHECK (
    sender_id = auth.uid()
    AND is_admin_optimized()
  );
