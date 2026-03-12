#!/bin/bash
# =============================================================================
# SMOKE TEST STAGING
# =============================================================================
# Hits critical endpoints on staging to verify deployment health.
# Returns exit code 0 if all pass, 1 if any fail.
#
# Usage: ./scripts/smoke-test-staging.sh
# =============================================================================

set -uo pipefail

STAGING_URL="https://caerqjzvuerejfrdtygb.supabase.co"
TIMEOUT=30
PASSED=0
FAILED=0
RESULTS=""

check_endpoint() {
  local name="$1"
  local url="$2"
  local expected_status="${3:-200}"

  HTTP_STATUS=$(curl -s -o /dev/null -w "%{http_code}" --max-time "$TIMEOUT" "$url" 2>/dev/null || echo "000")

  if [ "$HTTP_STATUS" = "$expected_status" ]; then
    RESULTS="$RESULTS\n| $name | $HTTP_STATUS | PASS |"
    PASSED=$((PASSED + 1))
  else
    RESULTS="$RESULTS\n| $name | $HTTP_STATUS (expected $expected_status) | FAIL |"
    FAILED=$((FAILED + 1))
  fi
}

echo "Running smoke tests against staging..."
echo ""

# Health endpoint (verify_jwt=false)
check_endpoint "health" "$STAGING_URL/functions/v1/health"

# Demo research endpoint (verify_jwt=false, public)
check_endpoint "demo-research" "$STAGING_URL/functions/v1/demo-research" "200"

# Analytics web vitals (verify_jwt=false)
check_endpoint "analytics-web-vitals" "$STAGING_URL/functions/v1/analytics-web-vitals" "200"

# Landing form handler (verify_jwt=false)
check_endpoint "handle-landing-form-submission" "$STAGING_URL/functions/v1/handle-landing-form-submission" "405"

echo ""
echo "| Endpoint | Status | Result |"
echo "|----------|--------|--------|"
echo -e "$RESULTS"
echo ""
echo "Passed: $PASSED / $((PASSED + FAILED))"

if [ "$FAILED" -gt 0 ]; then
  echo "WARNING: $FAILED endpoint(s) failed smoke test"
  exit 1
else
  echo "All smoke tests passed"
  exit 0
fi
