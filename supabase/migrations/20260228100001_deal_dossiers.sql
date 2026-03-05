-- DOSS-001: Create deal_dossiers table for persistent deal intelligence
-- Stores AI-synthesized dossier snapshots from copilot conversations and meetings

CREATE TABLE IF NOT EXISTS public.deal_dossiers (
  id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  deal_id         UUID NOT NULL REFERENCES public.deals(id) ON DELETE CASCADE,
  org_id          UUID NOT NULL,
  snapshot        JSONB NOT NULL DEFAULT '{}'::jsonb,
  -- snapshot structure: { narrative, key_facts[], stakeholders[], commitments[], objections[], timeline[] }
  last_meetings_hash TEXT,  -- hash of meeting IDs already incorporated, prevents reprocessing
  updated_at      TIMESTAMPTZ NOT NULL DEFAULT now(),
  created_at      TIMESTAMPTZ NOT NULL DEFAULT now(),
  CONSTRAINT unique_deal_dossier UNIQUE (deal_id)
);

-- Index for fast lookup by deal_id (also enforced by unique constraint)
CREATE INDEX IF NOT EXISTS idx_deal_dossiers_deal_id ON public.deal_dossiers(deal_id);
CREATE INDEX IF NOT EXISTS idx_deal_dossiers_org_id ON public.deal_dossiers(org_id);

-- RLS
ALTER TABLE public.deal_dossiers ENABLE ROW LEVEL SECURITY;

-- Users can read dossiers for deals in their org
DROP POLICY IF EXISTS "Users can read dossiers in their org" ON public.deal_dossiers;
CREATE POLICY "Users can read dossiers in their org"
  ON public.deal_dossiers FOR SELECT
  USING (
    org_id IN (
      SELECT org_id FROM public.organization_memberships
      WHERE user_id = auth.uid()
    )
  );

-- Users can insert dossiers for deals in their org
DROP POLICY IF EXISTS "Users can insert dossiers in their org" ON public.deal_dossiers;
CREATE POLICY "Users can insert dossiers in their org"
  ON public.deal_dossiers FOR INSERT
  WITH CHECK (
    org_id IN (
      SELECT org_id FROM public.organization_memberships
      WHERE user_id = auth.uid()
    )
  );

-- Users can update dossiers for deals in their org
DROP POLICY IF EXISTS "Users can update dossiers in their org" ON public.deal_dossiers;
CREATE POLICY "Users can update dossiers in their org"
  ON public.deal_dossiers FOR UPDATE
  USING (
    org_id IN (
      SELECT org_id FROM public.organization_memberships
      WHERE user_id = auth.uid()
    )
  );

-- Service role bypass for edge functions (cron jobs, webhooks)
DROP POLICY IF EXISTS "Service role full access" ON public.deal_dossiers;
CREATE POLICY "Service role full access"
  ON public.deal_dossiers FOR ALL
  USING (auth.role() = 'service_role');
