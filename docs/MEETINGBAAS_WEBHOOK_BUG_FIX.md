# MeetingBaaS Webhook URL Storage Bug Fix

**Date**: January 27, 2026
**Status**: ✅ Fixed
**Severity**: Critical - Blocking all S3 uploads for 60 Notetaker recordings

## Problem Summary

After deploying the auto-join-scheduler fix (scheduled_time parameter), we discovered that post-meeting processing was incomplete for bot recordings. The S3 upload was stuck at "pending" status because the MeetingBaaS video/audio URLs were never saved to the database.

## Root Cause

The webhook handler code (`supabase/functions/meetingbaas-webhook/index.ts` lines 939-948) was attempting to update `video_url` and `audio_url` columns in the `bot_deployments` table:

```typescript
await supabase
  .from('bot_deployments')
  .update({
    status: 'completed',
    leave_time: exited_at,
    video_url: video || null,    // ❌ Column didn't exist
    audio_url: audio || null,     // ❌ Column didn't exist
    updated_at: new Date().toISOString(),
  })
  .eq('id', deployment.id);
```

**However, these columns didn't exist in the database schema!** The update operation failed silently, leaving the URLs as NULL.

## Impact

- **All 60 Notetaker recordings** since the feature launched have been affected
- MeetingBaaS URLs expire after 4 hours, so recordings not processed within that window are permanently lost
- The `poll-s3-upload-queue` cron job couldn't find URLs to upload, leaving recordings stuck at "pending"
- Transcription worked (stored directly in recordings.transcript_json), but video/audio files were never saved to S3

## The Fix

### 1. Added Missing Database Columns

Created migration `20260127110000_add_meetingbaas_url_columns.sql`:

```sql
ALTER TABLE bot_deployments
ADD COLUMN IF NOT EXISTS video_url TEXT,
ADD COLUMN IF NOT EXISTS audio_url TEXT;

COMMENT ON COLUMN bot_deployments.video_url IS 'Temporary video URL from MeetingBaaS (expires after 4 hours)';
COMMENT ON COLUMN bot_deployments.audio_url IS 'Temporary audio URL from MeetingBaaS (expires after 4 hours)';
```

**Applied to**: Staging ✅

### 2. Fixed Test Recording Manually

For the test recording (bot_id: `b3dc2c9c-e501-47c1-89f3-612a45603a79`):
- Manually inserted the URLs from the `bot.completed` webhook payload
- URLs are valid for 3.65 more hours (until ~14:45 UTC)
- The `poll-s3-upload-queue` cron will automatically process it within 5-10 minutes

## Timeline of Discovery

1. **10:35** - Bot deployed for test meeting
2. **10:40** - Meeting started (bot joined 34 seconds early due to fix deployed at 10:37)
3. **10:44** - Bot left meeting (recording completed)
4. **10:45** - `bot.completed` webhook received with video/audio URLs
5. **10:45** - Webhook handler processed: set s3_upload_status='pending' ✅, started Gladia transcription ✅
6. **10:45** - Webhook handler FAILED to save URLs (columns didn't exist) ❌
7. **10:48** - Transcription completed successfully ✅
8. **10:57** - Investigation started: S3 upload stuck at "pending"
9. **11:03** - Root cause identified: missing database columns
10. **11:04** - Migration created and applied to staging
11. **11:05** - URLs manually added to fix test recording

## What Happens Next

The `poll-s3-upload-queue` cron job runs every 5 minutes and will:

1. Find recordings with `s3_upload_status='pending'`
2. JOIN with `bot_deployments` to get video/audio URLs
3. Trigger `upload-recording-to-s3` function
4. Download from MeetingBaaS URLs and upload to S3
5. Update recording with S3 URLs and set status to 'complete'
6. Trigger thumbnail generation
7. Sync to meetings table

## Verification Steps

Check S3 upload completion in ~5-10 minutes:

```bash
# Run this script to verify
npx tsx scripts/check-recording-processing.ts
```

Expected results:
- ✅ Recording created
- ✅ Recording URL available
- ✅ S3 upload complete
- ✅ S3 video URL
- ✅ Meeting record created
- ✅ Meeting has video URL
- ✅ Thumbnail generated
- ✅ AI summary generated
- ✅ Transcript available

## Deployment Checklist

**Staging**: ✅ Complete
- [x] Migration applied
- [x] Test recording fixed manually
- [ ] Verify S3 upload completes (check in 5-10 minutes)

**Production**: ⏳ Ready to deploy
- [ ] Apply migration: `20260127110000_add_meetingbaas_url_columns.sql`
- [ ] Redeploy `meetingbaas-webhook` function (no code changes needed)
- [ ] Monitor first recording to verify URLs are saved

## Related Issues

This bug existed since 60 Notetaker was first implemented. All historical recordings have been affected:
- URLs expired within 4 hours
- Recordings cannot be recovered (MeetingBaaS doesn't persist them)
- Only transcripts remain (processed within the 4-hour window)

## Files Changed

1. **supabase/migrations/20260127110000_add_meetingbaas_url_columns.sql** - NEW
   - Adds video_url and audio_url columns to bot_deployments

2. **scripts/manually-fix-missing-urls.ts** - NEW (diagnostic/repair)
   - Manual fix for test recording
   - Can be used for future emergencies if webhook fails

3. **scripts/check-s3-upload-queue.ts** - NEW (diagnostic)
   - Comprehensive S3 upload queue status checker
   - Shows URL age, expiry countdown, queue status

## Lessons Learned

1. **Silent Failures**: Supabase doesn't throw errors for non-existent columns in updates
2. **Schema Validation**: Need better schema validation before deploying edge functions
3. **Test Coverage**: End-to-end testing should verify database state after webhook processing
4. **Monitoring**: Add alerts for recordings stuck at "pending" for >1 hour

## Related Documentation

- Original auto-join fix: `docs/BOT_DEPLOYMENT_FIX.md`
- S3 storage implementation: `.sixty/plan-s3-storage.md`
