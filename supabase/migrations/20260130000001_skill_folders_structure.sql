-- Migration: Skill Folders Structure
-- Purpose: Add folder-based organization for skills with child documents and references
-- Feature: skills-remap (SKILL-001, SKILL-002, SKILL-003)
-- Date: 2026-01-30

-- =============================================================================
-- Table 1: skill_folders
-- Virtual folder hierarchy within each skill
-- =============================================================================

CREATE TABLE IF NOT EXISTS skill_folders (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),

  -- Parent skill reference
  skill_id UUID NOT NULL REFERENCES platform_skills(id) ON DELETE CASCADE,

  -- Folder properties
  name TEXT NOT NULL,
  description TEXT,

  -- Nested folder support (self-referential)
  parent_folder_id UUID REFERENCES skill_folders(id) ON DELETE CASCADE,

  -- Ordering within parent
  sort_order INT DEFAULT 0,

  -- Metadata
  created_by UUID REFERENCES profiles(id),
  created_at TIMESTAMPTZ DEFAULT now(),
  updated_at TIMESTAMPTZ DEFAULT now()
);

-- Indexes for folder lookups
CREATE INDEX IF NOT EXISTS idx_skill_folders_skill ON skill_folders(skill_id);
CREATE INDEX IF NOT EXISTS idx_skill_folders_parent ON skill_folders(parent_folder_id);
CREATE INDEX IF NOT EXISTS idx_skill_folders_skill_parent ON skill_folders(skill_id, parent_folder_id);

-- Unique constraint: folder name unique within parent (or root)
CREATE UNIQUE INDEX IF NOT EXISTS idx_skill_folders_unique_name
  ON skill_folders(skill_id, COALESCE(parent_folder_id, '00000000-0000-0000-0000-000000000000'::uuid), name);

-- =============================================================================
-- Table 2: skill_documents
-- Child documents within skill folders (prompts, examples, assets, references)
-- =============================================================================

-- Document type enum
DO $$ BEGIN
  CREATE TYPE skill_document_type AS ENUM ('prompt', 'example', 'asset', 'reference', 'template');
EXCEPTION
  WHEN duplicate_object THEN NULL;
END $$;

CREATE TABLE IF NOT EXISTS skill_documents (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),

  -- Parent references
  skill_id UUID NOT NULL REFERENCES platform_skills(id) ON DELETE CASCADE,
  folder_id UUID REFERENCES skill_folders(id) ON DELETE CASCADE, -- NULL = root level

  -- Document properties
  title TEXT NOT NULL,
  description TEXT,
  doc_type skill_document_type NOT NULL DEFAULT 'asset',

  -- Content
  content TEXT NOT NULL DEFAULT '',
  frontmatter JSONB DEFAULT '{}', -- Additional metadata for the document

  -- Ordering within folder
  sort_order INT DEFAULT 0,

  -- Metadata
  created_by UUID REFERENCES profiles(id),
  created_at TIMESTAMPTZ DEFAULT now(),
  updated_at TIMESTAMPTZ DEFAULT now()
);

-- Indexes for document lookups
CREATE INDEX IF NOT EXISTS idx_skill_documents_skill ON skill_documents(skill_id);
CREATE INDEX IF NOT EXISTS idx_skill_documents_folder ON skill_documents(folder_id);
CREATE INDEX IF NOT EXISTS idx_skill_documents_skill_folder ON skill_documents(skill_id, folder_id);
CREATE INDEX IF NOT EXISTS idx_skill_documents_type ON skill_documents(doc_type);

-- =============================================================================
-- Table 3: skill_references
-- Track @ mentions and dependencies between documents/skills
-- =============================================================================

-- Reference target type enum
DO $$ BEGIN
  CREATE TYPE skill_reference_type AS ENUM ('document', 'skill', 'variable', 'folder');
EXCEPTION
  WHEN duplicate_object THEN NULL;
END $$;

