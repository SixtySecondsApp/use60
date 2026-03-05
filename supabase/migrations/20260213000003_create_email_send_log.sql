-- Migration: Create email_send_log table for tracking emails sent via Gmail API
-- Used by email-send-as-rep edge function for daily rate limiting and audit trail

CREATE TABLE IF NOT EXISTS email_send_log (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  org_id UUID REFERENCES organizations(id) ON DELETE CASCADE,
  message_id TEXT NOT NULL, -- Gmail message ID
  thread_id TEXT, -- Gmail thread ID (for threading)
  to_email TEXT NOT NULL,
  subject TEXT NOT NULL,
  sent_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  job_id UUID REFERENCES sequence_jobs(id) ON DELETE SET NULL, -- Optional link to orchestrator job
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),

  CONSTRAINT email_send_log_message_id_unique UNIQUE (message_id)
);

-- Index for daily send limit queries (user_id + sent_at range)
CREATE INDEX IF NOT EXISTS idx_email_send_log_user_sent
ON email_send_log (user_id, sent_at DESC);

-- Index for job audit trail lookups
CREATE INDEX IF NOT EXISTS idx_email_send_log_job
ON email_send_log (job_id)
WHERE job_id IS NOT NULL;

-- Index for thread lookups
CREATE INDEX IF NOT EXISTS idx_email_send_log_thread
ON email_send_log (thread_id)
WHERE thread_id IS NOT NULL;

-- Enable RLS
ALTER TABLE email_send_log ENABLE ROW LEVEL SECURITY;

-- Users can read their own send logs
DO $$ BEGIN
  CREATE POLICY "Users can read own email send logs"
ON email_send_log FOR SELECT
USING (user_id = auth.uid());
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

-- Service role has full access
DO $$ BEGIN
  CREATE POLICY "Service role full access to email send logs"
ON email_send_log FOR ALL
USING (true)
WITH CHECK (true);
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

-- Grant permissions
GRANT SELECT ON email_send_log TO authenticated;
GRANT ALL ON email_send_log TO service_role;

COMMENT ON TABLE email_send_log IS 'Audit log of emails sent via Gmail API with daily rate limiting';
COMMENT ON COLUMN email_send_log.message_id IS 'Gmail message ID returned from messages.send API';
COMMENT ON COLUMN email_send_log.thread_id IS 'Gmail thread ID for email threading';
COMMENT ON COLUMN email_send_log.job_id IS 'Optional link to sequence_jobs for orchestrator audit trail';
