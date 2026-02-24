-- Fix RLS policies for waitlist_magic_tokens table
-- The issue was that the USING clause on the service role policy was too restrictive
-- We need separate policies for different operations to ensure service role can always manage tokens

-- Drop the problematic combined policy
DROP POLICY IF EXISTS "Service role can manage tokens" ON public.waitlist_magic_tokens;

-- Create separate policies for service role operations (with IF NOT EXISTS to avoid conflicts)
-- This ensures service role can always INSERT, SELECT, UPDATE, DELETE regardless of data conditions
DO $$ BEGIN
  CREATE POLICY "Service role can insert tokens" ON public.waitlist_magic_tokens
    FOR INSERT
    WITH CHECK (auth.role() = 'service_role');
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

DO $$ BEGIN
  CREATE POLICY "Service role can view all tokens" ON public.waitlist_magic_tokens
    FOR SELECT
    USING (auth.role() = 'service_role');
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

DO $$ BEGIN
  CREATE POLICY "Service role can update tokens" ON public.waitlist_magic_tokens
    FOR UPDATE
    USING (auth.role() = 'service_role')
    WITH CHECK (auth.role() = 'service_role');
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

DO $$ BEGIN
  CREATE POLICY "Service role can delete tokens" ON public.waitlist_magic_tokens
    FOR DELETE
    USING (auth.role() = 'service_role');
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

-- Keep the existing public read policy for token validation (unexpired tokens only)
-- This allows the set-password page to read tokens for validation