CREATE TABLE IF NOT EXISTS skill_references (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),

  -- Source (where the reference is made from)
  source_skill_id UUID NOT NULL REFERENCES platform_skills(id) ON DELETE CASCADE,
  source_document_id UUID REFERENCES skill_documents(id) ON DELETE CASCADE, -- NULL = from main skill content

  -- Target (what is being referenced)
  target_type skill_reference_type NOT NULL,
  target_skill_id UUID REFERENCES platform_skills(id) ON DELETE CASCADE, -- For skill references
  target_document_id UUID REFERENCES skill_documents(id) ON DELETE CASCADE, -- For document references
  target_variable TEXT, -- For variable references like {ICP_profile}

  -- Reference metadata
  reference_text TEXT NOT NULL, -- The actual text: @prompts/initial.md or {company_name}
  reference_path TEXT, -- Normalized path: prompts/initial.md

  -- Position in content (for highlighting)
  start_position INT,
  end_position INT,

  -- Metadata
  created_at TIMESTAMPTZ DEFAULT now()
);

-- Indexes for reference lookups
CREATE INDEX IF NOT EXISTS idx_skill_references_source_skill ON skill_references(source_skill_id);
CREATE INDEX IF NOT EXISTS idx_skill_references_source_doc ON skill_references(source_document_id);
CREATE INDEX IF NOT EXISTS idx_skill_references_target_skill ON skill_references(target_skill_id);
CREATE INDEX IF NOT EXISTS idx_skill_references_target_doc ON skill_references(target_document_id);
CREATE INDEX IF NOT EXISTS idx_skill_references_type ON skill_references(target_type);

-- =============================================================================
-- RLS Policies for skill_folders
-- =============================================================================

ALTER TABLE skill_folders ENABLE ROW LEVEL SECURITY;

-- Anyone can read folders for active skills
DROP POLICY IF EXISTS "Anyone can read skill folders" ON skill_folders;
CREATE POLICY "Anyone can read skill folders"
  ON skill_folders FOR SELECT
  USING (EXISTS (
    SELECT 1 FROM platform_skills ps
    WHERE ps.id = skill_id AND ps.is_active = true
  ));

-- Only platform admins can manage folders
DROP POLICY IF EXISTS "Only platform admins can insert skill folders" ON skill_folders;
CREATE POLICY "Only platform admins can insert skill folders"
  ON skill_folders FOR INSERT
  WITH CHECK (EXISTS (
    SELECT 1 FROM profiles WHERE id = auth.uid() AND is_admin = true
  ));

DROP POLICY IF EXISTS "Only platform admins can update skill folders" ON skill_folders;
CREATE POLICY "Only platform admins can update skill folders"
  ON skill_folders FOR UPDATE
  USING (EXISTS (
    SELECT 1 FROM profiles WHERE id = auth.uid() AND is_admin = true
  ));

DROP POLICY IF EXISTS "Only platform admins can delete skill folders" ON skill_folders;
CREATE POLICY "Only platform admins can delete skill folders"
  ON skill_folders FOR DELETE
  USING (EXISTS (
    SELECT 1 FROM profiles WHERE id = auth.uid() AND is_admin = true
  ));

-- =============================================================================
-- RLS Policies for skill_documents
-- =============================================================================

ALTER TABLE skill_documents ENABLE ROW LEVEL SECURITY;

-- Anyone can read documents for active skills
DROP POLICY IF EXISTS "Anyone can read skill documents" ON skill_documents;
CREATE POLICY "Anyone can read skill documents"
  ON skill_documents FOR SELECT
  USING (EXISTS (
    SELECT 1 FROM platform_skills ps
    WHERE ps.id = skill_id AND ps.is_active = true
  ));

-- Only platform admins can manage documents
DROP POLICY IF EXISTS "Only platform admins can insert skill documents" ON skill_documents;
CREATE POLICY "Only platform admins can insert skill documents"
  ON skill_documents FOR INSERT
  WITH CHECK (EXISTS (
    SELECT 1 FROM profiles WHERE id = auth.uid() AND is_admin = true
  ));

DROP POLICY IF EXISTS "Only platform admins can update skill documents" ON skill_documents;
CREATE POLICY "Only platform admins can update skill documents"
  ON skill_documents FOR UPDATE
  USING (EXISTS (
    SELECT 1 FROM profiles WHERE id = auth.uid() AND is_admin = true
  ));

