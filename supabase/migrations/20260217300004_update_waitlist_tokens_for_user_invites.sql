-- Update waitlist_magic_tokens to support both waitlist entries and direct user invitations
-- Make waitlist_entry_id nullable and add user_id column

-- Drop the NOT NULL constraint on waitlist_entry_id
ALTER TABLE public.waitlist_magic_tokens
  ALTER COLUMN waitlist_entry_id DROP NOT NULL;

-- Add user_id column for direct user invitations (optional - either waitlist_entry_id OR user_id)
ALTER TABLE public.waitlist_magic_tokens
  ADD COLUMN user_id UUID REFERENCES auth.users(id) ON DELETE CASCADE;

-- Add check constraint to ensure at least one of waitlist_entry_id or user_id is set
ALTER TABLE public.waitlist_magic_tokens
  ADD CONSTRAINT token_has_reference CHECK (
    (waitlist_entry_id IS NOT NULL) OR (user_id IS NOT NULL)
  );

-- Add index for user_id lookups
CREATE INDEX idx_waitlist_magic_tokens_user_id ON public.waitlist_magic_tokens(user_id);

COMMENT ON COLUMN public.waitlist_magic_tokens.user_id IS 'User ID for direct invitations (when not from waitlist). Either waitlist_entry_id OR user_id must be set.';
COMMENT ON TABLE public.waitlist_magic_tokens IS 'Stores custom magic tokens for signup flow. Supports both waitlist entries and direct user invitations. Tokens expire after 24 hours and can only be used once.';
