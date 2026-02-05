# 60 Notetaker S3 Storage Implementation

## Overview

Complete implementation of permanent S3 storage for 60 Notetaker recordings, replacing 4-hour expiry MeetingBaaS URLs with permanent storage and cost tracking.

## Architecture

### Unified Storage Model

Both Fathom and 60 Notetaker recordings now write to the unified `meetings` table:

```
Fathom Meetings:
  Fathom → fathom-sync → meetings table (video_url from Fathom)

60 Notetaker Meetings:
  MeetingBaaS → meetingbaas-webhook → recordings table
                                     ↓
           Gladia/MeetingBaaS transcription
                                     ↓
              process-gladia-webhook / process-recording
                                     ↓
              S3 upload (permanent URLs)
                                     ↓
              syncRecordingToMeeting()
                                     ↓
        meetings table (video_url from S3, thumbnail_url)
```

### Recording Flow (4 Phases)

#### Phase 1: Bot Deployment & Recording
1. **auto-join-scheduler** (cron every 2 min) finds upcoming meetings
2. **deploy-recording-bot** sends bot to meeting via MeetingBaaS API
3. **meetingbaas-webhook** receives status updates:
   - `bot.joined` → Update status to 'joined'
   - `bot.completed` → Store MeetingBaaS URLs, set `s3_upload_status='pending'`

#### Phase 2: S3 Upload (Background)
4. **poll-s3-upload-queue** (cron every 5 min) finds pending uploads
   - Checks MeetingBaaS URL expiry (<4 hours old)
   - Implements exponential backoff: 2min, 5min, 10min
5. **upload-recording-to-s3** streams video/audio:
   - Streaming multipart upload (5MB chunks)
   - S3 path: `meeting-recordings/{org_id}/{user_id}/{recording_id}/`
   - Updates: `s3_upload_status='complete'`, stores S3 URLs

#### Phase 3: Transcription (Async)
6. Two transcription paths:
   - **Gladia**: Async API → process-gladia-webhook
   - **MeetingBaaS**: transcript.ready → process-recording
7. Both paths call **syncRecordingToMeeting()** helper:
   - Syncs S3 URLs to meetings table
   - Triggers thumbnail generation

#### Phase 4: Thumbnail & Display
8. **generate-s3-video-thumbnail** creates thumbnail
9. Meetings page displays with permanent S3 URLs

### Provider-Agnostic Design

The `syncRecordingToMeeting()` helper ensures consistent behavior regardless of transcription provider:

```typescript
// supabase/functions/_shared/recordingCompleteSync.ts
export async function syncRecordingToMeeting(options: SyncOptions): Promise<void> {
  // 1. Get recording with S3 URLs
  const { data: recording } = await supabase
    .from('recordings')
    .select('s3_upload_status, s3_video_url, s3_audio_url')
    .eq('id', recording_id)
    .single();

  // 2. Sync S3 URLs to meetings if complete
  if (recording?.s3_upload_status === 'complete') {
    await supabase
      .from('meetings')
      .update({
        video_url: recording.s3_video_url,
        audio_url: recording.s3_audio_url,
      })
      .eq('bot_id', bot_id);

    // 3. Generate thumbnail
    if (recording.s3_video_url) {
      await supabase.functions.invoke('generate-s3-video-thumbnail', {
        body: { recording_id, video_url: recording.s3_video_url }
      });
    }
  }
}
```

## Implementation Files

### Database Migrations (5 files)

1. **20260126160000_add_s3_upload_tracking.sql**
   - Adds S3 tracking columns to recordings table
   - Creates `s3_upload_status` enum: pending, uploading, complete, failed
   - Indexes for queue queries and error monitoring

2. **20260126161000_poll_s3_upload_cron.sql**
   - Cron job every 5 minutes
   - Calls `call_poll_s3_upload_queue()` function

3. **20260126162000_add_s3_retry_tracking.sql**
   - Adds retry tracking: `s3_upload_retry_count`, `s3_upload_last_retry_at`
   - Index for retry queries

4. **20260126163000_create_s3_usage_metrics.sql**
   - Creates `s3_usage_metrics` table
   - Metric types: storage_gb, upload_gb, download_gb, api_requests
   - RLS policies (admin-only read)
   - Cost calculation functions

