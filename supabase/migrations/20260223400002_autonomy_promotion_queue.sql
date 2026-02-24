-- Phase 8: Graduated Autonomy System (PRD-24)
-- GRAD-002: Promotion queue for graduated autonomy rules engine
--
-- Depends on: 20260223200003_autonomy_promotion_queue.sql (base tables)
-- This migration adds reviewed_by/reviewed_at columns and updated_at trigger
-- to the autonomy_promotion_queue table if not already present.

-- Add reviewed_by column (references profiles, not auth.users)
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_schema = 'public'
      AND table_name = 'autonomy_promotion_queue'
      AND column_name = 'reviewed_by'
  ) THEN
    ALTER TABLE public.autonomy_promotion_queue
      ADD COLUMN reviewed_by uuid REFERENCES public.profiles(id);
  END IF;
END $$;

-- Add reviewed_at column
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_schema = 'public'
      AND table_name = 'autonomy_promotion_queue'
      AND column_name = 'reviewed_at'
  ) THEN
    ALTER TABLE public.autonomy_promotion_queue
      ADD COLUMN reviewed_at timestamptz;
  END IF;
END $$;

-- Add updated_at column
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_schema = 'public'
      AND table_name = 'autonomy_promotion_queue'
      AND column_name = 'updated_at'
  ) THEN
    ALTER TABLE public.autonomy_promotion_queue
      ADD COLUMN updated_at timestamptz NOT NULL DEFAULT now();
  END IF;
END $$;

-- Auto-update updated_at on row changes
CREATE OR REPLACE FUNCTION public.update_promotion_queue_updated_at()
RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
  NEW.updated_at = now();
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS promotion_queue_updated_at ON public.autonomy_promotion_queue;
CREATE TRIGGER promotion_queue_updated_at
  BEFORE UPDATE ON public.autonomy_promotion_queue
  FOR EACH ROW EXECUTE FUNCTION public.update_promotion_queue_updated_at();

-- Admin update policy (org admins can approve/reject/snooze promotions)
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_policies
    WHERE tablename = 'autonomy_promotion_queue'
      AND policyname = 'Org admins can update promotion queue'
  ) THEN
    CREATE POLICY "Org admins can update promotion queue"
      ON public.autonomy_promotion_queue FOR UPDATE
      USING (org_id IN (
        SELECT om.org_id FROM public.organization_memberships om
        WHERE om.user_id = auth.uid()
          AND om.role IN ('owner', 'admin')
      ))
      WITH CHECK (org_id IN (
        SELECT om.org_id FROM public.organization_memberships om
        WHERE om.user_id = auth.uid()
          AND om.role IN ('owner', 'admin')
      ));
  END IF;
END $$;

-- Expire old snoozed promotions whose snooze window has passed
-- (Can be called by a cron or the evaluation job)
CREATE OR REPLACE FUNCTION public.expire_snoozed_promotions()
RETURNS integer
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
  expired_count integer;
BEGIN
  UPDATE public.autonomy_promotion_queue
  SET status = 'expired', updated_at = now()
  WHERE status = 'snoozed'
    AND snoozed_until IS NOT NULL
    AND snoozed_until < now();

  GET DIAGNOSTICS expired_count = ROW_COUNT;
  RETURN expired_count;
END;
$$;

COMMENT ON FUNCTION public.expire_snoozed_promotions IS 'Expires snoozed promotion suggestions whose snooze window has passed (PRD-24, GRAD-002)';
