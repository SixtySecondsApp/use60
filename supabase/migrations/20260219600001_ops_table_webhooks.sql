-- Migration: OTW-001 — Ops Table Webhooks schema
-- Purpose: Inbound webhook endpoints for dynamic tables, with API key auth,
--          field mapping, activity log, and ENUM extensions.
-- Date: 2026-02-19

-- =============================================================================
-- 1. ops_table_webhooks — one webhook endpoint per dynamic table
-- =============================================================================

CREATE TABLE IF NOT EXISTS public.ops_table_webhooks (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  table_id UUID NOT NULL REFERENCES public.dynamic_tables(id) ON DELETE CASCADE,
  org_id UUID NOT NULL REFERENCES public.organizations(id) ON DELETE CASCADE,
  api_key TEXT NOT NULL DEFAULT '',
  previous_api_key TEXT,
  previous_api_key_expires_at TIMESTAMPTZ,
  is_enabled BOOLEAN NOT NULL DEFAULT true,
  auto_create_columns BOOLEAN NOT NULL DEFAULT false,
  first_call_received_at TIMESTAMPTZ,
  field_mapping JSONB,
  created_by UUID REFERENCES auth.users(id),
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE(table_id)
);

COMMENT ON TABLE public.ops_table_webhooks IS
  'One inbound webhook endpoint per dynamic table. Stores API key, field mapping config, and first-call timestamp.';
COMMENT ON COLUMN public.ops_table_webhooks.api_key IS
  'Active API key (sk_ prefix + 64 hex chars). Validated on every inbound webhook request.';
COMMENT ON COLUMN public.ops_table_webhooks.previous_api_key IS
  'Previous API key kept alive during rotation grace period.';
COMMENT ON COLUMN public.ops_table_webhooks.previous_api_key_expires_at IS
  'When the previous_api_key stops being accepted (24 h after rotation).';
COMMENT ON COLUMN public.ops_table_webhooks.auto_create_columns IS
  'If true, unknown payload fields are automatically added as new columns.';
COMMENT ON COLUMN public.ops_table_webhooks.field_mapping IS
  'JSON map of incoming payload keys → table column keys.';
COMMENT ON COLUMN public.ops_table_webhooks.first_call_received_at IS
  'Timestamp of the first successful inbound webhook call (for onboarding UX).';

-- =============================================================================
-- 2. ops_webhook_logs — inbound / outbound activity log
-- =============================================================================

