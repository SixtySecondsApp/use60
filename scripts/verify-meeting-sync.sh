#!/usr/bin/env bash
# Verify meeting → Railway sync pipeline
# Run: ./scripts/verify-meeting-sync.sh [staging|production]

set -e
ENV="${1:-production}"

if [[ "$ENV" == "staging" ]]; then
  SUPABASE_URL="https://caerqjzvuerejfrdtygb.supabase.co"
  PROJECT_REF="caerqjzvuerejfrdtygb"
else
  SUPABASE_URL="https://ygdpgliavpxeugaajgrb.supabase.co"
  PROJECT_REF="ygdpgliavpxeugaajgrb"
fi

echo "=== Meeting → Railway Sync Verification ($ENV) ==="
echo "Supabase URL: $SUPABASE_URL"
echo ""

echo "1. Health check (meeting-analytics / Railway connectivity)"
HEALTH=$(curl -s "${SUPABASE_URL}/functions/v1/meeting-analytics/health" 2>/dev/null || echo '{"error":"request failed"}')
echo "$HEALTH" | head -c 500
echo ""
if echo "$HEALTH" | grep -q '"database":"connected"'; then
  echo "   ✓ Railway database connected"
elif echo "$HEALTH" | grep -q '"database":"disconnected"'; then
  echo "   ✗ Railway database disconnected - check RAILWAY_DATABASE_URL in Edge Function secrets"
elif echo "$HEALTH" | grep -q 'Cannot GET'; then
  echo "   ⚠ Health route may need deploy (path parsing fix in helpers.ts)"
else
  echo "   ? Unexpected response"
fi
echo ""

echo "2. Next steps (manual)"
echo "   - Run SQL in Supabase Dashboard → SQL Editor (see scripts/verify-meeting-railway-sync.md)"
echo "   - Check system_config.supabase_url, vault service_role, trigger existence"
echo "   - Deploy meeting-analytics: npx supabase functions deploy meeting-analytics --project-ref $PROJECT_REF"
echo ""
