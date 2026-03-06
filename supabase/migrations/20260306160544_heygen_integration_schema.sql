-- Migration: HeyGen Integration Schema
-- Date: 20260306160544
--
-- What this migration does:
--   Creates tables for HeyGen API credential storage, avatar management,
--   and video generation tracking for personalized video outreach.
--
-- Rollback strategy:
--   DROP TABLE IF EXISTS public.heygen_videos CASCADE;
--   DROP TABLE IF EXISTS public.heygen_avatars CASCADE;
--   DROP TABLE IF EXISTS public.heygen_org_credentials CASCADE;

-- =============================================================================
-- Step 1: heygen_org_credentials — Service-role-only API key storage
-- =============================================================================

CREATE TABLE IF NOT EXISTS public.heygen_org_credentials (
  org_id UUID PRIMARY KEY REFERENCES public.organizations(id) ON DELETE CASCADE,
  api_key TEXT NOT NULL,
  plan_tier TEXT DEFAULT 'free',
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

COMMENT ON TABLE public.heygen_org_credentials IS 'Org-scoped HeyGen API key (service-role-only).';

ALTER TABLE public.heygen_org_credentials ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "heygen_org_credentials_service_all" ON public.heygen_org_credentials;
CREATE POLICY "heygen_org_credentials_service_all"
  ON public.heygen_org_credentials
  USING (public.is_service_role())
  WITH CHECK (public.is_service_role());

CREATE OR REPLACE TRIGGER update_heygen_org_credentials_updated_at
  BEFORE UPDATE ON public.heygen_org_credentials
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

-- =============================================================================
-- Step 2: heygen_avatars — Avatar records per user
-- =============================================================================

CREATE TABLE IF NOT EXISTS public.heygen_avatars (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  org_id UUID NOT NULL REFERENCES public.organizations(id) ON DELETE CASCADE,
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,

  -- HeyGen identifiers
  heygen_avatar_id TEXT,
  heygen_group_id TEXT,
  heygen_generation_id TEXT,

  -- Avatar metadata
  avatar_name TEXT NOT NULL DEFAULT 'My Avatar',
  avatar_type TEXT NOT NULL DEFAULT 'photo' CHECK (avatar_type IN ('photo', 'digital_twin')),
  status TEXT NOT NULL DEFAULT 'creating' CHECK (status IN ('creating', 'training', 'generating_looks', 'ready', 'failed')),
  error_message TEXT,

  -- Looks: array of { look_id, name, thumbnail_url, heygen_avatar_id }
  looks JSONB NOT NULL DEFAULT '[]'::jsonb,

  -- Voice selection
  voice_id TEXT,
  voice_name TEXT,

  -- Display
  thumbnail_url TEXT,

  -- Timestamps
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

COMMENT ON TABLE public.heygen_avatars IS 'User-owned HeyGen avatars with training status, looks, and voice selection.';
COMMENT ON COLUMN public.heygen_avatars.looks IS 'Array of avatar looks: [{ look_id, name, thumbnail_url, heygen_avatar_id }]';

ALTER TABLE public.heygen_avatars ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "heygen_avatars_select" ON public.heygen_avatars;
CREATE POLICY "heygen_avatars_select"
  ON public.heygen_avatars
  FOR SELECT
  USING (
    public.is_service_role()
    OR user_id = auth.uid()
    OR org_id IN (
      SELECT org_id FROM public.organization_memberships
      WHERE user_id = auth.uid()
    )
  );

DROP POLICY IF EXISTS "heygen_avatars_insert" ON public.heygen_avatars;
CREATE POLICY "heygen_avatars_insert"
  ON public.heygen_avatars
  FOR INSERT
  WITH CHECK (
    public.is_service_role()
    OR user_id = auth.uid()
  );

DROP POLICY IF EXISTS "heygen_avatars_update" ON public.heygen_avatars;
CREATE POLICY "heygen_avatars_update"
  ON public.heygen_avatars
  FOR UPDATE
  USING (public.is_service_role() OR user_id = auth.uid())
  WITH CHECK (public.is_service_role() OR user_id = auth.uid());

DROP POLICY IF EXISTS "heygen_avatars_delete" ON public.heygen_avatars;
CREATE POLICY "heygen_avatars_delete"
  ON public.heygen_avatars
  FOR DELETE
  USING (public.is_service_role() OR user_id = auth.uid());

CREATE OR REPLACE TRIGGER update_heygen_avatars_updated_at
  BEFORE UPDATE ON public.heygen_avatars
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

CREATE INDEX IF NOT EXISTS idx_heygen_avatars_org_id
  ON public.heygen_avatars(org_id);

CREATE INDEX IF NOT EXISTS idx_heygen_avatars_user_id
  ON public.heygen_avatars(user_id);

CREATE INDEX IF NOT EXISTS idx_heygen_avatars_status
  ON public.heygen_avatars(status) WHERE status != 'ready';

-- =============================================================================
-- Step 3: heygen_videos — Generated video tracking
-- =============================================================================

CREATE TABLE IF NOT EXISTS public.heygen_videos (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  org_id UUID NOT NULL REFERENCES public.organizations(id) ON DELETE CASCADE,
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  avatar_id UUID REFERENCES public.heygen_avatars(id) ON DELETE SET NULL,

  -- HeyGen identifiers
  heygen_video_id TEXT NOT NULL,
  template_id TEXT,
  callback_id TEXT,

  -- Video metadata
  status TEXT NOT NULL DEFAULT 'pending' CHECK (status IN ('pending', 'processing', 'completed', 'failed')),
  video_url TEXT,
  thumbnail_url TEXT,
  duration_seconds NUMERIC,
  error_message TEXT,

  -- Prospect personalization data
  prospect_data JSONB DEFAULT '{}'::jsonb,

  -- Link to campaign or ops table row
  campaign_link_id UUID,
  dynamic_table_row_id UUID,

  -- Video URLs expire after 7 days from HeyGen
  video_url_expires_at TIMESTAMPTZ,

  -- Timestamps
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

COMMENT ON TABLE public.heygen_videos IS 'Tracks HeyGen video generation jobs and stores video URLs per prospect.';
COMMENT ON COLUMN public.heygen_videos.prospect_data IS 'Variables used: { first_name, company, pain_point, ... }';
COMMENT ON COLUMN public.heygen_videos.callback_id IS 'Unique ID sent to HeyGen callback_url for webhook matching.';

ALTER TABLE public.heygen_videos ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "heygen_videos_select" ON public.heygen_videos;
CREATE POLICY "heygen_videos_select"
  ON public.heygen_videos
  FOR SELECT
  USING (
    public.is_service_role()
    OR user_id = auth.uid()
    OR org_id IN (
      SELECT org_id FROM public.organization_memberships
      WHERE user_id = auth.uid()
    )
  );

DROP POLICY IF EXISTS "heygen_videos_insert" ON public.heygen_videos;
CREATE POLICY "heygen_videos_insert"
  ON public.heygen_videos
  FOR INSERT
  WITH CHECK (public.is_service_role() OR user_id = auth.uid());

DROP POLICY IF EXISTS "heygen_videos_update" ON public.heygen_videos;
CREATE POLICY "heygen_videos_update"
  ON public.heygen_videos
  FOR UPDATE
  USING (public.is_service_role() OR user_id = auth.uid())
  WITH CHECK (public.is_service_role() OR user_id = auth.uid());

DROP POLICY IF EXISTS "heygen_videos_service_all" ON public.heygen_videos;
CREATE POLICY "heygen_videos_service_all"
  ON public.heygen_videos
  FOR ALL
  USING (public.is_service_role())
  WITH CHECK (public.is_service_role());

CREATE OR REPLACE TRIGGER update_heygen_videos_updated_at
  BEFORE UPDATE ON public.heygen_videos
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

CREATE INDEX IF NOT EXISTS idx_heygen_videos_org_id
  ON public.heygen_videos(org_id);

CREATE INDEX IF NOT EXISTS idx_heygen_videos_user_id
  ON public.heygen_videos(user_id);

CREATE INDEX IF NOT EXISTS idx_heygen_videos_status
  ON public.heygen_videos(status) WHERE status IN ('pending', 'processing');

CREATE INDEX IF NOT EXISTS idx_heygen_videos_campaign_link_id
  ON public.heygen_videos(campaign_link_id) WHERE campaign_link_id IS NOT NULL;

CREATE INDEX IF NOT EXISTS idx_heygen_videos_heygen_video_id
  ON public.heygen_videos(heygen_video_id);

CREATE INDEX IF NOT EXISTS idx_heygen_videos_callback_id
  ON public.heygen_videos(callback_id) WHERE callback_id IS NOT NULL;

-- =============================================================================
-- Grant permissions
-- =============================================================================

GRANT ALL ON TABLE public.heygen_org_credentials TO anon;
GRANT ALL ON TABLE public.heygen_org_credentials TO authenticated;
GRANT ALL ON TABLE public.heygen_org_credentials TO service_role;

GRANT ALL ON TABLE public.heygen_avatars TO anon;
GRANT ALL ON TABLE public.heygen_avatars TO authenticated;
GRANT ALL ON TABLE public.heygen_avatars TO service_role;

GRANT ALL ON TABLE public.heygen_videos TO anon;
GRANT ALL ON TABLE public.heygen_videos TO authenticated;
GRANT ALL ON TABLE public.heygen_videos TO service_role;

-- =============================================================================
NOTIFY pgrst, 'reload schema';
