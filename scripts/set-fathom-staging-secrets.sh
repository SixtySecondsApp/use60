#!/bin/bash
# Set Fathom OAuth secrets for staging

echo "🎥 Setting Fathom OAuth secrets for staging..."
echo ""

export SUPABASE_PROJECT_REF=caerqjzvuerejfrdtygb

# Check if staging.use60.com exists or if we should use localhost
read -p "Does staging.use60.com exist and work? (y/n): " HAS_STAGING_DOMAIN

if [[ "$HAS_STAGING_DOMAIN" =~ ^[Yy]$ ]]; then
  REDIRECT_URI="https://staging.use60.com/oauth/fathom/callback"
  echo "Using staging domain: $REDIRECT_URI"
else
  REDIRECT_URI="http://localhost:5175/oauth/fathom/callback"
  echo "Using localhost: $REDIRECT_URI"
  echo "⚠️  Note: You'll need to add this redirect URI in your Fathom OAuth app settings"
fi

echo ""
echo "Setting secrets..."
supabase secrets set \
  FATHOM_CLIENT_ID=13dk59QYngycoXNNcfezY6AxqYYzMgTIImg2m9sdars \
  FATHOM_CLIENT_SECRET=yB3nh8FsDt-c73-dYrUoErBsACx1e6ZYvNE4uMKyKW4 \
  FATHOM_REDIRECT_URI="$REDIRECT_URI" \
  --project-ref $SUPABASE_PROJECT_REF

echo ""
echo "✅ Fathom secrets set successfully"
echo ""
echo "📋 Next Steps:"
echo "1. Go to your app: http://localhost:5175/integrations"
echo "2. Click 'Connect Fathom'"
echo "3. Complete OAuth flow"
echo ""
echo "🔗 Or use this direct OAuth URL:"
echo "https://fathom.video/external/v1/oauth2/authorize?client_id=13dk59QYngycoXNNcfezY6AxqYYzMgTIImg2m9sdars&redirect_uri=$(echo $REDIRECT_URI | jq -sRr @uri)&response_type=code&scope=public_api"
echo ""
