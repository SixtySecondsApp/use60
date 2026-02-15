-- Add is_default and template_key to ops_rules
ALTER TABLE public.ops_rules ADD COLUMN IF NOT EXISTS is_default BOOLEAN NOT NULL DEFAULT false;
ALTER TABLE public.ops_rules ADD COLUMN IF NOT EXISTS template_key TEXT;

-- Index for finding default rules
CREATE INDEX IF NOT EXISTS idx_ops_rules_is_default ON public.ops_rules(table_id) WHERE is_default = true;

COMMENT ON COLUMN public.ops_rules.is_default IS 'True for rules auto-created during standard table provisioning';
COMMENT ON COLUMN public.ops_rules.template_key IS 'Identifies the rule template (e.g. leads_escalate_high_engagement)';

NOTIFY pgrst, 'reload schema';