DROP POLICY IF EXISTS "Only platform admins can delete skill documents" ON skill_documents;
CREATE POLICY "Only platform admins can delete skill documents"
  ON skill_documents FOR DELETE
  USING (EXISTS (
    SELECT 1 FROM profiles WHERE id = auth.uid() AND is_admin = true
  ));

-- =============================================================================
-- RLS Policies for skill_references
-- =============================================================================

ALTER TABLE skill_references ENABLE ROW LEVEL SECURITY;

-- Anyone can read references
DROP POLICY IF EXISTS "Anyone can read skill references" ON skill_references;
CREATE POLICY "Anyone can read skill references"
  ON skill_references FOR SELECT
  USING (true);

-- Service role manages references (created via triggers/functions)
DROP POLICY IF EXISTS "Service role can manage skill references" ON skill_references;
CREATE POLICY "Service role can manage skill references"
  ON skill_references FOR ALL
  USING (true)
  WITH CHECK (true);

-- =============================================================================
-- Triggers: Auto-update updated_at
-- =============================================================================

DROP TRIGGER IF EXISTS update_skill_folders_updated_at ON skill_folders;
CREATE TRIGGER update_skill_folders_updated_at
  BEFORE UPDATE ON skill_folders
  FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

DROP TRIGGER IF EXISTS update_skill_documents_updated_at ON skill_documents;
CREATE TRIGGER update_skill_documents_updated_at
  BEFORE UPDATE ON skill_documents
  FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

-- =============================================================================
-- Function: Get skill folder tree
-- Returns nested folder structure for a skill
-- =============================================================================

CREATE OR REPLACE FUNCTION get_skill_folder_tree(p_skill_id UUID)
RETURNS TABLE (
  id UUID,
  name TEXT,
  description TEXT,
  parent_folder_id UUID,
  sort_order INT,
  depth INT,
  path TEXT
) AS $$
BEGIN
  RETURN QUERY
  WITH RECURSIVE folder_tree AS (
    -- Root level folders
    SELECT
      f.id,
      f.name,
      f.description,
      f.parent_folder_id,
      f.sort_order,
      0 as depth,
      f.name as path
    FROM skill_folders f
    WHERE f.skill_id = p_skill_id
      AND f.parent_folder_id IS NULL

    UNION ALL

    -- Child folders
    SELECT
      f.id,
      f.name,
      f.description,
      f.parent_folder_id,
      f.sort_order,
      ft.depth + 1,
      ft.path || '/' || f.name
    FROM skill_folders f
    INNER JOIN folder_tree ft ON f.parent_folder_id = ft.id
  )
  SELECT * FROM folder_tree
  ORDER BY depth, sort_order, name;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- =============================================================================
-- Function: Get skill documents
-- Returns documents for a skill, optionally filtered by folder
-- =============================================================================

CREATE OR REPLACE FUNCTION get_skill_documents(
  p_skill_id UUID,
  p_folder_id UUID DEFAULT NULL
)
RETURNS TABLE (
  id UUID,
  title TEXT,
  description TEXT,
  doc_type skill_document_type,
  content TEXT,
  frontmatter JSONB,
  folder_id UUID,
  folder_path TEXT,
  sort_order INT,
  created_at TIMESTAMPTZ,
  updated_at TIMESTAMPTZ
) AS $$
BEGIN
  RETURN QUERY
  SELECT
    d.id,
    d.title,
    d.description,
    d.doc_type,
    d.content,
    d.frontmatter,
    d.folder_id,
    COALESCE(ft.path, '') as folder_path,
    d.sort_order,
    d.created_at,
    d.updated_at
  FROM skill_documents d
  LEFT JOIN LATERAL (
    SELECT path FROM get_skill_folder_tree(p_skill_id)
    WHERE get_skill_folder_tree.id = d.folder_id
  ) ft ON true
  WHERE d.skill_id = p_skill_id
    AND (p_folder_id IS NULL OR d.folder_id = p_folder_id)
  ORDER BY d.sort_order, d.title;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- =============================================================================
-- Function: Get document references
-- Returns all @ mentions and variable references for a document
-- =============================================================================

