-- SUP-006: Add SLA tracking columns and auto-calculation to support_tickets
-- Tracks first response time, SLA hours by priority, and breach detection.

BEGIN;

-- =====================================================
-- 1. Add SLA tracking columns
-- =====================================================

ALTER TABLE public.support_tickets
  ADD COLUMN IF NOT EXISTS first_response_at TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS sla_response_hours INTEGER,
  ADD COLUMN IF NOT EXISTS sla_breached BOOLEAN NOT NULL DEFAULT false;

COMMENT ON COLUMN public.support_tickets.first_response_at
  IS 'Timestamp of the first agent reply on this ticket';

COMMENT ON COLUMN public.support_tickets.sla_response_hours
  IS 'SLA target hours for first response, derived from priority: urgent=1, high=4, medium=8, low=24';

COMMENT ON COLUMN public.support_tickets.sla_breached
  IS 'True if first agent response exceeded the SLA window';

-- =====================================================
-- 2. Function: set_sla_on_ticket_create()
--    BEFORE INSERT on support_tickets
--    Sets sla_response_hours based on priority
-- =====================================================

CREATE OR REPLACE FUNCTION public.set_sla_on_ticket_create()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $$
BEGIN
  NEW.sla_response_hours := CASE NEW.priority
    WHEN 'urgent' THEN 1
    WHEN 'high'   THEN 4
    WHEN 'medium' THEN 8
    WHEN 'low'    THEN 24
    ELSE 8  -- fallback to medium
  END;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_set_sla_on_ticket_create ON public.support_tickets;
CREATE TRIGGER trg_set_sla_on_ticket_create
  BEFORE INSERT ON public.support_tickets
  FOR EACH ROW
  EXECUTE FUNCTION public.set_sla_on_ticket_create();

-- =====================================================
-- 3. Function: set_sla_on_priority_change()
--    BEFORE UPDATE on support_tickets
--    Recalculates sla_response_hours when priority changes
-- =====================================================

CREATE OR REPLACE FUNCTION public.set_sla_on_priority_change()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $$
BEGIN
  IF OLD.priority IS DISTINCT FROM NEW.priority THEN
    NEW.sla_response_hours := CASE NEW.priority
      WHEN 'urgent' THEN 1
      WHEN 'high'   THEN 4
      WHEN 'medium' THEN 8
      WHEN 'low'    THEN 24
      ELSE 8
    END;
  END IF;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_set_sla_on_priority_change ON public.support_tickets;
CREATE TRIGGER trg_set_sla_on_priority_change
  BEFORE UPDATE ON public.support_tickets
  FOR EACH ROW
  WHEN (OLD.priority IS DISTINCT FROM NEW.priority)
  EXECUTE FUNCTION public.set_sla_on_priority_change();

-- =====================================================
-- 4. Function: set_first_response_at()
--    AFTER INSERT on support_messages
--    Sets first_response_at on ticket for first agent reply
--    and checks for SLA breach
-- =====================================================

CREATE OR REPLACE FUNCTION public.set_first_response_at()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $$
DECLARE
  v_ticket RECORD;
BEGIN
  -- Only act on agent messages
  IF NEW.sender_type != 'agent' THEN
    RETURN NEW;
  END IF;

  -- Fetch the ticket, skip if already has a first response
  SELECT id, first_response_at, created_at, sla_response_hours
  INTO v_ticket
  FROM public.support_tickets
  WHERE id = NEW.ticket_id;

  IF v_ticket.first_response_at IS NOT NULL THEN
    RETURN NEW;
  END IF;

  -- Set first_response_at and check SLA breach
  UPDATE public.support_tickets
  SET
    first_response_at = NEW.created_at,
    sla_breached = CASE
      WHEN sla_response_hours IS NOT NULL
        AND NEW.created_at > v_ticket.created_at + (sla_response_hours * INTERVAL '1 hour')
      THEN true
      ELSE false
    END
  WHERE id = NEW.ticket_id
    AND first_response_at IS NULL;

  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_set_first_response_at ON public.support_messages;
CREATE TRIGGER trg_set_first_response_at
  AFTER INSERT ON public.support_messages
  FOR EACH ROW
  EXECUTE FUNCTION public.set_first_response_at();

-- =====================================================
-- 5. Backfill: set sla_response_hours for existing tickets
-- =====================================================

UPDATE public.support_tickets
SET sla_response_hours = CASE priority
  WHEN 'urgent' THEN 1
  WHEN 'high'   THEN 4
  WHEN 'medium' THEN 8
  WHEN 'low'    THEN 24
  ELSE 8
END
WHERE sla_response_hours IS NULL;

COMMIT;
