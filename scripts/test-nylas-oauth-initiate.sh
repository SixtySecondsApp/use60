#!/usr/bin/env bash
# Test nylas-oauth-initiate edge function
# Usage: ./scripts/test-nylas-oauth-initiate.sh <JWT> [staging|production]
#
# Get JWT: Log into staging (https://staging.use60.com), open DevTools → Application → Local Storage,
# copy the supabase auth token, or use: JSON.parse(localStorage.getItem('sb-<project>-auth-token'))?.access_token

set -e
JWT="${1:?Usage: $0 <JWT> [staging|production]}"
ENV="${2:-staging}"

if [[ "$ENV" == "production" ]]; then
  SUPABASE_URL="https://ygdpgliavpxeugaajgrb.supabase.co"
else
  SUPABASE_URL="https://caerqjzvuerejfrdtygb.supabase.co"
fi

echo "=== Testing nylas-oauth-initiate ($ENV) ==="
echo "URL: $SUPABASE_URL/functions/v1/nylas-oauth-initiate"
echo ""

RESP=$(curl -s -w "\n%{http_code}" -X POST \
  "${SUPABASE_URL}/functions/v1/nylas-oauth-initiate" \
  -H "Authorization: Bearer $JWT" \
  -H "Content-Type: application/json" \
  -d '{"origin":"https://staging.use60.com"}')

HTTP_BODY=$(echo "$RESP" | head -n -1)
HTTP_CODE=$(echo "$RESP" | tail -n 1)

echo "HTTP $HTTP_CODE"
echo "$HTTP_BODY" | jq . 2>/dev/null || echo "$HTTP_BODY"
echo ""

if [[ "$HTTP_CODE" == "200" ]]; then
  AUTH_URL=$(echo "$HTTP_BODY" | jq -r '.authUrl // empty')
  if [[ -n "$AUTH_URL" && "$AUTH_URL" != "null" ]]; then
    echo "✓ Success: authUrl received"
    echo "  Open in browser: $AUTH_URL"
  else
    echo "✗ Unexpected: no authUrl in response"
    exit 1
  fi
else
  echo "✗ Failed (HTTP $HTTP_CODE)"
  exit 1
fi
