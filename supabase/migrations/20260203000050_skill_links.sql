-- Migration: Skill Links for Sequence Simplification
-- Purpose: Enable skills to reference other skills dynamically for "mega skill" sequences
-- Feature: sequence-simplification (SEQ-001)
-- Date: 2026-02-03

-- =============================================================================
-- Table: skill_links
-- Dynamic references from one skill (parent/sequence) to another (linked) skill
-- Used for sequences that orchestrate multiple skills via @skill-name references
-- =============================================================================

CREATE TABLE IF NOT EXISTS skill_links (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),

  -- Parent skill (the sequence or "mega skill" that contains the link)
  parent_skill_id UUID NOT NULL REFERENCES platform_skills(id) ON DELETE CASCADE,

  -- Linked skill (the skill being referenced)
  linked_skill_id UUID NOT NULL REFERENCES platform_skills(id) ON DELETE CASCADE,

  -- Optional placement in folder tree (NULL = root level of parent skill)
  folder_id UUID REFERENCES skill_folders(id) ON DELETE SET NULL,

  -- Display order within the folder/root
  display_order INT DEFAULT 0,

  -- Metadata
  created_by UUID REFERENCES profiles(id),
  created_at TIMESTAMPTZ DEFAULT now(),
  updated_at TIMESTAMPTZ DEFAULT now(),

  -- Prevent linking a skill to itself
  CONSTRAINT skill_links_no_self_reference CHECK (parent_skill_id != linked_skill_id)
);

-- Unique constraint: A skill can only be linked once per parent skill
CREATE UNIQUE INDEX IF NOT EXISTS idx_skill_links_unique_parent_linked
  ON skill_links(parent_skill_id, linked_skill_id);

-- Indexes for efficient lookups
CREATE INDEX IF NOT EXISTS idx_skill_links_parent ON skill_links(parent_skill_id);
CREATE INDEX IF NOT EXISTS idx_skill_links_linked ON skill_links(linked_skill_id);
CREATE INDEX IF NOT EXISTS idx_skill_links_folder ON skill_links(folder_id);
CREATE INDEX IF NOT EXISTS idx_skill_links_parent_folder ON skill_links(parent_skill_id, folder_id);

-- =============================================================================
-- RLS Policies for skill_links
-- Following the same pattern as skill_folders and skill_documents
-- =============================================================================

ALTER TABLE skill_links ENABLE ROW LEVEL SECURITY;

-- Anyone can read links for active skills
DROP POLICY IF EXISTS "Anyone can read skill links" ON skill_links;
DO $$ BEGIN
  CREATE POLICY "Anyone can read skill links"
  ON skill_links FOR SELECT
  USING (EXISTS (
    SELECT 1 FROM platform_skills ps
    WHERE ps.id = parent_skill_id AND ps.is_active = true
  ));
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

-- Only platform admins can create skill links
DROP POLICY IF EXISTS "Only platform admins can insert skill links" ON skill_links;
DO $$ BEGIN
  CREATE POLICY "Only platform admins can insert skill links"
  ON skill_links FOR INSERT
  WITH CHECK (EXISTS (
    SELECT 1 FROM profiles WHERE id = auth.uid() AND is_admin = true
  ));
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

-- Only platform admins can update skill links
DROP POLICY IF EXISTS "Only platform admins can update skill links" ON skill_links;
DO $$ BEGIN
  CREATE POLICY "Only platform admins can update skill links"
  ON skill_links FOR UPDATE
  USING (EXISTS (
    SELECT 1 FROM profiles WHERE id = auth.uid() AND is_admin = true
  ));
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

-- Only platform admins can delete skill links
DROP POLICY IF EXISTS "Only platform admins can delete skill links" ON skill_links;
DO $$ BEGIN
  CREATE POLICY "Only platform admins can delete skill links"
  ON skill_links FOR DELETE
  USING (EXISTS (
    SELECT 1 FROM profiles WHERE id = auth.uid() AND is_admin = true
  ));
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

-- =============================================================================
-- Trigger: Auto-update updated_at
-- =============================================================================

DROP TRIGGER IF EXISTS update_skill_links_updated_at ON skill_links;
CREATE TRIGGER update_skill_links_updated_at
  BEFORE UPDATE ON skill_links
  FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

-- =============================================================================
-- Function: Get linked skills for a parent skill
-- Returns linked skills with their preview data
-- =============================================================================

