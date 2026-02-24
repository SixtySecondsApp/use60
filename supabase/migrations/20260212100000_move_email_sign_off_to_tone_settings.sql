-- Move email_sign_off from profiles to user_tone_settings
-- Email sign-off is an email communication preference, not a profile attribute

-- 1. Add column to user_tone_settings
ALTER TABLE user_tone_settings ADD COLUMN IF NOT EXISTS email_sign_off TEXT;

COMMENT ON COLUMN user_tone_settings.email_sign_off IS 'User preferred email sign-off for AI-generated emails (e.g. "Best, Andrew")';

-- 2. Migrate existing data if the column exists on profiles
DO $$
BEGIN
  IF EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_name = 'profiles' AND column_name = 'email_sign_off'
  ) THEN
    INSERT INTO user_tone_settings (user_id, content_type, email_sign_off, tone_style, formality_level, emoji_usage, updated_at)
    SELECT p.id, 'email', p.email_sign_off, 'friendly and professional', 5, 'none', now()
    FROM profiles p
    WHERE p.email_sign_off IS NOT NULL
      AND p.email_sign_off != ''
    ON CONFLICT (user_id, content_type)
    DO UPDATE SET email_sign_off = EXCLUDED.email_sign_off;

    ALTER TABLE profiles DROP COLUMN email_sign_off;
  END IF;
END $$;

-- Notify PostgREST to reload schema
NOTIFY pgrst, 'reload schema';
