-- =============================================================================
-- Landing Builder Sessions
--
-- Stores multi-phase landing page builder conversations.
-- Each session tracks brief, strategy, copy, visuals, and generated code
-- across a phased workflow.
-- =============================================================================

-- ---------------------------------------------------------------------------
-- 1. Table
-- ---------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.landing_builder_sessions (
  id               uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  conversation_id  text NOT NULL UNIQUE,
  user_id          uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  org_id           text NOT NULL,
  brief            jsonb DEFAULT '{}'::jsonb,
  strategy         jsonb DEFAULT '{}'::jsonb,
  copy             jsonb DEFAULT '{}'::jsonb,
  visuals          jsonb DEFAULT '{}'::jsonb,
  code             text,
  current_phase    integer DEFAULT 0,
  phase_status     jsonb DEFAULT '{"0":"pending","1":"pending","2":"pending","3":"pending"}'::jsonb,
  created_at       timestamptz NOT NULL DEFAULT now(),
  updated_at       timestamptz NOT NULL DEFAULT now()
);

-- ---------------------------------------------------------------------------
-- 2. Indexes
-- ---------------------------------------------------------------------------
CREATE INDEX IF NOT EXISTS idx_landing_builder_sessions_user_org
  ON public.landing_builder_sessions (user_id, org_id);

-- ---------------------------------------------------------------------------
-- 3. RLS
-- ---------------------------------------------------------------------------
ALTER TABLE public.landing_builder_sessions ENABLE ROW LEVEL SECURITY;

CREATE POLICY "users_select_own_landing_builder_sessions"
  ON public.landing_builder_sessions
  FOR SELECT
  TO authenticated
  USING (auth.uid() = user_id);

CREATE POLICY "users_insert_own_landing_builder_sessions"
  ON public.landing_builder_sessions
  FOR INSERT
  TO authenticated
  WITH CHECK (auth.uid() = user_id);

CREATE POLICY "users_update_own_landing_builder_sessions"
  ON public.landing_builder_sessions
  FOR UPDATE
  TO authenticated
  USING (auth.uid() = user_id)
  WITH CHECK (auth.uid() = user_id);

CREATE POLICY "users_delete_own_landing_builder_sessions"
  ON public.landing_builder_sessions
  FOR DELETE
  TO authenticated
  USING (auth.uid() = user_id);

-- ---------------------------------------------------------------------------
-- 4. updated_at trigger (reuses baseline function)
-- ---------------------------------------------------------------------------
CREATE TRIGGER set_landing_builder_sessions_updated_at
  BEFORE UPDATE ON public.landing_builder_sessions
  FOR EACH ROW
  EXECUTE FUNCTION public.update_updated_at_column();
