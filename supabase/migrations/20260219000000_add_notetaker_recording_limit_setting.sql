-- ============================================================================
-- Add default recording limit setting for 60 Notetaker
-- ============================================================================
-- Purpose: Store the platform-wide default monthly recording limit in app_settings
-- so it can be configured without a code deploy, via the Platform Admin UI.
-- ============================================================================

INSERT INTO app_settings (key, value)
VALUES ('notetaker_default_recording_limit', '20')
ON CONFLICT (key) DO NOTHING;

DO $$
BEGIN
  RAISE NOTICE '✅ notetaker_default_recording_limit setting added to app_settings (default: 20)';
END $$;
