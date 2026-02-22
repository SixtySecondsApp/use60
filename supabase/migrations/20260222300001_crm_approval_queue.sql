-- ============================================================================
-- PRD-03: Auto CRM Update Agent — Approval Queue & Field Update Enhancements
-- Migration: CRM-001
--
-- Creates crm_approval_queue for HITL approval of AI-proposed CRM changes.
-- Enhances crm_field_updates with audit trail columns (previous_value,
-- change_source, confidence, meeting_id).
-- ============================================================================

-- ---------------------------------------------------------------------------
-- 1. Enhance crm_field_updates with new audit columns
-- ---------------------------------------------------------------------------

ALTER TABLE crm_field_updates
  ADD COLUMN IF NOT EXISTS previous_value   JSONB,
  ADD COLUMN IF NOT EXISTS change_source    TEXT CHECK (change_source IN ('auto_apply', 'approved', 'manual')),
  ADD COLUMN IF NOT EXISTS confidence_score TEXT,
  ADD COLUMN IF NOT EXISTS meeting_id       UUID REFERENCES meetings(id) ON DELETE SET NULL;

COMMENT ON COLUMN crm_field_updates.previous_value   IS 'Snapshot of the value before this update (for full audit trail)';
COMMENT ON COLUMN crm_field_updates.change_source    IS 'How this update was applied: auto_apply (high-confidence), approved (via HITL), manual (user-initiated)';
COMMENT ON COLUMN crm_field_updates.confidence_score IS 'Raw confidence text passed from the classifier (mirrors crm_approval_queue.confidence)';
COMMENT ON COLUMN crm_field_updates.meeting_id       IS 'Meeting that triggered this CRM update';

-- Index for meeting-scoped queries
CREATE INDEX IF NOT EXISTS idx_crm_field_updates_meeting
  ON crm_field_updates(meeting_id)
  WHERE meeting_id IS NOT NULL;

-- ---------------------------------------------------------------------------
-- 2. Create crm_approval_queue table
-- ---------------------------------------------------------------------------

CREATE TABLE IF NOT EXISTS crm_approval_queue (
  id               UUID        PRIMARY KEY DEFAULT gen_random_uuid(),

  -- Context
  org_id           UUID        NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
  user_id          UUID        NOT NULL,
  deal_id          UUID        REFERENCES deals(id) ON DELETE CASCADE,
  meeting_id       UUID        REFERENCES meetings(id) ON DELETE SET NULL,

  -- Proposed change
  field_name       TEXT        NOT NULL,
  current_value    JSONB,
  proposed_value   JSONB,

  -- Classification
  confidence       TEXT        NOT NULL CHECK (confidence IN ('high', 'medium', 'low')),
  reason           TEXT,

  -- Lifecycle
  status           TEXT        NOT NULL DEFAULT 'pending'
                               CHECK (status IN ('pending', 'approved', 'rejected', 'edited', 'expired')),

  -- Slack HITL
  slack_message_ts TEXT,

  -- Approval metadata
  approved_by      UUID,
  approved_at      TIMESTAMPTZ,

  -- Expiry (auto-set by trigger to created_at + 48h)
  expires_at       TIMESTAMPTZ,

  -- Timestamps
  created_at       TIMESTAMPTZ NOT NULL DEFAULT now()
);

COMMENT ON TABLE crm_approval_queue IS
  'Holds AI-proposed CRM field changes pending human approval (HITL). '
  'High-confidence changes bypass this table and go directly to crm_field_updates via auto-apply.';

COMMENT ON COLUMN crm_approval_queue.org_id           IS 'Organization that owns this approval request';
COMMENT ON COLUMN crm_approval_queue.user_id          IS 'Rep whose meeting triggered the proposed change';
COMMENT ON COLUMN crm_approval_queue.deal_id          IS 'Deal whose field is being proposed for change';
COMMENT ON COLUMN crm_approval_queue.meeting_id       IS 'Meeting that generated the proposed change';
COMMENT ON COLUMN crm_approval_queue.field_name       IS 'CRM field being proposed for update';
COMMENT ON COLUMN crm_approval_queue.current_value    IS 'Current value of the field at time of proposal';
COMMENT ON COLUMN crm_approval_queue.proposed_value   IS 'AI-proposed new value';
COMMENT ON COLUMN crm_approval_queue.confidence       IS 'AI confidence: high (auto-apply), medium/low (queue for approval)';
COMMENT ON COLUMN crm_approval_queue.reason           IS 'AI reasoning for the proposed change';
COMMENT ON COLUMN crm_approval_queue.status           IS 'Lifecycle state: pending → approved/rejected/edited, or expired after 48h';
COMMENT ON COLUMN crm_approval_queue.slack_message_ts IS 'Slack message timestamp for updating HITL approval blocks';
COMMENT ON COLUMN crm_approval_queue.approved_by      IS 'User who approved/rejected (null until actioned)';
COMMENT ON COLUMN crm_approval_queue.approved_at      IS 'Timestamp of approval/rejection action';
COMMENT ON COLUMN crm_approval_queue.expires_at       IS 'Auto-set to created_at + 48h; heartbeat monitor marks expired rows';

