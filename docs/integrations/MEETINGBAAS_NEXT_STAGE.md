## MeetingBaaS (60 Notetaker) — Next Stage Development + Testing Runbook

This document is the practical "next stage" checklist to get the **MeetingBaaS (60 Notetaker)** integration deployed, configured, and tested end-to-end.

---

## Deployment Status (2026-01-22)

### Production (`ygdpgliavpxeugaajgrb`) - ✅ READY FOR TESTING

| Component | Status | Notes |
|-----------|--------|-------|
| Migrations | ✅ Applied | All 3 MeetingBaaS migrations via Dashboard SQL Editor |
| Edge Functions | ✅ Deployed | 240 functions deployed |
| `MEETINGBAAS_API_KEY` | ✅ Set | |
| `MEETINGBAAS_WEBHOOK_SECRET` | ✅ Set | |
| AWS Secrets | ✅ Set | REGION, BUCKET, ACCESS_KEY, SECRET_KEY |
| Vault `service_role_key` | ✅ Set | Added to Vault for cron authentication |
| MeetingBaaS Webhook URL | ✅ Configured | Webhook receiving events |

### Staging (`caerqjzvuerejfrdtygb`) - ⚠️ NEEDS SECRETS

| Component | Status | Notes |
|-----------|--------|-------|
| Migrations | ✅ Applied | All 3 MeetingBaaS migrations via MCP |
| Edge Functions | ✅ Deployed | Critical 5 functions: deploy-recording-bot, meetingbaas-webhook, process-recording, generate-s3-video-thumbnail, auto-join-scheduler |
| `MEETINGBAAS_API_KEY` | ⬜ Pending | Dashboard → Edge Functions → Secrets |
| `MEETINGBAAS_WEBHOOK_SECRET` | ⬜ Pending | Dashboard → Edge Functions → Secrets |
| AWS Secrets | ⬜ Pending | REGION, BUCKET, ACCESS_KEY, SECRET_KEY |
| Vault `service_role_key` | ⬜ Pending | Dashboard → Settings → Vault |
| MeetingBaaS Webhook URL | ⬜ Pending | Configure `https://caerqjzvuerejfrdtygb.supabase.co/functions/v1/meetingbaas-webhook` |

---

It assumes the core code paths already exist:
- Upcoming meetings are discovered from `calendar_events`
- Bots are deployed via `deploy-recording-bot`
- Webhooks update state and trigger processing via `meetingbaas-webhook`
- Recordings are uploaded to S3
- AI analysis is generated
- Thumbnails are generated via Lambda+ffmpeg from S3 videos

---

## What “working” means (acceptance criteria)

- **See upcoming meetings**: An upcoming event in `calendar_events` with a Zoom/Meet/Teams URL is detected.
- **Join automatically**: `auto-join-scheduler` deploys a bot shortly before start time and creates/updates DB rows.
- **Capture in S3**: On `bot.completed`, video/audio are stored under `meeting-recordings/...` in the S3 bucket and the DB has `recording_s3_key` + `recording_s3_url`.
- **Analyze with AI**: `process-recording` updates `recordings.summary`, `highlights`, `action_items`, `speakers` (and optional metrics).
- **Create thumbnail**: `generate-s3-video-thumbnail` writes `thumbnail_s3_key` + `thumbnail_url` (real frame or placeholder).

---

## Deploy prerequisites (local machine)

- Supabase CLI installed and authenticated:
  - Run `supabase login`
- Your `.env` / `.env.staging` contains:
  - `SUPABASE_DATABASE_PASSWORD` (used for migration deploy)

---

## Staging deployment commands

### Migrations + Edge Functions (staging)

```bash
cd /Users/andrewbryce/Documents/sixty-sales-dashboard && \
supabase login && \
set -a && source .env.staging && set +a && \
export SUPABASE_DB_PASSWORD_STAGING="$SUPABASE_DATABASE_PASSWORD" && \
./scripts/deploy-migrations.sh staging && \
./scripts/deploy-functions-staging.sh
```

### Production deployment commands

Only after staging is green:

```bash
cd /Users/andrewbryce/Documents/sixty-sales-dashboard && \
supabase login && \
set -a && source .env && set +a && \
export SUPABASE_DB_PASSWORD_PRODUCTION="$SUPABASE_DATABASE_PASSWORD" && \
./scripts/deploy-migrations.sh production --force && \
./scripts/deploy-functions-production.sh --force
```

---

## Critical DB/schema notes

### New migrations added for MeetingBaaS completeness

These are the migrations that ensure `60_notetaker` rows can be created and updated cleanly:
- `supabase/migrations/20260122000002_add_60_notetaker_meetings_support.sql`
  - Allows `meetings.source_type = '60_notetaker'`
  - Makes `meetings.fathom_recording_id` nullable (required for non-Fathom sources)
  - Adds meeting fields used by bots and thumbnails (bot id, S3 keys, processing status, etc.)
