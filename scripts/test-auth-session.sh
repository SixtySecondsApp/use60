#!/bin/bash
# Test if your current session is valid

echo "🔐 Testing authentication session..."
echo ""

# Get credentials
SUPABASE_URL="https://caerqjzvuerejfrdtygb.supabase.co"
ANON_KEY="eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImNhZXJxanp2dWVyZWpmcmR0eWdiIiwicm9sZSI6ImFub24iLCJpYXQiOjE3Njc5NDkyMjcsImV4cCI6MjA4MzUyNTIyN30.a_6b9Ojfm32MAprq_spkN7kQkdy1XCcPsv19psYMahg"

echo "Testing Fathom OAuth initiate endpoint..."
echo "URL: $SUPABASE_URL/functions/v1/fathom-oauth-initiate"
echo ""

# Try to call the function (will fail without auth)
RESPONSE=$(curl -s -X POST \
  "$SUPABASE_URL/functions/v1/fathom-oauth-initiate" \
  -H "apikey: $ANON_KEY" \
  -H "Content-Type: application/json")

echo "Response without auth token:"
echo "$RESPONSE" | jq '.'
echo ""
echo "Expected: Should show 'Unauthorized: No valid session' error"
echo ""
echo "💡 To fix this:"
echo "1. Make sure you're logged into your app at http://localhost:5175"
echo "2. Open DevTools → Application → Local Storage → Check for 'sb-' keys"
echo "3. Make sure your session hasn't expired"
echo ""
echo "If you're logged in but still get 401:"
echo "- Try logging out and back in"
echo "- Clear browser cache/storage"
echo "- Check browser console for errors"
