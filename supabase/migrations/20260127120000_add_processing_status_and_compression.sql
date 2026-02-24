-- Add 'processing' status to s3_upload_status enum for Lambda compression pipeline
-- and add compression tracking columns to recordings table

-- Add new enum value (PostgreSQL does not support IF NOT EXISTS for ADD VALUE,
-- but ADD VALUE is a no-op if the value already exists in PG 9.3+, and errors
-- in older versions. Supabase runs PG 15+ so this is safe to run idempotently
-- by wrapping in a DO block that checks first.)
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_enum
    WHERE enumlabel = 'processing'
    AND enumtypid = (SELECT oid FROM pg_type WHERE typname = 's3_upload_status')
  ) THEN
    ALTER TYPE s3_upload_status ADD VALUE 'processing';
  END IF;
END
$$;

-- Add compression tracking columns
ALTER TABLE recordings
  ADD COLUMN IF NOT EXISTS compression_ratio NUMERIC,
  ADD COLUMN IF NOT EXISTS original_size_bytes BIGINT,
  ADD COLUMN IF NOT EXISTS compressed_size_bytes BIGINT,
  ADD COLUMN IF NOT EXISTS compression_duration_seconds INTEGER;

-- Comment on new columns for documentation
COMMENT ON COLUMN recordings.compression_ratio IS 'Ratio of compressed to original size (e.g., 0.15 = 85% reduction)';
COMMENT ON COLUMN recordings.original_size_bytes IS 'Original video size before compression';
COMMENT ON COLUMN recordings.compressed_size_bytes IS 'Video size after FFmpeg compression';
COMMENT ON COLUMN recordings.compression_duration_seconds IS 'Time taken by Lambda to compress the video';
