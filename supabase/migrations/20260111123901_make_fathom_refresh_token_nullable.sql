-- Make fathom_integrations.refresh_token nullable
-- OAuth flows don't always return refresh tokens

ALTER TABLE public.fathom_integrations
ALTER COLUMN refresh_token DROP NOT NULL;

-- Add comment explaining why
COMMENT ON COLUMN public.fathom_integrations.refresh_token IS
'OAuth refresh token - may be null if provider does not issue refresh tokens';;
