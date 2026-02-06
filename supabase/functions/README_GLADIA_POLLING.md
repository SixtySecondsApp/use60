# Gladia Polling Architecture

## Overview

**Critical Discovery**: Gladia API accepts `callback_url` parameter but **does not actually fire webhooks**. This document describes the polling-based solution implemented to work around this limitation.

## Problem

The initial async architecture was built on the assumption that Gladia would POST to our webhook when transcription completes. However, testing revealed:

1. ✅ Gladia accepts `callback_url` in the request
2. ✅ API returns `"callback": true` in response
3. ❌ **Webhook is never called** when transcription completes
4. ✅ Transcription does complete successfully (can be verified via GET request)

## Solution: Polling with Intelligent Efficiency

Created a scheduled edge function that polls Gladia API every 3 minutes to check for completed transcriptions.

### Architecture

```
┌─────────────────────────────────────────────────────────────┐
│  ASYNC PROCESSING WITH POLLING                              │
├─────────────────────────────────────────────────────────────┤
│                                                             │
│  1. MeetingBaaS Webhook                                     │
│     └─> Store metadata (no S3 upload, ~15MB memory)        │
│     └─> Request Gladia transcription with callback URL     │
│     └─> Update recording: status='transcribing'            │
│                                                             │
│  2. Poll Gladia Jobs (every 3 min via pg_cron)             │
│     └─> Fast HEAD request: count 'transcribing' records    │
│     └─> EXIT if count=0 (< 50ms, saves compute)           │
│     └─> Poll Gladia API for each recording                 │
│     └─> When status='done', call process-gladia-webhook    │
│                                                             │
│  3. Process Gladia Webhook                                  │
│     └─> Save transcript to recordings table                │
│     └─> Trigger AI analysis edge function                  │
│                                                             │
│  4. Process AI Analysis                                     │
│     └─> Generate summary, action items, coaching           │
│     └─> Update recordings + sync to meetings table         │
│     └─> Status: 'transcribing' → 'ready'                  │
│                                                             │
└─────────────────────────────────────────────────────────────┘
```

## Files

### Core Functions

| File | Purpose | Cron |
|------|---------|------|
| `poll-gladia-jobs/index.ts` | Polls Gladia for completed jobs | Every 3 min |
| `process-gladia-webhook/index.ts` | Processes completed transcripts | On-demand |
| `process-ai-analysis/index.ts` | Generates AI insights | On-demand |
| `meetingbaas-webhook/index.ts` | Initiates async flow | Webhook |

### Database

| Migration | Purpose |
|-----------|---------|
| `20260126120000_add_gladia_tracking.sql` | Add gladia_job_id, gladia_result_url columns |
| `20260126140000_add_transcribing_status.sql` | Add 'transcribing' status to recordings |
| `20260126150000_poll_gladia_cron.sql` | Set up pg_cron job |

### Scripts

| Script | Purpose |
|--------|---------|
| `recover-failed-recording.sh` | Manually recover failed recordings |
| `check-recording-status.ts` | Check recording/meeting status |
| `deploy-async-processing.sh` | Deploy async system |

## Cron Efficiency

The polling cron is highly optimized for minimal resource usage:

```typescript
// 1. Fast HEAD request (< 50ms)
const { count } = await supabase
  .from('recordings')
  .select('*', { count: 'exact', head: true })
  .eq('status', 'transcribing')
  .not('gladia_job_id', 'is', null);

// 2. Exit immediately if nothing to process
if (!count || count === 0) {
  console.log('[PollGladiaJobs] No recordings - skipping');
  return { success: true, count: 0 };
}

// 3. Only fetch full data when needed
const { data: recordings } = await supabase
  .from('recordings')
  .select('id, gladia_job_id, ...')
  .eq('status', 'transcribing');
```

**Resource Usage**:
- **Idle** (no recordings): ~50ms, ~5MB memory
- **Active** (1 recording): ~2s, ~15MB memory
- **Multiple** (5 recordings): ~10s, ~20MB memory

**Frequency**: Every 3 minutes (configurable in migration)

## Status Flow

```
pending
  ↓
bot_joining
  ↓
recording
  ↓
processing (S3 upload - SKIPPED in current implementation)
  ↓
transcribing (Gladia job running - POLLED every 3 min)
  ↓
processing (AI analysis running)
  ↓
ready / failed
```

## Performance Benchmarks

| Recording Length | Transcription Time | Total Time |
|------------------|-------------------|------------|
| 5 minutes | ~2 min | ~5 min |
| 15 minutes | ~5 min | ~8 min |
| 30 minutes | ~10 min | ~13 min |
| 60 minutes | ~20 min | ~23 min |

**Note**: Polling adds max 3 minutes delay (average 1.5 min) to total processing time.

## Monitoring

### Check Cron Status

