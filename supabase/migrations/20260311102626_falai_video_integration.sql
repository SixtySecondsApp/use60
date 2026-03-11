-- Migration: fal.ai Video Integration Schema
-- Date: 20260311102626
--
-- What this migration does:
--   Creates tables for fal.ai API credential storage, video job tracking,
--   and a model catalog for AI video generation from ops table rows.
--
-- Rollback strategy:
--   DROP TABLE IF EXISTS public.fal_video_jobs CASCADE;
--   DROP TABLE IF EXISTS public.fal_video_models CASCADE;
--   DROP TABLE IF EXISTS public.fal_org_credentials CASCADE;
--   DELETE FROM storage.buckets WHERE id = 'fal-videos';

-- =============================================================================
-- Step 1: fal_org_credentials — Service-role-only API key storage
-- =============================================================================

CREATE TABLE IF NOT EXISTS public.fal_org_credentials (
  org_id     UUID        PRIMARY KEY REFERENCES public.organizations(id) ON DELETE CASCADE,
  api_key    TEXT        NOT NULL,
  is_byok    BOOLEAN     DEFAULT true,  -- false = platform whitelabel key
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

COMMENT ON TABLE  public.fal_org_credentials         IS 'Org-scoped fal.ai API key (service-role-only).';
COMMENT ON COLUMN public.fal_org_credentials.is_byok IS 'true = customer-supplied key; false = platform whitelabel key.';

ALTER TABLE public.fal_org_credentials ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "fal_org_credentials_service_all" ON public.fal_org_credentials;
CREATE POLICY "fal_org_credentials_service_all"
  ON public.fal_org_credentials
  USING (public.is_service_role())
  WITH CHECK (public.is_service_role());

CREATE OR REPLACE TRIGGER update_fal_org_credentials_updated_at
  BEFORE UPDATE ON public.fal_org_credentials
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

-- =============================================================================
-- Step 2: fal_video_models — Model catalog with pricing (reference data)
-- =============================================================================

CREATE TABLE IF NOT EXISTS public.fal_video_models (
  id                      TEXT        PRIMARY KEY,  -- e.g. 'fal-ai/kling-video/v3/pro/text-to-video'
  display_name            TEXT        NOT NULL,
  provider                TEXT        NOT NULL DEFAULT 'fal.ai',
  mode                    TEXT        NOT NULL CHECK (mode IN ('text-to-video', 'image-to-video', 'both')),
  cost_per_second         NUMERIC     NOT NULL,  -- fal.ai USD cost per rendered second
  credit_cost_per_second  NUMERIC     NOT NULL,  -- platform credit charge (50% margin)
  max_duration_seconds    INTEGER     DEFAULT 15,
  supported_aspect_ratios TEXT[]      DEFAULT ARRAY['16:9', '9:16', '1:1'],
  supports_audio          BOOLEAN     DEFAULT false,
  is_active               BOOLEAN     DEFAULT true,
  sort_order              INTEGER     DEFAULT 0,
  created_at              TIMESTAMPTZ DEFAULT NOW()
);

COMMENT ON TABLE  public.fal_video_models                        IS 'fal.ai model catalog with pricing for video generation selection.';
COMMENT ON COLUMN public.fal_video_models.id                     IS 'fal.ai model endpoint ID (e.g. fal-ai/kling-video/v3/pro/text-to-video).';
COMMENT ON COLUMN public.fal_video_models.cost_per_second        IS 'Upstream fal.ai cost in USD per rendered second.';
COMMENT ON COLUMN public.fal_video_models.credit_cost_per_second IS 'Platform credit charge per rendered second (upstream cost + 50% margin).';

ALTER TABLE public.fal_video_models ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "fal_video_models_select" ON public.fal_video_models;
CREATE POLICY "fal_video_models_select"
  ON public.fal_video_models
  FOR SELECT
  USING (true);  -- reference data readable by all authenticated users + service_role

DROP POLICY IF EXISTS "fal_video_models_service_all" ON public.fal_video_models;
CREATE POLICY "fal_video_models_service_all"
  ON public.fal_video_models
  FOR ALL
  USING (public.is_service_role())
  WITH CHECK (public.is_service_role());

-- =============================================================================
-- Step 3: fal_video_jobs — Job tracking per generation request
-- =============================================================================

CREATE TABLE IF NOT EXISTS public.fal_video_jobs (
  id                   UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
  org_id               UUID        NOT NULL REFERENCES public.organizations(id) ON DELETE CASCADE,
  user_id              UUID        NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,

  -- fal.ai identifiers
  fal_request_id       TEXT,  -- request_id returned by fal.ai queue API

  -- Model
  model_id             TEXT        NOT NULL,  -- e.g. 'fal-ai/kling-video/v3/pro/text-to-video'

  -- Job lifecycle
  status               TEXT        NOT NULL DEFAULT 'pending'
                         CHECK (status IN ('pending', 'processing', 'completed', 'failed', 'cancelled')),
  error_message        TEXT,

  -- Video output
  video_url            TEXT,    -- fal.ai CDN URL (expires)
  storage_url          TEXT,    -- permanent Supabase Storage URL
  thumbnail_url        TEXT,
  duration_seconds     NUMERIC,

  -- Input
  prompt               TEXT,
  input_config         JSONB       DEFAULT '{}'::jsonb,  -- aspect_ratio, negative_prompt, etc.

  -- Cost tracking
  credit_cost          NUMERIC,   -- actual credits charged after completion
  estimated_cost       NUMERIC,   -- pre-flight estimate shown to user

  -- Ops table linkage
  dynamic_table_row_id UUID,
  dynamic_table_id     UUID,

  -- Timestamps
  created_at           TIMESTAMPTZ DEFAULT NOW(),
  updated_at           TIMESTAMPTZ DEFAULT NOW(),
  completed_at         TIMESTAMPTZ
);

COMMENT ON TABLE  public.fal_video_jobs                       IS 'Tracks fal.ai video generation jobs, status, URLs, and credit costs.';
COMMENT ON COLUMN public.fal_video_jobs.fal_request_id        IS 'Request ID returned by the fal.ai queue API for polling.';
COMMENT ON COLUMN public.fal_video_jobs.video_url             IS 'Temporary fal.ai CDN URL — copy to storage_url for permanent access.';
COMMENT ON COLUMN public.fal_video_jobs.storage_url           IS 'Permanent Supabase Storage URL after download from fal.ai CDN.';
COMMENT ON COLUMN public.fal_video_jobs.input_config          IS 'Full input parameters: aspect_ratio, negative_prompt, image_url, duration, etc.';
COMMENT ON COLUMN public.fal_video_jobs.dynamic_table_row_id  IS 'Links this video to a specific ops table row (optional).';
COMMENT ON COLUMN public.fal_video_jobs.dynamic_table_id      IS 'Links this video to a specific ops table (optional).';

ALTER TABLE public.fal_video_jobs ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "fal_video_jobs_select" ON public.fal_video_jobs;
CREATE POLICY "fal_video_jobs_select"
  ON public.fal_video_jobs
  FOR SELECT
  USING (
    public.is_service_role()
    OR user_id = auth.uid()
    OR org_id IN (
      SELECT org_id FROM public.organization_memberships
      WHERE user_id = auth.uid()
    )
  );

DROP POLICY IF EXISTS "fal_video_jobs_insert" ON public.fal_video_jobs;
CREATE POLICY "fal_video_jobs_insert"
  ON public.fal_video_jobs
  FOR INSERT
  WITH CHECK (public.is_service_role() OR user_id = auth.uid());

DROP POLICY IF EXISTS "fal_video_jobs_update" ON public.fal_video_jobs;
CREATE POLICY "fal_video_jobs_update"
  ON public.fal_video_jobs
  FOR UPDATE
  USING (public.is_service_role() OR user_id = auth.uid())
  WITH CHECK (public.is_service_role() OR user_id = auth.uid());

DROP POLICY IF EXISTS "fal_video_jobs_service_all" ON public.fal_video_jobs;
CREATE POLICY "fal_video_jobs_service_all"
  ON public.fal_video_jobs
  FOR ALL
  USING (public.is_service_role())
  WITH CHECK (public.is_service_role());

CREATE OR REPLACE TRIGGER update_fal_video_jobs_updated_at
  BEFORE UPDATE ON public.fal_video_jobs
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

CREATE INDEX IF NOT EXISTS idx_fal_video_jobs_org_id
  ON public.fal_video_jobs(org_id);

CREATE INDEX IF NOT EXISTS idx_fal_video_jobs_user_id
  ON public.fal_video_jobs(user_id);

CREATE INDEX IF NOT EXISTS idx_fal_video_jobs_status
  ON public.fal_video_jobs(status) WHERE status IN ('pending', 'processing');

CREATE INDEX IF NOT EXISTS idx_fal_video_jobs_fal_request_id
  ON public.fal_video_jobs(fal_request_id) WHERE fal_request_id IS NOT NULL;

CREATE INDEX IF NOT EXISTS idx_fal_video_jobs_dynamic_table_row_id
  ON public.fal_video_jobs(dynamic_table_row_id) WHERE dynamic_table_row_id IS NOT NULL;

-- =============================================================================
-- Step 4: Seed fal_video_models catalog
-- =============================================================================

INSERT INTO public.fal_video_models
  (id, display_name, provider, mode, cost_per_second, credit_cost_per_second, max_duration_seconds, supports_audio, sort_order)
VALUES
  (
    'fal-ai/kling-video/v3/pro/text-to-video',
    'Kling 3.0 Pro (T2V)',
    'fal.ai',
    'text-to-video',
    0.168,
    2.5,
    15,
    true,
    1
  ),
  (
    'fal-ai/kling-video/v3/pro/image-to-video',
    'Kling 3.0 Pro (I2V)',
    'fal.ai',
    'image-to-video',
    0.168,
    2.5,
    15,
    true,
    2
  ),
  (
    'fal-ai/kling-video/v2/master/text-to-video',
    'Kling 2.5 Master',
    'fal.ai',
    'text-to-video',
    0.07,
    1.0,
    10,
    false,
    3
  ),
  (
    'fal-ai/veo3',
    'Google Veo 3',
    'fal.ai',
    'text-to-video',
    0.40,
    6.0,
    8,
    true,
    4
  ),
  (
    'fal-ai/wan-ai/wan2.1-i2v-720p',
    'Wan 2.5',
    'fal.ai',
    'image-to-video',
    0.05,
    0.75,
    5,
    false,
    5
  )
ON CONFLICT (id) DO NOTHING;

-- =============================================================================
-- Step 5: Storage bucket for permanent video storage
-- =============================================================================

INSERT INTO storage.buckets (id, name, public)
  VALUES ('fal-videos', 'fal-videos', true)
ON CONFLICT (id) DO NOTHING;

-- =============================================================================
-- Grant permissions
-- =============================================================================

GRANT ALL ON TABLE public.fal_org_credentials TO anon;
GRANT ALL ON TABLE public.fal_org_credentials TO authenticated;
GRANT ALL ON TABLE public.fal_org_credentials TO service_role;

GRANT ALL ON TABLE public.fal_video_models TO anon;
GRANT ALL ON TABLE public.fal_video_models TO authenticated;
GRANT ALL ON TABLE public.fal_video_models TO service_role;

GRANT ALL ON TABLE public.fal_video_jobs TO anon;
GRANT ALL ON TABLE public.fal_video_jobs TO authenticated;
GRANT ALL ON TABLE public.fal_video_jobs TO service_role;

-- =============================================================================
NOTIFY pgrst, 'reload schema';
