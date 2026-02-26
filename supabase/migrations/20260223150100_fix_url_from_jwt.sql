-- ============================================================================
-- Migration: Fix call_proactive_edge_function — derive URL from JWT ref
-- Purpose: Previous fix removed the broken request.headers parsing but the
--          vault and app.supabase_url fallbacks both fail. This version
--          extracts the project ref from the service_role JWT in vault,
--          which is always available on Supabase hosted.
-- Date: 2026-02-23
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
  v_jwt_payload TEXT;
  v_padded TEXT;
  v_decoded TEXT;
  v_ref TEXT;
BEGIN
  -- Get service role key from vault (always needed)
  SELECT decrypted_secret INTO v_service_role_key
  FROM vault.decrypted_secrets
  WHERE name = 'service_role_key';

  IF v_service_role_key IS NULL THEN
    INSERT INTO public.cron_job_logs (job_name, status, message)
    VALUES (function_name, 'error', 'Vault secret "service_role_key" not found');
    RETURN;
  END IF;

  -- 1. Try Vault for explicit supabase_url
  BEGIN
    SELECT decrypted_secret INTO v_supabase_url
    FROM vault.decrypted_secrets
    WHERE name = 'supabase_url'
    LIMIT 1;
  EXCEPTION WHEN OTHERS THEN
    v_supabase_url := NULL;
  END;

  -- 2. Try app.supabase_url setting
  IF v_supabase_url IS NULL OR v_supabase_url = '' THEN
    BEGIN
      v_supabase_url := current_setting('app.supabase_url', true);
    EXCEPTION WHEN OTHERS THEN
      v_supabase_url := NULL;
    END;
  END IF;

  -- 3. Extract project ref from service_role JWT payload
  IF v_supabase_url IS NULL OR v_supabase_url = '' THEN
    BEGIN
      -- JWT format: header.payload.signature
      v_jwt_payload := split_part(v_service_role_key, '.', 2);

      -- Fix base64url -> base64: replace - with +, _ with /
      v_jwt_payload := replace(replace(v_jwt_payload, '-', '+'), '_', '/');

      -- Add padding
      CASE length(v_jwt_payload) % 4
        WHEN 2 THEN v_padded := v_jwt_payload || '==';
        WHEN 3 THEN v_padded := v_jwt_payload || '=';
        ELSE v_padded := v_jwt_payload;
      END CASE;

      -- Decode and extract ref
      v_decoded := convert_from(decode(v_padded, 'base64'), 'UTF8');
      v_ref := v_decoded::jsonb->>'ref';

      IF v_ref IS NOT NULL AND v_ref <> '' THEN
        v_supabase_url := 'https://' || v_ref || '.supabase.co';
      END IF;
    EXCEPTION WHEN OTHERS THEN
      -- JWT parsing failed, v_supabase_url stays NULL
      NULL;
    END;
  END IF;

  -- Validate URL
  IF v_supabase_url IS NULL OR v_supabase_url = '' THEN
    INSERT INTO public.cron_job_logs (job_name, status, message)
    VALUES (function_name, 'error', 'Could not determine Supabase URL');
    RETURN;
  END IF;

  -- Make async HTTP request to edge function
  SELECT net.http_post(
    url := v_supabase_url || '/functions/v1/' || function_name,
    headers := jsonb_build_object(
      'Content-Type', 'application/json',
      'Authorization', 'Bearer ' || v_service_role_key
    ),
    body := payload,
    timeout_milliseconds := 55000
  ) INTO v_request_id;

  -- Log success
  INSERT INTO public.cron_job_logs (job_name, status, message, metadata)
  VALUES (
    function_name,
    'triggered',
    'Edge function called via pg_net',
    jsonb_build_object('request_id', v_request_id, 'url', v_supabase_url, 'payload', payload)
  );

EXCEPTION WHEN OTHERS THEN
  INSERT INTO public.cron_job_logs (job_name, status, message, error_details)
  VALUES (function_name, 'error', 'Failed to call edge function', SQLERRM);
END;
$$;

COMMENT ON FUNCTION public.call_proactive_edge_function IS
  'Generic wrapper to call proactive AI edge functions via pg_net. '
  'Derives Supabase URL from service_role JWT ref claim. '
  'Fixed 2026-02-23: robust URL detection without request.headers.';

-- ============================================================================
-- Verification
-- ============================================================================

DO $$
BEGIN
  RAISE NOTICE 'Fixed call_proactive_edge_function: JWT ref extraction for URL';
END $$;
