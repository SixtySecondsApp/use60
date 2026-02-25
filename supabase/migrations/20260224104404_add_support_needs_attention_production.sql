-- Fix: Add support_needs_attention schema to production
-- Production has support_tickets (from support_centre_schema) but 20260219300002
-- ran before the table existed, so needs_attention + RPC were never applied.

-- 1. Add needs_attention column
ALTER TABLE public.support_tickets
  ADD COLUMN IF NOT EXISTS needs_attention BOOLEAN NOT NULL DEFAULT true;

-- 2. Composite index for efficient count queries
CREATE INDEX IF NOT EXISTS support_tickets_needs_attention_status_idx
  ON public.support_tickets(needs_attention, status);

-- 3. Trigger: manage needs_attention on ticket INSERT/UPDATE
CREATE OR REPLACE FUNCTION public.update_ticket_needs_attention()
RETURNS TRIGGER
LANGUAGE plpgsql
SET search_path TO 'public'
AS $$
BEGIN
  IF TG_OP = 'INSERT' THEN
    NEW.needs_attention = true;
  ELSIF TG_OP = 'UPDATE' THEN
    IF NEW.status IN ('resolved', 'closed') THEN
      NEW.needs_attention = false;
    END IF;
  END IF;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS ticket_insert_needs_attention ON public.support_tickets;
DROP TRIGGER IF EXISTS ticket_status_needs_attention ON public.support_tickets;

DROP TRIGGER IF EXISTS ticket_insert_needs_attention ON public.support_tickets;
CREATE TRIGGER ticket_insert_needs_attention
  BEFORE INSERT ON public.support_tickets
  FOR EACH ROW
  EXECUTE FUNCTION public.update_ticket_needs_attention();

DROP TRIGGER IF EXISTS ticket_status_needs_attention ON public.support_tickets;
CREATE TRIGGER ticket_status_needs_attention
  BEFORE UPDATE ON public.support_tickets
  FOR EACH ROW
  WHEN (OLD.status IS DISTINCT FROM NEW.status)
  EXECUTE FUNCTION public.update_ticket_needs_attention();

-- 4. Trigger: update needs_attention on new support message
CREATE OR REPLACE FUNCTION public.update_ticket_attention_on_message()
RETURNS TRIGGER
LANGUAGE plpgsql
SET search_path TO 'public'
AS $$
BEGIN
  IF NEW.sender_type = 'user' THEN
    UPDATE public.support_tickets
    SET needs_attention = true
    WHERE id = NEW.ticket_id;
  ELSIF NEW.sender_type = 'agent' THEN
    UPDATE public.support_tickets
    SET needs_attention = false
    WHERE id = NEW.ticket_id;
  END IF;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS message_updates_ticket_attention ON public.support_messages;

DROP TRIGGER IF EXISTS message_updates_ticket_attention ON public.support_messages;
CREATE TRIGGER message_updates_ticket_attention
  AFTER INSERT ON public.support_messages
  FOR EACH ROW
  EXECUTE FUNCTION public.update_ticket_attention_on_message();

-- 5. RPC: get count of tickets needing attention (admin-only)
CREATE OR REPLACE FUNCTION public.get_support_tickets_needing_attention_count()
RETURNS INTEGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $$
DECLARE
  v_count INTEGER;
  v_is_admin BOOLEAN;
BEGIN
  IF auth.uid() IS NULL THEN
    RETURN 0;
  END IF;

  SELECT COALESCE(is_admin, false)
  INTO v_is_admin
  FROM public.profiles
  WHERE id = auth.uid();

  IF NOT v_is_admin THEN
    RETURN 0;
  END IF;

  SELECT COUNT(*)
  INTO v_count
  FROM public.support_tickets
  WHERE needs_attention = true
    AND status NOT IN ('resolved', 'closed');

  RETURN COALESCE(v_count, 0);
END;
$$;

GRANT EXECUTE ON FUNCTION public.get_support_tickets_needing_attention_count() TO authenticated;

COMMENT ON FUNCTION public.get_support_tickets_needing_attention_count() IS
'Returns count of support tickets that need admin attention. Only accessible by platform admins (profiles.is_admin = true). Returns 0 for non-admins. Part of SUP-001.';

-- 6. Backfill existing tickets
UPDATE public.support_tickets
SET needs_attention = true
WHERE status NOT IN ('resolved', 'closed');

UPDATE public.support_tickets
SET needs_attention = false
WHERE status IN ('resolved', 'closed');
