-- Migration: ElevenLabs Voice Clone Schema
-- Date: 20260307130754
--
-- What this migration does:
--   Creates tables for ElevenLabs voice clone management, TTS job tracking,
--   org-level credential storage, and adds elevenlabs_audio column type.
--
-- Rollback strategy:
--   DROP TABLE IF EXISTS public.elevenlabs_tts_jobs CASCADE;
--   DROP TABLE IF EXISTS public.voice_clones CASCADE;
--   DROP TABLE IF EXISTS public.elevenlabs_org_credentials CASCADE;

-- =============================================================================
-- Step 1: elevenlabs_org_credentials — Service-role-only API key storage
-- =============================================================================

CREATE TABLE IF NOT EXISTS public.elevenlabs_org_credentials (
  org_id UUID PRIMARY KEY REFERENCES public.organizations(id) ON DELETE CASCADE,
  api_key TEXT NOT NULL,
  plan_tier TEXT DEFAULT 'free',
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

COMMENT ON TABLE public.elevenlabs_org_credentials IS 'Org-scoped ElevenLabs API key (service-role-only).';

ALTER TABLE public.elevenlabs_org_credentials ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "elevenlabs_org_credentials_service_all" ON public.elevenlabs_org_credentials;
CREATE POLICY "elevenlabs_org_credentials_service_all"
  ON public.elevenlabs_org_credentials
  FOR ALL
  USING (public.is_service_role())
  WITH CHECK (public.is_service_role());

CREATE OR REPLACE TRIGGER update_elevenlabs_org_credentials_updated_at
  BEFORE UPDATE ON public.elevenlabs_org_credentials
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

-- =============================================================================
-- Step 2: voice_clones — Org-level voice library
-- =============================================================================

CREATE TABLE IF NOT EXISTS public.voice_clones (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  org_id UUID NOT NULL REFERENCES public.organizations(id) ON DELETE CASCADE,
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,

  -- Voice identity
  name TEXT NOT NULL,
  description TEXT,

  -- ElevenLabs reference
  elevenlabs_voice_id TEXT,
  source TEXT NOT NULL DEFAULT 'instant_clone' CHECK (source IN ('instant_clone', 'professional_clone', 'imported', 'heygen_stock')),

  -- For HeyGen stock voices (no ElevenLabs)
  heygen_voice_id TEXT,

  -- Clone metadata
  clone_audio_url TEXT,
  clone_duration_seconds NUMERIC,

  -- API key source
  api_key_source TEXT NOT NULL DEFAULT 'platform' CHECK (api_key_source IN ('platform', 'byok')),

  -- Status
  status TEXT NOT NULL DEFAULT 'ready' CHECK (status IN ('cloning', 'ready', 'failed')),
  error_message TEXT,

  -- Preview
  preview_audio_url TEXT,
  language TEXT DEFAULT 'en',

  -- Timestamps
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

COMMENT ON TABLE public.voice_clones IS 'Org-level voice library: cloned voices, imported voices, and HeyGen stock references.';

ALTER TABLE public.voice_clones ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "voice_clones_select" ON public.voice_clones;
CREATE POLICY "voice_clones_select"
  ON public.voice_clones
  FOR SELECT
  USING (
    public.is_service_role()
    OR user_id = auth.uid()
    OR org_id IN (
      SELECT org_id FROM public.organization_memberships
      WHERE user_id = auth.uid()
    )
  );

DROP POLICY IF EXISTS "voice_clones_insert" ON public.voice_clones;
CREATE POLICY "voice_clones_insert"
  ON public.voice_clones
  FOR INSERT
  WITH CHECK (
    public.is_service_role()
    OR user_id = auth.uid()
  );

DROP POLICY IF EXISTS "voice_clones_update" ON public.voice_clones;
CREATE POLICY "voice_clones_update"
  ON public.voice_clones
  FOR UPDATE
  USING (public.is_service_role() OR user_id = auth.uid())
  WITH CHECK (public.is_service_role() OR user_id = auth.uid());

DROP POLICY IF EXISTS "voice_clones_delete" ON public.voice_clones;
CREATE POLICY "voice_clones_delete"
  ON public.voice_clones
  FOR DELETE
  USING (public.is_service_role() OR user_id = auth.uid());

DROP POLICY IF EXISTS "voice_clones_service_all" ON public.voice_clones;
CREATE POLICY "voice_clones_service_all"
  ON public.voice_clones
  FOR ALL
  USING (public.is_service_role())
  WITH CHECK (public.is_service_role());

CREATE OR REPLACE TRIGGER update_voice_clones_updated_at
  BEFORE UPDATE ON public.voice_clones
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

CREATE INDEX IF NOT EXISTS idx_voice_clones_org_id
  ON public.voice_clones(org_id);

CREATE INDEX IF NOT EXISTS idx_voice_clones_user_id
  ON public.voice_clones(user_id);

CREATE INDEX IF NOT EXISTS idx_voice_clones_status
  ON public.voice_clones(status) WHERE status != 'ready';

-- =============================================================================
-- Step 3: elevenlabs_tts_jobs — Batch TTS generation tracking
-- =============================================================================

CREATE TABLE IF NOT EXISTS public.elevenlabs_tts_jobs (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  org_id UUID NOT NULL REFERENCES public.organizations(id) ON DELETE CASCADE,
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  voice_clone_id UUID REFERENCES public.voice_clones(id) ON DELETE SET NULL,

  -- Batch context
  table_id UUID NOT NULL,
  audio_column_id UUID NOT NULL,
  script_template TEXT NOT NULL,

  -- Progress
  total_rows INT NOT NULL DEFAULT 0,
  completed_rows INT NOT NULL DEFAULT 0,
  failed_rows INT NOT NULL DEFAULT 0,
  status TEXT NOT NULL DEFAULT 'pending' CHECK (status IN ('pending', 'processing', 'completed', 'failed')),

  -- Timestamps
  created_at TIMESTAMPTZ DEFAULT NOW(),
  completed_at TIMESTAMPTZ
);

COMMENT ON TABLE public.elevenlabs_tts_jobs IS 'Tracks batch TTS generation for ops table rows.';

ALTER TABLE public.elevenlabs_tts_jobs ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "elevenlabs_tts_jobs_select" ON public.elevenlabs_tts_jobs;
CREATE POLICY "elevenlabs_tts_jobs_select"
  ON public.elevenlabs_tts_jobs
  FOR SELECT
  USING (
    public.is_service_role()
    OR user_id = auth.uid()
    OR org_id IN (
      SELECT org_id FROM public.organization_memberships
      WHERE user_id = auth.uid()
    )
  );

DROP POLICY IF EXISTS "elevenlabs_tts_jobs_insert" ON public.elevenlabs_tts_jobs;
CREATE POLICY "elevenlabs_tts_jobs_insert"
  ON public.elevenlabs_tts_jobs
  FOR INSERT
  WITH CHECK (public.is_service_role() OR user_id = auth.uid());

DROP POLICY IF EXISTS "elevenlabs_tts_jobs_update" ON public.elevenlabs_tts_jobs;
CREATE POLICY "elevenlabs_tts_jobs_update"
  ON public.elevenlabs_tts_jobs
  FOR UPDATE
  USING (public.is_service_role() OR user_id = auth.uid())
  WITH CHECK (public.is_service_role() OR user_id = auth.uid());

DROP POLICY IF EXISTS "elevenlabs_tts_jobs_service_all" ON public.elevenlabs_tts_jobs;
CREATE POLICY "elevenlabs_tts_jobs_service_all"
  ON public.elevenlabs_tts_jobs
  FOR ALL
  USING (public.is_service_role())
  WITH CHECK (public.is_service_role());

CREATE INDEX IF NOT EXISTS idx_elevenlabs_tts_jobs_org_id
  ON public.elevenlabs_tts_jobs(org_id);

CREATE INDEX IF NOT EXISTS idx_elevenlabs_tts_jobs_status
  ON public.elevenlabs_tts_jobs(status) WHERE status IN ('pending', 'processing');

-- =============================================================================
-- Step 4: Add elevenlabs_audio column type
-- =============================================================================

ALTER TABLE public.dynamic_table_columns DROP CONSTRAINT IF EXISTS dynamic_table_columns_column_type_check;

ALTER TABLE public.dynamic_table_columns ADD CONSTRAINT dynamic_table_columns_column_type_check
  CHECK (column_type = ANY (ARRAY[
    'text', 'email', 'url', 'number', 'boolean', 'enrichment', 'status',
    'person', 'company', 'linkedin', 'date', 'dropdown', 'tags', 'phone',
    'checkbox', 'formula', 'integration', 'action', 'hubspot_property',
    'attio_property', 'apollo_property', 'linkedin_property', 'instantly',
    'button', 'signal', 'agent_research', 'heygen_video', 'elevenlabs_audio'
  ])) NOT VALID;

-- =============================================================================
-- Step 5: Create storage bucket for voice clone audio
-- =============================================================================

INSERT INTO storage.buckets (id, name, public)
VALUES ('voice-clones', 'voice-clones', true)
ON CONFLICT (id) DO NOTHING;

-- =============================================================================
-- Grant permissions
-- =============================================================================

GRANT ALL ON TABLE public.elevenlabs_org_credentials TO anon;
GRANT ALL ON TABLE public.elevenlabs_org_credentials TO authenticated;
GRANT ALL ON TABLE public.elevenlabs_org_credentials TO service_role;

GRANT ALL ON TABLE public.voice_clones TO anon;
GRANT ALL ON TABLE public.voice_clones TO authenticated;
GRANT ALL ON TABLE public.voice_clones TO service_role;

GRANT ALL ON TABLE public.elevenlabs_tts_jobs TO anon;
GRANT ALL ON TABLE public.elevenlabs_tts_jobs TO authenticated;
GRANT ALL ON TABLE public.elevenlabs_tts_jobs TO service_role;

-- =============================================================================
NOTIFY pgrst, 'reload schema';
