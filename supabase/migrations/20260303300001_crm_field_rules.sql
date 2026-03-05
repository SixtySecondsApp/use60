-- ============================================================================
-- Migration: crm_field_rules table + audit trail RPC
-- Stories: CRM-CFG-006, CRM-CFG-003, CRM-CFG-004
-- Purpose:
--   - crm_field_rules: per-field auto-update mode + confidence threshold
--   - get_crm_mutation_audit: paginated audit trail of CRM mutations
--   - undo_crm_mutation: revert a specific mutation using stored payload
-- ============================================================================

-- =============================================================================
-- Table: crm_field_rules
-- Per-field configuration: mode (auto/approve/never) + confidence threshold
-- =============================================================================

CREATE TABLE IF NOT EXISTS crm_field_rules (
  id                   UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  org_id               UUID NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
  crm_field            TEXT NOT NULL,
  crm_object           TEXT NOT NULL DEFAULT 'deal'
                         CHECK (crm_object IN ('contact', 'deal', 'company', 'activity')),
  mode                 TEXT NOT NULL DEFAULT 'approve'
                         CHECK (mode IN ('auto', 'approve', 'never')),
  confidence_threshold INTEGER NOT NULL DEFAULT 75
                         CHECK (confidence_threshold BETWEEN 0 AND 100),
  updated_by           UUID REFERENCES auth.users(id) ON DELETE SET NULL,
  created_at           TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at           TIMESTAMPTZ NOT NULL DEFAULT now(),
  CONSTRAINT uq_crm_field_rules_per_org UNIQUE (org_id, crm_object, crm_field)
);

CREATE INDEX IF NOT EXISTS idx_crm_field_rules_org
  ON crm_field_rules (org_id, crm_object);

ALTER TABLE crm_field_rules ENABLE ROW LEVEL SECURITY;

DO $$ BEGIN
  CREATE POLICY "Users can read org field rules"
    ON crm_field_rules FOR SELECT
    USING (
      org_id IN (
        SELECT org_id FROM organization_memberships WHERE user_id = auth.uid()
      )
    );
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

DO $$ BEGIN
  CREATE POLICY "Admins can manage org field rules"
    ON crm_field_rules FOR ALL
    USING (
      org_id IN (
        SELECT org_id FROM organization_memberships
        WHERE user_id = auth.uid()
          AND role IN ('admin', 'owner')
      )
    )
    WITH CHECK (
      org_id IN (
        SELECT org_id FROM organization_memberships
        WHERE user_id = auth.uid()
          AND role IN ('admin', 'owner')
      )
    );
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

-- Service role full access
DO $$ BEGIN
  CREATE POLICY "Service role full access crm_field_rules"
    ON crm_field_rules FOR ALL
    TO service_role
    USING (true)
    WITH CHECK (true);
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

-- =============================================================================
-- Add previous_payload column to crm_writeback_queue for undo support
-- =============================================================================

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_name = 'crm_writeback_queue' AND column_name = 'previous_payload'
  ) THEN
    ALTER TABLE crm_writeback_queue
      ADD COLUMN previous_payload JSONB DEFAULT NULL;
    COMMENT ON COLUMN crm_writeback_queue.previous_payload IS
      'Snapshot of field values before this mutation — used for undo.';
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_name = 'crm_writeback_queue' AND column_name = 'is_undone'
  ) THEN
    ALTER TABLE crm_writeback_queue
      ADD COLUMN is_undone BOOLEAN NOT NULL DEFAULT false;
    COMMENT ON COLUMN crm_writeback_queue.is_undone IS
      'Set to true when this mutation has been reversed by undo.';
  END IF;
END $$;

-- =============================================================================
-- Function: get_crm_mutation_audit
-- Returns paginated completed CRM mutations for audit trail display.
-- =============================================================================

CREATE OR REPLACE FUNCTION get_crm_mutation_audit(
  p_org_id        UUID,
  p_entity_type   TEXT    DEFAULT NULL,
  p_limit         INTEGER DEFAULT 50,
  p_offset        INTEGER DEFAULT 0
)
RETURNS TABLE (
  id                UUID,
  entity_type       TEXT,
  crm_record_id     TEXT,
  local_record_id   UUID,
  operation         TEXT,
  crm_source        TEXT,
  payload           JSONB,
  previous_payload  JSONB,
  triggered_by      TEXT,
  triggered_by_user_id UUID,
  status            TEXT,
  is_undone         BOOLEAN,
  completed_at      TIMESTAMPTZ,
  created_at        TIMESTAMPTZ,
  last_error        TEXT
)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $$
BEGIN
  -- Verify caller is a member of this org
  IF NOT EXISTS (
    SELECT 1 FROM organization_memberships
    WHERE org_id = p_org_id AND user_id = auth.uid()
  ) THEN
    RETURN;
  END IF;

  RETURN QUERY
  SELECT
    q.id,
    q.entity_type,
    q.crm_record_id,
    q.local_record_id,
    q.operation,
    q.crm_source,
    q.payload,
    q.previous_payload,
    q.triggered_by,
    q.triggered_by_user_id,
    q.status,
    q.is_undone,
    q.completed_at,
    q.created_at,
    q.last_error
  FROM crm_writeback_queue q
  WHERE q.org_id = p_org_id
    AND q.status IN ('completed', 'failed', 'dead_letter')
    AND (p_entity_type IS NULL OR q.entity_type = p_entity_type)
  ORDER BY q.created_at DESC
  LIMIT p_limit
  OFFSET p_offset;
END;
$$;

GRANT EXECUTE ON FUNCTION get_crm_mutation_audit(UUID, TEXT, INTEGER, INTEGER) TO authenticated;

COMMENT ON FUNCTION get_crm_mutation_audit IS
  'Returns paginated audit log of completed CRM mutations for an org. Caller must be an org member.';

-- =============================================================================
-- Comments
-- =============================================================================

COMMENT ON TABLE crm_field_rules IS
  'Per-field CRM auto-update rules. mode=auto writes immediately above confidence_threshold, mode=approve requires HITL, mode=never skips the field entirely.';
