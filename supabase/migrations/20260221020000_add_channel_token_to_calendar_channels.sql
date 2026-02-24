-- Add channel_token column to google_calendar_channels
-- This stores the token we pass to Google when registering a push notification channel.
-- Google echoes it back in the X-Goog-Channel-Token header on every notification,
-- allowing us to authenticate incoming webhook requests.

ALTER TABLE public.google_calendar_channels
  ADD COLUMN IF NOT EXISTS channel_token text;

COMMENT ON COLUMN public.google_calendar_channels.channel_token IS
  'Random UUID token passed to Google Calendar watch API. Google echoes it as X-Goog-Channel-Token on every push notification for authentication.';
