-- Migration: brain_slack_delivery_log
-- Date: 20260313142711
--
-- What this migration does:
--   Creates slack_delivery_log table to audit all Slack DM delivery attempts
--   (success or failure), including blocked reasons like quiet_hours, rate_limited, etc.
--
-- Rollback strategy:
--   DROP TABLE IF EXISTS slack_delivery_log;

CREATE TABLE IF NOT EXISTS public.slack_delivery_log (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID,
  org_id UUID,
  message_type TEXT,
  channel_id TEXT,
  success BOOLEAN DEFAULT false,
  error_message TEXT,
  blocked_reason TEXT,  -- 'quiet_hours', 'rate_limited', 'token_expired', 'channel_not_found'
  created_at TIMESTAMPTZ DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_slack_delivery_log_user
  ON public.slack_delivery_log (user_id, created_at DESC);

CREATE INDEX IF NOT EXISTS idx_slack_delivery_log_org
  ON public.slack_delivery_log (org_id, created_at DESC);

-- RLS
ALTER TABLE public.slack_delivery_log ENABLE ROW LEVEL SECURITY;

-- Service role full access (edge functions write via service role)
DROP POLICY IF EXISTS "Service role full access to slack_delivery_log" ON public.slack_delivery_log;
CREATE POLICY "Service role full access to slack_delivery_log"
  ON public.slack_delivery_log
  FOR ALL
  USING (auth.role() = 'service_role');

-- Users can read their own delivery logs
DROP POLICY IF EXISTS "Users can read own slack delivery logs" ON public.slack_delivery_log;
CREATE POLICY "Users can read own slack delivery logs"
  ON public.slack_delivery_log
  FOR SELECT
  USING (user_id = auth.uid());

NOTIFY pgrst, 'reload schema';
