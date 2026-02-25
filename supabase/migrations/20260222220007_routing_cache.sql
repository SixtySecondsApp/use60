-- Migration: routing_cache
-- Caches route-message pipeline results to reduce latency on repeated messages.

CREATE TABLE IF NOT EXISTS routing_cache (
  hash_key   TEXT        PRIMARY KEY,
  response   JSONB       NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  expires_at TIMESTAMPTZ NOT NULL
);

COMMENT ON TABLE routing_cache IS 'Short-lived cache for route-message pipeline results keyed by SHA-256(message + org_id + source).';
COMMENT ON COLUMN routing_cache.hash_key  IS 'First 32 hex chars of SHA-256(message + org_id + source).';
COMMENT ON COLUMN routing_cache.response  IS 'Full RouteResponse JSON returned to the caller.';
COMMENT ON COLUMN routing_cache.expires_at IS 'Cache entry TTL — entries past this timestamp are stale and should be ignored.';

-- Index for efficient cleanup of expired entries
CREATE INDEX IF NOT EXISTS routing_cache_expires_at_idx ON routing_cache (expires_at);

-- RLS
ALTER TABLE routing_cache ENABLE ROW LEVEL SECURITY;

-- Service role can do everything (used by edge function via service client)
CREATE POLICY "service_role_all" ON routing_cache
  FOR ALL
  TO service_role
  USING (true)
  WITH CHECK (true);

-- Authenticated users can read cache entries (read-only; writes are service-role only)
CREATE POLICY "authenticated_read" ON routing_cache
  FOR SELECT
  TO authenticated
  USING (true);
