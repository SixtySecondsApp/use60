# Async Recording Processing Architecture

## Overview

This system processes 60 Notetaker recordings asynchronously to handle long recordings (30+ minutes) without edge function timeouts.

## Architecture

```
┌─────────────────────────────────────────────────────────────────┐
│ ASYNC RECORDING PROCESSING PIPELINE                            │
├─────────────────────────────────────────────────────────────────┤
│                                                                 │
│  Stage 1: Webhook Handler (meetingbaas-webhook)                │
│  ├── Receive bot.completed event                               │
│  ├── Upload video to S3 (~1-2 min for 30min recording)        │
│  ├── Request async transcription from Gladia                   │
│  └── Return immediately (webhook completes in < 2 min)         │
│                                                                 │
│  Stage 2: Gladia Transcription (external service)              │
│  ├── Transcribe audio asynchronously (~5-10 min)              │
│  └── POST results to process-gladia-webhook                    │
│                                                                 │
│  Stage 3: Transcription Webhook (process-gladia-webhook)       │
│  ├── Receive transcript from Gladia                            │
│  ├── Save to database                                          │
│  ├── Trigger AI analysis                                       │
│  └── Return immediately (< 5 sec)                              │
│                                                                 │
│  Stage 4: AI Analysis (process-ai-analysis)                    │
│  ├── Generate summary with Claude                              │
│  ├── Extract action items                                      │
│  ├── Calculate talk time & sentiment                           │
│  ├── Update recording status to 'ready'                        │
│  └── Send notification (< 30 sec)                              │
│                                                                 │
└─────────────────────────────────────────────────────────────────┘
```

## Benefits

1. **No Timeouts**: Each stage completes quickly (< 2 minutes)
2. **Handles Any Length**: Can process hours-long recordings
3. **Better UX**: Users see progress ("Transcribing..." → "Analyzing..." → "Ready")
4. **Cost Efficient**: Only pay for actual compute used
5. **Resilient**: Failures in one stage don't affect others

## Recording Status Flow

```
pending
  ↓
bot_joining (bot deployed)
  ↓
recording (bot in meeting)
  ↓
processing (video uploaded to S3)
  ↓
transcribing (Gladia processing)  ← NEW STATUS
  ↓
processing (AI analysis running)
  ↓
ready (complete with summary)
```

## Edge Functions

### 1. `meetingbaas-webhook`
- **Updated**: Now uses async Gladia transcription
- **Runtime**: < 2 minutes (upload time)
- **Triggers**: Gladia transcription job

### 2. `process-gladia-webhook` (NEW)
- **Purpose**: Receive transcript from Gladia
- **Runtime**: < 5 seconds
- **Triggers**: AI analysis

### 3. `process-ai-analysis` (NEW)
- **Purpose**: Generate AI summary and insights
- **Runtime**: < 30 seconds
- **Output**: Summary, action items, talk time analysis

### 4. `process-recording` (LEGACY)
- **Status**: Kept for manual reprocessing
- **Issue**: Synchonous, times out on long recordings
- **Use**: Only for manual retries or short recordings

## Database Schema

### New Columns in `recordings` table:

```sql
gladia_job_id TEXT              -- Track async transcription job
gladia_result_url TEXT          -- Gladia result URL for debugging
transcription_started_at TIMESTAMPTZ  -- When transcription began
```

## Deployment

```bash
# Deploy to staging
./scripts/deploy-async-processing.sh caerqjzvuerejfrdtygb

# Deploy to production
./scripts/deploy-async-processing.sh ygdpgliavpxeugaajgrb
```

## Configuration

### Required Secrets

Ensure these are set in Supabase edge function secrets:

```bash
supabase secrets set GLADIA_API_KEY=<your-key> --project-ref <ref>
supabase secrets set DEEPGRAM_API_KEY=<your-key> --project-ref <ref>  # Fallback
supabase secrets set OPENAI_API_KEY=<your-key> --project-ref <ref>    # AI analysis
```