CREATE TABLE IF NOT EXISTS public.ops_webhook_logs (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  webhook_id UUID NOT NULL REFERENCES public.ops_table_webhooks(id) ON DELETE CASCADE,
  direction TEXT NOT NULL CHECK (direction IN ('inbound', 'outbound')),
  status INTEGER,
  payload JSONB,
  mapped_result JSONB,
  rows_affected INTEGER DEFAULT 0,
  error TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

COMMENT ON TABLE public.ops_webhook_logs IS
  'Activity log for inbound and outbound webhook calls. Retained for debugging and audit.';
COMMENT ON COLUMN public.ops_webhook_logs.direction IS
  'inbound = data received from external source; outbound = data pushed to external URL.';
COMMENT ON COLUMN public.ops_webhook_logs.status IS
  'HTTP status code returned/received (e.g. 200, 400, 500).';
COMMENT ON COLUMN public.ops_webhook_logs.mapped_result IS
  'Row data after field mapping was applied (for inbound calls).';
COMMENT ON COLUMN public.ops_webhook_logs.rows_affected IS
  'Number of dynamic_table_rows created or updated by this call.';

-- =============================================================================
-- 3. Indexes
-- =============================================================================

CREATE INDEX IF NOT EXISTS idx_ops_webhook_logs_webhook_time
  ON public.ops_webhook_logs(webhook_id, created_at DESC);

CREATE INDEX IF NOT EXISTS idx_ops_table_webhooks_table_id
  ON public.ops_table_webhooks(table_id);

-- =============================================================================
-- 4. updated_at trigger for ops_table_webhooks
-- =============================================================================

CREATE OR REPLACE FUNCTION public.set_ops_table_webhooks_updated_at()
RETURNS TRIGGER
LANGUAGE plpgsql
AS $$
BEGIN
  NEW.updated_at := now();
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_ops_table_webhooks_updated_at ON public.ops_table_webhooks;
CREATE TRIGGER trg_ops_table_webhooks_updated_at
  BEFORE UPDATE ON public.ops_table_webhooks
  FOR EACH ROW EXECUTE FUNCTION public.set_ops_table_webhooks_updated_at();

-- =============================================================================
-- 5. RLS
-- =============================================================================

ALTER TABLE public.ops_table_webhooks ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.ops_webhook_logs ENABLE ROW LEVEL SECURITY;

-- Webhook config: org-scoped via table
CREATE POLICY "org_members_crud_webhooks"
  ON public.ops_table_webhooks
  FOR ALL
  USING (
    EXISTS (
      SELECT 1 FROM public.dynamic_tables dt
      JOIN public.organization_memberships om ON om.org_id = dt.organization_id
      WHERE dt.id = ops_table_webhooks.table_id
        AND om.user_id = auth.uid()
    )
  );

-- Webhook logs: read by org members via webhook → table
CREATE POLICY "org_members_read_webhook_logs"
  ON public.ops_webhook_logs
  FOR SELECT
  USING (
    EXISTS (
      SELECT 1 FROM public.ops_table_webhooks w
      JOIN public.dynamic_tables dt ON dt.id = w.table_id
      JOIN public.organization_memberships om ON om.org_id = dt.organization_id
      WHERE w.id = ops_webhook_logs.webhook_id
        AND om.user_id = auth.uid()
    )
  );

-- Allow service role to insert logs (called from edge function)
CREATE POLICY "service_insert_webhook_logs"
  ON public.ops_webhook_logs
  FOR INSERT
  WITH CHECK (true);

-- =============================================================================
-- 6. Extend dynamic_table_rows source_type CHECK to include 'webhook'
--    (Column added in 20260218000001 with an inline unnamed CHECK constraint)
-- =============================================================================

DO $$
DECLARE
  v_constraint_name TEXT;
BEGIN
  -- Find the unnamed (auto-generated) check constraint on dynamic_table_rows.source_type
  SELECT c.conname INTO v_constraint_name
  FROM pg_constraint c
  JOIN pg_class r ON r.oid = c.conrelid
  JOIN pg_namespace n ON n.oid = r.relnamespace
  WHERE c.contype = 'c'
    AND n.nspname = 'public'
    AND r.relname = 'dynamic_table_rows'
    AND pg_get_constraintdef(c.oid) LIKE '%source_type%'
  LIMIT 1;

  IF v_constraint_name IS NOT NULL THEN
    EXECUTE format('ALTER TABLE public.dynamic_table_rows DROP CONSTRAINT IF EXISTS %I', v_constraint_name);
  END IF;
END $$;

ALTER TABLE public.dynamic_table_rows
  ADD CONSTRAINT dynamic_table_rows_source_type_check
  CHECK (source_type IN ('manual', 'hubspot', 'attio', 'app', 'webhook'));

COMMENT ON CONSTRAINT dynamic_table_rows_source_type_check ON public.dynamic_table_rows IS
  'manual = user-created, hubspot/attio/app = CRM sync, webhook = inbound webhook call';

-- =============================================================================
-- 7. Extend ops_rules action_type CHECK to include 'webhook'
--    (Column defined inline in 20260205600000 with an unnamed CHECK constraint)
-- =============================================================================

DO $$
DECLARE
  v_constraint_name TEXT;
BEGIN
  SELECT c.conname INTO v_constraint_name
  FROM pg_constraint c
  JOIN pg_class r ON r.oid = c.conrelid
  JOIN pg_namespace n ON n.oid = r.relnamespace
  WHERE c.contype = 'c'
    AND n.nspname = 'public'
    AND r.relname = 'ops_rules'
    AND pg_get_constraintdef(c.oid) LIKE '%action_type%'
  LIMIT 1;

  IF v_constraint_name IS NOT NULL THEN
    EXECUTE format('ALTER TABLE public.ops_rules DROP CONSTRAINT IF EXISTS %I', v_constraint_name);
  END IF;
END $$;

ALTER TABLE public.ops_rules
  ADD CONSTRAINT ops_rules_action_type_check
  CHECK (action_type IN ('update_cell', 'run_enrichment', 'push_to_hubspot', 'add_tag', 'notify', 'webhook'));

COMMENT ON CONSTRAINT ops_rules_action_type_check ON public.ops_rules IS
  'Supported rule action types. webhook = fire outbound HTTP request.';

-- =============================================================================
-- 8. generate_webhook_api_key RPC
--    Creates or rotates the API key for a table's webhook.
--    On rotation, keeps the previous key alive for 24 hours.
-- =============================================================================

CREATE OR REPLACE FUNCTION public.generate_webhook_api_key(p_table_id UUID)
RETURNS TEXT
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_new_key TEXT;
  v_webhook_id UUID;
  v_org_id UUID;
  v_created_by UUID;
BEGIN
  v_new_key := 'sk_' || encode(gen_random_bytes(32), 'hex');
  SELECT id INTO v_webhook_id FROM ops_table_webhooks WHERE table_id = p_table_id;

  IF v_webhook_id IS NULL THEN
    SELECT organization_id, created_by INTO v_org_id, v_created_by FROM dynamic_tables WHERE id = p_table_id;
    INSERT INTO ops_table_webhooks (table_id, org_id, api_key, created_by)
    VALUES (p_table_id, v_org_id, v_new_key, v_created_by);
  ELSE
    UPDATE ops_table_webhooks
    SET previous_api_key = api_key,
        previous_api_key_expires_at = now() + interval '24 hours',
        api_key = v_new_key,
        updated_at = now()
    WHERE id = v_webhook_id;
  END IF;

  RETURN v_new_key;
END;
$$;

COMMENT ON FUNCTION public.generate_webhook_api_key(UUID) IS
  'Creates or rotates the inbound webhook API key for a dynamic table. Previous key remains valid for 24 hours after rotation.';

-- =============================================================================
-- Done
-- =============================================================================

NOTIFY pgrst, 'reload schema';
