-- Fix trigger functions on the tasks table that have search_path = '' but use
-- unqualified table/function names. These cause "relation does not exist" errors
-- when inserting tasks with meeting_action_item_id set.
--
-- This is the same pattern as 20260208000000_fix_meeting_contacts_trigger_search_path.sql
-- but covers the remaining unfixed functions.

-- =============================================================================
-- Fix 1: notify_task_from_meeting() — triggered on tasks INSERT when meeting_action_item_id IS NOT NULL
-- Error: relation "meetings" does not exist (line: FROM meetings m)
-- =============================================================================
CREATE OR REPLACE FUNCTION "public"."notify_task_from_meeting"() RETURNS "trigger"
    LANGUAGE "plpgsql"
    SET "search_path" TO 'public'
    AS $$
DECLARE
  meeting_title TEXT;
  notification_title TEXT;
  notification_message TEXT;
  notification_id UUID;
BEGIN
  -- Only notify if task was created from a meeting action item
  IF NEW.meeting_action_item_id IS NULL THEN
    RETURN NEW;
  END IF;

  -- Get meeting title
  SELECT m.title INTO meeting_title
  FROM meetings m
  JOIN meeting_action_items mai ON mai.meeting_id = m.id
  WHERE mai.id = NEW.meeting_action_item_id;

  -- Build notification
  notification_title := 'New Action Item from Meeting';
  notification_message := CONCAT(
    'A new task "', NEW.title, '" has been assigned to you from the meeting "',
    COALESCE(meeting_title, 'Unknown Meeting'), '".',
    CASE
      WHEN NEW.due_date IS NOT NULL THEN CONCAT(' Due: ', TO_CHAR(NEW.due_date, 'Mon DD, YYYY'))
      ELSE ''
    END
  );

  -- Create notification (may be NULL if rate limited)
  SELECT create_task_notification(
    NEW.assigned_to,
    NEW.id,
    notification_title,
    notification_message,
    CASE
      WHEN NEW.priority = 'urgent' THEN 'error'
      WHEN NEW.priority = 'high' THEN 'warning'
      ELSE 'info'
    END,
    CONCAT('/crm/tasks?task_id=', NEW.id)
  ) INTO notification_id;

  -- Log if notification was rate limited
  IF notification_id IS NULL THEN
    RAISE NOTICE 'Meeting task notification rate limited for user % task %',
      NEW.assigned_to, NEW.id;
  END IF;

  RETURN NEW;
END;
$$;

-- =============================================================================
-- Fix 2: sync_task_to_action_item() — called by trigger_sync_task_to_action_item()
-- Error: relation "tasks" / "meeting_action_items" does not exist
-- =============================================================================
CREATE OR REPLACE FUNCTION "public"."sync_task_to_action_item"("task_id_input" "uuid") RETURNS "uuid"
    LANGUAGE "plpgsql"
    SET "search_path" TO 'public'
    AS $$
DECLARE
  v_task RECORD;
  v_action_item_id UUID;
BEGIN
  -- Get task details
  SELECT * INTO v_task
  FROM tasks
  WHERE id = task_id_input;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'Task not found: %', task_id_input;
  END IF;

  -- Get linked action item
  v_action_item_id := v_task.meeting_action_item_id;

  IF v_action_item_id IS NULL THEN
    -- Task not linked to action item
    RETURN NULL;
  END IF;

  -- Update action item
  UPDATE meeting_action_items
  SET
    title = v_task.title,
    priority = CASE
      WHEN v_task.priority = 'high' THEN 'high'
      WHEN v_task.priority = 'medium' THEN 'medium'
      ELSE 'low'
    END,
    deadline_at = v_task.due_date,
    completed = (v_task.status = 'completed'),
    updated_at = NOW()
  WHERE id = v_action_item_id;

  RETURN v_action_item_id;
END;
$$;

-- =============================================================================
-- Fix 3: should_create_notification() — called by create_task_notification()
-- Error: relation "notification_rate_limits" does not exist
-- =============================================================================
CREATE OR REPLACE FUNCTION "public"."should_create_notification"("p_user_id" "uuid", "p_notification_type" "text", "p_max_per_hour" integer DEFAULT 10, "p_max_per_day" integer DEFAULT 50) RETURNS boolean
    LANGUAGE "plpgsql"
    SET "search_path" TO 'public'
    AS $$
DECLARE
  count_last_hour INTEGER;
  count_last_day INTEGER;
BEGIN
  -- Count notifications in the last hour
  SELECT COUNT(*) INTO count_last_hour
  FROM notification_rate_limits
  WHERE user_id = p_user_id
    AND notification_type = p_notification_type
    AND created_at > NOW() - INTERVAL '1 hour';

  -- Count notifications in the last 24 hours
  SELECT COUNT(*) INTO count_last_day
  FROM notification_rate_limits
  WHERE user_id = p_user_id
    AND notification_type = p_notification_type
    AND created_at > NOW() - INTERVAL '24 hours';

  -- Check if limits are exceeded
  IF count_last_hour >= p_max_per_hour THEN
    RAISE NOTICE 'Rate limit exceeded: % notifications in last hour (max: %)',
      count_last_hour, p_max_per_hour;
    RETURN FALSE;
  END IF;

  IF count_last_day >= p_max_per_day THEN
    RAISE NOTICE 'Rate limit exceeded: % notifications in last 24 hours (max: %)',
      count_last_day, p_max_per_day;
    RETURN FALSE;
  END IF;

  -- Record this notification attempt
  INSERT INTO notification_rate_limits (user_id, notification_type, created_at)
  VALUES (p_user_id, p_notification_type, NOW());

  RETURN TRUE;
END;
$$;

-- =============================================================================
-- Fix 4: create_task_notification() — called by notify_task_from_meeting()
-- Error: function should_create_notification(...) does not exist
-- Also references: notifications table
-- =============================================================================
CREATE OR REPLACE FUNCTION "public"."create_task_notification"("p_user_id" "uuid", "p_task_id" "uuid", "p_title" "text", "p_message" "text", "p_type" "text", "p_action_url" "text" DEFAULT NULL::"text") RETURNS "uuid"
    LANGUAGE "plpgsql"
    SET "search_path" TO 'public'
    AS $$
DECLARE
  notification_id UUID;
  can_create BOOLEAN;
  notification_type_key TEXT;
BEGIN
  -- Build notification type key for rate limiting
  notification_type_key := CONCAT(p_type, '_task');

  -- Check rate limits before creating notification
  can_create := should_create_notification(
    p_user_id,
    notification_type_key,
    10,  -- max per hour
    50   -- max per day
  );

  -- If rate limit exceeded, log and return NULL
  IF NOT can_create THEN
    RAISE NOTICE 'Rate limit exceeded for user % notification type %. Notification not created: "%"',
      p_user_id, notification_type_key, p_title;
    RETURN NULL;
  END IF;

  -- Rate limit OK, create notification
  INSERT INTO notifications (
    user_id,
    title,
    message,
    type,
    category,
    entity_type,
    entity_id,
    action_url,
    read,
    created_at
  ) VALUES (
    p_user_id,
    p_title,
    p_message,
    p_type,
    'task',
    'task',
    p_task_id,
    COALESCE(p_action_url, CONCAT('/crm/tasks?task_id=', p_task_id)),
    FALSE,
    NOW()
  )
  RETURNING id INTO notification_id;

  RETURN notification_id;
END;
$$;
