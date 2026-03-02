-- Microsoft 365 Integration Tables
-- Mirrors the Google integration pattern for Microsoft OAuth + services

-- =============================================================================
-- 1. microsoft_integrations - Core integration table
-- =============================================================================
CREATE TABLE IF NOT EXISTS public.microsoft_integrations (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  email TEXT,
  access_token TEXT,
  refresh_token TEXT,
  expires_at TIMESTAMPTZ,
  scopes TEXT,
  is_active BOOLEAN DEFAULT true,
  token_status TEXT DEFAULT 'valid' CHECK (token_status IN ('valid', 'expired', 'revoked', 'error')),
  last_token_refresh TIMESTAMPTZ,
  service_preferences JSONB DEFAULT '{"outlook": true, "calendar": true}'::jsonb,
  mail_subscription_id TEXT,
  mail_subscription_expiry TIMESTAMPTZ,
  calendar_subscription_id TEXT,
  calendar_subscription_expiry TIMESTAMPTZ,
  created_at TIMESTAMPTZ DEFAULT now(),
  updated_at TIMESTAMPTZ DEFAULT now(),
  CONSTRAINT microsoft_integrations_user_id_key UNIQUE (user_id)
);

-- =============================================================================
-- 2. microsoft_oauth_states - PKCE OAuth state tracking
-- =============================================================================
CREATE TABLE IF NOT EXISTS public.microsoft_oauth_states (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  state TEXT NOT NULL UNIQUE,
  code_verifier TEXT NOT NULL,
  code_challenge TEXT NOT NULL,
  redirect_uri TEXT,
  expires_at TIMESTAMPTZ NOT NULL,
  created_at TIMESTAMPTZ DEFAULT now()
);

-- =============================================================================
-- 3. microsoft_service_logs - Service action logs
-- =============================================================================
CREATE TABLE IF NOT EXISTS public.microsoft_service_logs (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  integration_id UUID REFERENCES public.microsoft_integrations(id) ON DELETE CASCADE,
  service TEXT NOT NULL,
  action TEXT NOT NULL,
  status TEXT NOT NULL,
  request_data JSONB,
  response_data JSONB,
  created_at TIMESTAMPTZ DEFAULT now()
);

-- =============================================================================
-- RLS Policies
-- =============================================================================

-- microsoft_integrations
ALTER TABLE public.microsoft_integrations ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users can view their own Microsoft integration"
  ON public.microsoft_integrations FOR SELECT
  USING (auth.uid() = user_id);

CREATE POLICY "Users can update their own Microsoft integration"
  ON public.microsoft_integrations FOR UPDATE
  USING (auth.uid() = user_id);

CREATE POLICY "Users can insert their own Microsoft integration"
  ON public.microsoft_integrations FOR INSERT
  WITH CHECK (auth.uid() = user_id);

CREATE POLICY "Users can delete their own Microsoft integration"
  ON public.microsoft_integrations FOR DELETE
  USING (auth.uid() = user_id);

CREATE POLICY "Service role has full access to Microsoft integrations"
  ON public.microsoft_integrations FOR ALL
  TO service_role
  USING (true)
  WITH CHECK (true);

-- microsoft_oauth_states
ALTER TABLE public.microsoft_oauth_states ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users can view their own OAuth states"
  ON public.microsoft_oauth_states FOR SELECT
  USING (auth.uid() = user_id);

CREATE POLICY "Users can insert their own OAuth states"
  ON public.microsoft_oauth_states FOR INSERT
  WITH CHECK (auth.uid() = user_id);

CREATE POLICY "Users can delete their own OAuth states"
  ON public.microsoft_oauth_states FOR DELETE
  USING (auth.uid() = user_id);

CREATE POLICY "Service role has full access to Microsoft OAuth states"
  ON public.microsoft_oauth_states FOR ALL
  TO service_role
  USING (true)
  WITH CHECK (true);

-- microsoft_service_logs
ALTER TABLE public.microsoft_service_logs ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users can view their own Microsoft service logs"
  ON public.microsoft_service_logs FOR SELECT
  USING (
    EXISTS (
      SELECT 1 FROM public.microsoft_integrations mi
      WHERE mi.id = integration_id AND mi.user_id = auth.uid()
    )
  );

CREATE POLICY "Service role has full access to Microsoft service logs"
  ON public.microsoft_service_logs FOR ALL
  TO service_role
  USING (true)
  WITH CHECK (true);

-- =============================================================================
-- Indexes
-- =============================================================================
CREATE INDEX idx_microsoft_integrations_user_id ON public.microsoft_integrations(user_id);
CREATE INDEX idx_microsoft_oauth_states_state ON public.microsoft_oauth_states(state);
CREATE INDEX idx_microsoft_oauth_states_expires_at ON public.microsoft_oauth_states(expires_at);
CREATE INDEX idx_microsoft_service_logs_integration_id ON public.microsoft_service_logs(integration_id);

-- =============================================================================
-- Updated_at trigger
-- =============================================================================
CREATE OR REPLACE FUNCTION update_microsoft_integrations_updated_at()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = now();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER trigger_microsoft_integrations_updated_at
  BEFORE UPDATE ON public.microsoft_integrations
  FOR EACH ROW
  EXECUTE FUNCTION update_microsoft_integrations_updated_at();

-- =============================================================================
-- Cleanup RPC for expired OAuth states
-- =============================================================================
CREATE OR REPLACE FUNCTION public.cleanup_expired_microsoft_oauth_states()
RETURNS void AS $$
BEGIN
  DELETE FROM public.microsoft_oauth_states WHERE expires_at < now();
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;
