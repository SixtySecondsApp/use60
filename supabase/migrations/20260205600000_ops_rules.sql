-- Migration: OPS-023 — Ops automation rules schema
-- Date: 2026-02-05

-- Rules table
CREATE TABLE IF NOT EXISTS public.ops_rules (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  table_id UUID NOT NULL REFERENCES public.dynamic_tables(id) ON DELETE CASCADE,
  name TEXT NOT NULL DEFAULT 'Untitled Rule',
  trigger_type TEXT NOT NULL CHECK (trigger_type IN ('cell_updated', 'enrichment_complete', 'row_created')),
  condition JSONB NOT NULL DEFAULT '{}',   -- { column_key, operator, value }
  action_type TEXT NOT NULL CHECK (action_type IN ('update_cell', 'run_enrichment', 'push_to_hubspot', 'add_tag', 'notify')),
  action_config JSONB NOT NULL DEFAULT '{}',  -- action-specific config
  is_enabled BOOLEAN NOT NULL DEFAULT true,
  consecutive_failures INT NOT NULL DEFAULT 0,
  created_by UUID NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- Rule executions log
CREATE TABLE IF NOT EXISTS public.ops_rule_executions (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  rule_id UUID NOT NULL REFERENCES public.ops_rules(id) ON DELETE CASCADE,
  row_id UUID REFERENCES public.dynamic_table_rows(id) ON DELETE SET NULL,
  status TEXT NOT NULL CHECK (status IN ('success', 'failed', 'skipped')),
  result JSONB,
  error TEXT,
  executed_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- Indexes
CREATE INDEX IF NOT EXISTS idx_ops_rules_table ON public.ops_rules(table_id);
CREATE INDEX IF NOT EXISTS idx_ops_rules_trigger ON public.ops_rules(trigger_type, is_enabled);
CREATE INDEX IF NOT EXISTS idx_ops_rule_executions_rule ON public.ops_rule_executions(rule_id);
CREATE INDEX IF NOT EXISTS idx_ops_rule_executions_time ON public.ops_rule_executions(executed_at DESC);

-- RLS
ALTER TABLE public.ops_rules ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.ops_rule_executions ENABLE ROW LEVEL SECURITY;

-- Rules: org-scoped via table
CREATE POLICY "org_members_crud_rules"
  ON public.ops_rules
  FOR ALL
  USING (
    EXISTS (
      SELECT 1 FROM public.dynamic_tables dt
      JOIN public.organization_memberships om ON om.org_id = dt.organization_id
      WHERE dt.id = ops_rules.table_id
        AND om.user_id = auth.uid()
    )
  );

-- Executions: org-scoped via rule → table
CREATE POLICY "org_members_read_executions"
  ON public.ops_rule_executions
  FOR SELECT
  USING (
    EXISTS (
      SELECT 1 FROM public.ops_rules r
      JOIN public.dynamic_tables dt ON dt.id = r.table_id
      JOIN public.organization_memberships om ON om.org_id = dt.organization_id
      WHERE r.id = ops_rule_executions.rule_id
        AND om.user_id = auth.uid()
    )
  );

-- Allow service role insert for executions
CREATE POLICY "service_insert_executions"
  ON public.ops_rule_executions
  FOR INSERT
  WITH CHECK (true);

NOTIFY pgrst, 'reload schema';
