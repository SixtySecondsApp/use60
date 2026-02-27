-- ============================================================================
-- AP-032: Autopilot Promotion Nudge columns
--
-- Adds two columns to `autopilot_confidence` that allow the
-- autopilot-record-signal edge function to set a pending in-context
-- promotion nudge after a milestone approval is detected.
--
-- pending_promotion_nudge — set TRUE after a milestone clean approval so the
--   next copilot response can surface the nudge.
-- nudge_message — human-readable nudge copy surfaced in the assistant banner.
--
-- Cleared to FALSE / NULL after the frontend reads the nudge (one-shot).
-- ============================================================================

ALTER TABLE public.autopilot_confidence
  ADD COLUMN IF NOT EXISTS pending_promotion_nudge BOOLEAN NOT NULL DEFAULT FALSE,
  ADD COLUMN IF NOT EXISTS nudge_message TEXT;

COMMENT ON COLUMN public.autopilot_confidence.pending_promotion_nudge IS
  'AP-032: Set TRUE when the user has just hit a milestone clean-approval count '
  'that makes them promotion-eligible. Cleared after the frontend reads it '
  '(one-shot display via GET /autopilot-record-signal).';

COMMENT ON COLUMN public.autopilot_confidence.nudge_message IS
  'AP-032: Human-readable promotion nudge copy generated at the time the '
  'milestone is hit. Cleared alongside pending_promotion_nudge.';

-- Partial index so the GET /pending-nudge route can find rows quickly
-- without scanning the whole table.
CREATE INDEX IF NOT EXISTS idx_confidence_pending_nudge
  ON public.autopilot_confidence (user_id)
  WHERE pending_promotion_nudge = TRUE;

-- ---------------------------------------------------------------------------
-- Migration summary
-- ---------------------------------------------------------------------------

DO $$
BEGIN
  RAISE NOTICE '';
  RAISE NOTICE '============================================================================';
  RAISE NOTICE 'Migration: 20260226600001_autopilot_promotion_nudge.sql';
  RAISE NOTICE '============================================================================';
  RAISE NOTICE '';
  RAISE NOTICE 'AP-032: In-context promotion nudge';
  RAISE NOTICE '';
  RAISE NOTICE 'Added to autopilot_confidence:';
  RAISE NOTICE '  - pending_promotion_nudge BOOLEAN DEFAULT FALSE';
  RAISE NOTICE '  - nudge_message TEXT';
  RAISE NOTICE '  - idx_confidence_pending_nudge (partial, pending_promotion_nudge=TRUE)';
  RAISE NOTICE '';
  RAISE NOTICE '============================================================================';
END $$;
