-- Migration: google_scope_tier
-- Date: 20260307152324
--
-- What this migration does:
--   Adds scope_tier column to google_integrations and google_oauth_states.
--   Tracks whether the user connected with 'free' (sensitive-only, no CASA)
--   or 'paid' (includes restricted scopes via Nylas or direct verification).
--
-- Rollback strategy:
--   ALTER TABLE google_integrations DROP COLUMN IF EXISTS scope_tier;
--   ALTER TABLE google_oauth_states DROP COLUMN IF EXISTS scope_tier;

-- Add scope_tier to google_integrations
ALTER TABLE google_integrations
  ADD COLUMN IF NOT EXISTS scope_tier TEXT DEFAULT 'free';

-- Add scope_tier to google_oauth_states so callback can read which tier was requested
ALTER TABLE google_oauth_states
  ADD COLUMN IF NOT EXISTS scope_tier TEXT DEFAULT 'free';
