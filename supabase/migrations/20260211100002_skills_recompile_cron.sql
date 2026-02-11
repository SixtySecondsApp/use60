-- Migration: Schedule periodic skill recompilation via pg_cron
-- Date: 2026-02-11
--
-- Purpose:
-- - Automatically recompile organization skills when org context changes.
-- - The trigger from 20260211100001_skills_auto_recompile.sql sets needs_recompile = true
--   on organization_skills when organization_context rows change.
-- - This cron job calls refresh-organization-skills every 5 minutes to process the queue.
--
-- Setup required:
-- - Add `service_role_key` to Supabase Vault (if not already present)
--   Dashboard → Settings → Vault → New Secret
--   Name: service_role_key
--   Value: <project service role key>

-- =============================================================================
-- 1. Helper function to call refresh-organization-skills edge function
-- =============================================================================

CREATE OR REPLACE FUNCTION public.call_refresh_organization_skills()
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public', 'extensions'
AS $$
DECLARE
  supabase_url text;
  service_role_key text;
  request_id bigint;
  pending_count integer;
BEGIN
  -- Check if there are any skills needing recompile before making the HTTP call
  SELECT count(*) INTO pending_count
  FROM public.organization_skills
  WHERE needs_recompile = true AND is_active = true;

  -- Skip if nothing to do (avoid unnecessary edge function invocations)
  IF pending_count = 0 THEN
    RETURN;
  END IF;

  -- Get the Supabase URL from project settings
  supabase_url := 'https://' ||
    regexp_replace(current_database(), '^postgres_', '') ||
    '.supabase.co';

  -- Get service role key from vault
  BEGIN
    SELECT decrypted_secret INTO service_role_key
    FROM vault.decrypted_secrets
    WHERE name = 'service_role_key'
    LIMIT 1;
  EXCEPTION WHEN OTHERS THEN
    service_role_key := NULL;
  END;

  IF service_role_key IS NULL THEN
    RAISE WARNING '[call_refresh_organization_skills] No service_role_key found in vault. Skipping.';
    RETURN;
  END IF;

  -- Call the edge function via pg_net
  SELECT net.http_post(
    url := supabase_url || '/functions/v1/refresh-organization-skills',
    headers := jsonb_build_object(
      'Content-Type', 'application/json',
      'Authorization', 'Bearer ' || service_role_key
    ),
    body := jsonb_build_object(
      'action', 'refresh_pending',
      'limit', 50
    )
  ) INTO request_id;

  RAISE LOG '[call_refresh_organization_skills] Dispatched refresh for % pending skills, request_id: %',
    pending_count, request_id;
END;
$$;

COMMENT ON FUNCTION public.call_refresh_organization_skills()
  IS 'Calls refresh-organization-skills edge function to process skills marked for recompilation';

-- =============================================================================
-- 2. Schedule the cron job (every 5 minutes)
-- =============================================================================

-- Unschedule if exists (idempotent)
DO $$
BEGIN
  PERFORM cron.unschedule('refresh-stale-skills');
EXCEPTION WHEN OTHERS THEN
  NULL;
END $$;

-- Run every 5 minutes
SELECT cron.schedule(
  'refresh-stale-skills',
  '*/5 * * * *',
  $$SELECT public.call_refresh_organization_skills()$$
);