-- ---------------------------------------------------------------------------
-- 3. Indexes
-- ---------------------------------------------------------------------------

-- Primary queue query: fetch pending items for an org sorted by time
CREATE INDEX IF NOT EXISTS idx_crm_approval_queue_pending
  ON crm_approval_queue (org_id, status, created_at DESC)
  WHERE status = 'pending';

-- General org + status queries (e.g., history view)
CREATE INDEX IF NOT EXISTS idx_crm_approval_queue_org_status
  ON crm_approval_queue (org_id, status, created_at DESC);

-- Deal-scoped lookups
CREATE INDEX IF NOT EXISTS idx_crm_approval_queue_deal
  ON crm_approval_queue (deal_id, created_at DESC)
  WHERE deal_id IS NOT NULL;

-- Expiry heartbeat: find rows to mark expired
CREATE INDEX IF NOT EXISTS idx_crm_approval_queue_expires
  ON crm_approval_queue (expires_at)
  WHERE status = 'pending';

-- ---------------------------------------------------------------------------
-- 4. Trigger: auto-set expires_at on INSERT
-- ---------------------------------------------------------------------------

CREATE OR REPLACE FUNCTION crm_approval_queue_set_expiry()
RETURNS TRIGGER
LANGUAGE plpgsql
AS $$
BEGIN
  -- Only set on INSERT; don't overwrite if caller explicitly provides a value
  IF NEW.expires_at IS NULL THEN
    NEW.expires_at := NEW.created_at + INTERVAL '48 hours';
  END IF;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_crm_approval_queue_set_expiry ON crm_approval_queue;
CREATE TRIGGER trg_crm_approval_queue_set_expiry
  BEFORE INSERT ON crm_approval_queue
  FOR EACH ROW EXECUTE FUNCTION crm_approval_queue_set_expiry();

-- ---------------------------------------------------------------------------
-- 5. Row Level Security
-- ---------------------------------------------------------------------------

ALTER TABLE crm_approval_queue ENABLE ROW LEVEL SECURITY;

-- Service role: unrestricted (edge functions use service-role client)
CREATE POLICY "crm_approval_queue_service_all"
  ON crm_approval_queue FOR ALL
  USING (auth.role() = 'service_role');

-- Org members: read their org's approval queue
CREATE POLICY "crm_approval_queue_org_read"
  ON crm_approval_queue FOR SELECT
  TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM organization_memberships om
      WHERE om.org_id = crm_approval_queue.org_id
        AND om.user_id = auth.uid()
    )
  );

-- Org admins/owners: approve/reject/edit any item in their org
CREATE POLICY "crm_approval_queue_org_admin_write"
  ON crm_approval_queue FOR UPDATE
  TO authenticated
  USING (
    get_org_role(auth.uid(), org_id) IN ('admin', 'owner')
  );

-- The owning rep can see and act on their own pending items
CREATE POLICY "crm_approval_queue_owner_write"
  ON crm_approval_queue FOR UPDATE
  TO authenticated
  USING (user_id = auth.uid());

-- ---------------------------------------------------------------------------
-- 6. Grants
-- ---------------------------------------------------------------------------

GRANT SELECT, INSERT, UPDATE ON crm_approval_queue TO authenticated;
GRANT SELECT, INSERT, UPDATE, DELETE ON crm_approval_queue TO service_role;

-- ---------------------------------------------------------------------------
-- 7. Helper RPCs
-- ---------------------------------------------------------------------------

-- RPC: create a new approval queue item (called from edge functions)
CREATE OR REPLACE FUNCTION create_crm_approval_item(
  p_org_id        UUID,
  p_user_id       UUID,
  p_deal_id       UUID,
  p_meeting_id    UUID,
  p_field_name    TEXT,
  p_current_value JSONB,
  p_proposed_value JSONB,
  p_confidence    TEXT,
  p_reason        TEXT DEFAULT NULL
)
RETURNS UUID
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = 'public'
AS $$
DECLARE
  v_id UUID;
BEGIN
  IF p_confidence NOT IN ('high', 'medium', 'low') THEN
    RAISE EXCEPTION 'Invalid confidence level: %', p_confidence;
  END IF;

  INSERT INTO crm_approval_queue (
    org_id, user_id, deal_id, meeting_id,
    field_name, current_value, proposed_value,
    confidence, reason
  ) VALUES (
    p_org_id, p_user_id, p_deal_id, p_meeting_id,
    p_field_name, p_current_value, p_proposed_value,
    p_confidence, p_reason
  )
  RETURNING id INTO v_id;

  RETURN v_id;
