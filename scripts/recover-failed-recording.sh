#!/bin/bash

# Recover Failed Recording
# This script manually kicks off async processing for the failed recording
# Uses the audio URL from the webhook payload (valid for 4 hours)

set -e

BOT_ID="${1:-28609cd5-feee-4d32-ba27-bc1f21b0cae5}"
AUDIO_URL="${2}"

if [ -z "$AUDIO_URL" ]; then
  echo "❌ Usage: $0 <bot_id> <audio_url>"
  echo ""
  echo "Example:"
  echo "  $0 28609cd5... 'https://meeting-baas-v2-artifacts.s3.fr-par.scw.cloud/...'"
  echo ""
  echo "⚠️  Audio URL from webhook payload (expires after 4 hours)"
  exit 1
fi

# Load environment variables
if [ -f .env.staging ]; then
  # Extract only the critical variables we need
  export SUPABASE_URL=$(grep "^SUPABASE_URL=" .env.staging | cut -d= -f2)
  export SUPABASE_SERVICE_ROLE_KEY=$(grep "^SUPABASE_SERVICE_ROLE_KEY=" .env.staging | cut -d= -f2)
  export GLADIA_API_KEY=$(grep "^GLADIA_API_KEY=" .env.staging | cut -d= -f2)
fi

echo "🔧 Recovering recording for bot_id: $BOT_ID"
echo ""

# Step 1: Find recording ID
echo "📋 Step 1: Looking up recording ID..."
RECORDING_ID=$(curl -s "${SUPABASE_URL}/rest/v1/bot_deployments?bot_id=eq.${BOT_ID}&select=recording_id" \
  -H "apikey: ${SUPABASE_SERVICE_ROLE_KEY}" \
  -H "Authorization: Bearer ${SUPABASE_SERVICE_ROLE_KEY}" \
  | jq -r '.[0].recording_id')

if [ "$RECORDING_ID" == "null" ] || [ -z "$RECORDING_ID" ]; then
  echo "❌ No recording found for bot_id: $BOT_ID"
  exit 1
fi

echo "✅ Found recording: $RECORDING_ID"
echo ""

# Step 2: Upload to S3 first (since webhook upload failed)
echo "📦 Step 2: Uploading audio to S3..."
# This would require implementing a separate upload script
# For now, we'll skip this and use the audio URL directly
echo "⚠️  Skipping S3 upload - using MeetingBaaS URL directly"
echo "    (URL expires in 4 hours from webhook receipt)"
echo ""

# Step 3: Request async transcription from Gladia
echo "🎙️  Step 3: Requesting Gladia transcription..."

# Encode recording_id and bot_id in callback URL (Gladia doesn't support metadata field)
CALLBACK_URL="${SUPABASE_URL}/functions/v1/process-gladia-webhook?recording_id=${RECORDING_ID}&bot_id=${BOT_ID}"

GLADIA_RESPONSE=$(curl -s -X POST "https://api.gladia.io/v2/transcription" \
  -H "x-gladia-key: ${GLADIA_API_KEY}" \
  -H "Content-Type: application/json" \
  -d "{
    \"audio_url\": \"${AUDIO_URL}\",
    \"diarization\": true,
    \"diarization_config\": {
      \"min_speakers\": 2,
      \"max_speakers\": 10
    },
    \"callback_url\": \"${CALLBACK_URL}\"
  }")

GLADIA_JOB_ID=$(echo "$GLADIA_RESPONSE" | jq -r '.id')
GLADIA_RESULT_URL=$(echo "$GLADIA_RESPONSE" | jq -r '.result_url')

if [ "$GLADIA_JOB_ID" == "null" ] || [ -z "$GLADIA_JOB_ID" ]; then
  echo "❌ Gladia transcription request failed:"
  echo "$GLADIA_RESPONSE" | jq '.'
  exit 1
fi

echo "✅ Gladia job started: $GLADIA_JOB_ID"
echo "   Result URL: $GLADIA_RESULT_URL"
echo ""

# Step 4: Update recording status
echo "📊 Step 4: Updating recording status..."
curl -s -X PATCH "${SUPABASE_URL}/rest/v1/recordings?id=eq.${RECORDING_ID}" \
  -H "apikey: ${SUPABASE_SERVICE_ROLE_KEY}" \
  -H "Authorization: Bearer ${SUPABASE_SERVICE_ROLE_KEY}" \
  -H "Content-Type: application/json" \
  -H "Prefer: return=minimal" \
  -d "{
    \"status\": \"transcribing\",
    \"gladia_job_id\": \"${GLADIA_JOB_ID}\",
    \"gladia_result_url\": \"${GLADIA_RESULT_URL}\",
    \"transcription_started_at\": \"$(date -u +"%Y-%m-%dT%H:%M:%SZ")\"
  }" > /dev/null

echo "✅ Recording status updated to 'transcribing'"
echo ""

echo "✨ Recovery initiated!"
echo ""
echo "📝 What happens next:"
echo "   1. Gladia transcribes the audio (~5-10 min for 30min recording)"
echo "   2. Gladia webhook fires when done"
echo "   3. Transcript saved to database"
echo "   4. AI analysis runs automatically"
echo "   5. Recording status → 'ready'"
echo ""
echo "🔍 Monitor progress:"
echo "   supabase functions logs process-gladia-webhook --project-ref caerqjzvuerejfrdtygb"
echo ""
echo "   Or check database:"
echo "   SELECT id, status, gladia_job_id, created_at, updated_at"
echo "   FROM recordings WHERE id = '${RECORDING_ID}';"
