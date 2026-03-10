-- Migration: linkedin_oauth_state_single_use
-- Date: 20260310110657
--
-- What this migration does:
--   Adds `used_at` column to linkedin_oauth_states to enforce single-use tokens
--   and prevent OAuth state replay attacks.
--
-- Rollback strategy:
--   ALTER TABLE public.linkedin_oauth_states DROP COLUMN IF EXISTS used_at;

ALTER TABLE public.linkedin_oauth_states
  ADD COLUMN IF NOT EXISTS used_at timestamptz;

COMMENT ON COLUMN public.linkedin_oauth_states.used_at IS
  'Set on first successful use to enforce single-use OAuth state tokens';
