-- Support notification triggers
-- Auto-create in-app notifications on support events:
--   1. Agent replies → notify ticket owner
--   2. User messages → notify platform admins
--   3. Ticket status changes → notify ticket owner

-- =====================================================
-- Function: notify on support_messages INSERT
-- =====================================================

CREATE OR REPLACE FUNCTION public.notify_on_support_message()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $$
DECLARE
  v_ticket RECORD;
  v_admin RECORD;
  v_title TEXT;
  v_message TEXT;
BEGIN
  -- Fetch the parent ticket
  SELECT id, user_id, subject
    INTO v_ticket
    FROM public.support_tickets
   WHERE id = NEW.ticket_id;

  IF NOT FOUND THEN
    RETURN NEW;
  END IF;

  IF NEW.sender_type = 'agent' THEN
    -- Agent replied → notify ticket owner (skip if agent IS the ticket owner)
    IF NEW.sender_id IS DISTINCT FROM v_ticket.user_id THEN
      v_title   := 'New reply on your support ticket';
      v_message := 'An agent replied to "' || v_ticket.subject || '"';

      INSERT INTO public.notifications (
        user_id, title, message, type, category,
        entity_type, entity_id, metadata, action_url, created_by
      ) VALUES (
        v_ticket.user_id,
        v_title,
        v_message,
        'info',
        'support',
        'support_ticket',
        v_ticket.id,
        jsonb_build_object('message_id', NEW.id, 'sender_type', NEW.sender_type),
        '/support?ticket=' || v_ticket.id::text,
        NEW.sender_id
      );
    END IF;

  ELSIF NEW.sender_type = 'user' THEN
    -- User sent a message → notify all platform admins (skip the sender)
    v_title   := 'New support message';
    v_message := 'User message on ticket "' || v_ticket.subject || '"';

    FOR v_admin IN
      SELECT id FROM public.profiles WHERE is_admin = true
    LOOP
      -- Don't notify the sender themselves
      IF v_admin.id IS DISTINCT FROM NEW.sender_id THEN
        INSERT INTO public.notifications (
          user_id, title, message, type, category,
          entity_type, entity_id, metadata, action_url, created_by
        ) VALUES (
          v_admin.id,
          v_title,
          v_message,
          'info',
          'support',
          'support_ticket',
          v_ticket.id,
          jsonb_build_object('message_id', NEW.id, 'sender_type', NEW.sender_type),
          '/support?ticket=' || v_ticket.id::text,
          NEW.sender_id
        );
      END IF;
    END LOOP;
  END IF;

  RETURN NEW;
END;
$$;

-- Trigger (idempotent)
DROP TRIGGER IF EXISTS trg_notify_on_support_message ON public.support_messages;
CREATE TRIGGER trg_notify_on_support_message
  AFTER INSERT ON public.support_messages
  FOR EACH ROW
  EXECUTE FUNCTION public.notify_on_support_message();

-- =====================================================
-- Function: notify on support_tickets status change
-- =====================================================

CREATE OR REPLACE FUNCTION public.notify_on_support_status_change()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $$
DECLARE
  v_title TEXT;
  v_message TEXT;
  v_updater_id UUID;
BEGIN
  -- Only fire when status actually changed
  IF OLD.status IS NOT DISTINCT FROM NEW.status THEN
    RETURN NEW;
  END IF;

  -- The updater is whoever is authenticated (could be admin or system)
  v_updater_id := auth.uid();

  -- Don't notify the ticket owner if they changed the status themselves
  IF v_updater_id IS NOT DISTINCT FROM NEW.user_id THEN
    RETURN NEW;
  END IF;

  v_title   := 'Support ticket status updated';
  v_message := 'Ticket "' || NEW.subject || '" changed from '
               || OLD.status::text || ' to ' || NEW.status::text;

  INSERT INTO public.notifications (
    user_id, title, message, type, category,
    entity_type, entity_id, metadata, action_url, created_by
  ) VALUES (
    NEW.user_id,
    v_title,
    v_message,
    'info',
    'support',
    'support_ticket',
    NEW.id,
    jsonb_build_object('old_status', OLD.status::text, 'new_status', NEW.status::text),
    '/support?ticket=' || NEW.id::text,
    v_updater_id
  );

  RETURN NEW;
END;
$$;

-- Trigger (idempotent)
DROP TRIGGER IF EXISTS trg_notify_on_support_status_change ON public.support_tickets;
CREATE TRIGGER trg_notify_on_support_status_change
  AFTER UPDATE ON public.support_tickets
  FOR EACH ROW
  EXECUTE FUNCTION public.notify_on_support_status_change();