CREATE OR REPLACE FUNCTION get_document_references(p_document_id UUID)
RETURNS TABLE (
  id UUID,
  target_type skill_reference_type,
  reference_text TEXT,
  reference_path TEXT,
  target_skill_key TEXT,
  target_document_title TEXT,
  target_variable TEXT
) AS $$
BEGIN
  RETURN QUERY
  SELECT
    r.id,
    r.target_type,
    r.reference_text,
    r.reference_path,
    ps.skill_key as target_skill_key,
    sd.title as target_document_title,
    r.target_variable
  FROM skill_references r
  LEFT JOIN platform_skills ps ON r.target_skill_id = ps.id
  LEFT JOIN skill_documents sd ON r.target_document_id = sd.id
  WHERE r.source_document_id = p_document_id;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- =============================================================================
-- Function: Get skill references (from main skill content)
-- =============================================================================

CREATE OR REPLACE FUNCTION get_skill_references(p_skill_id UUID)
RETURNS TABLE (
  id UUID,
  target_type skill_reference_type,
  reference_text TEXT,
  reference_path TEXT,
  target_skill_key TEXT,
  target_document_title TEXT,
  target_variable TEXT,
  source_document_id UUID,
  source_document_title TEXT
) AS $$
BEGIN
  RETURN QUERY
  SELECT
    r.id,
    r.target_type,
    r.reference_text,
    r.reference_path,
    ps.skill_key as target_skill_key,
    sd.title as target_document_title,
    r.target_variable,
    r.source_document_id,
    src_doc.title as source_document_title
  FROM skill_references r
  LEFT JOIN platform_skills ps ON r.target_skill_id = ps.id
  LEFT JOIN skill_documents sd ON r.target_document_id = sd.id
  LEFT JOIN skill_documents src_doc ON r.source_document_id = src_doc.id
  WHERE r.source_skill_id = p_skill_id;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- =============================================================================
-- Function: Resolve skill content with references
-- Compiles skill content by inlining referenced documents
-- =============================================================================

CREATE OR REPLACE FUNCTION resolve_skill_references(p_skill_id UUID)
RETURNS TABLE (
  skill_key TEXT,
  compiled_content TEXT,
  referenced_documents JSONB,
  unresolved_references JSONB
) AS $$
DECLARE
  v_skill RECORD;
  v_content TEXT;
  v_refs JSONB := '[]'::JSONB;
  v_unresolved JSONB := '[]'::JSONB;
  v_ref RECORD;
  v_doc RECORD;
BEGIN
  -- Get the skill
  SELECT ps.skill_key, ps.content_template
  INTO v_skill
  FROM platform_skills ps
  WHERE ps.id = p_skill_id AND ps.is_active = true;

  IF NOT FOUND THEN
    RETURN;
  END IF;

  v_content := v_skill.content_template;

  -- Process document references (@folder/document.md)
  FOR v_ref IN
    SELECT * FROM skill_references
    WHERE source_skill_id = p_skill_id
      AND target_type = 'document'
  LOOP
    IF v_ref.target_document_id IS NOT NULL THEN
      SELECT * INTO v_doc FROM skill_documents WHERE id = v_ref.target_document_id;
      IF FOUND THEN
        v_refs := v_refs || jsonb_build_object(
          'reference', v_ref.reference_text,
          'title', v_doc.title,
          'content', v_doc.content
        );
      END IF;
    ELSE
      v_unresolved := v_unresolved || jsonb_build_object(
        'reference', v_ref.reference_text,
        'reason', 'Document not found'
      );
    END IF;
  END LOOP;

  RETURN QUERY SELECT
    v_skill.skill_key,
    v_content,
    v_refs,
    v_unresolved;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- =============================================================================
-- Grant execute permissions
-- =============================================================================

GRANT EXECUTE ON FUNCTION get_skill_folder_tree TO authenticated;
GRANT EXECUTE ON FUNCTION get_skill_documents TO authenticated;
GRANT EXECUTE ON FUNCTION get_document_references TO authenticated;
GRANT EXECUTE ON FUNCTION get_skill_references TO authenticated;
GRANT EXECUTE ON FUNCTION resolve_skill_references TO authenticated;