5. **20260126164000_s3_metrics_cron.sql**
   - Daily cron at midnight UTC
   - Calls `call_update_s3_metrics()` function

### Edge Functions (7 new + 2 modified)

**New Functions:**
1. **upload-recording-to-s3/** - Streaming multipart upload
2. **poll-s3-upload-queue/** - Queue polling with exponential backoff
3. **update-s3-metrics/** - Daily metrics calculation
4. **admin-s3-metrics/** - Admin API for metrics queries
5. **process-gladia-webhook/** - Gladia async transcription handler
6. **poll-gladia-jobs/** - Polls Gladia job status (async processing)
7. **process-ai-analysis/** - Lightweight AI analysis

**Shared Utilities:**
- **_shared/s3Client.ts** - S3 client configuration
- **_shared/s3StreamUpload.ts** - Streaming multipart upload
- **_shared/recordingCompleteSync.ts** - Provider-agnostic S3 sync

**Modified Functions:**
- **meetingbaas-webhook/index.ts** - Sets s3_upload_status='pending'
- **process-recording/index.ts** - Calls syncRecordingToMeeting()

### Frontend Components (3 files)

1. **src/hooks/queries/useS3Metrics.ts**
   - React Query hook for S3 metrics API
   - 5-minute stale time

2. **src/components/admin/S3CostMetrics.tsx**
   - Displays 4 metric cards + line chart
   - CSV export functionality
   - Cost alerts if >$50/month

3. **src/pages/admin/S3StorageAdmin.tsx**
   - Admin page wrapper
   - Admin access verification
   - Route: `/platform/s3-storage`

## Cost Tracking

### Pricing Model
- **Storage**: $0.023/GB/month
- **Download**: $0.09/GB (estimated)
- **Upload**: Free

### Metrics Dashboard
- Total storage used (GB)
- Current month cost ($)
- Next month projection ($)
- Daily breakdown with charts
- CSV export

### Database Schema
```sql
-- recordings table
s3_upload_status ENUM('pending', 'uploading', 'complete', 'failed')
s3_video_url TEXT
s3_audio_url TEXT
s3_file_size_bytes BIGINT
s3_upload_retry_count INT DEFAULT 0
s3_upload_last_retry_at TIMESTAMPTZ

-- s3_usage_metrics table
org_id UUID REFERENCES organizations(id)
date DATE NOT NULL
metric_type ENUM('storage_gb', 'upload_gb', 'download_gb', 'api_requests')
value NUMERIC NOT NULL
cost_usd NUMERIC NOT NULL
```

## Retry Strategy

Exponential backoff for failed uploads:
- **Attempt 1**: 2 minutes after failure
- **Attempt 2**: 5 minutes after failure
- **Attempt 3**: 10 minutes after failure
- **Max attempts**: 3 (then permanently failed)

Formula: `retryDelays = [2, 5, 10]` (minutes)

## Security

### Required Secrets (Edge Functions)
```bash
MEETINGBAAS_API_KEY
MEETINGBAAS_WEBHOOK_SECRET
AWS_REGION
AWS_S3_BUCKET
AWS_ACCESS_KEY_ID
AWS_SECRET_ACCESS_KEY
GLADIA_API_KEY  # Optional, MeetingBaaS fallback
```

### Required Vault Secrets (for cron)
```sql
-- Vault secret for service role key
Name: service_role_key
Value: <supabase-service-role-key>
Used by: call_auto_join_scheduler(), call_poll_s3_upload_queue()
```

### S3 Bucket Configuration
- **Bucket**: use60-application
- **Region**: eu-west-2
- **Path**: `meeting-recordings/{org_id}/{user_id}/{recording_id}/`
- **Access**: Private (presigned URLs for access)

## Deployment Checklist

### 1. Database Migrations
```bash
supabase db push
```

Verify migrations applied:
- S3 tracking columns added to recordings
- s3_usage_metrics table created
- Cron jobs scheduled (poll-s3-upload-queue, update-s3-metrics)

### 2. Edge Functions
```bash
# Deploy new functions
supabase functions deploy upload-recording-to-s3
supabase functions deploy poll-s3-upload-queue
supabase functions deploy update-s3-metrics
supabase functions deploy admin-s3-metrics
supabase functions deploy process-gladia-webhook
supabase functions deploy poll-gladia-jobs
supabase functions deploy process-ai-analysis

# Deploy modified functions
supabase functions deploy meetingbaas-webhook
supabase functions deploy process-recording
```

### 3. Verify Secrets
```bash
# Check edge function secrets
supabase secrets list

# Required:
# - MEETINGBAAS_API_KEY
# - MEETINGBAAS_WEBHOOK_SECRET
# - AWS_REGION
# - AWS_S3_BUCKET
# - AWS_ACCESS_KEY_ID
# - AWS_SECRET_ACCESS_KEY
# - GLADIA_API_KEY (optional)
```

### 4. Verify Cron Jobs
```sql
-- Check cron schedules
SELECT * FROM cron.job WHERE jobname IN (
  'poll-s3-upload-queue',
  'update-s3-metrics'
);

-- Expected:
-- poll-s3-upload-queue: */5 * * * * (every 5 min)
-- update-s3-metrics: 0 0 * * * (daily at midnight UTC)
```

### 5. Test End-to-End
1. Enable auto-join for a test meeting
2. Bot joins and records meeting
3. Verify S3 upload queue entry created
4. Wait 5 minutes for upload to start
5. Verify S3 URLs in meetings table
6. Verify thumbnail generation
7. Check meetings page displays recording

### 6. Monitor Costs
- Access admin dashboard: `/platform/s3-storage`
- Verify metrics calculation (daily at midnight)
- Set up alerts for >$50/month

## Troubleshooting

### Upload Failures
```sql
-- Find failed uploads
SELECT id, meeting_title, s3_upload_status, s3_upload_error_message
FROM recordings
WHERE s3_upload_status = 'failed';

