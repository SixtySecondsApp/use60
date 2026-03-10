-- Migration: add_published_landing_pages
-- Date: 20260310212120
--
-- What this migration does:
--   Creates published_landing_pages table for Vercel-deployed pages
--   and landing_form_submissions table for lead capture from published pages.
--
-- Rollback strategy:
--   DROP TABLE IF EXISTS public.landing_form_submissions;
--   DROP TABLE IF EXISTS public.published_landing_pages;

-- ---------------------------------------------------------------------------
-- 1. Published Landing Pages table
-- ---------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.published_landing_pages (
  id                    uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  session_id            uuid REFERENCES public.landing_builder_sessions(id) ON DELETE SET NULL,
  org_id                text NOT NULL,
  user_id               uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  slug                  text NOT NULL,
  title                 text NOT NULL DEFAULT '',
  html_content          text,
  meta_description      text,
  og_image_url          text,
  custom_domain         text,
  vercel_deployment_id  text,
  vercel_url            text,
  status                text NOT NULL DEFAULT 'draft' CHECK (status IN ('draft', 'published', 'unpublished')),
  seo_config            jsonb DEFAULT '{}'::jsonb,
  auto_create_contacts  boolean NOT NULL DEFAULT false,
  published_at          timestamptz,
  created_at            timestamptz NOT NULL DEFAULT now(),
  updated_at            timestamptz NOT NULL DEFAULT now()
);

-- ---------------------------------------------------------------------------
-- 2. Indexes
-- ---------------------------------------------------------------------------
CREATE UNIQUE INDEX IF NOT EXISTS idx_published_landing_pages_slug
  ON public.published_landing_pages (slug);

CREATE INDEX IF NOT EXISTS idx_published_landing_pages_org
  ON public.published_landing_pages (org_id);

CREATE INDEX IF NOT EXISTS idx_published_landing_pages_user
  ON public.published_landing_pages (user_id);

-- ---------------------------------------------------------------------------
-- 3. RLS for published_landing_pages
-- ---------------------------------------------------------------------------
ALTER TABLE public.published_landing_pages ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "users_select_own_published_pages" ON public.published_landing_pages;
CREATE POLICY "users_select_own_published_pages"
  ON public.published_landing_pages
  FOR SELECT TO authenticated
  USING (auth.uid() = user_id);

DROP POLICY IF EXISTS "users_insert_own_published_pages" ON public.published_landing_pages;
CREATE POLICY "users_insert_own_published_pages"
  ON public.published_landing_pages
  FOR INSERT TO authenticated
  WITH CHECK (auth.uid() = user_id);

DROP POLICY IF EXISTS "users_update_own_published_pages" ON public.published_landing_pages;
CREATE POLICY "users_update_own_published_pages"
  ON public.published_landing_pages
  FOR UPDATE TO authenticated
  USING (auth.uid() = user_id)
  WITH CHECK (auth.uid() = user_id);

DROP POLICY IF EXISTS "users_delete_own_published_pages" ON public.published_landing_pages;
CREATE POLICY "users_delete_own_published_pages"
  ON public.published_landing_pages
  FOR DELETE TO authenticated
  USING (auth.uid() = user_id);

-- ---------------------------------------------------------------------------
-- 4. updated_at trigger
-- ---------------------------------------------------------------------------
DROP TRIGGER IF EXISTS set_published_landing_pages_updated_at ON public.published_landing_pages;
CREATE TRIGGER set_published_landing_pages_updated_at
  BEFORE UPDATE ON public.published_landing_pages
  FOR EACH ROW
  EXECUTE FUNCTION public.update_updated_at_column();

-- ---------------------------------------------------------------------------
-- 5. Form Submissions table
-- ---------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.landing_form_submissions (
  id            uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  page_id       uuid NOT NULL REFERENCES public.published_landing_pages(id) ON DELETE CASCADE,
  org_id        text NOT NULL,
  form_data     jsonb NOT NULL DEFAULT '{}'::jsonb,
  source_url    text,
  ip_address    text,
  user_agent    text,
  submitted_at  timestamptz NOT NULL DEFAULT now()
);

-- ---------------------------------------------------------------------------
-- 6. Form Submissions indexes
-- ---------------------------------------------------------------------------
CREATE INDEX IF NOT EXISTS idx_landing_form_submissions_page
  ON public.landing_form_submissions (page_id);

CREATE INDEX IF NOT EXISTS idx_landing_form_submissions_org
  ON public.landing_form_submissions (org_id);

CREATE INDEX IF NOT EXISTS idx_landing_form_submissions_submitted
  ON public.landing_form_submissions (submitted_at DESC);

-- ---------------------------------------------------------------------------
-- 7. RLS for form submissions
-- ---------------------------------------------------------------------------
ALTER TABLE public.landing_form_submissions ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "org_members_select_form_submissions" ON public.landing_form_submissions;
CREATE POLICY "org_members_select_form_submissions"
  ON public.landing_form_submissions
  FOR SELECT TO authenticated
  USING (
    org_id IN (
      SELECT om.org_id FROM public.organization_members om
      WHERE om.user_id = auth.uid() AND om.status = 'active'
    )
  );

DROP POLICY IF EXISTS "anon_insert_form_submissions" ON public.landing_form_submissions;
CREATE POLICY "anon_insert_form_submissions"
  ON public.landing_form_submissions
  FOR INSERT TO anon, authenticated
  WITH CHECK (true);

DROP POLICY IF EXISTS "org_members_delete_form_submissions" ON public.landing_form_submissions;
CREATE POLICY "org_members_delete_form_submissions"
  ON public.landing_form_submissions
  FOR DELETE TO authenticated
  USING (
    org_id IN (
      SELECT om.org_id FROM public.organization_members om
      WHERE om.user_id = auth.uid() AND om.status = 'active'
    )
  );
