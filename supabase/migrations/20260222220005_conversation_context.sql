-- ============================================================================
-- V2 Architecture Foundations (MEM-001)
-- conversation_context: per-entity conversation context snapshots
--
-- Stores summarised conversation context keyed by user + entity + channel,
-- enabling the copilot to recall relevant prior discussion when a user
-- opens a CRM record, Slack thread, or fleet agent session.
-- ============================================================================

-- ---------------------------------------------------------------------------
-- 1. Table
-- ---------------------------------------------------------------------------

CREATE TABLE IF NOT EXISTS public.conversation_context (
  id             UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id        UUID        NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  org_id         UUID        NOT NULL REFERENCES public.organizations(id) ON DELETE CASCADE,
  channel        TEXT        NOT NULL CHECK (channel IN ('web_copilot', 'slack_copilot', 'fleet_agent')),
  channel_ref    TEXT,       -- e.g. Slack thread_id, fleet trace_id (nullable)
  entity_type    TEXT        NOT NULL CHECK (entity_type IN ('deal', 'contact', 'company', 'meeting', 'task')),
  entity_id      UUID        NOT NULL,
  context_summary TEXT       NOT NULL,
  last_updated   TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- ---------------------------------------------------------------------------
-- 2. Indexes
-- ---------------------------------------------------------------------------

-- Primary lookup: user's context for a specific entity, ordered by recency
CREATE INDEX IF NOT EXISTS conversation_context_entity_idx
  ON public.conversation_context (user_id, entity_type, entity_id, last_updated DESC);

-- Secondary lookup: user's context within a channel, ordered by recency
CREATE INDEX IF NOT EXISTS conversation_context_channel_idx
  ON public.conversation_context (user_id, channel, last_updated DESC);

-- ---------------------------------------------------------------------------
-- 3. Row-Level Security
-- ---------------------------------------------------------------------------

ALTER TABLE public.conversation_context ENABLE ROW LEVEL SECURITY;

-- Users can read their own rows
DROP POLICY IF EXISTS "conversation_context_select_own" ON public.conversation_context;
CREATE POLICY "conversation_context_select_own"
  ON public.conversation_context
  FOR SELECT
  USING (user_id = auth.uid());

-- Users can insert their own rows
DROP POLICY IF EXISTS "conversation_context_insert_own" ON public.conversation_context;
CREATE POLICY "conversation_context_insert_own"
  ON public.conversation_context
  FOR INSERT
  WITH CHECK (user_id = auth.uid());

-- Users can update their own rows
DROP POLICY IF EXISTS "conversation_context_update_own" ON public.conversation_context;
CREATE POLICY "conversation_context_update_own"
  ON public.conversation_context
  FOR UPDATE
  USING (user_id = auth.uid())
  WITH CHECK (user_id = auth.uid());

-- Users can delete their own rows
DROP POLICY IF EXISTS "conversation_context_delete_own" ON public.conversation_context;
CREATE POLICY "conversation_context_delete_own"
  ON public.conversation_context
  FOR DELETE
  USING (user_id = auth.uid());

-- Service role bypass (full access, no RLS restriction)
DROP POLICY IF EXISTS "conversation_context_service_role_all" ON public.conversation_context;
CREATE POLICY "conversation_context_service_role_all"
  ON public.conversation_context
  FOR ALL
  TO service_role
  USING (true)
  WITH CHECK (true);

-- ---------------------------------------------------------------------------
-- 4. Comments
-- ---------------------------------------------------------------------------

COMMENT ON TABLE public.conversation_context IS
  'Per-entity conversation context snapshots for the copilot. Stores a summarised '
  'record of prior discussion keyed by user, channel, and CRM entity so the '
  'copilot can recall relevant context when revisiting a deal, contact, or meeting.';

COMMENT ON COLUMN public.conversation_context.id IS 'Surrogate primary key.';
COMMENT ON COLUMN public.conversation_context.user_id IS 'Owning user; rows are strictly user-private (RLS enforced).';
COMMENT ON COLUMN public.conversation_context.org_id IS 'Organisation the user belongs to at write time.';
COMMENT ON COLUMN public.conversation_context.channel IS 'Originating copilot channel: web_copilot, slack_copilot, or fleet_agent.';
COMMENT ON COLUMN public.conversation_context.channel_ref IS 'Optional channel-specific reference (e.g. Slack thread_id, fleet trace_id).';
COMMENT ON COLUMN public.conversation_context.entity_type IS 'CRM entity type the context relates to.';
COMMENT ON COLUMN public.conversation_context.entity_id IS 'UUID of the CRM entity (deal, contact, etc.).';
COMMENT ON COLUMN public.conversation_context.context_summary IS 'LLM-generated summary of the conversation as it relates to this entity.';
COMMENT ON COLUMN public.conversation_context.last_updated IS 'Timestamp of the most recent context update; used for recency-ordered retrieval.';
