-- Migration: linkedin_webhook_failures
-- Date: 20260310110811
--
-- What this migration does:
--   Creates linkedin_webhook_failures table to log unresolved webhook
--   payloads for debugging (LI-005). Adds RLS policies scoped to org
--   membership and an index on (org_id, created_at DESC).
--
-- Rollback strategy:
--   DROP TABLE IF EXISTS public.linkedin_webhook_failures;

CREATE TABLE IF NOT EXISTS public.linkedin_webhook_failures (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  org_id uuid REFERENCES public.organizations(id),
  payload jsonb NOT NULL,
  failure_reason text NOT NULL,
  resolved boolean NOT NULL DEFAULT false,
  created_at timestamptz NOT NULL DEFAULT now()
);

-- Index for querying failures by org, newest first
CREATE INDEX IF NOT EXISTS idx_linkedin_webhook_failures_org_created
  ON public.linkedin_webhook_failures (org_id, created_at DESC);

-- Enable RLS
ALTER TABLE public.linkedin_webhook_failures ENABLE ROW LEVEL SECURITY;

-- RLS: org members can SELECT their org's failures
DROP POLICY IF EXISTS "org_members_select_webhook_failures" ON public.linkedin_webhook_failures;
CREATE POLICY "org_members_select_webhook_failures"
  ON public.linkedin_webhook_failures
  FOR SELECT
  USING (
    org_id IN (
      SELECT om.org_id
      FROM public.organization_memberships om
      WHERE om.user_id = auth.uid()
    )
  );

-- RLS: org admins can UPDATE (e.g. mark as resolved)
DROP POLICY IF EXISTS "org_admins_update_webhook_failures" ON public.linkedin_webhook_failures;
CREATE POLICY "org_admins_update_webhook_failures"
  ON public.linkedin_webhook_failures
  FOR UPDATE
  USING (
    org_id IN (
      SELECT om.org_id
      FROM public.organization_memberships om
      WHERE om.user_id = auth.uid()
        AND om.role IN ('admin', 'owner')
    )
  );

-- RLS: service role inserts via edge functions (no user context).
-- The webhook handler uses service_role key, which bypasses RLS.
-- No INSERT policy needed for regular users — only service role inserts.
