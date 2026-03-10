-- Migration: fix_call_proactive_edge_function_add_cron_secret
-- Date: 20260308214156
--
-- What this migration does:
--   Adds x-cron-secret header (from vault) to call_proactive_edge_function.
--   This fixes 401 errors on edge functions that use verifyCronSecret auth
--   (e.g. agent-eod-synthesis) when called via this helper.
--
-- Rollback strategy:
--   Re-apply the previous version without the x-cron-secret header.

CREATE OR REPLACE FUNCTION public.call_proactive_edge_function(function_name text, payload jsonb DEFAULT '{}'::jsonb)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public', 'extensions'
AS $function$
DECLARE
  v_supabase_url TEXT;
  v_service_role_key TEXT;
  v_cron_secret TEXT;
  v_request_id BIGINT;
BEGIN
  -- Get Supabase URL from system_config (reliable source)
  v_supabase_url := (SELECT value FROM public.system_config WHERE key = 'supabase_url');

  -- Get service role key from vault
  SELECT decrypted_secret INTO v_service_role_key
  FROM vault.decrypted_secrets
  WHERE name = 'service_role_key';

  -- Get cron secret from vault (for verifyCronSecret auth path)
  SELECT decrypted_secret INTO v_cron_secret
  FROM vault.decrypted_secrets
  WHERE name = 'cron_secret';

  -- Validate
  IF v_service_role_key IS NULL THEN
    INSERT INTO public.cron_job_logs (job_name, status, message)
    VALUES (function_name, 'error', 'Vault secret service_role_key not found');
    RETURN;
  END IF;

  IF v_supabase_url IS NULL THEN
    INSERT INTO public.cron_job_logs (job_name, status, message)
    VALUES (function_name, 'error', 'Could not determine Supabase URL from system_config');
    RETURN;
  END IF;

  -- Make async HTTP request to edge function using net schema
  SELECT net.http_post(
    url := v_supabase_url || '/functions/v1/' || function_name,
    headers := jsonb_build_object(
      'Content-Type', 'application/json',
      'Authorization', 'Bearer ' || v_service_role_key,
      'x-cron-secret', COALESCE(v_cron_secret, 'not-set')
    ),
    body := payload,
    timeout_milliseconds := 55000
  ) INTO v_request_id;

  -- Log success
  INSERT INTO public.cron_job_logs (job_name, status, message, metadata)
  VALUES (function_name, 'triggered', 'Edge function called, request_id: ' || v_request_id, payload);
EXCEPTION WHEN OTHERS THEN
  INSERT INTO public.cron_job_logs (job_name, status, message)
  VALUES (function_name, 'error', 'Failed to call edge function: ' || SQLERRM);
END;
$function$;
