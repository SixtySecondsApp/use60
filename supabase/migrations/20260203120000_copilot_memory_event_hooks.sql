-- Migration: Event hooks that automatically create copilot memories
-- Purpose: When deals, contacts, tasks, activities, or calendar events change,
--          insert structured memories so the copilot stays aware of business context.
-- Date: 2026-02-03

-- =============================================================================
-- Shared helper: insert a memory (avoids duplicating INSERT logic)
-- =============================================================================

CREATE OR REPLACE FUNCTION insert_copilot_memory(
  p_user_id UUID,
  p_category TEXT,
  p_subject TEXT,
  p_content TEXT,
  p_context_summary TEXT,
  p_deal_id UUID DEFAULT NULL,
  p_contact_id UUID DEFAULT NULL,
  p_company_id UUID DEFAULT NULL
)
RETURNS VOID
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
BEGIN
  INSERT INTO copilot_memories (
    user_id, category, subject, content, context_summary,
    deal_id, contact_id, company_id,
    confidence, created_at, updated_at
  ) VALUES (
    p_user_id, p_category, p_subject, p_content, p_context_summary,
    p_deal_id, p_contact_id, p_company_id,
    1.0, NOW(), NOW()
  );
END;
$$;

-- =============================================================================
-- 1. DEAL STAGE CHANGES
-- =============================================================================

CREATE OR REPLACE FUNCTION on_deal_stage_change()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
  v_old_stage TEXT;
  v_new_stage TEXT;
  v_deal_name TEXT;
BEGIN
  -- Only fire when stage_id actually changes
  IF OLD.stage_id IS NOT DISTINCT FROM NEW.stage_id THEN
    RETURN NEW;
  END IF;

  -- Look up stage names
  SELECT name INTO v_old_stage FROM deal_stages WHERE id = OLD.stage_id;
  SELECT name INTO v_new_stage FROM deal_stages WHERE id = NEW.stage_id;
  v_deal_name := COALESCE(NEW.name, 'Unnamed deal');

  PERFORM insert_copilot_memory(
    NEW.owner_id,
    'deal',
    v_deal_name,
    'Deal "' || v_deal_name || '" moved from ' || COALESCE(v_old_stage, 'unknown') || ' to ' || COALESCE(v_new_stage, 'unknown') || '.',
    'Automatic memory from deal stage change',
    NEW.id,
    NULL,
    NULL
  );

  RETURN NEW;
END;
$$;

CREATE TRIGGER trg_deal_stage_change
  AFTER UPDATE ON deals
  FOR EACH ROW
  WHEN (OLD.stage_id IS DISTINCT FROM NEW.stage_id)
  EXECUTE FUNCTION on_deal_stage_change();

-- =============================================================================
-- 2. DEAL VALUE CHANGES
-- =============================================================================

CREATE OR REPLACE FUNCTION on_deal_value_change()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
  v_deal_name TEXT;
  v_direction TEXT;
  v_old_val TEXT;
  v_new_val TEXT;
BEGIN
  IF OLD.value IS NOT DISTINCT FROM NEW.value THEN
    RETURN NEW;
  END IF;

  v_deal_name := COALESCE(NEW.name, 'Unnamed deal');
  v_old_val := COALESCE(OLD.value::TEXT, '0');
  v_new_val := COALESCE(NEW.value::TEXT, '0');

  IF COALESCE(NEW.value, 0) > COALESCE(OLD.value, 0) THEN
    v_direction := 'increased';
  ELSE
    v_direction := 'decreased';
  END IF;

  PERFORM insert_copilot_memory(
    NEW.owner_id,
    'deal',
    v_deal_name,
    'Deal "' || v_deal_name || '" value ' || v_direction || ' from $' || v_old_val || ' to $' || v_new_val || '.',
    'Automatic memory from deal value change',
    NEW.id,
    NULL,
    NULL
  );

  RETURN NEW;
END;
$$;

