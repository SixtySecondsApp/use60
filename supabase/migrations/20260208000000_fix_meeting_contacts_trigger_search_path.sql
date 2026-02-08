-- Fix trigger functions that have search_path = '' but use unqualified table/function names.
-- These cause "relation/function does not exist" errors on INSERT into meeting_contacts
-- and meeting_action_items.
--
-- Strategy: change search_path from '' to 'public' so all unqualified names resolve correctly.
-- This is consistent with the approach in 20260108231201_fix_rpc_function_search_paths.sql.

-- =============================================================================
-- Fix 1: update_contact_meeting_stats() — triggered on meeting_contacts INSERT/UPDATE
-- Error: relation "contacts" does not exist
-- =============================================================================
CREATE OR REPLACE FUNCTION "public"."update_contact_meeting_stats"() RETURNS "trigger"
    LANGUAGE "plpgsql"
    SET "search_path" TO 'public'
    AS $$
BEGIN
  UPDATE contacts
  SET
    total_meetings_count = (
      SELECT COUNT(*)
      FROM meeting_contacts
      WHERE contact_id = NEW.contact_id
    ),
    last_interaction_at = (
      SELECT MAX(m.meeting_start)
      FROM meetings m
      JOIN meeting_contacts mc ON m.id = mc.meeting_id
      WHERE mc.contact_id = NEW.contact_id
    )
  WHERE id = NEW.contact_id;

  RETURN NEW;
END;
$$;

-- =============================================================================
-- Fix 2: trigger_sync_action_item_to_task() — triggered on meeting_action_items INSERT/UPDATE
-- Error: function sync_action_item_to_task(uuid) does not exist
-- =============================================================================
CREATE OR REPLACE FUNCTION "public"."trigger_sync_action_item_to_task"() RETURNS "trigger"
    LANGUAGE "plpgsql"
    SET "search_path" TO 'public'
    AS $$
BEGIN
  PERFORM sync_action_item_to_task(NEW.id);
  RETURN NEW;
END;
$$;

-- =============================================================================
-- Fix 3: sync_action_item_to_task() — called by trigger_sync_action_item_to_task()
-- Has ~15 unqualified references to tables and functions
-- =============================================================================
CREATE OR REPLACE FUNCTION "public"."sync_action_item_to_task"("action_item_id" "uuid") RETURNS "uuid"
    LANGUAGE "plpgsql"
    SET "search_path" TO 'public'
    AS $$
DECLARE
  v_action_item RECORD;
  v_user_id UUID;
  v_task_id UUID;
  v_meeting_owner_id UUID;
  v_company_id UUID;
  v_deal_id UUID;