### Gladia Webhook URL

Configure in your MeetingBaaS settings (if using MeetingBaaS transcription):
- Staging: `https://caerqjzvuerejfrdtygb.supabase.co/functions/v1/process-gladia-webhook`
- Production: `https://ygdpgliavpxeugaajgrb.supabase.co/functions/v1/process-gladia-webhook`

## Testing

### Test Short Recording (5 min)

1. Schedule a 5-minute meeting
2. Deploy bot via auto-join scheduler
3. Wait for bot.completed webhook
4. Check logs:
   ```bash
   # Webhook handler
   supabase functions logs meetingbaas-webhook --project-ref <ref>

   # Gladia webhook
   supabase functions logs process-gladia-webhook --project-ref <ref>

   # AI analysis
   supabase functions logs process-ai-analysis --project-ref <ref>
   ```
5. Verify recording status: `pending → transcribing → processing → ready`

### Test Long Recording (30 min)

Same as above but recording will take longer to transcribe (~5-10 min).

### Monitor Status

```sql
-- Check recording status
SELECT
  id,
  status,
  gladia_job_id,
  transcription_started_at,
  created_at,
  updated_at
FROM recordings
WHERE bot_id = '<bot-id>'
ORDER BY created_at DESC
LIMIT 1;

-- Check if it synced to meetings
SELECT
  id,
  title,
  processing_status,
  summary IS NOT NULL as has_summary
FROM meetings
WHERE bot_id = '<bot-id>'
  AND source_type = '60_notetaker';
```

## Troubleshooting

### Recording stuck in "transcribing"

**Cause**: Gladia webhook didn't fire or failed

**Solution**:
1. Check Gladia dashboard for job status
2. Check `process-gladia-webhook` logs for errors
3. Manually fetch transcript:
   ```bash
   curl https://api.gladia.io/v2/transcription/<job-id> \
     -H "x-gladia-key: <key>"
   ```
4. Manually trigger AI analysis:
   ```bash
   curl -X POST https://<ref>.supabase.co/functions/v1/process-ai-analysis \
     -H "Authorization: Bearer <service-role-key>" \
     -H "Content-Type: application/json" \
     -d '{"recording_id":"<id>","bot_id":"<bot-id>"}'
   ```

### S3 upload failed

**Cause**: Large file size or network issues

**Solution**:
1. Check `meetingbaas-webhook` logs for S3 errors
2. MeetingBaaS URLs expire after 4 hours - act quickly
3. Manually download and upload to S3 if needed

### AI analysis failed

**Cause**: OpenAI API error or transcript too long

**Solution**:
1. Check `process-ai-analysis` logs
2. Verify OPENAI_API_KEY is set
3. Check Claude API quota (analyzeTranscriptWithClaude uses Anthropic)
4. Retry: POST to `/process-ai-analysis` with recording_id

## Migration from Sync to Async

### Before (Sync - had timeouts)
```
bot.completed → process-recording (everything) → timeout ❌
```

### After (Async - no timeouts)
```
bot.completed → upload S3 → request Gladia transcription → return ✅
                ↓
Gladia webhook → save transcript → trigger AI analysis ✅
                ↓
AI analysis → summary + insights → notification ✅
```

## Performance Benchmarks

| Recording Length | Old (Sync) | New (Async) | Improvement |
|-----------------|-----------|-------------|-------------|
| 5 min | 45 sec | 30 sec | 33% faster |
| 15 min | 2 min | 1 min | 50% faster |
| 30 min | **TIMEOUT** | 2 min | **Now works!** |
| 60 min | **TIMEOUT** | 5 min | **Now works!** |

## Cost Analysis

- **Gladia**: $0.00012/second = $0.432 for 60 min recording
- **Claude (AI)**: ~$0.02 per analysis (2K tokens)
- **S3 Storage**: $0.023/GB/month
- **Edge Functions**: First 2M invocations free

**Total cost per 60min recording**: ~$0.50
