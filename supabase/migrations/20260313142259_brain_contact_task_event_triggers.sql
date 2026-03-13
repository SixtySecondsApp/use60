-- Migration: brain_contact_task_event_triggers
-- Date: 20260313142259
--
-- What this migration does:
--   Creates PG triggers on contacts (INSERT) and tasks (UPDATE)
--   that invoke agent-trigger edge function via pg_net.
--   Contact: fires on new contact creation for auto-enrichment.
--   Task: fires when task becomes overdue (debounce: 1 per task per 24h).
--
-- Rollback strategy:
--   DROP TRIGGER IF EXISTS brain_contact_created_trigger ON contacts;
--   DROP TRIGGER IF EXISTS brain_task_overdue_trigger ON tasks;
--   DROP FUNCTION IF EXISTS _brain_trigger_contact_created();
--   DROP FUNCTION IF EXISTS _brain_trigger_task_overdue();
--   DROP TABLE IF EXISTS brain_task_overdue_debounce;

-- Debounce table for task overdue (max once per task per 24h)
CREATE TABLE IF NOT EXISTS brain_task_overdue_debounce (
  task_id UUID PRIMARY KEY,
  last_fired_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- Trigger function: contact_created
CREATE OR REPLACE FUNCTION _brain_trigger_contact_created()
RETURNS TRIGGER
LANGUAGE plpgsql SECURITY DEFINER SET search_path = ''
AS $$
DECLARE
  _creds RECORD;
  _payload JSONB;
  _org_id UUID;
BEGIN
  -- Resolve org_id from owner's membership
  IF NEW.owner_id IS NOT NULL THEN
    SELECT om.org_id INTO _org_id
    FROM public.organization_memberships om
    WHERE om.user_id = NEW.owner_id
    LIMIT 1;
  END IF;

  IF _org_id IS NULL THEN
    RETURN NEW;
  END IF;

  SELECT * INTO _creds FROM public._brain_get_credentials();

  IF _creds.supabase_url IS NULL OR _creds.service_role_key IS NULL THEN
    RETURN NEW;
  END IF;

  _payload := jsonb_build_object(
    'event', 'contact_created',
    'organization_id', _org_id,
    'user_id', NEW.owner_id,
    'payload', jsonb_build_object(
      'contact_id', NEW.id,
      'email', NEW.email,
      'full_name', NEW.full_name,
      'company', NEW.company,
      'company_id', NEW.company_id,
      'title', NEW.title,
      'source', NEW.source,
      'owner_id', NEW.owner_id
    )
  );

  PERFORM net.http_post(
    url := _creds.supabase_url || '/functions/v1/agent-trigger',
    headers := jsonb_build_object(
      'Content-Type', 'application/json',
      'Authorization', 'Bearer ' || _creds.service_role_key,
      'x-internal-call', 'true'
    ),
    body := _payload,
    timeout_milliseconds := 5000
  );

  RETURN NEW;
EXCEPTION WHEN OTHERS THEN
  RAISE WARNING '[brain] contact_created trigger error: %', SQLERRM;
  RETURN NEW;
END;
$$;

-- Trigger function: task_overdue (with 24h debounce)
CREATE OR REPLACE FUNCTION _brain_trigger_task_overdue()
RETURNS TRIGGER
LANGUAGE plpgsql SECURITY DEFINER SET search_path = ''
AS $$
DECLARE
  _creds RECORD;
  _payload JSONB;
  _org_id UUID;
  _last_fired TIMESTAMPTZ;
BEGIN
  -- Only fire for uncompleted tasks that are past due
  IF NEW.completed = true THEN
    RETURN NEW;
  END IF;

  IF NEW.due_date IS NULL OR NEW.due_date > now() THEN
    RETURN NEW;
  END IF;

  -- Debounce: check if we fired for this task in last 24h
  SELECT last_fired_at INTO _last_fired
  FROM public.brain_task_overdue_debounce
  WHERE task_id = NEW.id;

  IF _last_fired IS NOT NULL AND _last_fired > now() - interval '24 hours' THEN
    RETURN NEW;
  END IF;

  -- Update debounce
  INSERT INTO public.brain_task_overdue_debounce (task_id, last_fired_at)
  VALUES (NEW.id, now())
  ON CONFLICT (task_id) DO UPDATE SET last_fired_at = now();

  -- Resolve org_id
  _org_id := NEW.clerk_org_id::uuid;
  IF _org_id IS NULL THEN
    SELECT om.org_id INTO _org_id
    FROM public.organization_memberships om
    WHERE om.user_id = NEW.assigned_to
    LIMIT 1;
  END IF;

  IF _org_id IS NULL THEN
    RETURN NEW;
  END IF;

  SELECT * INTO _creds FROM public._brain_get_credentials();

  IF _creds.supabase_url IS NULL OR _creds.service_role_key IS NULL THEN
    RETURN NEW;
  END IF;

  _payload := jsonb_build_object(
    'event', 'task_overdue',
    'organization_id', _org_id,
    'user_id', NEW.assigned_to,
    'payload', jsonb_build_object(
      'task_id', NEW.id,
      'title', NEW.title,
      'due_date', NEW.due_date,
      'deal_id', NEW.deal_id,
      'contact_id', NEW.contact_id,
      'assigned_to', NEW.assigned_to,
      'priority', NEW.priority
    )
  );

  PERFORM net.http_post(
    url := _creds.supabase_url || '/functions/v1/agent-trigger',
    headers := jsonb_build_object(
      'Content-Type', 'application/json',
      'Authorization', 'Bearer ' || _creds.service_role_key,
      'x-internal-call', 'true'
    ),
    body := _payload,
    timeout_milliseconds := 5000
  );

  RETURN NEW;
EXCEPTION WHEN OTHERS THEN
  RAISE WARNING '[brain] task_overdue trigger error: %', SQLERRM;
  RETURN NEW;
END;
$$;

-- Create triggers
DROP TRIGGER IF EXISTS brain_contact_created_trigger ON contacts;
CREATE TRIGGER brain_contact_created_trigger
  AFTER INSERT ON contacts
  FOR EACH ROW
  EXECUTE FUNCTION _brain_trigger_contact_created();

DROP TRIGGER IF EXISTS brain_task_overdue_trigger ON tasks;
CREATE TRIGGER brain_task_overdue_trigger
  AFTER UPDATE ON tasks
  FOR EACH ROW
  EXECUTE FUNCTION _brain_trigger_task_overdue();
