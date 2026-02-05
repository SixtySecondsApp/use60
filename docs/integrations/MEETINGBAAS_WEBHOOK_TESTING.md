# MeetingBaaS Webhook Testing Guide

## ✅ Implementation Complete

The MeetingBaaS webhook handler has been updated to support the actual nested payload format from MeetingBaaS.

### Changes Implemented

1. **New Payload Format Support**
   - `bot.status_change` with nested `{ event, data: { bot_id, status: { code } } }`
   - `bot.completed` with `{ event, data: { bot_id, video, audio, duration_seconds, ... } }`

2. **S3 Upload Integration**
   - Automatically downloads and uploads recordings to S3 on `bot.completed`
   - Generates signed URLs with 7-day expiry
   - Fallback to MeetingBaaS URL if S3 upload fails

3. **Backward Compatibility**
   - Still supports legacy flat format `{ type, bot_id, ... }`
   - Existing webhook integrations continue to work

4. **Status Tracking**
   - Maps MeetingBaaS status codes to deployment/recording states
   - Maintains status history with timestamps

## Testing with Real MeetingBaaS Bots

### Step 1: Deploy a Recording Bot

Use the app UI or API to start a MeetingBaaS recording bot for a meeting.

### Step 2: Monitor Webhook Events

Watch the `webhook_events` table in Supabase:

```sql
-- View recent webhook events
SELECT
  created_at,
  event_type,
  status,
  payload->>'event' as event,
  payload->'data'->>'bot_id' as bot_id,
  error_message
FROM webhook_events
WHERE source = 'meetingbaas'
ORDER BY created_at DESC
LIMIT 20;
```

### Step 3: Verify Bot Deployment Updates

Check that bot deployments are updating correctly:

```sql
-- Check bot deployment status
SELECT
  bot_id,
  status,
  actual_join_time,
  leave_time,
  status_history
FROM bot_deployments
WHERE bot_id = 'YOUR_BOT_ID'
ORDER BY created_at DESC;
```

### Step 4: Verify Recording Upload

After bot completion, verify the recording was uploaded to S3:

```sql
-- Check recording details
SELECT
  id,
  meeting_title,
  status,
  recording_s3_key,
  recording_s3_url,
  meeting_start_time,
  meeting_end_time,
  meeting_duration_seconds
FROM recordings
WHERE bot_id = 'YOUR_BOT_ID'
ORDER BY created_at DESC;
```

## Expected Webhook Event Flow

For a typical recording, you should see these events in order:

1. **`bot.status_change`** - `joining_call`
   - Updates deployment: `status = 'joining'`
   - Updates recording: `status = 'bot_joining'`

2. **`bot.status_change`** - `in_call_recording`
   - Updates deployment: `status = 'in_meeting'`, sets `actual_join_time`
   - Updates recording: `status = 'recording'`, sets `meeting_start_time`

3. **`bot.status_change`** - `call_ended`
   - Updates deployment: `status = 'leaving'`, sets `leave_time`
   - Updates recording: `status = 'processing'`

4. **`bot.completed`**
   - Downloads video/audio from MeetingBaaS
   - Uploads to S3: `meeting-recordings/{org_id}/{user_id}/{recording_id}/recording.mp4`
   - Updates recording with S3 URLs, duration, timestamps
   - Updates deployment: `status = 'completed'`
   - **Triggers `process-recording` function** for transcription and AI analysis

5. **`process-recording` completion**
   - Transcribes audio
   - Identifies speakers
   - Generates AI summary and highlights
   - Updates recording: `status = 'ready'`

## Troubleshooting

### Webhook Not Receiving Events

Check that MeetingBaaS webhook is configured:
```bash
# View webhook configuration in MeetingBaaS dashboard
# Webhook URL should be:
https://ygdpgliavpxeugaajgrb.supabase.co/functions/v1/meetingbaas-webhook
```

### Signature Verification Failures

The webhook uses SVIX signature verification. MeetingBaaS should sign requests with your webhook secret.

If you need to temporarily disable verification for debugging:
```bash
# Unset the webhook secret (development only!)
npx supabase secrets unset MEETINGBAAS_WEBHOOK_SECRET
```

### S3 Upload Failures

Check AWS credentials are configured:
```bash
npx supabase secrets list | grep AWS
# Should show:
# - AWS_ACCESS_KEY_ID
# - AWS_SECRET_ACCESS_KEY
# - AWS_S3_BUCKET
# - AWS_REGION
```

## Function Logs

View real-time logs in Supabase Dashboard:
https://supabase.com/dashboard/project/ygdpgliavpxeugaajgrb/functions/meetingbaas-webhook/logs

Or check the `webhook_events` table for detailed payload logging.

## Deployment

Changes are already deployed! The webhook handler is live and ready to receive MeetingBaaS events.

```bash
# Redeploy if needed:
npx supabase functions deploy meetingbaas-webhook
```
