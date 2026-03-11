-- SUP-003: Auto-trigger notifications on support messages and status changes
-- Fires pg_net HTTP POST to the support-ticket-notification edge function
-- when a new message is inserted or a ticket status changes.

-- =====================================================
-- 1. Trigger function for new support messages
-- =====================================================

CREATE OR REPLACE FUNCTION public.trigger_support_notification_on_message()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $fn$
DECLARE
  v_url TEXT;
  v_service_role_key TEXT;
BEGIN
  -- Only fire for user or agent messages, not system messages
  IF NEW.sender_type NOT IN ('user', 'agent') THEN
    RETURN NEW;
  END IF;

  BEGIN
    SELECT value INTO v_url FROM public.system_config WHERE key = 'supabase_url';
    v_url := v_url || '/functions/v1/support-ticket-notification';

    SELECT decrypted_secret INTO v_service_role_key
    FROM vault.decrypted_secrets
    WHERE name = 'service_role_key';

    IF v_service_role_key IS NOT NULL AND v_url IS NOT NULL THEN
      PERFORM net.http_post(
        url := v_url,
        headers := jsonb_build_object(
          'Content-Type', 'application/json',
          'Authorization', 'Bearer ' || v_service_role_key
        ),
        body := jsonb_build_object(
          'event', 'new_reply',
          'ticket_id', NEW.ticket_id,
          'message_id', NEW.id
        )
      );
    END IF;
  EXCEPTION WHEN OTHERS THEN
    -- Log but don't block the INSERT
    RAISE WARNING 'support_notification_on_message failed: %', SQLERRM;
  END;

  RETURN NEW;
END;
$fn$;

DROP TRIGGER IF EXISTS trg_support_notify_new_message ON public.support_messages;
CREATE TRIGGER trg_support_notify_new_message
  AFTER INSERT ON public.support_messages
  FOR EACH ROW
  EXECUTE FUNCTION public.trigger_support_notification_on_message();

-- =====================================================
-- 2. Trigger function for ticket status changes
-- =====================================================

CREATE OR REPLACE FUNCTION public.trigger_support_notification_on_status_change()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $fn$
DECLARE
  v_url TEXT;
  v_service_role_key TEXT;
BEGIN
  -- Only fire when status actually changes
  IF OLD.status IS NOT DISTINCT FROM NEW.status THEN
    RETURN NEW;
  END IF;

  BEGIN
    SELECT value INTO v_url FROM public.system_config WHERE key = 'supabase_url';
    v_url := v_url || '/functions/v1/support-ticket-notification';

    SELECT decrypted_secret INTO v_service_role_key
    FROM vault.decrypted_secrets
    WHERE name = 'service_role_key';

    IF v_service_role_key IS NOT NULL AND v_url IS NOT NULL THEN
      PERFORM net.http_post(
        url := v_url,
        headers := jsonb_build_object(
          'Content-Type', 'application/json',
          'Authorization', 'Bearer ' || v_service_role_key
        ),
        body := jsonb_build_object(
          'event', 'status_changed',
          'ticket_id', NEW.id,
          'new_status', NEW.status::text
        )
      );
    END IF;
  EXCEPTION WHEN OTHERS THEN
    -- Log but don't block the UPDATE
    RAISE WARNING 'support_notification_on_status_change failed: %', SQLERRM;
  END;

  RETURN NEW;
END;
$fn$;

DROP TRIGGER IF EXISTS trg_support_notify_status_change ON public.support_tickets;
CREATE TRIGGER trg_support_notify_status_change
  AFTER UPDATE ON public.support_tickets
  FOR EACH ROW
  EXECUTE FUNCTION public.trigger_support_notification_on_status_change();