CREATE TRIGGER trg_deal_value_change
  AFTER UPDATE ON deals
  FOR EACH ROW
  WHEN (OLD.value IS DISTINCT FROM NEW.value)
  EXECUTE FUNCTION on_deal_value_change();

-- =============================================================================
-- 3. DEAL STATUS CHANGES (won / lost)
-- =============================================================================

CREATE OR REPLACE FUNCTION on_deal_status_change()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
  v_deal_name TEXT;
  v_content TEXT;
BEGIN
  IF OLD.status IS NOT DISTINCT FROM NEW.status THEN
    RETURN NEW;
  END IF;

  v_deal_name := COALESCE(NEW.name, 'Unnamed deal');

  IF NEW.status = 'closed_won' THEN
    v_content := 'Deal "' || v_deal_name || '" was closed-won (value: $' || COALESCE(NEW.value::TEXT, '0') || ').';
  ELSIF NEW.status = 'closed_lost' THEN
    v_content := 'Deal "' || v_deal_name || '" was closed-lost.';
  ELSE
    v_content := 'Deal "' || v_deal_name || '" status changed from ' || COALESCE(OLD.status, 'unknown') || ' to ' || COALESCE(NEW.status, 'unknown') || '.';
  END IF;

  PERFORM insert_copilot_memory(
    NEW.owner_id,
    'deal',
    v_deal_name,
    v_content,
    'Automatic memory from deal status change',
    NEW.id,
    NULL,
    NULL
  );

  RETURN NEW;
END;
$$;

CREATE TRIGGER trg_deal_status_change
  AFTER UPDATE ON deals
  FOR EACH ROW
  WHEN (OLD.status IS DISTINCT FROM NEW.status)
  EXECUTE FUNCTION on_deal_status_change();

-- =============================================================================
-- 4. CONTACT ENGAGEMENT LEVEL CHANGES
-- =============================================================================

CREATE OR REPLACE FUNCTION on_contact_engagement_change()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
  v_contact_name TEXT;
BEGIN
  IF OLD.engagement_level IS NOT DISTINCT FROM NEW.engagement_level THEN
    RETURN NEW;
  END IF;

  v_contact_name := COALESCE(NEW.full_name, TRIM(COALESCE(NEW.first_name, '') || ' ' || COALESCE(NEW.last_name, '')), NEW.email);

  PERFORM insert_copilot_memory(
    NEW.owner_id,
    'relationship',
    v_contact_name,
    'Contact ' || v_contact_name || ' engagement changed from ' || COALESCE(OLD.engagement_level, 'unset') || ' to ' || COALESCE(NEW.engagement_level, 'unset') || '.',
    'Automatic memory from contact engagement change',
    NULL,
    NEW.id,
    NULL
  );

  RETURN NEW;
END;
$$;

CREATE TRIGGER trg_contact_engagement_change
  AFTER UPDATE ON contacts
  FOR EACH ROW
  WHEN (OLD.engagement_level IS DISTINCT FROM NEW.engagement_level)
  EXECUTE FUNCTION on_contact_engagement_change();

-- =============================================================================
-- 5. CONTACT HEALTH SCORE CHANGES (significant swings only)
-- =============================================================================

CREATE OR REPLACE FUNCTION on_contact_health_change()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
  v_contact_name TEXT;
  v_direction TEXT;
BEGIN
  -- Only fire on significant changes (>= 20 point swing)
  IF ABS(COALESCE(NEW.health_score, 0) - COALESCE(OLD.health_score, 0)) < 20 THEN
    RETURN NEW;
  END IF;

  v_contact_name := COALESCE(NEW.full_name, TRIM(COALESCE(NEW.first_name, '') || ' ' || COALESCE(NEW.last_name, '')), NEW.email);

  IF COALESCE(NEW.health_score, 0) > COALESCE(OLD.health_score, 0) THEN
    v_direction := 'improved';
  ELSE
    v_direction := 'declined';
  END IF;

  PERFORM insert_copilot_memory(
    NEW.owner_id,
    'relationship',
    v_contact_name,
    'Contact ' || v_contact_name || ' health score ' || v_direction || ' from ' || COALESCE(OLD.health_score, 0)::TEXT || ' to ' || COALESCE(NEW.health_score, 0)::TEXT || '.',
    'Automatic memory from significant health score change (>= 20 point swing)',
    NULL,
    NEW.id,
    NULL
  );

  RETURN NEW;
