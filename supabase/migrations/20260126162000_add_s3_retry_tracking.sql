-- Add S3 upload retry tracking
-- Supports exponential backoff: 2 min, 5 min, 10 min (max 3 attempts)

ALTER TABLE recordings
  ADD COLUMN IF NOT EXISTS s3_upload_retry_count INTEGER DEFAULT 0,
  ADD COLUMN IF NOT EXISTS s3_upload_last_retry_at TIMESTAMPTZ;

-- Add comment
COMMENT ON COLUMN recordings.s3_upload_retry_count IS 'Number of retry attempts for S3 upload. Max 3 retries with exponential backoff (2min, 5min, 10min).';
COMMENT ON COLUMN recordings.s3_upload_last_retry_at IS 'Timestamp of last retry attempt. Used for exponential backoff calculation.';

-- Add index for retry queries (find failed uploads ready for retry)
CREATE INDEX IF NOT EXISTS idx_recordings_s3_retry
  ON recordings(s3_upload_status, s3_upload_retry_count, s3_upload_last_retry_at)
  WHERE s3_upload_status = 'failed' AND s3_upload_retry_count < 3;
