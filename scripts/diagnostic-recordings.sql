-- ========================================
-- Recording Storage Diagnostic Queries
-- ========================================
-- Run these queries in Supabase SQL Editor to diagnose recording issues

-- Query 1: Check recent recordings (all statuses)
-- This shows if recordings exist at all
SELECT
  id,
  status,
  title,
  platform,
  created_at,
  updated_at,
  recording_s3_url IS NOT NULL as has_s3_url,
  recording_s3_key IS NOT NULL as has_s3_key,
  transcript_text IS NOT NULL as has_transcript,
  meeting_duration_seconds,
  owner_user_id,
  org_id
FROM recordings
ORDER BY created_at DESC
LIMIT 10;

-- Query 2: Check recordings by status
-- See where recordings are getting stuck
SELECT
  status,
  COUNT(*) as count,
  MAX(created_at) as most_recent
FROM recordings
GROUP BY status
ORDER BY most_recent DESC;

-- Query 3: Check bot deployments (should trigger recordings)
-- See if bots are being deployed successfully
SELECT
  id,
  status,
  created_at,
  meeting_url,
  org_id,
  user_id
FROM bot_deployments
ORDER BY created_at DESC
LIMIT 10;

-- Query 4: Check for recordings missing S3 URLs
-- These recordings exist but haven't been uploaded to storage
SELECT
  id,
  status,
  title,
  created_at,
  CASE
    WHEN recording_s3_url IS NULL THEN 'Missing S3 URL'
    WHEN recording_s3_key IS NULL THEN 'Missing S3 Key'
    ELSE 'Has Storage Data'
  END as storage_status,
  meetingbaas_recording_id IS NOT NULL as has_bot_id
FROM recordings
WHERE status IN ('ready', 'processing', 'pending')
ORDER BY created_at DESC
LIMIT 10;

-- Query 5: Check if process-recording function was called
-- Look for any processing errors or logs
SELECT
  r.id as recording_id,
  r.status,
  r.created_at,
  r.updated_at,
  r.recording_s3_key,
  r.meetingbaas_recording_id,
  EXTRACT(EPOCH FROM (r.updated_at - r.created_at)) as processing_time_seconds
FROM recordings r
WHERE r.created_at > NOW() - INTERVAL '7 days'
ORDER BY r.created_at DESC
LIMIT 10;

-- Query 6: Check organization settings for recording
-- Verify org has recording enabled
SELECT
  id,
  name,
  recording_settings
FROM organizations
WHERE id IN (
  SELECT DISTINCT org_id FROM recordings
  UNION
  SELECT DISTINCT org_id FROM bot_deployments
)
LIMIT 5;

-- Query 7: Count total recordings per organization
-- See which orgs have recordings
SELECT
  o.id as org_id,
  o.name as org_name,
  COUNT(r.id) as total_recordings,
  COUNT(CASE WHEN r.status = 'ready' THEN 1 END) as ready_recordings,
  COUNT(CASE WHEN r.status = 'processing' THEN 1 END) as processing_recordings,
  COUNT(CASE WHEN r.recording_s3_url IS NOT NULL THEN 1 END) as with_s3_url,
  MAX(r.created_at) as latest_recording
FROM organizations o
LEFT JOIN recordings r ON r.org_id = o.id
GROUP BY o.id, o.name
HAVING COUNT(r.id) > 0
ORDER BY latest_recording DESC;

-- Query 8: Check RLS policies on recordings table
-- Verify users can access recordings
SELECT
  schemaname,
  tablename,
  policyname,
  permissive,
  roles,
  cmd,
  qual
FROM pg_policies
WHERE tablename = 'recordings'
ORDER BY policyname;

-- ========================================
-- Expected Results Guide
-- ========================================

-- If Query 1 returns 0 rows:
--   → No recordings exist in database
--   → Check bot_deployments (Query 3) to see if bots are being deployed
--   → Check meetingbaas-webhook logs for incoming webhooks

-- If Query 1 shows recordings with status != 'ready':
--   → Recordings exist but processing failed
--   → Check process-recording function logs
--   → Look for error messages in updated_at timestamps

-- If Query 4 shows recordings without S3 URLs:
--   → Storage upload is failing
--   → Check Supabase Storage bucket exists
--   → Verify SUPABASE_SERVICE_ROLE_KEY is set correctly
--   → Check process-recording function logs for upload errors

-- If Query 7 shows 0 recordings for your org:
--   → RLS policy might be blocking access
--   → Verify org_id matches your current organization
--   → Check Query 8 for RLS policies

-- Next steps based on results:
-- 1. If no recordings → Check bot deployments and webhook logs
-- 2. If recordings stuck in 'processing' → Check process-recording logs
-- 3. If recordings missing S3 URLs → Check storage configuration
-- 4. If recordings exist but not visible → Check RLS policies
