#!/bin/bash
# Clean up the old HubSpot integration and prepare for fresh connection

echo "🧹 Cleaning up old HubSpot integration..."
echo ""

SUPABASE_URL="https://caerqjzvuerejfrdtygb.supabase.co"
SERVICE_KEY="eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImNhZXJxanp2dWVyZWpmcmR0eWdiIiwicm9sZSI6InNlcnZpY2Vfcm9sZSIsImlhdCI6MTc2Nzk0OTIyNywiZXhwIjoyMDgzNTI1MjI3fQ.vZn5nVNIllQBoRgf9_gFTKwrFoakOUJ8VNJ4nnHUnko"
ANON_KEY="eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImNhZXJxanp2dWVyZWpmcmR0eWdiIiwicm9sZSI6ImFub24iLCJpYXQiOjE3Njc5NDkyMjcsImV4cCI6MjA4MzUyNTIyN30.a_6b9Ojfm32MAprq_spkN7kQkdy1XCcPsv19psYMahg"

echo "Step 1: Delete old HubSpot integration record (production portal)"
echo "----------------------------------------------------------------"
curl -s -X DELETE \
  "$SUPABASE_URL/rest/v1/hubspot_org_integrations?id=eq.e5329bc9-e4f0-477c-b1fd-38d3506c03cf" \
  -H "apikey: $ANON_KEY" \
  -H "Authorization: Bearer $SERVICE_KEY" \
  -H "Prefer: return=representation"

echo "✅ Old integration deleted"
echo ""

echo "Step 2: Clean up related data"
echo "-----------------------------"

# Delete OAuth states
curl -s -X DELETE \
  "$SUPABASE_URL/rest/v1/hubspot_oauth_states?org_id=eq.1d1b4274-c9c4-4cb7-9efc-243c90c86f4c" \
  -H "apikey: $ANON_KEY" \
  -H "Authorization: Bearer $SERVICE_KEY" > /dev/null

# Delete sync queue
curl -s -X DELETE \
  "$SUPABASE_URL/rest/v1/hubspot_sync_queue?org_id=eq.1d1b4274-c9c4-4cb7-9efc-243c90c86f4c" \
  -H "apikey: $ANON_KEY" \
  -H "Authorization: Bearer $SERVICE_KEY" > /dev/null

# Delete webhook events
curl -s -X DELETE \
  "$SUPABASE_URL/rest/v1/hubspot_webhook_events?org_id=eq.1d1b4274-c9c4-4cb7-9efc-243c90c86f4c" \
  -H "apikey: $ANON_KEY" \
  -H "Authorization: Bearer $SERVICE_KEY" > /dev/null

echo "✅ Related data cleaned"
echo ""

echo "Step 3: Verify cleanup"
echo "---------------------"
REMAINING=$(curl -s -X GET \
  "$SUPABASE_URL/rest/v1/hubspot_org_integrations?select=count" \
  -H "apikey: $ANON_KEY" \
  -H "Authorization: Bearer $SERVICE_KEY" \
  -H "Prefer: count=exact" | jq -r '.[0].count')

echo "Remaining integrations: $REMAINING"
echo ""

echo "=========================================="
echo "✅ Cleanup Complete!"
echo "=========================================="
echo ""
echo "🎯 Next Steps:"
echo ""
echo "1. Refresh your app: http://localhost:5175/integrations"
echo "2. Click 'Connect HubSpot' to connect with NEW staging app (28338792)"
echo "3. Complete OAuth flow"
echo "4. Configure webhooks with the new token"
echo ""
