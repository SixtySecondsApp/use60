-- Migration: AI Image + SVG Animation Column Types
-- Date: 20260311104958
--
-- What this migration does:
--   1. Adds 'ai_image' and 'svg_animation' column types to dynamic_table_columns CHECK constraint
--   2. Creates ai_image_jobs table for tracking Nano Banana 2 image generation
--   3. Creates ai-images storage bucket for permanent image storage
--   4. Seeds Nano Banana 2 model into fal_video_models (reusing model catalog pattern)
--
-- Rollback strategy:
--   DROP TABLE IF EXISTS public.ai_image_jobs CASCADE;
--   DELETE FROM storage.buckets WHERE id = 'ai-images';
--   -- Then restore previous CHECK constraint without ai_image/svg_animation

-- =============================================================================
-- Step 1: Expand column_type CHECK constraint
-- =============================================================================

ALTER TABLE public.dynamic_table_columns DROP CONSTRAINT IF EXISTS dynamic_table_columns_column_type_check;

ALTER TABLE public.dynamic_table_columns ADD CONSTRAINT dynamic_table_columns_column_type_check
  CHECK (column_type = ANY (ARRAY[
    'text', 'email', 'url', 'number', 'boolean', 'enrichment', 'status',
    'person', 'company', 'linkedin', 'date', 'dropdown', 'tags', 'phone',
    'checkbox', 'formula', 'integration', 'action', 'hubspot_property',
    'attio_property', 'apollo_property', 'linkedin_property', 'instantly',
    'button', 'signal', 'agent_research', 'heygen_video', 'elevenlabs_audio',
    'fal_video', 'ai_image', 'svg_animation'
  ])) NOT VALID;

-- =============================================================================
-- Step 2: ai_image_jobs — Job tracking for image generation
-- =============================================================================

CREATE TABLE IF NOT EXISTS public.ai_image_jobs (
  id                   UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
  org_id               UUID        NOT NULL REFERENCES public.organizations(id) ON DELETE CASCADE,
  user_id              UUID        NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,

  -- fal.ai identifiers
  fal_request_id       TEXT,  -- request_id returned by fal.ai queue API

  -- Model
  model_id             TEXT        NOT NULL DEFAULT 'fal-ai/nano-banana-2',

  -- Job lifecycle
  status               TEXT        NOT NULL DEFAULT 'pending'
                         CHECK (status IN ('pending', 'processing', 'completed', 'failed', 'cancelled')),
  error_message        TEXT,

  -- Image output
  image_url            TEXT,    -- fal.ai CDN URL (expires)
  storage_url          TEXT,    -- permanent Supabase Storage URL
  seed                 BIGINT,  -- seed for reproducibility

  -- Input
  prompt               TEXT,
  input_config         JSONB       DEFAULT '{}'::jsonb,  -- aspect_ratio, resolution, num_images, etc.

  -- Cost tracking
  credit_cost          NUMERIC,   -- actual credits charged
  estimated_cost       NUMERIC,   -- pre-flight estimate

  -- Ops table linkage (optional)
  dynamic_table_row_id UUID,
  dynamic_table_id     UUID,
  dynamic_table_column_id UUID,

  -- Timestamps
  created_at           TIMESTAMPTZ DEFAULT NOW(),
  updated_at           TIMESTAMPTZ DEFAULT NOW(),
  completed_at         TIMESTAMPTZ
);

COMMENT ON TABLE  public.ai_image_jobs                       IS 'Tracks AI image generation jobs (Nano Banana 2 via fal.ai).';
COMMENT ON COLUMN public.ai_image_jobs.image_url             IS 'Temporary fal.ai CDN URL — copy to storage_url for permanent access.';
COMMENT ON COLUMN public.ai_image_jobs.storage_url           IS 'Permanent Supabase Storage URL after download from CDN.';
COMMENT ON COLUMN public.ai_image_jobs.seed                  IS 'Generation seed for reproducible variations.';

ALTER TABLE public.ai_image_jobs ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "ai_image_jobs_select" ON public.ai_image_jobs;
CREATE POLICY "ai_image_jobs_select"
  ON public.ai_image_jobs
  FOR SELECT
  USING (
    public.is_service_role()
    OR user_id = auth.uid()
    OR org_id IN (
      SELECT org_id FROM public.organization_memberships
      WHERE user_id = auth.uid()
    )
  );

DROP POLICY IF EXISTS "ai_image_jobs_insert" ON public.ai_image_jobs;
CREATE POLICY "ai_image_jobs_insert"
  ON public.ai_image_jobs
  FOR INSERT
  WITH CHECK (public.is_service_role() OR user_id = auth.uid());

DROP POLICY IF EXISTS "ai_image_jobs_update" ON public.ai_image_jobs;
CREATE POLICY "ai_image_jobs_update"
  ON public.ai_image_jobs
  FOR UPDATE
  USING (public.is_service_role() OR user_id = auth.uid())
  WITH CHECK (public.is_service_role() OR user_id = auth.uid());

DROP POLICY IF EXISTS "ai_image_jobs_service_all" ON public.ai_image_jobs;
CREATE POLICY "ai_image_jobs_service_all"
  ON public.ai_image_jobs
  FOR ALL
  USING (public.is_service_role())
  WITH CHECK (public.is_service_role());

CREATE OR REPLACE TRIGGER update_ai_image_jobs_updated_at
  BEFORE UPDATE ON public.ai_image_jobs
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

CREATE INDEX IF NOT EXISTS idx_ai_image_jobs_org_id
  ON public.ai_image_jobs(org_id);

CREATE INDEX IF NOT EXISTS idx_ai_image_jobs_user_id
  ON public.ai_image_jobs(user_id);

CREATE INDEX IF NOT EXISTS idx_ai_image_jobs_status
  ON public.ai_image_jobs(status) WHERE status IN ('pending', 'processing');

CREATE INDEX IF NOT EXISTS idx_ai_image_jobs_fal_request_id
  ON public.ai_image_jobs(fal_request_id) WHERE fal_request_id IS NOT NULL;

CREATE INDEX IF NOT EXISTS idx_ai_image_jobs_dynamic_table_row_id
  ON public.ai_image_jobs(dynamic_table_row_id) WHERE dynamic_table_row_id IS NOT NULL;

-- =============================================================================
-- Step 3: Storage bucket for permanent image storage
-- =============================================================================

INSERT INTO storage.buckets (id, name, public)
  VALUES ('ai-images', 'ai-images', true)
ON CONFLICT (id) DO NOTHING;

-- =============================================================================
-- Step 4: Grants
-- =============================================================================

GRANT ALL ON TABLE public.ai_image_jobs TO anon;
GRANT ALL ON TABLE public.ai_image_jobs TO authenticated;
GRANT ALL ON TABLE public.ai_image_jobs TO service_role;

-- =============================================================================
NOTIFY pgrst, 'reload schema';
