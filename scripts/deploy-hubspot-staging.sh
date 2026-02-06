#!/bin/bash
# Complete HubSpot staging setup script

set -e  # Exit on any error

echo "🚀 Deploying HubSpot Integration to Staging"
echo "==========================================="
echo ""

# Set the project ref
export SUPABASE_PROJECT_REF=caerqjzvuerejfrdtygb

echo "Step 1/3: Setting all required secrets..."
echo "------------------------------------------"
supabase secrets set \
  SUPABASE_URL=https://caerqjzvuerejfrdtygb.supabase.co \
  SUPABASE_ANON_KEY=eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImNhZXJxanp2dWVyZWpmcmR0eWdiIiwicm9sZSI6ImFub24iLCJpYXQiOjE3Njc5NDkyMjcsImV4cCI6MjA4MzUyNTIyN30.a_6b9Ojfm32MAprq_spkN7kQkdy1XCcPsv19psYMahg \
  SUPABASE_SERVICE_ROLE_KEY=eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImNhZXJxanp2dWVyZWpmcmR0eWdiIiwicm9sZSI6InNlcnZpY2Vfcm9sZSIsImlhdCI6MTc2Nzk0OTIyNywiZXhwIjoyMDgzNTI1MjI3fQ.vZn5nVNIllQBoRgf9_gFTKwrFoakOUJ8VNJ4nnHUnko \
  HUBSPOT_CLIENT_ID=814e6221-e628-40fe-86ee-0788a43105e7 \
  HUBSPOT_CLIENT_SECRET=b66f937a-efc5-4734-8db2-a1d86481f233 \
  HUBSPOT_REDIRECT_URI=https://caerqjzvuerejfrdtygb.supabase.co/functions/v1/hubspot-oauth-callback \
  --project-ref $SUPABASE_PROJECT_REF

echo "✅ Secrets set successfully"
echo ""

echo "Step 2/3: Redeploying HubSpot edge functions..."
echo "-----------------------------------------------"
HUBSPOT_FUNCTIONS=(
  "hubspot-oauth-initiate"
  "hubspot-oauth-callback"
  "hubspot-admin"
  "hubspot-disconnect"
  "hubspot-token-refresh"
  "hubspot-webhook"
  "hubspot-process-queue"
)

for func in "${HUBSPOT_FUNCTIONS[@]}"; do
  echo "  Deploying $func..."
  supabase functions deploy "$func" --project-ref $SUPABASE_PROJECT_REF --no-verify-jwt
done

echo "✅ All functions deployed"
echo ""

echo "Step 3/3: Getting webhook URL..."
echo "--------------------------------"
sleep 2  # Give DB a moment to update

# Get webhook token
WEBHOOK_TOKEN=$(supabase db query \
  --project-ref $SUPABASE_PROJECT_REF \
  --output json \
  "SELECT webhook_token FROM hubspot_org_integrations WHERE is_active = true ORDER BY created_at DESC LIMIT 1;" \
  2>/dev/null | jq -r '.[0].webhook_token' 2>/dev/null)

echo ""
echo "=========================================="
echo "✅ HubSpot Staging Setup Complete!"
echo "=========================================="
echo ""
echo "📋 Next Steps:"
echo ""
echo "1. Connect HubSpot in your app:"
echo "   → Go to: http://localhost:5175/integrations"
echo "   → Click 'Connect HubSpot'"
echo ""
echo "2. Configure webhooks in HubSpot Developer Portal:"
echo "   → Go to: https://app.hubspot.com/developer/28338792/webhook-subscriptions"
echo "   → Click 'Create subscription'"

if [ -n "$WEBHOOK_TOKEN" ] && [ "$WEBHOOK_TOKEN" != "null" ]; then
  echo "   → Use this webhook URL:"
  echo "     https://caerqjzvuerejfrdtygb.supabase.co/functions/v1/hubspot-webhook?token=$WEBHOOK_TOKEN"
else
  echo "   → Webhook URL will be available after connecting HubSpot"
  echo "   → Run ./get-hubspot-webhook-url-api.sh to get it"
fi

echo ""
echo "3. Subscribe to these events:"
echo "   ✅ contact.propertyChange"
echo "   ✅ contact.creation"
echo "   ✅ deal.propertyChange"
echo "   ✅ deal.creation"
echo "   ✅ engagement.task.created (optional)"
echo ""
