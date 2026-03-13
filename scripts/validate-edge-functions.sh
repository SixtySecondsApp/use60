#!/bin/bash
# =============================================================================
# VALIDATE EDGE FUNCTIONS
# =============================================================================
# Checks edge function source files for common issues:
# - Unpinned esm.sh imports (@supabase/supabase-js@2 without @2.43.4)
# - Missing CORS helper usage (legacy corsHeaders)
# - Raw .then() chains (should use async/await)
#
# Usage: ./scripts/validate-edge-functions.sh [function-name ...]
#        ./scripts/validate-edge-functions.sh  # validates all
# =============================================================================

set -uo pipefail

FUNCTIONS_DIR="supabase/functions"
WARNINGS=0
ERRORS=0
RESULTS=""

validate_function() {
  local func_dir="$1"
  local func_name=$(basename "$func_dir")
  local issues=""

  # Skip _shared directory
  [ "$func_name" = "_shared" ] && return

  # Check all .ts files in the function directory
  for ts_file in "$func_dir"/*.ts; do
    [ -f "$ts_file" ] || continue
    local filename=$(basename "$ts_file")

    # ERROR: Unpinned supabase-js import (resolves to broken @2.95.1)
    if grep -q "supabase-js@2'" "$ts_file" 2>/dev/null || \
       grep -q 'supabase-js@2"' "$ts_file" 2>/dev/null; then
      # Check it's not already pinned to @2.43.4
      if ! grep -q "supabase-js@2.43.4" "$ts_file" 2>/dev/null; then
        issues="$issues\n  ERROR: Unpinned @supabase/supabase-js@2 in $filename (must pin @2.43.4)"
        ERRORS=$((ERRORS + 1))
      fi
    fi

    # WARNING: Legacy corsHeaders usage
    if grep -q "corsHeaders" "$ts_file" 2>/dev/null; then
      if ! grep -q "getCorsHeaders" "$ts_file" 2>/dev/null; then
        issues="$issues\n  WARN: Legacy corsHeaders in $filename (use getCorsHeaders(req))"
        WARNINGS=$((WARNINGS + 1))
      fi
    fi

    # WARNING: .then() chains (prefer async/await)
    THEN_COUNT=$(grep -c "\.then(" "$ts_file" 2>/dev/null || true)
    if [ "$THEN_COUNT" -gt 2 ]; then
      issues="$issues\n  WARN: $THEN_COUNT .then() chains in $filename (prefer async/await)"
      WARNINGS=$((WARNINGS + 1))
    fi
  done

  if [ -n "$issues" ]; then
    RESULTS="$RESULTS\n$func_name:$issues"
  fi
}

# Determine which functions to validate
if [ $# -gt 0 ]; then
  # Validate specific functions
  for func_name in "$@"; do
    func_dir="$FUNCTIONS_DIR/$func_name"
    if [ -d "$func_dir" ]; then
      validate_function "$func_dir"
    else
      echo "Function not found: $func_name"
      ERRORS=$((ERRORS + 1))
    fi
  done
else
  # Validate all functions
  for func_dir in "$FUNCTIONS_DIR"/*/; do
    validate_function "$func_dir"
  done
fi

# Output results
if [ -n "$RESULTS" ]; then
  echo "Edge Function Validation Results:"
  echo -e "$RESULTS"
  echo ""
fi

echo "Errors: $ERRORS | Warnings: $WARNINGS"

# Exit with error only on ERRORS (unpinned imports), not warnings
if [ "$ERRORS" -gt 0 ]; then
  exit 1
else
  exit 0
fi
