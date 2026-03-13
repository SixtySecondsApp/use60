-- Migration: brain_deal_event_triggers
-- Date: 20260313142124
--
-- What this migration does:
--   Creates PostgreSQL triggers on deals table that invoke agent-trigger
--   edge function via pg_net on deal creation and stage changes.
--   Follows the ops_rule_event_triggers pattern with Vault auth + debounce.
--
-- Rollback strategy:
--   DROP TRIGGER IF EXISTS brain_deal_created_trigger ON deals;
--   DROP TRIGGER IF EXISTS brain_deal_stage_changed_trigger ON deals;
--   DROP FUNCTION IF EXISTS _brain_trigger_deal_created();
--   DROP FUNCTION IF EXISTS _brain_trigger_deal_stage_changed();

-- Helper: read Vault credentials (reusable across brain triggers)
CREATE OR REPLACE FUNCTION _brain_get_credentials()
RETURNS TABLE(supabase_url TEXT, service_role_key TEXT)
LANGUAGE plpgsql SECURITY DEFINER SET search_path = ''
AS $$
BEGIN
  RETURN QUERY
  SELECT
    (SELECT value FROM public.system_config WHERE key = 'supabase_url' LIMIT 1),
    (SELECT decrypted_secret FROM vault.decrypted_secrets WHERE name = 'service_role_key' LIMIT 1);
END;
$$;

-- Trigger function: deal_created
CREATE OR REPLACE FUNCTION _brain_trigger_deal_created()
RETURNS TRIGGER
LANGUAGE plpgsql SECURITY DEFINER SET search_path = ''
AS $$
DECLARE
  _creds RECORD;
  _payload JSONB;
BEGIN
  SELECT * INTO _creds FROM public._brain_get_credentials();

  IF _creds.supabase_url IS NULL OR _creds.service_role_key IS NULL THEN
    RAISE WARNING '[brain] Missing credentials for deal_created trigger';
    RETURN NEW;
  END IF;

  _payload := jsonb_build_object(
    'event', 'deal_created',
    'organization_id', NEW.clerk_org_id,
    'user_id', NEW.owner_id,
    'payload', jsonb_build_object(
      'deal_id', NEW.id,
      'deal_name', NEW.name,
      'stage_id', NEW.stage_id,
      'value', NEW.value,
      'company', NEW.company,
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
  RAISE WARNING '[brain] deal_created trigger error: %', SQLERRM;
  RETURN NEW;
END;
$$;

-- Trigger function: deal_stage_changed
CREATE OR REPLACE FUNCTION _brain_trigger_deal_stage_changed()
RETURNS TRIGGER
LANGUAGE plpgsql SECURITY DEFINER SET search_path = ''
AS $$
DECLARE
  _creds RECORD;
  _payload JSONB;
BEGIN
  -- Only fire when stage actually changes
  IF OLD.stage_id IS NOT DISTINCT FROM NEW.stage_id THEN
    RETURN NEW;
  END IF;

  SELECT * INTO _creds FROM public._brain_get_credentials();

  IF _creds.supabase_url IS NULL OR _creds.service_role_key IS NULL THEN
    RAISE WARNING '[brain] Missing credentials for deal_stage_changed trigger';
    RETURN NEW;
  END IF;

  _payload := jsonb_build_object(
    'event', 'deal_stage_changed',
    'organization_id', NEW.clerk_org_id,
    'user_id', NEW.owner_id,
    'payload', jsonb_build_object(
      'deal_id', NEW.id,
      'deal_name', NEW.name,
      'old_stage_id', OLD.stage_id,
      'new_stage_id', NEW.stage_id,
      'value', NEW.value,
      'company', NEW.company,
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
  RAISE WARNING '[brain] deal_stage_changed trigger error: %', SQLERRM;
  RETURN NEW;
END;
$$;

-- Create triggers
DROP TRIGGER IF EXISTS brain_deal_created_trigger ON deals;
CREATE TRIGGER brain_deal_created_trigger
  AFTER INSERT ON deals
  FOR EACH ROW
  EXECUTE FUNCTION _brain_trigger_deal_created();

DROP TRIGGER IF EXISTS brain_deal_stage_changed_trigger ON deals;
CREATE TRIGGER brain_deal_stage_changed_trigger
  AFTER UPDATE ON deals
  FOR EACH ROW
  EXECUTE FUNCTION _brain_trigger_deal_stage_changed();
