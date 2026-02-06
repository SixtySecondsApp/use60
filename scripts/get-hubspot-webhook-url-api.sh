#!/bin/bash
# Get HubSpot webhook URL using Supabase REST API

echo "🔍 Fetching HubSpot webhook configuration for staging (via API)..."
echo ""

# Load environment variables
source .env.staging

if [ -z "$SUPABASE_SERVICE_ROLE_KEY" ]; then
  echo "❌ SUPABASE_SERVICE_ROLE_KEY not found in .env.staging"
  exit 1
fi

# Query using Supabase REST API
RESPONSE=$(curl -s -X GET \
  "https://caerqjzvuerejfrdtygb.supabase.co/rest/v1/hubspot_org_integrations?is_active=eq.true&select=webhook_token&order=created_at.desc&limit=1" \
  -H "apikey: $VITE_SUPABASE_ANON_KEY" \
  -H "Authorization: Bearer $SUPABASE_SERVICE_ROLE_KEY")

WEBHOOK_TOKEN=$(echo "$RESPONSE" | jq -r '.[0].webhook_token' 2>/dev/null)

if [ -z "$WEBHOOK_TOKEN" ] || [ "$WEBHOOK_TOKEN" == "null" ]; then
  echo "❌ No webhook token found. Make sure HubSpot is connected."
  echo ""
  echo "Response from API:"
  echo "$RESPONSE"
  echo ""
  echo "💡 Tip: Connect HubSpot in your app first at http://localhost:5175/integrations"
  exit 1
fi

echo "✅ Webhook Token: $WEBHOOK_TOKEN"
echo ""
echo "📋 Add this URL in HubSpot Developer Portal:"
echo "   https://caerqjzvuerejfrdtygb.supabase.co/functions/v1/hubspot-webhook?token=$WEBHOOK_TOKEN"
echo ""
echo "📍 Where to add it:"
echo "   1. Go to: https://app.hubspot.com/developer/26435907/webhook-subscriptions"
echo "   2. Click 'Create subscription'"
echo "   3. Paste the URL above as the webhook endpoint"
echo "   4. Select the events you want to track (contacts, deals, etc.)"
echo ""
