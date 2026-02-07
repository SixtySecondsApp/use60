-- Add email_sign_off column to profiles table
-- Stores per-user email closing preference (e.g. "Best, Andrew" or "Cheers, AB")
-- Used by NL table builder and email generation workflows

ALTER TABLE profiles ADD COLUMN IF NOT EXISTS email_sign_off TEXT;

COMMENT ON COLUMN profiles.email_sign_off IS 'User preferred email sign-off for AI-generated emails (e.g. "Best, Andrew")';

-- Notify PostgREST to reload schema
NOTIFY pgrst, 'reload schema';