- `supabase/migrations/20260122000003_add_recordings_ai_metrics_and_thumbnails.sql`
  - Adds `recordings.thumbnail_*` and AI metric columns that functions already write
- `supabase/migrations/20260122000004_schedule_auto_join_scheduler.sql`
  - Schedules the auto-join scheduler (cron)

---

## Required Supabase Edge Function secrets (Dashboard → Edge Functions → Secrets)

### Supabase (always required for server-side jobs)
- `SUPABASE_URL`
- `SUPABASE_SERVICE_ROLE_KEY`

### MeetingBaaS
- `MEETINGBAAS_API_KEY`
- `MEETINGBAAS_WEBHOOK_SECRET` (signature verification secret used by `meetingbaas-webhook`)

### AWS S3 (recordings + thumbnails)
- `AWS_REGION` (commonly `eu-west-2`)
- `AWS_S3_BUCKET` (commonly `use60-application`)
- `AWS_ACCESS_KEY_ID`
- `AWS_SECRET_ACCESS_KEY`

### Thumbnail Lambda integration
- `AWS_LAMBDA_THUMBNAIL_URL`
- `AWS_LAMBDA_API_KEY` (optional; only if your Lambda endpoint is protected via API key)

### AI (optional but recommended)
- `OPENAI_API_KEY`
  - If missing, `process-recording` falls back to basic analysis (still “works” but lower quality)

### Transcription (optional)
- `GLADIA_API_KEY`
  - Only required if org config selects Gladia. Default path uses MeetingBaaS transcript.

---

## Required Supabase Vault secret (for cron calling edge function)

The helper SQL function `public.call_auto_join_scheduler()` calls the edge function using a bearer token from Vault:

- Vault secret name: `service_role_key`
- Vault secret value: your Supabase project service role key

Set it via Supabase Dashboard:
- Settings → Vault → New Secret

---

## MeetingBaaS dashboard configuration (webhook)

You must configure the webhook URL inside MeetingBaaS; otherwise recordings will get stuck at `bot_joining` / `recording` states and never progress.

### Webhook URL
- Staging:
  - `https://caerqjzvuerejfrdtygb.supabase.co/functions/v1/meetingbaas-webhook`
- Production:
  - `https://ygdpgliavpxeugaajgrb.supabase.co/functions/v1/meetingbaas-webhook`

### Events to subscribe to (minimum viable)
- `bot.status_change`
- `bot.completed`

### Verification
Use the `webhook_events` table to confirm deliveries (see “SQL probes” section).

---

## Lambda requirements (thumbnail generation)

The edge function `supabase/functions/generate-s3-video-thumbnail/index.ts` does **not** run ffmpeg. It reuses the existing Fathom thumbnail Lambda by generating presigned S3 URLs.

### How it works

1. Edge function generates a presigned URL for the S3 video (15 min expiry)
2. Sends the presigned URL to Lambda as `fathom_url` (Lambda accepts any video URL)
3. Lambda extracts frame with ffmpeg, uploads thumbnail to S3
4. Returns `http_url` and `s3_location`

### Request contract (edge → lambda)

Lambda receives:

```json
{
  "fathom_url": "https://s3.eu-west-2.amazonaws.com/use60-application/meeting-recordings/...?X-Amz-Signature=...",
  "timestamp_seconds": 30
}
```

### Response contract (lambda → edge)

Lambda returns `200` JSON containing:
- `http_url` - Public URL to the generated thumbnail
- `s3_location` - S3 key where thumbnail was stored

Example:

```json
{
  "http_url": "https://use60-thumbnails.s3.eu-west-2.amazonaws.com/thumbnails/abc123.jpg",
  "s3_location": "thumbnails/abc123.jpg"
}
```

### Default Lambda URL

If `AWS_LAMBDA_THUMBNAIL_URL` is not set, the edge function falls back to:
```
https://pnip1dhixe.execute-api.eu-west-2.amazonaws.com/fathom-thumbnail-generator/thumbnail
```

This is the existing Fathom thumbnail Lambda that works with any video URL.

### Fallback behavior

If Lambda fails or is not configured, the edge function generates a placeholder SVG thumbnail with:
- Meeting title initial in a colored background
- Text: "60 Notetaker Recording"
- Stored at: `meeting-thumbnails/{orgId}/{recordingId}/placeholder.svg`

---

## End-to-end test plan (recommended sequence)

### 1) Confirm Google Calendar sync is populating `calendar_events`

