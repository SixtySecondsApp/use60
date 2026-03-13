-- Migration: wire_deal_heartbeat_triggers
-- Date: 20260310210511
--
-- What this migration does:
--   1. Adds a trigger on deals table that fires proactive-deal-heartbeat via pg_net
--      when stage_id changes (PST-004).
--   2. Schedules a nightly 2am UTC cron job to scan all active deals (PST-006).
--   3. Un-snoozes observations whose snooze_until has passed.
--
-- Rollback strategy:
--   DROP TRIGGER IF EXISTS trg_deal_heartbeat_stage_change ON deals;
--   DROP FUNCTION IF EXISTS notify_deal_heartbeat_stage_change();
--   SELECT cron.unschedule('nightly-deal-heartbeat');
--   SELECT cron.unschedule('unsnooze-deal-observations');

-- ============================================================================
-- PST-004: Deal stage change → heartbeat trigger
-- ============================================================================

-- Function that calls proactive-deal-heartbeat via pg_net on stage change
CREATE OR REPLACE FUNCTION notify_deal_heartbeat_stage_change()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
  v_supabase_url TEXT;
  v_service_role_key TEXT;
BEGIN
  -- Only fire when stage_id actually changes
  IF OLD.stage_id IS DISTINCT FROM NEW.stage_id THEN
    -- Get secrets from vault
    SELECT decrypted_secret INTO v_supabase_url
    FROM vault.decrypted_secrets
    WHERE name = 'supabase_url'
    LIMIT 1;

    SELECT decrypted_secret INTO v_service_role_key
    FROM vault.decrypted_secrets
    WHERE name = 'service_role_key'
    LIMIT 1;

    -- Fall back to env if vault not available
    IF v_supabase_url IS NULL THEN
      v_supabase_url := current_setting('app.settings.supabase_url', true);
    END IF;

    IF v_service_role_key IS NULL THEN
      v_service_role_key := current_setting('app.settings.service_role_key', true);
    END IF;

    -- Fire-and-forget call to proactive-deal-heartbeat
    IF v_supabase_url IS NOT NULL AND v_service_role_key IS NOT NULL THEN
      PERFORM net.http_post(
        url := v_supabase_url || '/functions/v1/proactive-deal-heartbeat',
        headers := jsonb_build_object(
          'Content-Type', 'application/json',
          'Authorization', 'Bearer ' || v_service_role_key
        ),
        body := jsonb_build_object(
          'deal_id', NEW.id,
          'org_id', NEW.org_id,
          'trigger_type', 'stage_change',
          'previous_stage_id', OLD.stage_id
        )
      );
    END IF;
  END IF;

  RETURN NEW;
END;
$$;

-- Drop existing trigger if any, then create
DROP TRIGGER IF EXISTS trg_deal_heartbeat_stage_change ON deals;
CREATE TRIGGER trg_deal_heartbeat_stage_change
  AFTER UPDATE ON deals
  FOR EACH ROW
  WHEN (OLD.stage_id IS DISTINCT FROM NEW.stage_id)
  EXECUTE FUNCTION notify_deal_heartbeat_stage_change();

-- ============================================================================
-- PST-006: Nightly heartbeat cron (2am UTC)
-- ============================================================================

-- Schedule nightly scan of all active deals
SELECT cron.schedule(
  'nightly-deal-heartbeat',
  '0 2 * * *',
  $$
  SELECT net.http_post(
    url := current_setting('app.settings.supabase_url', true) || '/functions/v1/proactive-deal-heartbeat',
    headers := jsonb_build_object(
      'Content-Type', 'application/json',
      'x-cron-secret', current_setting('app.settings.cron_secret', true)
    ),
    body := jsonb_build_object(
      'trigger_type', 'cron'
    )
  );
  $$
);

-- ============================================================================
-- Auto-unsnooze cron (runs hourly, cheap check)
-- ============================================================================

SELECT cron.schedule(
  'unsnooze-deal-observations',
  '0 * * * *',
  $$
  UPDATE deal_observations
  SET status = 'open', snooze_until = NULL
  WHERE status = 'snoozed'
    AND snooze_until IS NOT NULL
    AND snooze_until <= NOW();
  $$
);
