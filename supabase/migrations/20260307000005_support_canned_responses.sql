-- Support Canned Responses
-- Pre-written response templates for support agents.
-- Global responses (org_id IS NULL) are available to all platform admins.
-- Org-specific responses are scoped to that organization's admins.

-- =====================================================
-- Table
-- =====================================================

CREATE TABLE IF NOT EXISTS public.support_canned_responses (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  org_id UUID REFERENCES public.organizations(id) ON DELETE CASCADE,
  title TEXT NOT NULL,
  content TEXT NOT NULL,
  category TEXT,
  shortcut TEXT,
  created_by UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- =====================================================
-- Indexes
-- =====================================================

CREATE INDEX IF NOT EXISTS support_canned_responses_org_id_idx ON public.support_canned_responses(org_id);
CREATE INDEX IF NOT EXISTS support_canned_responses_category_idx ON public.support_canned_responses(category);

-- =====================================================
-- Auto-update updated_at trigger
-- =====================================================

CREATE OR REPLACE FUNCTION public.set_support_canned_response_updated_at()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = NOW();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS support_canned_responses_updated_at ON public.support_canned_responses;
CREATE TRIGGER support_canned_responses_updated_at
  BEFORE UPDATE ON public.support_canned_responses
  FOR EACH ROW
  EXECUTE FUNCTION public.set_support_canned_response_updated_at();

-- =====================================================
-- Row Level Security
-- =====================================================

ALTER TABLE public.support_canned_responses ENABLE ROW LEVEL SECURITY;

-- Platform admins can see all canned responses (global + all orgs)
DROP POLICY IF EXISTS "canned_responses_platform_admin_select" ON public.support_canned_responses;
CREATE POLICY "canned_responses_platform_admin_select"
ON public.support_canned_responses
FOR SELECT
USING (is_admin_optimized());

-- Platform admins can insert any canned response
DROP POLICY IF EXISTS "canned_responses_platform_admin_insert" ON public.support_canned_responses;
CREATE POLICY "canned_responses_platform_admin_insert"
ON public.support_canned_responses
FOR INSERT
WITH CHECK (is_admin_optimized());

-- Platform admins can update any canned response
DROP POLICY IF EXISTS "canned_responses_platform_admin_update" ON public.support_canned_responses;
CREATE POLICY "canned_responses_platform_admin_update"
ON public.support_canned_responses
FOR UPDATE
USING (is_admin_optimized());

-- Platform admins can delete any canned response
DROP POLICY IF EXISTS "canned_responses_platform_admin_delete" ON public.support_canned_responses;
CREATE POLICY "canned_responses_platform_admin_delete"
ON public.support_canned_responses
FOR DELETE
USING (is_admin_optimized());

-- Org admins can see global responses + their own org's responses
DROP POLICY IF EXISTS "canned_responses_org_admin_select" ON public.support_canned_responses;
CREATE POLICY "canned_responses_org_admin_select"
ON public.support_canned_responses
FOR SELECT
USING (
  (org_id IS NULL)
  OR org_id IN (
    SELECT om.org_id FROM public.organization_memberships om
    WHERE om.user_id = auth.uid()
    AND om.role IN ('owner', 'admin')
  )
);

-- Org admins can insert responses for their own org
DROP POLICY IF EXISTS "canned_responses_org_admin_insert" ON public.support_canned_responses;
CREATE POLICY "canned_responses_org_admin_insert"
ON public.support_canned_responses
FOR INSERT
WITH CHECK (
  org_id IS NOT NULL
  AND org_id IN (
    SELECT om.org_id FROM public.organization_memberships om
    WHERE om.user_id = auth.uid()
    AND om.role IN ('owner', 'admin')
  )
);

-- Org admins can update their own org's responses
DROP POLICY IF EXISTS "canned_responses_org_admin_update" ON public.support_canned_responses;
CREATE POLICY "canned_responses_org_admin_update"
ON public.support_canned_responses
FOR UPDATE
USING (
  org_id IS NOT NULL
  AND org_id IN (
    SELECT om.org_id FROM public.organization_memberships om
    WHERE om.user_id = auth.uid()
    AND om.role IN ('owner', 'admin')
  )
);

-- Org admins can delete their own org's responses
DROP POLICY IF EXISTS "canned_responses_org_admin_delete" ON public.support_canned_responses;
CREATE POLICY "canned_responses_org_admin_delete"
ON public.support_canned_responses
FOR DELETE
USING (
  org_id IS NOT NULL
  AND org_id IN (
    SELECT om.org_id FROM public.organization_memberships om
    WHERE om.user_id = auth.uid()
    AND om.role IN ('owner', 'admin')
  )
);
