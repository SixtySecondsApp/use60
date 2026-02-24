-- Add Gmail watch tracking columns to google_integrations
-- WIRE-004: Gmail API watch setup and OAuth scope management

-- Add Gmail watch state columns
ALTER TABLE google_integrations
  ADD COLUMN IF NOT EXISTS gmail_watch_expiration TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS gmail_watch_history_id TEXT,
  ADD COLUMN IF NOT EXISTS gmail_watch_resource_id TEXT,
  ADD COLUMN IF NOT EXISTS gmail_watch_error TEXT;

-- Note: scopes column already exists as TEXT (not TEXT[])

-- Index for finding watches that need renewal
CREATE INDEX IF NOT EXISTS idx_google_integrations_watch_expiry
  ON google_integrations (gmail_watch_expiration)
  WHERE gmail_watch_expiration IS NOT NULL;

-- Comment
COMMENT ON COLUMN google_integrations.gmail_watch_expiration IS 'When the Gmail push notification watch expires (renew before this time)';
COMMENT ON COLUMN google_integrations.gmail_watch_history_id IS 'Gmail history ID from last watch notification';
COMMENT ON COLUMN google_integrations.gmail_watch_resource_id IS 'Gmail watch resource ID for tracking active watch';
COMMENT ON COLUMN google_integrations.gmail_watch_error IS 'Last error encountered during watch setup/renewal';

-- RPC to get users needing watch renewal (expiring within 24 hours)
CREATE OR REPLACE FUNCTION get_gmail_watches_needing_renewal()
RETURNS TABLE (
  user_id UUID,
  email TEXT,
  gmail_watch_expiration TIMESTAMPTZ,
  hours_until_expiry NUMERIC
)
LANGUAGE sql
SECURITY DEFINER
AS $$
  SELECT
    user_id,
    email,
    gmail_watch_expiration,
    EXTRACT(EPOCH FROM (gmail_watch_expiration - NOW())) / 3600 as hours_until_expiry
  FROM google_integrations
  WHERE gmail_watch_expiration IS NOT NULL
    AND gmail_watch_expiration < NOW() + INTERVAL '24 hours'
    AND gmail_watch_expiration > NOW()  -- Not already expired
    AND is_active = true
  ORDER BY gmail_watch_expiration ASC;
$$;

GRANT EXECUTE ON FUNCTION get_gmail_watches_needing_renewal TO service_role;

COMMENT ON FUNCTION get_gmail_watches_needing_renewal IS 'Returns Gmail watches that will expire within 24 hours and need renewal';
