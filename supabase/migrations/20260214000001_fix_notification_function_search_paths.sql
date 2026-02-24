-- Fix notification-related functions called during task INSERT triggers.
-- These have search_path = '' causing "function/relation does not exist" errors
-- when inserting tasks with meeting_action_item_id set.
--
-- Call chain: tasks INSERT trigger -> notify_task_from_meeting() ->
--   create_task_notification() -> should_create_notification()

-- =============================================================================
-- Fix 1: should_create_notification() — rate limit check
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
-- Fix 2: create_task_notification() — notification creation with rate limiting
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