```sql
-- View all scheduled jobs
SELECT * FROM cron.job;

-- View job run history
SELECT * FROM cron.job_run_details
WHERE jobname = 'poll-gladia-jobs'
ORDER BY start_time DESC
LIMIT 10;
```

### Check Function Logs

```bash
# Via Supabase dashboard
https://supabase.com/dashboard/project/caerqjzvuerejfrdtygb/functions/poll-gladia-jobs

# Via CLI (requires project linked)
supabase functions logs poll-gladia-jobs
```

### Check Recording Status

```bash
deno run --allow-net --allow-env --allow-read scripts/check-recording-status.ts <recording_id>
```

## Recovery Procedures

### Manually Trigger Polling

```bash
curl -X POST "https://caerqjzvuerejfrdtygb.supabase.co/functions/v1/poll-gladia-jobs" \
  -H "Authorization: Bearer ${SUPABASE_SERVICE_ROLE_KEY}"
```

### Recover Failed Recording (within 4 hours of webhook)

```bash
bash scripts/recover-failed-recording.sh <bot_id> <audio_url>
```

### Manually Process Completed Transcription

```bash
# 1. Get Gladia job status
GLADIA_JOB_ID="..."
curl "https://api.gladia.io/v2/transcription/${GLADIA_JOB_ID}" \
  -H "x-gladia-key: ${GLADIA_API_KEY}" > /tmp/gladia_response.json

# 2. Send to webhook handler
curl -X POST "https://caerqjzvuerejfrdtygb.supabase.co/functions/v1/process-gladia-webhook?recording_id=${RECORDING_ID}&bot_id=${BOT_ID}" \
  -H "Authorization: Bearer ${SUPABASE_SERVICE_ROLE_KEY}" \
  -H "Content-Type: application/json" \
  -d @/tmp/gladia_response.json
```

## Configuration

### Change Polling Frequency

Edit migration `20260126150000_poll_gladia_cron.sql`:

```sql
-- Every 3 minutes (current)
SELECT cron.schedule('poll-gladia-jobs', '*/3 * * * *', ...);

-- Every 5 minutes
SELECT cron.schedule('poll-gladia-jobs', '*/5 * * * *', ...);

-- Every 10 minutes
SELECT cron.schedule('poll-gladia-jobs', '*/10 * * * *', ...);
```

Then run migration:

```bash
supabase db push
```

### Disable Polling

```sql
-- Remove the cron job
SELECT cron.unschedule('poll-gladia-jobs');
```

### Re-enable Polling

```sql
-- Recreate the cron job
SELECT cron.schedule(
  'poll-gladia-jobs',
  '*/3 * * * *',
  'SELECT call_poll_gladia_jobs();'
);
```

## Known Issues

1. **No video/audio URLs for playback**
   - Current implementation skips S3 upload to avoid memory limits
   - MeetingBaaS URLs expire after 4 hours
   - **Solution**: Implement background S3 upload job after transcription

2. **Summary sometimes null**
   - AI analysis completes but summary field is empty
   - Other fields (coach_rating, talk_time) populate correctly
   - **Investigation needed**: Check aiAnalysis.ts for summary generation

3. **Polling delay**
   - Max 3 min delay between completion and processing
   - Average 1.5 min delay
   - **Tradeoff**: More frequent polling = higher costs

## Future Improvements

1. **Webhook Retry with Gladia Support**
   - Contact Gladia to confirm webhook status
   - If webhooks work for some customers, investigate our configuration

2. **WebSocket/SSE Alternative**
   - Long-polling or server-sent events for real-time updates
   - Would eliminate 1-3 minute delay

3. **Background S3 Upload**
   - Upload recordings after transcription completes
   - Enables permanent storage and playback

4. **Adaptive Polling Frequency**
   - Poll more frequently during business hours (every 2 min)
   - Less frequent at night (every 5 min)
   - Further reduce costs while maintaining responsiveness

## Testing

### Test End-to-End Flow

1. Deploy a recording bot to a short meeting (5-10 min)
2. Check webhook fires and recording enters 'transcribing' state
3. Wait 3-6 minutes for polling to detect completion
4. Verify transcript appears in meetings table
5. Check AI analysis completes (summary, coach_rating, etc.)

### Test Polling Efficiency

```bash
# When no recordings are transcribing
time curl -X POST "https://caerqjzvuerejfrdtygb.supabase.co/functions/v1/poll-gladia-jobs" \
  -H "Authorization: Bearer ${SUPABASE_SERVICE_ROLE_KEY}"
# Should complete in < 100ms

# When recording is transcribing
# Should take 2-5 seconds depending on number of recordings
```

## Support

For issues or questions:
1. Check function logs in Supabase dashboard
2. Verify cron job is running: `SELECT * FROM cron.job_run_details`
3. Manually trigger polling to test: `curl -X POST .../poll-gladia-jobs`
4. Check Gladia dashboard for job status
5. Review this documentation and recovery procedures
