#!/bin/bash
# Check what HubSpot integrations exist in staging database

echo "🔍 Checking HubSpot integrations in staging database..."
echo ""

SUPABASE_URL="https://caerqjzvuerejfrdtygb.supabase.co"
ANON_KEY="eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImNhZXJxanp2dWVyZWpmcmR0eWdiIiwicm9sZSI6ImFub24iLCJpYXQiOjE3Njc5NDkyMjcsImV4cCI6MjA4MzUyNTIyN30.a_6b9Ojfm32MAprq_spkN7kQkdy1XCcPsv19psYMahg"
SERVICE_KEY="eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImNhZXJxanp2dWVyZWpmcmR0eWdiIiwicm9sZSI6InNlcnZpY2Vfcm9sZSIsImlhdCI6MTc2Nzk0OTIyNywiZXhwIjoyMDgzNTI1MjI3fQ.vZn5nVNIllQBoRgf9_gFTKwrFoakOUJ8VNJ4nnHUnko"

echo "Active HubSpot integrations:"
echo "----------------------------"
curl -s -X GET \
  "$SUPABASE_URL/rest/v1/hubspot_org_integrations?select=id,org_id,is_active,is_connected,hubspot_portal_id,created_at&order=created_at.desc" \
  -H "apikey: $ANON_KEY" \
  -H "Authorization: Bearer $SERVICE_KEY" | jq '.'

echo ""
echo "Organizations in database:"
echo "-------------------------"
curl -s -X GET \
  "$SUPABASE_URL/rest/v1/organizations?select=id,name,created_at&order=created_at.desc&limit=5" \
  -H "apikey: $ANON_KEY" \
  -H "Authorization: Bearer $SERVICE_KEY" | jq '.'
