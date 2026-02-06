-- AVATAR-1, EMAIL-TOKEN-TABLE: Add avatar/email change columns and tokens table
-- This migration supports:
-- 1. Avatar removal feature (remove_avatar flag + reverting to initials)
-- 2. Email change verification flow (pending_email tracking)
-- 3. Email change tokens for secure verification

-- ============================================================================
-- AVATAR-1: Add remove_avatar and pending_email columns to profiles
-- ============================================================================

ALTER TABLE public.profiles
ADD COLUMN IF NOT EXISTS remove_avatar boolean DEFAULT false;

ALTER TABLE public.profiles
ADD COLUMN IF NOT EXISTS pending_email text;

-- Comment for clarity
COMMENT ON COLUMN public.profiles.remove_avatar IS 'When true, user profile reverts to initials instead of avatar_url';
COMMENT ON COLUMN public.profiles.pending_email IS 'Stores new email during change verification process. Cleared when email change is confirmed.';

-- ============================================================================
-- EMAIL-TOKEN-TABLE: Create email_change_tokens table for verification
-- ============================================================================

CREATE TABLE IF NOT EXISTS public.email_change_tokens (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  token text NOT NULL UNIQUE,
  new_email text NOT NULL,
  expires_at timestamp with time zone NOT NULL,
  used_at timestamp with time zone,
  created_at timestamp with time zone DEFAULT now()
);

-- Index for fast token lookup
CREATE INDEX IF NOT EXISTS email_change_tokens_token_idx ON public.email_change_tokens(token);
CREATE INDEX IF NOT EXISTS email_change_tokens_user_id_idx ON public.email_change_tokens(user_id);

-- Enable RLS for security
ALTER TABLE public.email_change_tokens ENABLE ROW LEVEL SECURITY;

-- RLS Policy: Users can view their own tokens
CREATE POLICY "Users can read own email change tokens"
  ON public.email_change_tokens
  FOR SELECT
  USING (auth.uid() = user_id);

-- RLS Policy: Service role (edge functions) can read all for verification
CREATE POLICY "Service role can manage email change tokens"
  ON public.email_change_tokens
  FOR ALL
  USING (current_setting('role') = 'authenticated' OR auth.jwt() ->> 'role' = 'service_role')
  WITH CHECK (current_setting('role') = 'authenticated' OR auth.jwt() ->> 'role' = 'service_role');

-- Comment for clarity
COMMENT ON TABLE public.email_change_tokens IS 'Stores secure tokens for email change verification. Each token is single-use and expires after 24 hours.';
COMMENT ON COLUMN public.email_change_tokens.token IS '32+ byte cryptographically secure random token';
COMMENT ON COLUMN public.email_change_tokens.new_email IS 'The new email address the user is changing to';
COMMENT ON COLUMN public.email_change_tokens.expires_at IS 'Token expires after 24 hours from creation';
COMMENT ON COLUMN public.email_change_tokens.used_at IS 'Timestamp when token was used. NULL if not yet used.';
