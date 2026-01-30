-- Add race condition protection to organization_join_requests
-- Prevents concurrent acceptance of the same join request

-- Add is_processing flag to prevent concurrent updates
ALTER TABLE organization_join_requests
ADD COLUMN IF NOT EXISTS is_processing boolean
DEFAULT false
NOT NULL;

-- Add timestamp for when processing started
ALTER TABLE organization_join_requests
ADD COLUMN IF NOT EXISTS processing_started_at timestamptz;

-- Create partial index for active processing rows (fast lookups)
CREATE INDEX IF NOT EXISTS idx_join_requests_processing
ON organization_join_requests(id, processing_started_at)
WHERE is_processing = true;

-- Create index for stale processing cleanup (stuck > 5 minutes)
CREATE INDEX IF NOT EXISTS idx_join_requests_stale_processing
ON organization_join_requests(processing_started_at)
WHERE is_processing = true AND processing_started_at < NOW() - INTERVAL '5 minutes';

-- Add comment for documentation
COMMENT ON COLUMN organization_join_requests.is_processing IS 'Prevents concurrent acceptance of same join request. Auto-resets after 5 minutes if stuck.';
COMMENT ON COLUMN organization_join_requests.processing_started_at IS 'When processing began. Used to detect stale locks (>5 min = auto-reset).';

-- Function to auto-reset stale processing flags (optional, for safety)
CREATE OR REPLACE FUNCTION reset_stale_join_request_processing()
RETURNS integer
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
  reset_count integer;
BEGIN
  UPDATE organization_join_requests
  SET is_processing = false,
      processing_started_at = NULL
  WHERE is_processing = true
    AND processing_started_at < NOW() - INTERVAL '5 minutes';

  GET DIAGNOSTICS reset_count = ROW_COUNT;

  RETURN reset_count;
END;
$$;

COMMENT ON FUNCTION reset_stale_join_request_processing() IS 'Resets join requests stuck in processing for >5 minutes. Can be called by cron job.';