BEGIN
  -- Get action item details
  SELECT * INTO v_action_item
  FROM meeting_action_items
  WHERE id = action_item_id;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'Action item not found: %', action_item_id;
  END IF;

  -- Get meeting owner and company
  SELECT owner_user_id, company_id INTO v_meeting_owner_id, v_company_id
  FROM meetings
  WHERE id = v_action_item.meeting_id;

  -- Get active deal for this company
  SELECT id INTO v_deal_id
  FROM deals
  WHERE company_id = v_company_id
    AND status = 'active'
  ORDER BY created_at DESC
  LIMIT 1;

  -- Check if assignee is internal (sales rep)
  IF NOT is_internal_assignee(v_action_item.assignee_email) THEN
    UPDATE meeting_action_items
    SET
      sync_status = 'excluded',
      sync_error = 'External assignee - not synced to CRM tasks'
    WHERE id = action_item_id;

    RETURN NULL;
  END IF;

  -- Get user ID for internal assignee
  v_user_id := get_user_id_from_email(v_action_item.assignee_email);

  IF v_user_id IS NULL THEN
    UPDATE meeting_action_items
    SET
      sync_status = 'failed',
      sync_error = 'Could not find user ID for email: ' || v_action_item.assignee_email
    WHERE id = action_item_id;

    RETURN NULL;
  END IF;

  -- Check if task already exists
  IF v_action_item.task_id IS NOT NULL THEN
    UPDATE tasks
    SET
      title = v_action_item.title,
      description = NULL,
      priority = CASE
        WHEN v_action_item.priority = 'high' THEN 'high'
        WHEN v_action_item.priority = 'medium' THEN 'medium'
        ELSE 'low'
      END,
      due_date = v_action_item.deadline_at,
      status = CASE
        WHEN v_action_item.completed THEN 'completed'
        ELSE 'open'
      END,
      updated_at = NOW()
    WHERE id = v_action_item.task_id;

    v_task_id := v_action_item.task_id;
  ELSE
    INSERT INTO tasks (
      title, description, created_by, assigned_to, company_id, deal_id,
      priority, due_date, status, task_type, meeting_action_item_id,
      created_at, updated_at
    ) VALUES (
      v_action_item.title,
      NULL,
      v_meeting_owner_id,
      v_user_id,
      v_company_id,
      v_deal_id,
      CASE
        WHEN v_action_item.priority = 'high' THEN 'high'
        WHEN v_action_item.priority = 'medium' THEN 'medium'
        ELSE 'low'
      END,
      v_action_item.deadline_at,
      CASE
        WHEN v_action_item.completed THEN 'completed'
        ELSE 'open'
      END,
      'follow_up',
      action_item_id,
      NOW(),
      NOW()
    )
    RETURNING id INTO v_task_id;

    UPDATE meeting_action_items
    SET task_id = v_task_id
    WHERE id = action_item_id;
  END IF;

  -- Mark as synced
  UPDATE meeting_action_items
  SET
    synced_to_task = true,
    sync_status = 'synced',
    sync_error = NULL,
    synced_at = NOW()
  WHERE id = action_item_id;

  RETURN v_task_id;
END;
$$;

-- =============================================================================
-- Fix 4: sync_action_item_completion_to_task() — triggered on meeting_action_items UPDATE of completed
-- =============================================================================
CREATE OR REPLACE FUNCTION "public"."sync_action_item_completion_to_task"() RETURNS "trigger"
    LANGUAGE "plpgsql"
    SET "search_path" TO 'public'
    AS $$
BEGIN
  IF NEW.linked_task_id IS NOT NULL AND
     OLD.completed IS DISTINCT FROM NEW.completed THEN
    UPDATE tasks
    SET
      completed = NEW.completed,
      completed_at = CASE
        WHEN NEW.completed = true THEN NOW()
        ELSE NULL
      END,
      status = CASE
        WHEN NEW.completed = true THEN 'completed'::text
        ELSE 'pending'::text
      END,
      updated_at = NOW()
    WHERE id = NEW.linked_task_id;
  END IF;
  RETURN NEW;
END;
$$;

-- =============================================================================
-- Fix 5: trigger_sync_task_to_action_item() — triggered on tasks INSERT/UPDATE
-- =============================================================================
CREATE OR REPLACE FUNCTION "public"."trigger_sync_task_to_action_item"() RETURNS "trigger"
    LANGUAGE "plpgsql"
    SET "search_path" TO 'public'
    AS $$
BEGIN
  IF NEW.meeting_action_item_id IS NOT NULL THEN
    PERFORM sync_task_to_action_item(NEW.id);
  END IF;
  RETURN NEW;
END;
$$;

-- =============================================================================
-- Fix 6: trigger_update_meeting_insights() — triggered on meetings UPDATE
-- References meeting_contacts and calls aggregate functions unqualified
-- =============================================================================
CREATE OR REPLACE FUNCTION "public"."trigger_update_meeting_insights"() RETURNS "trigger"
    LANGUAGE "plpgsql"
    SET "search_path" TO 'public'
    AS $$
BEGIN
  IF NEW.sync_status = 'synced' THEN
    PERFORM aggregate_contact_meeting_insights(mc.contact_id)
    FROM meeting_contacts mc
    WHERE mc.meeting_id = NEW.id;

    IF NEW.company_id IS NOT NULL THEN
      PERFORM aggregate_company_meeting_insights(NEW.company_id);
    END IF;
  END IF;

  RETURN NEW;
END;
$$;
