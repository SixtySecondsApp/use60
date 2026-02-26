-- ============================================================================
-- Migration: Fix call_proactive_edge_function URL detection
-- Purpose: The existing function tries to parse request.headers as JSON to
--          extract the host, but when called from pg_cron there is no HTTP
--          request context, causing:
--            "operator does not exist: text ->> unknown"
--
--          Fix: Try Vault first (supabase_url secret), then app.supabase_url
--          setting, then derive from current_database(). Removes the broken
--          request.headers JSON parse.
--
--          NOTE: You should add a "supabase_url" secret in Supabase Dashboard
--          > Settings > Vault with value "https://<project-ref>.supabase.co"
--          for best reliability. The current_database() fallback works on
--          hosted Supabase where db name = project ref.
-- Date: 2026-02-23
-- ============================================================================

-- ============================================================================
-- 1. Recreate call_proactive_edge_function with robust URL detection
-- ============================================================================

CREATE OR REPLACE FUNCTION public.call_proactive_edge_function(
  function_name TEXT,
  payload JSONB DEFAULT '{}'::jsonb
)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, extensions
AS $$
DECLARE
  v_supabase_url TEXT;
  v_service_role_key TEXT;
  v_request_id BIGINT;
BEGIN
  -- 1. Try Vault for the project URL (preferred — works from pg_cron)
  BEGIN
    SELECT decrypted_secret INTO v_supabase_url
    FROM vault.decrypted_secrets
    WHERE name = 'supabase_url'
    LIMIT 1;
  EXCEPTION WHEN OTHERS THEN
    v_supabase_url := NULL;
  END;

  -- 2. Fallback: app.supabase_url setting (set by some Supabase configs)
  IF v_supabase_url IS NULL OR v_supabase_url = '' THEN
    BEGIN
      v_supabase_url := current_setting('app.supabase_url', true);
    EXCEPTION WHEN OTHERS THEN
      v_supabase_url := NULL;
    END;
  END IF;

  -- 3. Fallback: derive from service_role JWT (extract project ref)
  --    On Supabase hosted, the service_role JWT 'ref' claim = project ref
  IF v_supabase_url IS NULL OR v_supabase_url = '' THEN
    BEGIN
      SELECT decrypted_secret INTO v_service_role_key
      FROM vault.decrypted_secrets
      WHERE name = 'service_role_key'
      LIMIT 1;

      IF v_service_role_key IS NOT NULL THEN
        -- JWT is base64url: header.payload.signature
        -- Decode the payload (2nd segment) to extract 'ref'
        v_supabase_url := 'https://' ||
          convert_from(
            decode(
              -- Add padding and fix base64url chars
              replace(replace(
                split_part(v_service_role_key, '.', 2),
                '-', '+'), '_', '/') ||
              repeat('=', (4 - length(split_part(v_service_role_key, '.', 2)) % 4) % 4),
              'base64'
            ),
            'UTF8'
          )::jsonb->>'ref' || '.supabase.co';
      END IF;
    EXCEPTION WHEN OTHERS THEN
      -- JWT parsing failed, continue to next fallback
      NULL;
    END;
  END IF;

  -- 4. Get service role key from vault (if not already fetched above)
  IF v_service_role_key IS NULL THEN
    SELECT decrypted_secret INTO v_service_role_key
    FROM vault.decrypted_secrets
    WHERE name = 'service_role_key';
  END IF;

  -- Validate
  IF v_service_role_key IS NULL THEN
    INSERT INTO public.cron_job_logs (job_name, status, message)
    VALUES (function_name, 'error', 'Vault secret "service_role_key" not found. Add it in Supabase Dashboard > Settings > Vault');
    RETURN;
  END IF;

  IF v_supabase_url IS NULL OR v_supabase_url = '' THEN
    INSERT INTO public.cron_job_logs (job_name, status, message)
    VALUES (function_name, 'error', 'Could not determine Supabase URL. Add "supabase_url" to Vault.');
    RETURN;
  END IF;

  -- Make async HTTP request to edge function using net schema
  SELECT net.http_post(
    url := v_supabase_url || '/functions/v1/' || function_name,
    headers := jsonb_build_object(
      'Content-Type', 'application/json',
      'Authorization', 'Bearer ' || v_service_role_key
    ),
    body := payload,
    timeout_milliseconds := 55000
  ) INTO v_request_id;

  -- Log the trigger
  INSERT INTO public.cron_job_logs (job_name, status, message, metadata)
  VALUES (
    function_name,
    'triggered',
    'Edge function called via pg_net',
    jsonb_build_object('request_id', v_request_id, 'payload', payload)
  );

EXCEPTION WHEN OTHERS THEN
  INSERT INTO public.cron_job_logs (job_name, status, message, error_details)
  VALUES (function_name, 'error', 'Failed to call edge function', SQLERRM);
END;
$$;

COMMENT ON FUNCTION public.call_proactive_edge_function IS
  'Generic wrapper to call proactive AI edge functions via pg_net. '
  'Reads supabase_url and service_role_key from Vault. '
  'Derives project URL from JWT ref claim if Vault secret missing. '
  'Fixed 2026-02-23: removed request.headers parsing that broke pg_cron context.';

-- ============================================================================
-- 2. Verification
-- ============================================================================

DO $$
BEGIN
  RAISE NOTICE '';
  RAISE NOTICE '============================================================================';
  RAISE NOTICE 'Migration: 20260223104200_fix_edge_function_url_detection.sql';
  RAISE NOTICE '============================================================================';
  RAISE NOTICE '';
  RAISE NOTICE 'Fixed: call_proactive_edge_function URL detection';
  RAISE NOTICE '  - Removed broken request.headers JSON parsing';
  RAISE NOTICE '  - Added JWT ref claim extraction as fallback';
  RAISE NOTICE '  - Vault "supabase_url" secret still preferred';
  RAISE NOTICE '';
  RAISE NOTICE 'ACTION NEEDED: Add "supabase_url" to Vault in Supabase Dashboard';
  RAISE NOTICE '  Value: https://<project-ref>.supabase.co';
  RAISE NOTICE '';
  RAISE NOTICE '============================================================================';
END $$;
