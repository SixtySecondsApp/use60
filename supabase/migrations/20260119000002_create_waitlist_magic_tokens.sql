-- Create waitlist_magic_tokens table for custom token-based signup flow
-- Tokens are generated when admin grants access and expire after 24 hours
-- This allows users to sign up without Supabase creating accounts immediately

CREATE TABLE public.waitlist_magic_tokens (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  token TEXT NOT NULL UNIQUE,
  waitlist_entry_id UUID NOT NULL REFERENCES public.meetings_waitlist(id) ON DELETE CASCADE,
  email TEXT NOT NULL,
  expires_at TIMESTAMP WITH TIME ZONE NOT NULL,
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
  used_at TIMESTAMP WITH TIME ZONE,
  CONSTRAINT token_not_empty CHECK (token != '')
);

-- Index for faster lookups
CREATE INDEX idx_waitlist_magic_tokens_token ON public.waitlist_magic_tokens(token);
CREATE INDEX idx_waitlist_magic_tokens_email ON public.waitlist_magic_tokens(email);
CREATE INDEX idx_waitlist_magic_tokens_expires ON public.waitlist_magic_tokens(expires_at);
CREATE INDEX idx_waitlist_magic_tokens_used ON public.waitlist_magic_tokens(used_at);

-- RLS Policy: Allow anyone to read their own token (by email in token validation)
-- Allow service role to insert/update tokens
ALTER TABLE public.waitlist_magic_tokens ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Service role can manage tokens" ON public.waitlist_magic_tokens
  AS PERMISSIVE FOR ALL
  USING (auth.role() = 'service_role')
  WITH CHECK (auth.role() = 'service_role');

-- Allow public to read unexpired tokens for validation
CREATE POLICY "Anyone can read unexpired tokens" ON public.waitlist_magic_tokens
  AS PERMISSIVE FOR SELECT
  USING (expires_at > now() AND used_at IS NULL);

COMMENT ON TABLE public.waitlist_magic_tokens IS 'Stores custom magic tokens for waitlist signup flow. Tokens expire after 24 hours and can only be used once.';
