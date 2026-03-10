-- NOTIF-010: Exclude hidden notification types from unread count
--
-- The get_unread_notification_count() RPC was counting ALL unread notifications,
-- including agent_scheduled_run and agent_trigger_run types which are hidden from
-- the UI (NOTIF-004). This causes the unread badge to show a higher count than
-- the number of visible notifications in NotificationCenter.
--
-- Fix: Add a NOT IN filter to exclude the hidden types from the count.
-- The function signature is unchanged so no GRANT changes are needed.

CREATE OR REPLACE FUNCTION public.get_unread_notification_count()
RETURNS integer
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO ''
AS $$
DECLARE
  count_result INTEGER;
BEGIN
  SELECT COUNT(*)
  INTO count_result
  FROM public.notifications
  WHERE user_id = auth.uid()
    AND read = FALSE
    AND type NOT IN ('agent_scheduled_run', 'agent_trigger_run');

  RETURN count_result;
END;
$$;