END;
$$;

COMMENT ON FUNCTION create_crm_approval_item IS
  'Creates a new CRM approval queue item. expires_at is auto-set to +48h by trigger.';

GRANT EXECUTE ON FUNCTION create_crm_approval_item(UUID, UUID, UUID, UUID, TEXT, JSONB, JSONB, TEXT, TEXT)
  TO authenticated;
GRANT EXECUTE ON FUNCTION create_crm_approval_item(UUID, UUID, UUID, UUID, TEXT, JSONB, JSONB, TEXT, TEXT)
  TO service_role;

-- RPC: resolve an approval item (approve/reject/edit) and optionally log the field update
CREATE OR REPLACE FUNCTION resolve_crm_approval_item(
  p_approval_id    UUID,
  p_actor_user_id  UUID,
  p_action         TEXT,   -- 'approved' | 'rejected' | 'edited'
  p_final_value    JSONB   DEFAULT NULL  -- used when action = 'edited'
)
RETURNS BOOLEAN
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = 'public'
AS $$
DECLARE
  v_item crm_approval_queue%ROWTYPE;
BEGIN
  IF p_action NOT IN ('approved', 'rejected', 'edited') THEN
    RAISE EXCEPTION 'Invalid action: %. Must be approved, rejected, or edited.', p_action;
  END IF;

  SELECT * INTO v_item
  FROM crm_approval_queue
  WHERE id = p_approval_id;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'Approval item not found: %', p_approval_id;
  END IF;

  IF v_item.status != 'pending' THEN
    RAISE EXCEPTION 'Approval item is not pending (current status: %)', v_item.status;
  END IF;

  -- Update the queue item
  UPDATE crm_approval_queue
  SET
    status      = p_action,
    approved_by = p_actor_user_id,
    approved_at = NOW()
  WHERE id = p_approval_id;

  -- If approved or edited, write a crm_field_updates record
  IF p_action IN ('approved', 'edited') THEN
    INSERT INTO crm_field_updates (
      org_id,
      deal_id,
      user_id,
      field_name,
      old_value,
      new_value,
      previous_value,
      confidence,
      change_source,
      confidence_score,
      meeting_id,
      reasoning
    ) VALUES (
      v_item.org_id::text,
      v_item.deal_id,
      v_item.user_id,
      v_item.field_name,
      v_item.current_value,
      COALESCE(p_final_value, v_item.proposed_value),
      v_item.current_value,
      v_item.confidence::crm_update_confidence,
      'approved',
      v_item.confidence,
      v_item.meeting_id,
      v_item.reason
    );
  END IF;

  RETURN TRUE;
END;
$$;

COMMENT ON FUNCTION resolve_crm_approval_item IS
  'Marks an approval item as approved/rejected/edited. For approved/edited actions, '
  'writes a corresponding crm_field_updates record with change_source = approved.';

GRANT EXECUTE ON FUNCTION resolve_crm_approval_item(UUID, UUID, TEXT, JSONB)
  TO authenticated;
GRANT EXECUTE ON FUNCTION resolve_crm_approval_item(UUID, UUID, TEXT, JSONB)
  TO service_role;

-- RPC: get pending approval queue for an org (for dashboard & Slack heartbeat)
CREATE OR REPLACE FUNCTION get_pending_crm_approvals(
  p_org_id  UUID,
  p_limit   INT DEFAULT 50
)
RETURNS TABLE (
  id               UUID,
  user_id          UUID,
  deal_id          UUID,
  meeting_id       UUID,
  field_name       TEXT,
  current_value    JSONB,
  proposed_value   JSONB,
  confidence       TEXT,
  reason           TEXT,
  slack_message_ts TEXT,
  expires_at       TIMESTAMPTZ,
  created_at       TIMESTAMPTZ
)
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = 'public'
AS $$
  SELECT
    caq.id,
    caq.user_id,
    caq.deal_id,
    caq.meeting_id,
    caq.field_name,
    caq.current_value,
    caq.proposed_value,
    caq.confidence,
    caq.reason,
    caq.slack_message_ts,
    caq.expires_at,
    caq.created_at
  FROM crm_approval_queue caq
  WHERE caq.org_id = p_org_id
    AND caq.status = 'pending'
  ORDER BY caq.created_at DESC
  LIMIT p_limit;
$$;

COMMENT ON FUNCTION get_pending_crm_approvals IS
  'Returns pending approval items for an org, ordered newest-first.';

GRANT EXECUTE ON FUNCTION get_pending_crm_approvals(UUID, INT) TO authenticated;
GRANT EXECUTE ON FUNCTION get_pending_crm_approvals(UUID, INT) TO service_role;
