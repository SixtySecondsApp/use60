-- ============================================================================
-- EMAIL-006: Daily email send cap per rep
--
-- Adds daily_email_send_cap to organizations so admins can configure the
-- maximum number of AI-sent emails per rep per calendar day (UTC).
-- The hitl-send-followup-email edge function enforces this cap by counting
-- send_email actions in agent_daily_logs for the current UTC day.
-- Default: 50 emails/day per rep.
-- ============================================================================

ALTER TABLE public.organizations
  ADD COLUMN IF NOT EXISTS daily_email_send_cap INTEGER NOT NULL DEFAULT 50;

COMMENT ON COLUMN public.organizations.daily_email_send_cap IS
  'Maximum number of AI-triggered emails a single rep can send per calendar day (UTC). '
  'Enforced by hitl-send-followup-email. Resets at midnight UTC. Default: 50. (EMAIL-006)';

-- ---------------------------------------------------------------------------
-- Migration summary
-- ---------------------------------------------------------------------------

DO $$
BEGIN
  RAISE NOTICE '';
  RAISE NOTICE '============================================================================';
  RAISE NOTICE 'Migration: 20260227100001_email_send_cap.sql';
  RAISE NOTICE '============================================================================';
  RAISE NOTICE '';
  RAISE NOTICE 'EMAIL-006: Daily email send cap per rep';
  RAISE NOTICE '';
  RAISE NOTICE 'Added:';
  RAISE NOTICE '  - organizations.daily_email_send_cap (INTEGER NOT NULL DEFAULT 50)';
  RAISE NOTICE '';
  RAISE NOTICE 'The hitl-send-followup-email function reads this value and blocks sends';
  RAISE NOTICE 'when the user has already reached their daily cap (counted via agent_daily_logs).';
  RAISE NOTICE '';
  RAISE NOTICE '============================================================================';
END $$;