CREATE OR REPLACE FUNCTION get_skill_links(p_parent_skill_id UUID)
RETURNS TABLE (
  id UUID,
  linked_skill_id UUID,
  linked_skill_key TEXT,
  linked_skill_name TEXT,
  linked_skill_description TEXT,
  linked_skill_category TEXT,
  folder_id UUID,
  folder_name TEXT,
  display_order INT,
  created_at TIMESTAMPTZ
) AS $$
BEGIN
  RETURN QUERY
  SELECT
    sl.id,
    sl.linked_skill_id,
    ps.skill_key as linked_skill_key,
    (ps.frontmatter->>'name')::TEXT as linked_skill_name,
    (ps.frontmatter->>'description')::TEXT as linked_skill_description,
    ps.category as linked_skill_category,
    sl.folder_id,
    sf.name as folder_name,
    sl.display_order,
    sl.created_at
  FROM skill_links sl
  INNER JOIN platform_skills ps ON sl.linked_skill_id = ps.id
  LEFT JOIN skill_folders sf ON sl.folder_id = sf.id
  WHERE sl.parent_skill_id = p_parent_skill_id
    AND ps.is_active = true
  ORDER BY COALESCE(sf.sort_order, 0), sl.display_order, (ps.frontmatter->>'name');
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- =============================================================================
-- Function: Get skills that link to a given skill (reverse lookup)
-- Useful for showing "used by" information
-- =============================================================================

CREATE OR REPLACE FUNCTION get_skills_linking_to(p_linked_skill_id UUID)
RETURNS TABLE (
  id UUID,
  parent_skill_id UUID,
  parent_skill_key TEXT,
  parent_skill_name TEXT,
  parent_skill_category TEXT,
  created_at TIMESTAMPTZ
) AS $$
BEGIN
  RETURN QUERY
  SELECT
    sl.id,
    sl.parent_skill_id,
    ps.skill_key as parent_skill_key,
    (ps.frontmatter->>'name')::TEXT as parent_skill_name,
    ps.category as parent_skill_category,
    sl.created_at
  FROM skill_links sl
  INNER JOIN platform_skills ps ON sl.parent_skill_id = ps.id
  WHERE sl.linked_skill_id = p_linked_skill_id
    AND ps.is_active = true
  ORDER BY (ps.frontmatter->>'name');
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- =============================================================================
-- Function: Check for circular references
-- Prevents creating links that would cause circular dependencies
-- =============================================================================

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

-- =============================================================================
-- Function: Search skills available for linking
-- Excludes already-linked skills and the parent skill itself
-- =============================================================================

CREATE OR REPLACE FUNCTION search_skills_for_linking(
  p_parent_skill_id UUID,
  p_query TEXT DEFAULT '',
  p_category TEXT DEFAULT NULL,
  p_limit INT DEFAULT 20
)
RETURNS TABLE (
  id UUID,
  skill_key TEXT,
  name TEXT,
  description TEXT,
  category TEXT,
  is_already_linked BOOLEAN
) AS $$
BEGIN
  RETURN QUERY
  SELECT
    ps.id,
    ps.skill_key,
    (ps.frontmatter->>'name')::TEXT as name,
    (ps.frontmatter->>'description')::TEXT as description,
    ps.category,
    EXISTS (
      SELECT 1 FROM skill_links sl
      WHERE sl.parent_skill_id = p_parent_skill_id
        AND sl.linked_skill_id = ps.id
    ) as is_already_linked
  FROM platform_skills ps
  WHERE ps.is_active = true
    AND ps.id != p_parent_skill_id  -- Can't link to self
    AND (
      p_query = ''
      OR ps.skill_key ILIKE '%' || p_query || '%'
      OR (ps.frontmatter->>'name') ILIKE '%' || p_query || '%'
      OR (ps.frontmatter->>'description') ILIKE '%' || p_query || '%'
    )
    AND (p_category IS NULL OR ps.category = p_category)
  ORDER BY
    -- Sort already linked skills to the bottom
    EXISTS (
      SELECT 1 FROM skill_links sl
      WHERE sl.parent_skill_id = p_parent_skill_id
        AND sl.linked_skill_id = ps.id
    ),
    (ps.frontmatter->>'name')
  LIMIT p_limit;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- =============================================================================
-- Grant execute permissions
-- =============================================================================

GRANT EXECUTE ON FUNCTION get_skill_links TO authenticated;
GRANT EXECUTE ON FUNCTION get_skills_linking_to TO authenticated;
GRANT EXECUTE ON FUNCTION check_skill_link_circular TO authenticated;
GRANT EXECUTE ON FUNCTION search_skills_for_linking TO authenticated;
