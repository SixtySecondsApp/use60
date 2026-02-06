-- Migration: UPL-001 - Expand proposal-assets for document uploads
-- Enables uploading .docx/.pdf example proposals to auto-create templates.

-- ============================================================================
-- 1. Expand proposal_assets.asset_type CHECK to include 'document'
-- ============================================================================

DO $$ BEGIN
  -- Drop existing CHECK constraint and recreate with 'document' added
  ALTER TABLE proposal_assets DROP CONSTRAINT IF EXISTS proposal_assets_asset_type_check;
  ALTER TABLE proposal_assets ADD CONSTRAINT proposal_assets_asset_type_check
    CHECK (asset_type IN ('logo', 'image', 'attachment', 'font', 'document'));
END $$;

-- ============================================================================
-- 2. Expand storage bucket: increase file size limit & add DOCX MIME type
-- ============================================================================

UPDATE storage.buckets
SET
  file_size_limit = 15728640,  -- 15MB (was 5MB)
  allowed_mime_types = ARRAY[
    'image/png',
    'image/jpeg',
    'image/svg+xml',
    'image/webp',
    'application/pdf',
    'application/vnd.openxmlformats-officedocument.wordprocessingml.document'
  ]::text[]
WHERE id = 'proposal-assets';

-- ============================================================================
-- 3. Add source_document_id to proposal_templates (links template to source upload)
-- ============================================================================

DO $$ BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_name = 'proposal_templates' AND column_name = 'source_document_id'
  ) THEN
    ALTER TABLE proposal_templates ADD COLUMN source_document_id uuid REFERENCES proposal_assets(id);
  END IF;
END $$;

COMMENT ON COLUMN proposal_templates.source_document_id IS 'FK to proposal_assets; the uploaded document this template was auto-created from. NULL for manually created templates.';