- Make sure Google integration is connected in the app.
- Ensure the calendar event appears in `calendar_events` with:
  - `start_time`, `end_time`
  - `meeting_url` populated

### 2) Enable Notetaker (org + user)

In the app (Notetaker settings UI):
- Org must have `organizations.recording_settings.recordings_enabled = true`
- Auto-join must be enabled: `organizations.recording_settings.auto_record_enabled = true`
- User must have:
  - `notetaker_user_settings.is_enabled = true`
  - `selected_calendar_id` set (use `primary` to watch all)
  - choose external/internal preferences:
    - `auto_record_external`
    - `auto_record_internal`

### 3) Create a calendar event for testing

Create a calendar event starting soon:
- Start time: **3–5 minutes from now**
- Add a valid meeting URL:
  - Google Meet / Zoom / Teams
- If testing “external-only” filtering, invite at least one external email (e.g. gmail).

### 4) Watch auto-join happen

Expected DB changes:
- `recordings` row created:
  - `calendar_event_id`, `meeting_url`, `meeting_platform`, `bot_id`, `status = bot_joining`
- `bot_deployments` row created:
  - `status = joining`, then progresses with webhook updates
- `meetings` unified row created:
  - `source_type = '60_notetaker'`, `bot_id`, `recording_id`, `processing_status`

### 5) End the meeting and verify recording upload + processing

Expected webhook flow:
- `bot.status_change`: joining → in_meeting → leaving
- `bot.completed`:
  - downloads meeting recording from MeetingBaaS
  - uploads to S3
  - updates DB with `recording_s3_key` + `recording_s3_url`
  - triggers `process-recording`

Expected processing:
- `process-recording` sets:
  - transcript fields (`transcript_json` / `transcript_text`)
  - AI fields (`summary`, `highlights`, `action_items`, `speakers`)
  - `status = ready` (or `failed` with `error_message`)

### 6) Verify thumbnail generation

Expected:
- `generate-s3-video-thumbnail` updates:
  - `recordings.thumbnail_s3_key` + `recordings.thumbnail_url`
  - and/or `meetings.thumbnail_*` for the unified row

If Lambda fails, the function writes a placeholder thumbnail SVG into:
- `meeting-thumbnails/{orgId}/{recordingId}/placeholder.svg`

---

## SQL probes (copy/paste)

### Webhook deliveries

```sql
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
LIMIT 50;
```

### Bot deployment status

```sql
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

### Recording status + S3 fields

```sql
SELECT
  id,
  meeting_title,
  status,
  error_message,
  recording_s3_key,
  recording_s3_url,
  thumbnail_s3_key,
  thumbnail_url,
  created_at,
  updated_at
FROM recordings
WHERE bot_id = 'YOUR_BOT_ID'
ORDER BY created_at DESC;
```

### Unified meeting row (60_notetaker)

```sql
SELECT
  id,
  source_type,
  bot_id,
  recording_id,
  processing_status,
  recording_s3_key,
  recording_s3_url,
  thumbnail_s3_key,
  thumbnail_url,
  created_at,
  updated_at
FROM meetings
WHERE source_type = '60_notetaker'
ORDER BY created_at DESC
LIMIT 20;
```

---

## Troubleshooting cheatsheet

- **No bot joins**:
  - Check `organizations.recording_settings.auto_record_enabled = true`
  - Check `notetaker_user_settings.is_enabled = true`
  - Check `calendar_events.meeting_url` is non-null and valid
  - Check cron is scheduled + Vault secret is set
- **Bots join but no processing / stuck in bot_joining**:
  - MeetingBaaS webhook not configured (or wrong environment URL)
  - `MEETINGBAAS_WEBHOOK_SECRET` mismatch
  - Confirm `webhook_events` rows appear
- **Recording exists but no S3 URL**:
  - Missing AWS creds in edge function secrets
  - S3 permissions issue (check function logs for AccessDenied)
- **No thumbnails**:
  - `AWS_LAMBDA_THUMBNAIL_URL` not set
  - Lambda returns non-200 or missing `thumbnail_s3_key`
  - Lambda IAM missing `GetObject`/`PutObject`

---

## Next stage development (recommended hardening)

### Reliability & idempotency
- Ensure webhook handlers are idempotent:
  - multiple `bot.completed` events should not duplicate uploads/processing
- Add explicit retries for:
  - MeetingBaaS fetch failures (temporary)
  - Lambda thumbnail generation

### Observability
- Add log markers or a small “pipeline status” view:
  - `bot joined` → `completed` → `uploaded` → `processed` → `thumbnail done`

### UX improvements
- Show a clear status timeline in the UI for 60 Notetaker recordings.
- Add a “test join now” admin button that:
  - calls `deploy-recording-bot` for a provided URL
  - shows the bot_id and links to logs