-- Reset for retry
UPDATE recordings
SET s3_upload_status = 'pending',
    s3_upload_retry_count = 0
WHERE id = '<recording_id>';
```

### Missing Thumbnails
```sql
-- Find recordings without thumbnails
SELECT r.id, m.title, m.thumbnail_url
FROM recordings r
JOIN meetings m ON m.bot_id = r.bot_id
WHERE r.s3_video_url IS NOT NULL
  AND m.thumbnail_url IS NULL;

-- Manually trigger thumbnail generation
SELECT supabase.functions.invoke(
  'generate-s3-video-thumbnail',
  '{"recording_id": "<recording_id>", "video_url": "<s3_video_url>"}'::jsonb
);
```

### Cost Monitoring
```sql
-- Check current month costs by org
SELECT
  org_id,
  SUM(cost_usd) as total_cost,
  SUM(CASE WHEN metric_type = 'storage_gb' THEN value ELSE 0 END) as storage_gb
FROM s3_usage_metrics
WHERE date >= date_trunc('month', CURRENT_DATE)
GROUP BY org_id
ORDER BY total_cost DESC;
```

## Documentation Updates

### Updated Files
1. **CLAUDE.md** - Added complete S3 storage architecture section
2. **ProcessMaps.tsx** - Updated MeetingBaaS to "60 Notetaker" with full description
3. **S3_STORAGE_IMPLEMENTATION.md** (this file)

### Process Map
Generate process map for 60 Notetaker via admin dashboard:
- Navigate to `/platform/process-maps`
- Click "Generate" on "60 Notetaker" integration
- View complete flow diagram with all 4 phases

## Success Metrics

✅ **Permanent Storage**: Replaces 4-hour expiry MeetingBaaS URLs
✅ **Unified Display**: Same UI for Fathom and 60 Notetaker
✅ **Provider-Agnostic**: Works with both Gladia and MeetingBaaS transcription
✅ **Cost Tracking**: Admin dashboard with metrics and projections
✅ **Retry Logic**: Exponential backoff with 3 attempts
✅ **Streaming Upload**: No memory buffering, handles large files
✅ **Thumbnail Generation**: Automatic via existing Lambda

## Next Steps

1. **Deploy to staging** - Test complete flow
2. **Monitor costs** - Set up alerts
3. **Optimize uploads** - Tune chunk size if needed
4. **Add compression** - Consider video compression before upload
5. **Lifecycle policies** - Auto-delete old recordings after 90 days
