-- =============================================================================
-- EMAIL-008: Scheduled Email Sends
--
-- Queue table for delayed email sends initiated from the Slack [Schedule] button.
-- A pg_cron job fires every minute, finds pending rows WHERE scheduled_at <= NOW(),
-- and calls hitl-send-followup-email for each one.
-- =============================================================================

-- ---------------------------------------------------------------------------
-- 1. Queue table
-- ---------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.scheduled_email_sends (
  id            uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  approval_id   uuid NOT NULL REFERENCES public.hitl_pending_approvals(id) ON DELETE CASCADE,
  org_id        uuid NOT NULL,
  user_id       uuid,
  scheduled_at  timestamptz NOT NULL,
  -- pending → sent | cancelled | failed
  status        text NOT NULL DEFAULT 'pending'
                CHECK (status IN ('pending', 'sent', 'cancelled', 'failed')),
  -- Slack context needed for post-send message update
  slack_team_id   text,
  slack_channel_id text,
  slack_message_ts text,
  -- Human-readable label shown in the Slack message, e.g. "Fri 2pm"
  scheduled_label text,
  -- Error detail when status = 'failed'
  error_message text,
  created_at    timestamptz NOT NULL DEFAULT now(),
  updated_at    timestamptz NOT NULL DEFAULT now()
);

-- Index for the cron poller — pending rows whose time has come
CREATE INDEX IF NOT EXISTS idx_scheduled_email_sends_poll
  ON public.scheduled_email_sends (scheduled_at)
  WHERE status = 'pending';

-- Index by approval_id for cancel lookups
CREATE INDEX IF NOT EXISTS idx_scheduled_email_sends_approval
  ON public.scheduled_email_sends (approval_id);

-- RLS: rows are user-private and org-scoped
ALTER TABLE public.scheduled_email_sends ENABLE ROW LEVEL SECURITY;

-- Service role bypass (cron poller uses service role)
CREATE POLICY "service_role_all_scheduled_email_sends"
  ON public.scheduled_email_sends
  FOR ALL
  TO service_role
  USING (true)
  WITH CHECK (true);

-- Users can read/cancel their own rows
CREATE POLICY "users_own_scheduled_email_sends"
  ON public.scheduled_email_sends
  FOR ALL
  TO authenticated
  USING (user_id = auth.uid())
  WITH CHECK (user_id = auth.uid());

-- ---------------------------------------------------------------------------
-- 2. Cron worker function
--    Finds pending scheduled sends that are due and calls hitl-send-followup-email.
-- ---------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.process_scheduled_email_sends()
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, extensions
AS $$
DECLARE
  v_supabase_url    text;
  v_service_role_key text;
  v_row             record;
  v_request_id      bigint;
BEGIN
  v_supabase_url := get_system_config('supabase_url');
  IF v_supabase_url IS NULL THEN
    RAISE WARNING '[scheduled_email_sends] supabase_url not found in system_config';
    RETURN;
  END IF;

  SELECT decrypted_secret INTO v_service_role_key
  FROM vault.decrypted_secrets
  WHERE name = 'service_role_key'
  LIMIT 1;

  IF v_service_role_key IS NULL THEN
    RAISE WARNING '[scheduled_email_sends] service_role_key not found in vault';
    RETURN;
  END IF;

  FOR v_row IN
    SELECT id, approval_id
    FROM public.scheduled_email_sends
    WHERE status = 'pending'
      AND scheduled_at <= now()
    ORDER BY scheduled_at
    LIMIT 50
  LOOP
    BEGIN
      -- Mark as sent optimistically (prevents double-fire if cron overlaps)
      UPDATE public.scheduled_email_sends
         SET status = 'sent', updated_at = now()
       WHERE id = v_row.id AND status = 'pending';

      -- Only proceed if we actually owned the update (row wasn't already processed)
      IF FOUND THEN
        SELECT net.http_post(
          url     := v_supabase_url || '/functions/v1/hitl-send-followup-email',
          headers := jsonb_build_object(
            'Content-Type',  'application/json',
            'Authorization', 'Bearer ' || v_service_role_key
          ),
          body    := jsonb_build_object(
            'approval_id', v_row.approval_id::text,
            'action',      'approved'
          ),
          timeout_milliseconds := 55000
        ) INTO v_request_id;

        RAISE LOG '[scheduled_email_sends] dispatched approval % (row %, request %)',
          v_row.approval_id, v_row.id, v_request_id;
      END IF;

    EXCEPTION WHEN OTHERS THEN
      -- Mark failed and log; do not block remaining rows
      UPDATE public.scheduled_email_sends
         SET status = 'failed', error_message = SQLERRM, updated_at = now()
       WHERE id = v_row.id;

      RAISE WARNING '[scheduled_email_sends] failed for row %: %', v_row.id, SQLERRM;
    END;
  END LOOP;
END;
$$;

-- ---------------------------------------------------------------------------
-- 3. pg_cron schedule — every minute
-- ---------------------------------------------------------------------------
SELECT cron.schedule(
  'process-scheduled-email-sends',
  '* * * * *',
  $$ SELECT public.process_scheduled_email_sends(); $$
);
