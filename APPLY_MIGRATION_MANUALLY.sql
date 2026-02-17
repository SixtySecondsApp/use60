-- ============================================================================
-- MANUAL MIGRATION APPLICATION FOR STAGING
-- ============================================================================
-- Run this in Supabase Dashboard > SQL Editor
-- Project: caerqjzvuerejfrdtygb (Staging)
-- URL: https://supabase.com/dashboard/project/caerqjzvuerejfrdtygb/sql
-- ============================================================================

-- ============================================================================
-- MIGRATION 1: Update waitlist_magic_tokens for User Invitations
-- Version: 20260217230000
-- ============================================================================
-- Update waitlist_magic_tokens to support both waitlist entries and direct user invitations
-- Make waitlist_entry_id nullable and add user_id column

-- Drop the NOT NULL constraint on waitlist_entry_id
ALTER TABLE public.waitlist_magic_tokens
  ALTER COLUMN waitlist_entry_id DROP NOT NULL;

-- Add user_id column for direct user invitations (optional - either waitlist_entry_id OR user_id)
ALTER TABLE public.waitlist_magic_tokens
  ADD COLUMN IF NOT EXISTS user_id UUID REFERENCES auth.users(id) ON DELETE CASCADE;

-- Add check constraint to ensure at least one of waitlist_entry_id or user_id is set
ALTER TABLE public.waitlist_magic_tokens
  DROP CONSTRAINT IF EXISTS token_has_reference;

ALTER TABLE public.waitlist_magic_tokens
  ADD CONSTRAINT token_has_reference CHECK (
    (waitlist_entry_id IS NOT NULL) OR (user_id IS NOT NULL)
  );

-- Add index for user_id lookups
DROP INDEX IF EXISTS idx_waitlist_magic_tokens_user_id;
CREATE INDEX idx_waitlist_magic_tokens_user_id ON public.waitlist_magic_tokens(user_id);

COMMENT ON COLUMN public.waitlist_magic_tokens.user_id IS 'User ID for direct invitations (when not from waitlist). Either waitlist_entry_id OR user_id must be set.';
COMMENT ON TABLE public.waitlist_magic_tokens IS 'Stores custom magic tokens for signup flow. Supports both waitlist entries and direct user invitations. Tokens expire after 24 hours and can only be used once.';

-- Record this migration as applied (prevents re-running)
INSERT INTO supabase_migrations.schema_migrations (version, statements, name)
VALUES (
  '20260217230000',
  ARRAY[
    'ALTER TABLE public.waitlist_magic_tokens ALTER COLUMN waitlist_entry_id DROP NOT NULL',
    'ALTER TABLE public.waitlist_magic_tokens ADD COLUMN user_id UUID REFERENCES auth.users(id) ON DELETE CASCADE',
    'ALTER TABLE public.waitlist_magic_tokens ADD CONSTRAINT token_has_reference CHECK ((waitlist_entry_id IS NOT NULL) OR (user_id IS NOT NULL))',
    'CREATE INDEX idx_waitlist_magic_tokens_user_id ON public.waitlist_magic_tokens(user_id)'
  ],
  'update_waitlist_tokens_for_user_invites'
)
ON CONFLICT (version) DO NOTHING;

-- Verify the changes
SELECT
  column_name,
  data_type,
  is_nullable,
  column_default
FROM information_schema.columns
WHERE table_schema = 'public'
  AND table_name = 'waitlist_magic_tokens'
ORDER BY ordinal_position;
