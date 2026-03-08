-- Migration: add_schedule_permission_mode
-- Date: 20260307223713
--
-- What this migration does:
--   Adds permission_mode column to agent_schedules table.
--   Controls how much autonomy each schedule has:
--   - suggest: results go to Command Centre for review (no auto-send)
--   - approve: results delivered but external actions queued for approval
--   - auto: full autonomous execution (current default behavior)
--
-- Rollback strategy:
--   ALTER TABLE public.agent_schedules DROP COLUMN IF EXISTS permission_mode;

ALTER TABLE public.agent_schedules
  ADD COLUMN IF NOT EXISTS permission_mode text NOT NULL DEFAULT 'suggest'
  CHECK (permission_mode IN ('suggest', 'approve', 'auto'));

COMMENT ON COLUMN public.agent_schedules.permission_mode IS
  'Autonomy level: suggest (review first), approve (deliver but gate actions), auto (full execution)';
