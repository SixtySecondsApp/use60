#!/bin/bash

# Force fetch transcripts by calling the fetch-transcript edge function directly

echo "🚀 Force Fetching Transcripts for Recent Meetings"
echo "================================================="
echo ""

SUPABASE_URL=$(grep "VITE_SUPABASE_URL" .env.local | cut -d '=' -f2)
SERVICE_ROLE_KEY=$(grep "VITE_SUPABASE_SERVICE_ROLE_KEY" .env.local | cut -d '=' -f2)

if [ -z "$SUPABASE_URL" ] || [ -z "$SERVICE_ROLE_KEY" ]; then
    echo "❌ Error: Could not find Supabase credentials in .env.local"
    exit 1
fi

echo "1️⃣  Finding meetings without transcripts..."
MEETINGS=$(curl -s -X GET "${SUPABASE_URL}/rest/v1/meetings?select=id,title,fathom_recording_id,meeting_start,owner_user_id&transcript_text=is.null&order=meeting_start.desc&limit=10" \
  -H "apikey: ${SERVICE_ROLE_KEY}" \
  -H "Authorization: Bearer ${SERVICE_ROLE_KEY}")

COUNT=$(echo "$MEETINGS" | jq 'length')
echo "   Found ${COUNT} meetings without transcripts"
echo ""

if [ "$COUNT" -eq 0 ]; then
    echo "✅ All meetings have transcripts!"
    exit 0
fi

echo "Meetings to fetch:"
echo "$MEETINGS" | jq -r '.[] | "   📅 \(.title) - \(.meeting_start | split("T")[0])"'
echo ""

read -p "Fetch transcripts for these meetings? (y/n): " -n 1 -r
echo ""

if [[ ! $REPLY =~ ^[Yy]$ ]]; then
    echo "❌ Cancelled"
    exit 0
fi

echo ""
echo "2️⃣  Fetching transcripts..."
echo ""

SUCCESS=0
FAILED=0

echo "$MEETINGS" | jq -c '.[]' | while read -r meeting; do
    MEETING_ID=$(echo "$meeting" | jq -r '.id')
    TITLE=$(echo "$meeting" | jq -r '.title')
    OWNER_ID=$(echo "$meeting" | jq -r '.owner_user_id')

    echo "📄 Fetching: $TITLE"

    # Call fetch-transcript edge function
    RESULT=$(curl -s -X POST "${SUPABASE_URL}/functions/v1/fetch-router" \
      -H "Authorization: Bearer ${SERVICE_ROLE_KEY}" \
      -H "apikey: ${SERVICE_ROLE_KEY}" \
      -H "x-service-role-key: ${SERVICE_ROLE_KEY}" \
      -H "Content-Type: application/json" \
      -d "{\"action\": \"transcript\", \"meetingId\": \"${MEETING_ID}\", \"user_id\": \"${OWNER_ID}\"}")

    # Check if successful
    SUCCESS_CHECK=$(echo "$RESULT" | jq -r '.success // false')

    if [ "$SUCCESS_CHECK" == "true" ]; then
        TRANSCRIPT_LENGTH=$(echo "$RESULT" | jq -r '.transcript | length')
        echo "   ✅ Success! Fetched ${TRANSCRIPT_LENGTH} characters"
        ((SUCCESS++))
    else
        ERROR_MSG=$(echo "$RESULT" | jq -r '.error // "Unknown error"')
        echo "   ❌ Failed: $ERROR_MSG"
        ((FAILED++))
    fi

    # Small delay
    sleep 1
done

echo ""
echo "✅ Done!"
echo "   Success: ${SUCCESS}"
echo "   Failed: ${FAILED}"
echo ""

# Verify results
echo "3️⃣  Verifying results..."
sleep 2

NEW_STATUS=$(curl -s -X GET "${SUPABASE_URL}/rest/v1/meetings?select=id,title,transcript_text&transcript_text=is.null&order=meeting_start.desc&limit=10" \
  -H "apikey: ${SERVICE_ROLE_KEY}" \
  -H "Authorization: Bearer ${SERVICE_ROLE_KEY}")

NEW_COUNT=$(echo "$NEW_STATUS" | jq 'length')
echo "   Meetings still without transcripts: ${NEW_COUNT}"

if [ "$NEW_COUNT" -lt "$COUNT" ]; then
    FIXED=$((COUNT - NEW_COUNT))
    echo "   📊 Successfully fetched ${FIXED} transcript(s)!"
fi
