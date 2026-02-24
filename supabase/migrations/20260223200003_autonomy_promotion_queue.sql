-- Phase 8: Graduated Autonomy System (PRD-24)
-- GRAD-002/003/004: Promotion queue and audit log

-- Queue for pending promotion suggestions
CREATE TABLE IF NOT EXISTS public.autonomy_promotion_queue (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  org_id uuid NOT NULL REFERENCES public.organizations(id) ON DELETE CASCADE,
  action_type text NOT NULL,
  current_policy text NOT NULL, -- 'approve', 'suggest'
  proposed_policy text NOT NULL, -- 'auto', 'approve'
  evidence jsonb NOT NULL DEFAULT '{}'::jsonb,
  status text NOT NULL DEFAULT 'pending' CHECK (status IN ('pending', 'approved', 'rejected', 'snoozed', 'expired')),
  slack_message_ts text,
  snoozed_until timestamptz,
  resolved_at timestamptz,
  resolved_by uuid,
  created_at timestamptz DEFAULT now(),
  CONSTRAINT unique_pending_promotion UNIQUE (org_id, action_type, status)
);

CREATE INDEX idx_promotion_queue_org ON public.autonomy_promotion_queue(org_id, status);

-- Audit log for all autonomy changes (promotions, demotions, manual changes)
CREATE TABLE IF NOT EXISTS public.autonomy_audit_log (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  org_id uuid NOT NULL REFERENCES public.organizations(id) ON DELETE CASCADE,
  action_type text NOT NULL,
  change_type text NOT NULL CHECK (change_type IN ('promotion', 'demotion', 'manual_change', 'cooldown_start', 'cooldown_end')),
  previous_policy text,
  new_policy text,
  trigger_reason text,
  evidence jsonb DEFAULT '{}'::jsonb,
  initiated_by text NOT NULL, -- 'system', 'admin', user_id
  created_at timestamptz DEFAULT now()
);

CREATE INDEX idx_autonomy_audit_org ON public.autonomy_audit_log(org_id, created_at DESC);
CREATE INDEX idx_autonomy_audit_action ON public.autonomy_audit_log(org_id, action_type, created_at DESC);

-- Cooldown tracking for demoted actions
CREATE TABLE IF NOT EXISTS public.autonomy_cooldowns (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  org_id uuid NOT NULL REFERENCES public.organizations(id) ON DELETE CASCADE,
  action_type text NOT NULL,
  cooldown_until timestamptz NOT NULL,
  demoted_at timestamptz DEFAULT now(),
  reason text,
  CONSTRAINT unique_cooldown UNIQUE (org_id, action_type)
);

-- RLS
ALTER TABLE public.autonomy_promotion_queue ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.autonomy_audit_log ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.autonomy_cooldowns ENABLE ROW LEVEL SECURITY;

-- Org members can view
CREATE POLICY "Org members can view promotion queue"
  ON public.autonomy_promotion_queue FOR SELECT
  USING (org_id IN (SELECT om.org_id FROM public.organization_memberships om WHERE om.user_id = auth.uid()));

CREATE POLICY "Org members can view audit log"
  ON public.autonomy_audit_log FOR SELECT
  USING (org_id IN (SELECT om.org_id FROM public.organization_memberships om WHERE om.user_id = auth.uid()));

CREATE POLICY "Org members can view cooldowns"
  ON public.autonomy_cooldowns FOR SELECT
  USING (org_id IN (SELECT om.org_id FROM public.organization_memberships om WHERE om.user_id = auth.uid()));

-- Service role full access
CREATE POLICY "Service role full access to promotion_queue" ON public.autonomy_promotion_queue FOR ALL USING (auth.role() = 'service_role');
CREATE POLICY "Service role full access to audit_log" ON public.autonomy_audit_log FOR ALL USING (auth.role() = 'service_role');
CREATE POLICY "Service role full access to cooldowns" ON public.autonomy_cooldowns FOR ALL USING (auth.role() = 'service_role');

COMMENT ON TABLE public.autonomy_promotion_queue IS 'Pending autonomy promotion suggestions for admin review (PRD-24)';
COMMENT ON TABLE public.autonomy_audit_log IS 'Complete audit trail of all autonomy policy changes (PRD-24)';
COMMENT ON TABLE public.autonomy_cooldowns IS 'Cooldown periods for demoted action types preventing re-promotion (PRD-24)';
