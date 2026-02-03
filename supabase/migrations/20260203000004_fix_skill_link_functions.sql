-- Migration: Fix skill link functions for schema cache
-- Purpose: Recreate functions to refresh PostgREST schema cache
-- Date: 2026-02-03

-- Drop and recreate check_skill_link_circular to fix schema cache issue
DROP FUNCTION IF EXISTS check_skill_link_circular(UUID, UUID);

CREATE OR REPLACE FUNCTION check_skill_link_circular(
  p_parent_skill_id UUID,
  p_linked_skill_id UUID
)
RETURNS BOOLEAN AS $$
DECLARE
  v_has_circular BOOLEAN := FALSE;
BEGIN
  -- Check if linked_skill_id (directly or transitively) links back to parent_skill_id
  WITH RECURSIVE link_chain AS (
    -- Start from the skill we're trying to link
    SELECT linked_skill_id, parent_skill_id, 1 as depth
    FROM skill_links
    WHERE parent_skill_id = p_linked_skill_id

    UNION ALL

    -- Follow the chain
    SELECT sl.linked_skill_id, sl.parent_skill_id, lc.depth + 1
    FROM skill_links sl
    INNER JOIN link_chain lc ON sl.parent_skill_id = lc.linked_skill_id
    WHERE lc.depth < 10  -- Prevent infinite loops, max depth 10
  )
  SELECT EXISTS (
    SELECT 1 FROM link_chain WHERE linked_skill_id = p_parent_skill_id
  ) INTO v_has_circular;

  RETURN v_has_circular;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- Ensure proper grants
GRANT EXECUTE ON FUNCTION check_skill_link_circular(UUID, UUID) TO authenticated;
GRANT EXECUTE ON FUNCTION check_skill_link_circular(UUID, UUID) TO anon;

-- Notify PostgREST to reload schema (this triggers on any schema change)
NOTIFY pgrst, 'reload schema';
