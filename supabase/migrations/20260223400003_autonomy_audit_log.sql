-- Phase 8: Graduated Autonomy — GRAD-004
-- Add cooldown_until column to autonomy_audit_log for demotion cooldown tracking
-- Also add 'ceiling_set' to the change_type check constraint

-- 1. Add cooldown_until column
ALTER TABLE public.autonomy_audit_log
  ADD COLUMN IF NOT EXISTS cooldown_until timestamptz;

-- 2. Expand change_type check constraint to include 'ceiling_set'
--    Drop and recreate to add the new valid value
ALTER TABLE public.autonomy_audit_log
  DROP CONSTRAINT IF EXISTS autonomy_audit_log_change_type_check;

DO $$ BEGIN
  ALTER TABLE public.autonomy_audit_log
  ADD CONSTRAINT autonomy_audit_log_change_type_check
  CHECK (change_type IN ('promotion', 'demotion', 'manual_change', 'cooldown_start', 'cooldown_end', 'ceiling_set'));
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

-- 3. Index for cooldown lookups (demotions by org + action + recency)
CREATE INDEX IF NOT EXISTS idx_autonomy_audit_demotion_cooldown
  ON public.autonomy_audit_log (org_id, action_type, change_type, created_at DESC)
  WHERE change_type = 'demotion' AND cooldown_until IS NOT NULL;

COMMENT ON COLUMN public.autonomy_audit_log.cooldown_until IS 'For demotions: timestamp until which re-promotion is blocked (30-day default)';
