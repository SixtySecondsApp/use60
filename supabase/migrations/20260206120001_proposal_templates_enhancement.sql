-- Migration: SCH-002 - Enhance proposal_templates with org_id, sections, and brand_config
-- Adds org-scoped columns, structured section definitions, brand configuration,
-- and replaces basic RLS policies with org-aware ones.

-- ============================================================================
-- 1. ADD NEW COLUMNS (all idempotent via IF NOT EXISTS pattern)
-- ============================================================================

-- Add org_id column (FK to organizations.id) to scope templates to an org
DO $$ BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_name = 'proposal_templates' AND column_name = 'org_id'
  ) THEN
    ALTER TABLE proposal_templates ADD COLUMN org_id uuid REFERENCES organizations(id);
  END IF;
END $$;

-- Add description column for template picker UI
DO $$ BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_name = 'proposal_templates' AND column_name = 'description'
  ) THEN
    ALTER TABLE proposal_templates ADD COLUMN description text;
  END IF;
END $$;

-- Add sections column (JSONB) for structured section definitions
DO $$ BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_name = 'proposal_templates' AND column_name = 'sections'
  ) THEN
    ALTER TABLE proposal_templates ADD COLUMN sections jsonb;
  END IF;
END $$;

-- Add brand_config column (JSONB) for default brand settings (colors, fonts, logo)
DO $$ BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_name = 'proposal_templates' AND column_name = 'brand_config'
  ) THEN
    ALTER TABLE proposal_templates ADD COLUMN brand_config jsonb;
  END IF;
END $$;

-- Add preview_image_url column for template card thumbnails
DO $$ BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_name = 'proposal_templates' AND column_name = 'preview_image_url'
  ) THEN
    ALTER TABLE proposal_templates ADD COLUMN preview_image_url text;
  END IF;
END $$;

-- Add category column for template classification
DO $$ BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_name = 'proposal_templates' AND column_name = 'category'
  ) THEN
    ALTER TABLE proposal_templates ADD COLUMN category text;
  END IF;
END $$;

-- Add created_by column (FK to auth.users) to track who created the template
DO $$ BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_name = 'proposal_templates' AND column_name = 'created_by'
  ) THEN
    ALTER TABLE proposal_templates ADD COLUMN created_by uuid REFERENCES auth.users(id);
  END IF;
END $$;

-- ============================================================================
-- 2. REPLACE RLS POLICIES (drop old, create org-scoped)
-- ============================================================================

-- Drop old permissive policies (idempotent)
DROP POLICY IF EXISTS "Everyone can view proposal_templates" ON proposal_templates;
DROP POLICY IF EXISTS "Authenticated users can manage proposal_templates" ON proposal_templates;

-- 2a. SELECT: Users can see global templates (org_id IS NULL) + their org's templates + their own personal templates
DO $$ BEGIN
  CREATE POLICY "Users can view accessible templates" ON proposal_templates
    FOR SELECT USING (
        org_id IS NULL
        OR org_id IN (SELECT org_id FROM organization_memberships WHERE user_id = auth.uid())
        OR user_id = auth.uid()
    );
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

-- 2b. INSERT: Users can create templates in their org or as personal templates
DO $$ BEGIN
  CREATE POLICY "Users can create org templates" ON proposal_templates
    FOR INSERT WITH CHECK (
        org_id IN (SELECT org_id FROM organization_memberships WHERE user_id = auth.uid())
        OR user_id = auth.uid()
    );
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

-- 2c. UPDATE: Users can update their own templates or org templates they created
DO $$ BEGIN
  CREATE POLICY "Users can update own templates" ON proposal_templates
    FOR UPDATE USING (
        user_id = auth.uid()
        OR (created_by = auth.uid() AND org_id IN (SELECT org_id FROM organization_memberships WHERE user_id = auth.uid()))
    );
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

-- 2d. DELETE: Users can delete their own templates (not global starters)
DO $$ BEGIN
  CREATE POLICY "Users can delete own templates" ON proposal_templates
    FOR DELETE USING (
        user_id = auth.uid() AND org_id IS NOT NULL
    );
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

-- ============================================================================
-- 3. INDEXES
-- ============================================================================

CREATE INDEX IF NOT EXISTS idx_proposal_templates_org_id ON proposal_templates (org_id);
CREATE INDEX IF NOT EXISTS idx_proposal_templates_category ON proposal_templates (category);
CREATE INDEX IF NOT EXISTS idx_proposal_templates_created_by ON proposal_templates (created_by);

-- ============================================================================
-- 4. COLUMN DOCUMENTATION
-- ============================================================================

COMMENT ON COLUMN proposal_templates.org_id IS 'FK to organizations; scopes template visibility to an org. NULL = global/starter template visible to all.';
COMMENT ON COLUMN proposal_templates.description IS 'Human-readable description shown in the template picker UI.';
COMMENT ON COLUMN proposal_templates.sections IS 'JSONB array of section definitions: [{id, title, prompt_hint, order, required}]. Defines the structure a proposal built from this template will follow.';
COMMENT ON COLUMN proposal_templates.brand_config IS 'JSONB with default brand settings: {primary_color, secondary_color, font_family, logo_url, header_style}. Inherited by proposals unless overridden.';
COMMENT ON COLUMN proposal_templates.preview_image_url IS 'URL to a thumbnail image shown on the template card in the picker UI.';
COMMENT ON COLUMN proposal_templates.category IS 'Template category: starter (built-in), org (org-shared), personal (user-private).';
COMMENT ON COLUMN proposal_templates.created_by IS 'FK to auth.users; the user who created this template. Used for update/delete permission checks.';
