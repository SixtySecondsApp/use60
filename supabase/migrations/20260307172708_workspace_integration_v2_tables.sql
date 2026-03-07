-- Migration: workspace_integration_v2_tables
-- Date: 20260307172708
--
-- What this migration does:
--   Creates all tables needed for Workspace Integration V2:
--   microsoft_integrations, microsoft_oauth_states, background_job_logs,
--   calendar_watches, email_messages, reply_gaps, contact_communication_health,
--   deal_documents + proposals columns + token refresh lock function
--
-- Rollback strategy:
--   DROP TABLE IF EXISTS microsoft_integrations, microsoft_oauth_states,
--     background_job_logs, calendar_watches, email_messages, reply_gaps,
--     contact_communication_health, deal_documents CASCADE;
--   DROP FUNCTION IF EXISTS try_lock_integration_refresh;
--   ALTER TABLE proposals DROP COLUMN IF EXISTS storage_provider;
--   ALTER TABLE proposals DROP COLUMN IF EXISTS drive_file_id;

-- ============================================================================
-- 1. Microsoft Integration Tables (WS-007)
-- ============================================================================

CREATE TABLE IF NOT EXISTS microsoft_integrations (
  id            uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id       uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  email         text NOT NULL,
  access_token  text NOT NULL,
  refresh_token text,
  expires_at    timestamptz,
  scopes        text NOT NULL DEFAULT '',
  is_active     boolean DEFAULT true,
  token_status  text DEFAULT 'valid' CHECK (token_status IN ('valid', 'expired', 'revoked', 'needs_reconnect')),
  created_at    timestamptz DEFAULT now(),
  updated_at    timestamptz DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_microsoft_integrations_user
  ON microsoft_integrations(user_id) WHERE is_active = true;

ALTER TABLE microsoft_integrations ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "Users can read own Microsoft integrations" ON microsoft_integrations;
CREATE POLICY "Users can read own Microsoft integrations"
  ON microsoft_integrations FOR SELECT USING (auth.uid() = user_id);
DROP POLICY IF EXISTS "Users can update own Microsoft integrations" ON microsoft_integrations;
CREATE POLICY "Users can update own Microsoft integrations"
  ON microsoft_integrations FOR UPDATE USING (auth.uid() = user_id);
DROP POLICY IF EXISTS "Users can insert own Microsoft integrations" ON microsoft_integrations;
CREATE POLICY "Users can insert own Microsoft integrations"
  ON microsoft_integrations FOR INSERT WITH CHECK (auth.uid() = user_id);
DROP POLICY IF EXISTS "Users can delete own Microsoft integrations" ON microsoft_integrations;
CREATE POLICY "Users can delete own Microsoft integrations"
  ON microsoft_integrations FOR DELETE USING (auth.uid() = user_id);

CREATE TABLE IF NOT EXISTS microsoft_oauth_states (
  id            uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id       uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  state         text NOT NULL UNIQUE,
  code_verifier text,
  redirect_uri  text,
  created_at    timestamptz DEFAULT now(),
  expires_at    timestamptz DEFAULT now() + interval '10 minutes'
);

-- ============================================================================
-- 2. Token Refresh Lock Function (WS-002)
-- ============================================================================

CREATE OR REPLACE FUNCTION try_lock_integration_refresh(
  p_table text,
  p_id uuid
) RETURNS boolean
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
  locked boolean := false;
BEGIN
  locked := pg_try_advisory_xact_lock(hashtext(p_table || '::' || p_id::text));
  RETURN locked;
END;
$$;

-- ============================================================================
-- 3. Background Job Logs (WS-013)
-- ============================================================================

CREATE TABLE IF NOT EXISTS background_job_logs (
  id            uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  job_type      text NOT NULL,
  user_id       uuid REFERENCES auth.users(id) ON DELETE SET NULL,
  status        text NOT NULL DEFAULT 'running' CHECK (status IN ('running', 'success', 'error', 'skipped')),
  started_at    timestamptz DEFAULT now(),
  completed_at  timestamptz,
  error         text,
  metadata      jsonb DEFAULT '{}'::jsonb,
  created_at    timestamptz DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_background_job_logs_type_user
  ON background_job_logs(job_type, user_id, started_at DESC);

ALTER TABLE background_job_logs ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "Service role can manage job logs" ON background_job_logs;
CREATE POLICY "Service role can manage job logs"
  ON background_job_logs FOR ALL USING (true);

-- ============================================================================
-- 4. Calendar Watches (WS-016)
-- ============================================================================

CREATE TABLE IF NOT EXISTS calendar_watches (
  id            uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id       uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  provider      text NOT NULL CHECK (provider IN ('google', 'microsoft')),
  resource_id   text,
  channel_id    text,
  expiration    timestamptz NOT NULL,
  created_at    timestamptz DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_calendar_watches_expiration
  ON calendar_watches(expiration) WHERE expiration > now();

ALTER TABLE calendar_watches ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "Users can read own calendar watches" ON calendar_watches;
CREATE POLICY "Users can read own calendar watches"
  ON calendar_watches FOR SELECT USING (auth.uid() = user_id);

-- ============================================================================
-- 5. Email Messages (WS-017)
-- ============================================================================

CREATE TABLE IF NOT EXISTS email_messages (
  id              uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id         uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  provider        text NOT NULL CHECK (provider IN ('google', 'microsoft')),
  message_id      text NOT NULL,
  thread_id       text,
  from_email      text,
  to_emails       text[] DEFAULT '{}',
  cc_emails       text[] DEFAULT '{}',
  subject         text,
  snippet         text,
  labels          text[] DEFAULT '{}',
  is_read         boolean DEFAULT false,
  is_starred      boolean DEFAULT false,
  has_attachments boolean DEFAULT false,
  received_at     timestamptz,
  classification  jsonb,
  raw_metadata    jsonb DEFAULT '{}'::jsonb,
  sync_cursor     text,
  created_at      timestamptz DEFAULT now(),
  UNIQUE(user_id, provider, message_id)
);

CREATE INDEX IF NOT EXISTS idx_email_messages_user_provider
  ON email_messages(user_id, provider, received_at DESC);
CREATE INDEX IF NOT EXISTS idx_email_messages_classification
  ON email_messages(user_id) WHERE classification IS NULL;
CREATE INDEX IF NOT EXISTS idx_email_messages_from
  ON email_messages(from_email, user_id);

ALTER TABLE email_messages ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "Users can read own email messages" ON email_messages;
CREATE POLICY "Users can read own email messages"
  ON email_messages FOR SELECT USING (auth.uid() = user_id);

-- ============================================================================
-- 6. Reply Gaps (WS-019)
-- ============================================================================

CREATE TABLE IF NOT EXISTS reply_gaps (
  id              uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id         uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  provider        text NOT NULL CHECK (provider IN ('google', 'microsoft')),
  thread_id       text NOT NULL,
  contact_email   text NOT NULL,
  sent_at         timestamptz NOT NULL,
  gap_hours       integer NOT NULL,
  urgency         text DEFAULT 'low' CHECK (urgency IN ('low', 'medium', 'high')),
  deal_id         uuid REFERENCES deals(id) ON DELETE SET NULL,
  resolved        boolean DEFAULT false,
  created_at      timestamptz DEFAULT now(),
  UNIQUE(user_id, thread_id)
);

CREATE INDEX IF NOT EXISTS idx_reply_gaps_user_unresolved
  ON reply_gaps(user_id) WHERE resolved = false;

ALTER TABLE reply_gaps ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "Users can read own reply gaps" ON reply_gaps;
CREATE POLICY "Users can read own reply gaps"
  ON reply_gaps FOR SELECT USING (auth.uid() = user_id);

-- ============================================================================
-- 7. Contact Communication Health (WS-020)
-- ============================================================================

CREATE TABLE IF NOT EXISTS contact_communication_health (
  id                      uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id                 uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  contact_email           text NOT NULL,
  provider                text NOT NULL CHECK (provider IN ('google', 'microsoft')),
  sent_count              integer DEFAULT 0,
  received_count          integer DEFAULT 0,
  ratio                   numeric(5,2) DEFAULT 0,
  last_sent_at            timestamptz,
  last_received_at        timestamptz,
  avg_response_time_hours numeric(8,2),
  streak_type             text CHECK (streak_type IN ('sending', 'receiving', 'balanced')),
  updated_at              timestamptz DEFAULT now(),
  UNIQUE(user_id, contact_email, provider)
);

ALTER TABLE contact_communication_health ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "Users can read own communication health" ON contact_communication_health;
CREATE POLICY "Users can read own communication health"
  ON contact_communication_health FOR SELECT USING (auth.uid() = user_id);

-- ============================================================================
-- 8. Deal Documents (WS-024)
-- ============================================================================

CREATE TABLE IF NOT EXISTS deal_documents (
  id          uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  deal_id     uuid NOT NULL REFERENCES deals(id) ON DELETE CASCADE,
  user_id     uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  provider    text NOT NULL CHECK (provider IN ('google', 'microsoft', 's3')),
  file_id     text,
  file_name   text NOT NULL,
  file_url    text NOT NULL,
  file_type   text,
  linked_by   text DEFAULT 'manual' CHECK (linked_by IN ('auto', 'manual')),
  linked_at   timestamptz DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_deal_documents_deal
  ON deal_documents(deal_id);

ALTER TABLE deal_documents ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "Users can read own deal documents" ON deal_documents;
CREATE POLICY "Users can read own deal documents"
  ON deal_documents FOR SELECT USING (auth.uid() = user_id);
DROP POLICY IF EXISTS "Users can insert own deal documents" ON deal_documents;
CREATE POLICY "Users can insert own deal documents"
  ON deal_documents FOR INSERT WITH CHECK (auth.uid() = user_id);

-- ============================================================================
-- 9. Proposals table updates (WS-028)
-- ============================================================================

DO $$ BEGIN
  ALTER TABLE proposals ADD COLUMN IF NOT EXISTS storage_provider text DEFAULT 's3'
    CHECK (storage_provider IN ('drive', 'onedrive', 's3'));
EXCEPTION WHEN duplicate_column THEN NULL;
END $$;

DO $$ BEGIN
  ALTER TABLE proposals ADD COLUMN IF NOT EXISTS drive_file_id text;
EXCEPTION WHEN duplicate_column THEN NULL;
END $$;
