# Supabase Storage Configuration Check

## Overview
Recordings are stored in **Supabase Storage** (not raw AWS S3). The system uses the `recordings` bucket with a specific folder structure.

## Storage Bucket Details

**Bucket Name**: `recordings`
**Folder Structure**: `{org_id}/{user_id}/{recording_id}/recording.{ext}`
**Security**: Protected by Row-Level Security (RLS)
**URL Type**: Signed URLs with 7-day expiry

## Configuration Checklist

### 1. Check if Storage Bucket Exists

**Via Supabase Dashboard**:
1. Go to: https://supabase.com/dashboard/project/ygdpgliavpxeugaajgrb
2. Navigate to: **Storage** → **Buckets**
3. Look for bucket named: `recordings`

**Expected Configuration**:
- **Public**: ❌ No (should be private)
- **File Size Limit**: 500 MB or higher
- **Allowed MIME types**: `video/*`, `audio/*`

### 2. Check Bucket Policies

**Via SQL**:
```sql
-- Check storage policies for recordings bucket
SELECT *
FROM storage.buckets
WHERE name = 'recordings';

-- Check storage object policies
SELECT
  policyname,
  permissive,
  roles,
  cmd,
  qual
FROM pg_policies
WHERE schemaname = 'storage'
  AND tablename = 'objects'
ORDER BY policyname;
```

**Expected Policies**:
- Allow authenticated users to upload to their org folder
- Allow authenticated users to read from their org folder
- Deny public access

### 3. Verify Storage Environment Variables

Check that these are set in Supabase Edge Functions:

```bash
# Required for storage operations
SUPABASE_URL=https://ygdpgliavpxeugaajgrb.supabase.co
SUPABASE_SERVICE_ROLE_KEY=<service-role-key>
SUPABASE_ANON_KEY=<anon-key>
```

**To check in Supabase Dashboard**:
1. Go to: **Edge Functions** → **Settings**
2. Verify environment variables are set
3. `SUPABASE_SERVICE_ROLE_KEY` must have full storage access

### 4. Test Storage Upload

**Via Supabase Dashboard**:
1. Go to: **Storage** → `recordings` bucket
2. Try uploading a test file manually
3. If upload succeeds, storage is configured correctly

**Via SQL** (Test query):
```sql
-- Check if any files exist in storage
SELECT
  name,
  bucket_id,
  created_at,
  updated_at,
  last_accessed_at,
  metadata
FROM storage.objects
WHERE bucket_id = 'recordings'
ORDER BY created_at DESC
LIMIT 10;
```

### 5. Check Edge Function Logs

**Check process-recording function logs**:
```bash
# View recent logs for upload errors
supabase functions logs process-recording --limit 50
```

**Look for these error patterns**:
- `Failed to upload to storage`
- `Storage bucket not found`
- `Permission denied`
- `Invalid service role key`

**Filter for upload-related logs**:
```bash
supabase functions logs process-recording --limit 100 | grep -i "upload\|storage\|s3"
```

### 6. Verify Signed URL Generation

**Via get-recording-url function**:
```bash
# Check if signed URL generation is working
supabase functions logs get-recording-url --limit 50
```

**Look for**:
- Successful signed URL creation
- 7-day expiry timestamps
- No permission errors

### 7. Manual Storage Test

**Create a test upload script**:
```sql
-- Test direct storage upload (requires service role)
-- This should be run from an edge function with service role access

SELECT storage.upload(
  'recordings/test-org/test-user/test-recording/test.txt',
  'Hello World'::bytea,
  'recordings'
);

-- Then try to read it back
SELECT storage.download('recordings', 'test-org/test-user/test-recording/test.txt');

-- Cleanup
SELECT storage.delete('recordings', 'test-org/test-user/test-recording/test.txt');
```

## Common Issues and Solutions

### Issue 1: Bucket Doesn't Exist
**Symptoms**: Process-recording fails with "bucket not found"
**Solution**:
1. Create `recordings` bucket in Supabase Dashboard
2. Set as **Private** (not public)
3. Configure size limits (500MB+)

### Issue 2: Permission Denied
**Symptoms**: "Permission denied" errors in logs
**Solution**:
1. Verify `SUPABASE_SERVICE_ROLE_KEY` is correct
2. Check storage policies allow service role access
3. Ensure edge function uses `supabaseAdmin` client (not regular `supabase` client)

### Issue 3: Upload Succeeds but URL Generation Fails
**Symptoms**: `recording_s3_key` exists but `recording_s3_url` is null
**Solution**:
1. Check signed URL generation in process-recording:line 574
2. Verify 7-day expiry calculation is correct
3. Test `storage.createSignedUrl()` manually

### Issue 4: Files Upload but Can't Be Downloaded
**Symptoms**: Signed URLs return 403/404
**Solution**:
1. Verify RLS policies allow authenticated users to read
2. Check if signed URL has expired (7 days)
3. Regenerate URL using get-recording-url function

## Storage Flow Diagram

```
MeetingBaaS Webhook (recording.ready)
    ↓
meetingbaas-webhook function
  - Stores meetingbaas_recording_id
    ↓
MeetingBaaS Webhook (transcript.ready)
    ↓
process-recording function
    ↓
Step 1.5: uploadRecordingToStorage()
  1. Download from MeetingBaaS temporary URL
     fetch(meetingbaasUrl) → blob

  2. Upload to Supabase Storage
     bucket: 'recordings'
     path: '{org_id}/{user_id}/{recording_id}/recording.mp4'
     supabaseAdmin.storage.from('recordings').upload(path, blob)

  3. Generate signed URL (7 days)
     supabaseAdmin.storage.from('recordings').createSignedUrl(path, 604800)

  4. Save to database
     UPDATE recordings SET
       recording_s3_url = signedUrl,
       recording_s3_key = path
    ↓
Dashboard fetches recording
  - Displays video using recording_s3_url
  - Regenerates URL on-demand via get-recording-url
```

## Quick Diagnosis Steps

Run these in order:

1. **Check if bucket exists**:
   - Supabase Dashboard → Storage → Look for "recordings" bucket

2. **Check if files are being uploaded**:
   ```sql
   SELECT COUNT(*) FROM storage.objects WHERE bucket_id = 'recordings';
   ```

3. **Check if recordings have S3 data**:
   ```sql
   SELECT COUNT(*) FROM recordings WHERE recording_s3_key IS NOT NULL;
   ```

4. **Check recent processing logs**:
   ```bash
   supabase functions logs process-recording --limit 50 | grep -i "upload\|storage"
   ```

5. **Check webhook logs**:
   ```bash
   supabase functions logs meetingbaas-webhook --limit 50
   ```

## Next Steps Based on Results

- **No bucket** → Create recordings bucket (see Issue 1)
- **No files in storage** → Check process-recording logs for upload errors
- **Files in storage but no URLs** → Check signed URL generation
- **No recordings in DB** → Check webhook logs, bot deployments
- **Recordings in DB but empty dashboard** → Check RLS policies, frontend queries
