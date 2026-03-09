-- Migration: fix_dynamic_table_cells_org_write_policy
-- Date: 20260309123342
--
-- What this migration does:
--   Replace the creator-only write policy on dynamic_table_cells with an
--   org-scoped policy so any org member can write cells in their org's tables.
--
-- Rollback strategy:
--   Re-create the old policy: CREATE POLICY "Users can manage cells of own tables"
--   ON dynamic_table_cells FOR ALL USING (row_id IN (SELECT r.id FROM dynamic_table_rows r
--   JOIN dynamic_tables t ON r.table_id = t.id WHERE t.created_by = auth.uid()));

-- Drop the restrictive creator-only policy
DROP POLICY IF EXISTS "Users can manage cells of own tables" ON dynamic_table_cells;

-- Create org-scoped write policy for INSERT, UPDATE, DELETE
DROP POLICY IF EXISTS "Org members can manage cells" ON dynamic_table_cells;
CREATE POLICY "Org members can manage cells" ON dynamic_table_cells
  FOR ALL
  USING (
    row_id IN (
      SELECT r.id
      FROM dynamic_table_rows r
      JOIN dynamic_tables t ON r.table_id = t.id
      WHERE t.organization_id IN (
        SELECT org_id FROM organization_memberships WHERE user_id = auth.uid()
      )
    )
  )
  WITH CHECK (
    row_id IN (
      SELECT r.id
      FROM dynamic_table_rows r
      JOIN dynamic_tables t ON r.table_id = t.id
      WHERE t.organization_id IN (
        SELECT org_id FROM organization_memberships WHERE user_id = auth.uid()
      )
    )
  );
