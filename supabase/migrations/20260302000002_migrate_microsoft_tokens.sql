-- Migrate existing Microsoft OAuth tokens from user_settings to microsoft_integrations
INSERT INTO public.microsoft_integrations (user_id, access_token, refresh_token, expires_at, email, is_active, token_status)
SELECT
  us.user_id,
  us.preferences->'microsoft_oauth'->>'access_token',
  us.preferences->'microsoft_oauth'->>'refresh_token',
  (us.preferences->'microsoft_oauth'->>'expires_at')::timestamptz,
  us.preferences->'microsoft_oauth'->>'email',
  true,
  'valid'
FROM public.user_settings us
WHERE us.preferences->'microsoft_oauth' IS NOT NULL
  AND us.preferences->'microsoft_oauth'->>'access_token' IS NOT NULL
ON CONFLICT (user_id) DO NOTHING;
