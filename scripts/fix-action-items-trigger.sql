-- Fix: "42P01 relation 'meetings' does not exist" error when inserting action items
--
-- Root cause: The trigger function sync_action_item_to_task() has SET search_path TO ''
-- but references tables (meetings, deals, meeting_action_items) without schema qualifier.
-- When the trigger fires on INSERT into meeting_action_items, the function can't find
-- the tables because 'public' is not in the search_path.
--
-- Fix: Drop the auto-sync trigger since automatic task creation is not desired.
-- Action items are inserted with synced_to_task=false, and users manually pick which to sync.
-- The function itself is preserved in case it's needed for manual sync later.

-- Drop the INSERT trigger (causes the error)
DROP TRIGGER IF EXISTS sync_action_item_on_insert ON public.meeting_action_items;

-- Also drop the UPDATE trigger (same function, same search_path issue)
DROP TRIGGER IF EXISTS sync_action_item_on_update ON public.meeting_action_items;

-- Optional: If you want to keep the triggers but fix the root cause instead,
-- uncomment these lines and comment out the DROP statements above:
--
-- ALTER FUNCTION public.sync_action_item_to_task(uuid) SET search_path TO 'public';
-- ALTER FUNCTION public.trigger_sync_action_item_to_task() SET search_path TO 'public';
-- ALTER FUNCTION public.is_internal_assignee(text) SET search_path TO 'public';
-- ALTER FUNCTION public.get_user_id_from_email(text) SET search_path TO 'public';