END;
$$;

CREATE TRIGGER trg_contact_health_change
  AFTER UPDATE ON contacts
  FOR EACH ROW
  WHEN (OLD.health_score IS DISTINCT FROM NEW.health_score)
  EXECUTE FUNCTION on_contact_health_change();

-- =============================================================================
-- 6. TASK COMPLETION
-- =============================================================================

CREATE OR REPLACE FUNCTION on_task_completed()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
  v_user_id UUID;
  v_title TEXT;
BEGIN
  -- Only fire when task transitions to completed
  IF NEW.completed IS NOT TRUE OR OLD.completed IS NOT DISTINCT FROM NEW.completed THEN
    RETURN NEW;
  END IF;

  v_user_id := COALESCE(NEW.assigned_to, NEW.owner_id, NEW.created_by);
  v_title := COALESCE(NEW.title, 'Untitled task');

  PERFORM insert_copilot_memory(
    v_user_id,
    'commitment',
    v_title,
    'Task "' || v_title || '" was completed.',
    'Automatic memory from task completion',
    NEW.deal_id,
    NULL,
    NULL
  );

  RETURN NEW;
END;
$$;

CREATE TRIGGER trg_task_completed
  AFTER UPDATE ON tasks
  FOR EACH ROW
  WHEN (NEW.completed = TRUE AND (OLD.completed IS DISTINCT FROM NEW.completed))
  EXECUTE FUNCTION on_task_completed();

-- =============================================================================
-- 7. ACTIVITY LOGGED
-- =============================================================================

CREATE OR REPLACE FUNCTION on_activity_created()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
  v_content TEXT;
BEGIN
  v_content := 'Activity logged: ' || COALESCE(NEW.type, 'unknown type');

  -- Add deal context if linked
  IF NEW.deal_id IS NOT NULL THEN
    v_content := v_content || ' (linked to a deal)';
  END IF;

  PERFORM insert_copilot_memory(
    NEW.user_id,
    'fact',
    COALESCE(NEW.type, 'activity') || ' activity',
    v_content || '.',
    'Automatic memory from activity creation',
    NEW.deal_id,
    NEW.contact_id,
    NULL
  );

  RETURN NEW;
END;
$$;

CREATE TRIGGER trg_activity_created
  AFTER INSERT ON activities
  FOR EACH ROW
  EXECUTE FUNCTION on_activity_created();

-- =============================================================================
-- 8. CALENDAR EVENT COMPLETED (end_time has passed on update)
-- =============================================================================

CREATE OR REPLACE FUNCTION on_calendar_event_completed()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
  v_title TEXT;
BEGIN
  -- Fire when status changes to cancelled, or when event is updated after end_time passed
  IF NEW.status = 'cancelled' AND OLD.status IS DISTINCT FROM NEW.status THEN
    v_title := COALESCE(NEW.title, 'Untitled event');

    PERFORM insert_copilot_memory(
      NEW.user_id,
      'fact',
      v_title,
      'Calendar event "' || v_title || '" was cancelled.',
      'Automatic memory from calendar event cancellation',
      NEW.deal_id,
      NULL,
      NULL
    );
  END IF;

  RETURN NEW;
END;
$$;

CREATE TRIGGER trg_calendar_event_status_change
  AFTER UPDATE ON calendar_events
  FOR EACH ROW
  WHEN (OLD.status IS DISTINCT FROM NEW.status)
  EXECUTE FUNCTION on_calendar_event_completed();

-- =============================================================================
-- Done
-- =============================================================================

NOTIFY pgrst, 'reload schema';
