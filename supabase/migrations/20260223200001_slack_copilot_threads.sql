-- Phase 7: Conversational Slack Interface (PRD-22)
-- CONV-001: Slack copilot thread state management

-- Table to track Slack DM conversation threads with the copilot
CREATE TABLE IF NOT EXISTS public.slack_copilot_threads (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  org_id uuid NOT NULL REFERENCES public.organizations(id) ON DELETE CASCADE,
  user_id uuid NOT NULL,
  slack_team_id text NOT NULL,
  slack_channel_id text NOT NULL,
  slack_thread_ts text NOT NULL,
  title text,
  message_count integer DEFAULT 0,
  last_message_at timestamptz DEFAULT now(),
  context jsonb DEFAULT '{}'::jsonb,
  created_at timestamptz DEFAULT now(),
  updated_at timestamptz DEFAULT now(),
  CONSTRAINT unique_slack_thread UNIQUE (slack_channel_id, slack_thread_ts)
);

-- Indexes
CREATE INDEX idx_slack_copilot_threads_user ON public.slack_copilot_threads(user_id);
CREATE INDEX idx_slack_copilot_threads_org ON public.slack_copilot_threads(org_id);
CREATE INDEX idx_slack_copilot_threads_channel ON public.slack_copilot_threads(slack_channel_id, slack_thread_ts);
CREATE INDEX idx_slack_copilot_threads_last_msg ON public.slack_copilot_threads(user_id, last_message_at DESC);

-- Table to store individual messages within copilot threads
CREATE TABLE IF NOT EXISTS public.slack_copilot_messages (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  thread_id uuid NOT NULL REFERENCES public.slack_copilot_threads(id) ON DELETE CASCADE,
  role text NOT NULL CHECK (role IN ('user', 'assistant')),
  content text NOT NULL,
  slack_ts text,
  intent text,
  metadata jsonb DEFAULT '{}'::jsonb,
  created_at timestamptz DEFAULT now()
);

CREATE INDEX idx_slack_copilot_messages_thread ON public.slack_copilot_messages(thread_id, created_at);

-- RLS
ALTER TABLE public.slack_copilot_threads ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.slack_copilot_messages ENABLE ROW LEVEL SECURITY;

-- Threads: users can only see their own
CREATE POLICY "Users can view own slack copilot threads"
  ON public.slack_copilot_threads FOR SELECT
  USING (auth.uid() = user_id);

CREATE POLICY "Users can insert own slack copilot threads"
  ON public.slack_copilot_threads FOR INSERT
  WITH CHECK (auth.uid() = user_id);

CREATE POLICY "Users can update own slack copilot threads"
  ON public.slack_copilot_threads FOR UPDATE
  USING (auth.uid() = user_id);

-- Messages: users can see messages in their threads
CREATE POLICY "Users can view own slack copilot messages"
  ON public.slack_copilot_messages FOR SELECT
  USING (EXISTS (
    SELECT 1 FROM public.slack_copilot_threads t
    WHERE t.id = thread_id AND t.user_id = auth.uid()
  ));

CREATE POLICY "Users can insert into own slack copilot threads"
  ON public.slack_copilot_messages FOR INSERT
  WITH CHECK (EXISTS (
    SELECT 1 FROM public.slack_copilot_threads t
    WHERE t.id = thread_id AND t.user_id = auth.uid()
  ));

-- Service role bypass for edge functions
CREATE POLICY "Service role full access to slack_copilot_threads"
  ON public.slack_copilot_threads FOR ALL
  USING (auth.role() = 'service_role');

CREATE POLICY "Service role full access to slack_copilot_messages"
  ON public.slack_copilot_messages FOR ALL
  USING (auth.role() = 'service_role');

-- Helper RPC to increment message count atomically
CREATE OR REPLACE FUNCTION public.increment_slack_copilot_thread_count(p_thread_id uuid)
RETURNS void
LANGUAGE sql
SECURITY DEFINER
AS $$
  UPDATE public.slack_copilot_threads
  SET message_count = message_count + 1,
      updated_at = now()
  WHERE id = p_thread_id;
$$;

COMMENT ON TABLE public.slack_copilot_threads IS 'Tracks Slack DM conversation threads between reps and the copilot (PRD-22)';
COMMENT ON TABLE public.slack_copilot_messages IS 'Individual messages within copilot Slack threads for multi-turn context';
