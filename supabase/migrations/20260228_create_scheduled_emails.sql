-- =============================================================================
-- EMAIL-ACT-004: Scheduled Emails (Copilot Email Actions)
--
-- Queue table for scheduled email sends from the Deal Copilot chat.
-- A pg_cron job fires every minute, finds pending rows WHERE scheduled_for <= NOW(),
-- and calls email-send-as-rep for each one via net.http_post.
-- =============================================================================

-- ---------------------------------------------------------------------------
-- 1. Queue table
-- ---------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.scheduled_emails (
  id                    uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id               uuid NOT NULL,
  to_email              text NOT NULL,
  cc_email              text,
  bcc_email             text,
  subject               text NOT NULL,
  body                  text NOT NULL,
  scheduled_for         timestamptz NOT NULL,
  -- pending -> sent | cancelled | failed
  status                text NOT NULL DEFAULT 'pending'
                        CHECK (status IN ('pending', 'sent', 'failed', 'cancelled')),
  error_message         text,
  sent_at               timestamptz,
  contact_id            uuid,
  deal_id               uuid,
  thread_id             text,
  reply_to_message_id   text,
  created_at            timestamptz NOT NULL DEFAULT now()
);

-- Index for the cron poller -- pending rows whose time has come
CREATE INDEX IF NOT EXISTS idx_scheduled_emails_poll
  ON public.scheduled_emails (scheduled_for)
  WHERE status = 'pending';

-- Index by user for listing/cancelling
CREATE INDEX IF NOT EXISTS idx_scheduled_emails_user
  ON public.scheduled_emails (user_id, status);

-- ---------------------------------------------------------------------------
-- 2. RLS
-- ---------------------------------------------------------------------------
ALTER TABLE public.scheduled_emails ENABLE ROW LEVEL SECURITY;

-- Service role bypass (cron poller uses service role)
CREATE POLICY "service_role_all_scheduled_emails"
  ON public.scheduled_emails
  FOR ALL
  TO service_role
  USING (true)
  WITH CHECK (true);

-- Users can CRUD their own rows
CREATE POLICY "users_own_scheduled_emails"
  ON public.scheduled_emails
  FOR ALL
  TO authenticated
  USING (user_id = auth.uid())
  WITH CHECK (user_id = auth.uid());

-- ---------------------------------------------------------------------------
-- 3. Cron worker function
-- ---------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.process_scheduled_emails()
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
    RAISE WARNING '[scheduled_emails] supabase_url not found in system_config';
    RETURN;
  END IF;

  SELECT decrypted_secret INTO v_service_role_key
  FROM vault.decrypted_secrets
  WHERE name = 'service_role_key'
  LIMIT 1;

  IF v_service_role_key IS NULL THEN
    RAISE WARNING '[scheduled_emails] service_role_key not found in vault';
    RETURN;
  END IF;

  FOR v_row IN
    SELECT id, user_id, to_email, cc_email, bcc_email, subject, body,
           thread_id, reply_to_message_id, contact_id, deal_id
    FROM public.scheduled_emails
    WHERE status = 'pending'
      AND scheduled_for <= now()
    ORDER BY scheduled_for
    LIMIT 50
  LOOP
    BEGIN
      -- Mark as sent optimistically (prevents double-fire if cron overlaps)
      UPDATE public.scheduled_emails
         SET status = 'sent', sent_at = now()
       WHERE id = v_row.id AND status = 'pending';

      -- Only proceed if we actually owned the update
      IF FOUND THEN
        SELECT net.http_post(
          url     := v_supabase_url || '/functions/v1/email-send-as-rep',
          headers := jsonb_build_object(
            'Content-Type',  'application/json',
            'Authorization', 'Bearer ' || v_service_role_key
          ),
          body    := jsonb_build_object(
            'userId',    v_row.user_id::text,
            'to',        v_row.to_email,
            'subject',   v_row.subject,
            'body',      v_row.body,
            'cc',        v_row.cc_email,
            'bcc',       v_row.bcc_email,
            'thread_id', v_row.thread_id,
            'in_reply_to', v_row.reply_to_message_id
          ),
          timeout_milliseconds := 55000
        ) INTO v_request_id;

        RAISE LOG '[scheduled_emails] dispatched email for user % (row %, request %)',
          v_row.user_id, v_row.id, v_request_id;
      END IF;

    EXCEPTION WHEN OTHERS THEN
      -- Mark failed and log; do not block remaining rows
      UPDATE public.scheduled_emails
         SET status = 'failed', error_message = SQLERRM
       WHERE id = v_row.id;

      RAISE WARNING '[scheduled_emails] failed for row %: %', v_row.id, SQLERRM;
    END;
  END LOOP;
END;
$$;

-- ---------------------------------------------------------------------------
-- 4. pg_cron schedule -- every minute
-- ---------------------------------------------------------------------------
SELECT cron.schedule(
  'process-scheduled-emails',
  '* * * * *',
  $$ SELECT public.process_scheduled_emails(); $$
);
