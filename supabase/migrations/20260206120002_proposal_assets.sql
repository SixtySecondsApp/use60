-- Migration: SCH-003 - Create proposal_assets table and Supabase Storage bucket
-- Tracks assets (logos, images, attachments, fonts) associated with proposals.
-- Storage path convention: {org_id}/{user_id}/{asset_id}/{filename}

-- ============================================================================
-- 1. Create proposal_assets table
-- ============================================================================

CREATE TABLE IF NOT EXISTS proposal_assets (
    id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    proposal_id uuid REFERENCES proposals(id) ON DELETE CASCADE,
    org_id uuid,
    asset_type text NOT NULL CHECK (asset_type IN ('logo', 'image', 'attachment', 'font')),
    storage_path text,
    source text NOT NULL CHECK (source IN ('upload', 'logo_dev', 'template', 'generated')),
    file_name text,
    file_size_bytes bigint,
    mime_type text,
    metadata jsonb,
    created_at timestamptz DEFAULT now(),
    created_by uuid REFERENCES auth.users(id)
);

-- Document column purposes
COMMENT ON COLUMN proposal_assets.id IS 'Primary key, auto-generated UUID';
COMMENT ON COLUMN proposal_assets.proposal_id IS 'FK to proposals table; the proposal this asset belongs to';
COMMENT ON COLUMN proposal_assets.org_id IS 'Organization ID for org-scoped access control';
COMMENT ON COLUMN proposal_assets.asset_type IS 'Type of asset: logo, image, attachment, or font';
COMMENT ON COLUMN proposal_assets.storage_path IS 'Path within the proposal-assets Supabase Storage bucket';
COMMENT ON COLUMN proposal_assets.source IS 'Origin of the asset: upload (user), logo_dev (Logo.dev API), template (from template), generated (AI-created)';
COMMENT ON COLUMN proposal_assets.file_name IS 'Original file name as uploaded or fetched';
COMMENT ON COLUMN proposal_assets.file_size_bytes IS 'File size in bytes for storage tracking';
COMMENT ON COLUMN proposal_assets.mime_type IS 'MIME type of the file (e.g. image/png, application/pdf)';
COMMENT ON COLUMN proposal_assets.metadata IS 'Extra metadata: dimensions, alt text, color palette, etc.';
COMMENT ON COLUMN proposal_assets.created_by IS 'FK to auth.users; the user who created/uploaded this asset';

-- ============================================================================
-- 2. Indexes
-- ============================================================================

CREATE INDEX IF NOT EXISTS idx_proposal_assets_proposal_id ON proposal_assets (proposal_id);
CREATE INDEX IF NOT EXISTS idx_proposal_assets_org_id ON proposal_assets (org_id);
CREATE INDEX IF NOT EXISTS idx_proposal_assets_type ON proposal_assets (asset_type);

-- ============================================================================
-- 3. Row Level Security
-- ============================================================================

ALTER TABLE proposal_assets ENABLE ROW LEVEL SECURITY;

-- Users can view assets they created, or assets for proposals they own, or assets in their org
CREATE POLICY "Users can view proposal assets" ON proposal_assets
    FOR SELECT USING (
        created_by = auth.uid()
        OR proposal_id IN (SELECT id FROM proposals WHERE user_id = auth.uid())
        OR org_id IN (
            SELECT org_id FROM organization_memberships WHERE user_id = auth.uid()
        )
    );

-- Authenticated users can create assets
CREATE POLICY "Users can create proposal assets" ON proposal_assets
    FOR INSERT WITH CHECK (
        auth.uid() IS NOT NULL
    );

-- Users can update their own assets
CREATE POLICY "Users can update own proposal assets" ON proposal_assets
    FOR UPDATE USING (
        created_by = auth.uid()
    );

-- Users can delete their own assets
CREATE POLICY "Users can delete own proposal assets" ON proposal_assets
    FOR DELETE USING (
        created_by = auth.uid()
    );

-- ============================================================================
-- 4. Supabase Storage bucket: proposal-assets (private)
-- ============================================================================

INSERT INTO storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
VALUES (
    'proposal-assets',
    'proposal-assets',
    false,
    5242880,  -- 5MB limit
    ARRAY['image/png', 'image/jpeg', 'image/svg+xml', 'image/webp', 'application/pdf']::text[]
)
ON CONFLICT (id) DO NOTHING;

-- ============================================================================
-- 5. Storage policies (idempotent with DROP IF EXISTS)
-- ============================================================================

DO $$
BEGIN
    -- Upload policy: authenticated users can upload to proposal-assets bucket
    DROP POLICY IF EXISTS "Users can upload proposal assets" ON storage.objects;
    CREATE POLICY "Users can upload proposal assets" ON storage.objects
        FOR INSERT
        TO authenticated
        WITH CHECK (
            bucket_id = 'proposal-assets'
            AND auth.uid() IS NOT NULL
        );

    -- View policy: authenticated users can view proposal assets
    DROP POLICY IF EXISTS "Users can view proposal assets" ON storage.objects;
    CREATE POLICY "Users can view proposal assets" ON storage.objects
        FOR SELECT
        TO authenticated
        USING (
            bucket_id = 'proposal-assets'
            AND auth.uid() IS NOT NULL
        );

    -- Delete policy: users can only delete files in their own user folder
    -- Storage path convention: {org_id}/{user_id}/{asset_id}/{filename}
    DROP POLICY IF EXISTS "Users can delete own proposal assets" ON storage.objects;
    CREATE POLICY "Users can delete own proposal assets" ON storage.objects
        FOR DELETE
        TO authenticated
        USING (
            bucket_id = 'proposal-assets'
            AND auth.uid()::text = (storage.foldername(name))[2]
        );

    -- Service role full access for backend operations
    DROP POLICY IF EXISTS "Service role manages proposal assets" ON storage.objects;
    CREATE POLICY "Service role manages proposal assets" ON storage.objects
        FOR ALL
        TO service_role
        USING (bucket_id = 'proposal-assets');

EXCEPTION
    WHEN undefined_table THEN
        NULL;
END $$;
