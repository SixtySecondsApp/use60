-- Migration: linkedin_add_token_columns
-- Date: 20260310110609
--
-- What this migration does:
--   Adds access_token_encrypted, refresh_token_encrypted, token_expires_at
--   columns to linkedin_org_integrations. These are expected by
--   linkedin-oauth-callback, linkedin-analytics-sync, linkedin-campaign-sync,
--   and oauth-token-refresh/linkedin but were missing from the original schema.
--
-- Rollback strategy:
--   ALTER TABLE public.linkedin_org_integrations
--     DROP COLUMN IF EXISTS access_token_encrypted,
--     DROP COLUMN IF EXISTS refresh_token_encrypted,
--     DROP COLUMN IF EXISTS token_expires_at;

ALTER TABLE public.linkedin_org_integrations
  ADD COLUMN IF NOT EXISTS access_token_encrypted text,
  ADD COLUMN IF NOT EXISTS refresh_token_encrypted text,
  ADD COLUMN IF NOT EXISTS token_expires_at timestamptz;
