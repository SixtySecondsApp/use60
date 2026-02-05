#!/bin/bash
# Set HubSpot environment variables for staging Supabase project

echo "Setting HubSpot secrets for staging project..."

# Set the project ref
export SUPABASE_PROJECT_REF=caerqjzvuerejfrdtygb

# Set HubSpot credentials (NEW Staging App ID: 28338792)
supabase secrets set \
  HUBSPOT_CLIENT_ID=814e6221-e628-40fe-86ee-0788a43105e7 \
  HUBSPOT_CLIENT_SECRET=b66f937a-efc5-4734-8db2-a1d86481f233 \
  HUBSPOT_REDIRECT_URI=https://caerqjzvuerejfrdtygb.supabase.co/functions/v1/hubspot-oauth-callback \
  --project-ref $SUPABASE_PROJECT_REF

echo "✅ HubSpot secrets set successfully"
echo "Note: Edge functions will pick up new secrets automatically"
