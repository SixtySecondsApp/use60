#!/bin/bash
# =============================================================================
# DETECT CHANGED EDGE FUNCTIONS
# =============================================================================
# Analyzes git diff to determine which edge functions need deployment.
# If _shared/ files changed, traces imports to find affected functions.
#
# Usage: ./scripts/detect-changed-functions.sh [base-branch]
# Output: JSON array of function names to deploy
#
# Examples:
#   ./scripts/detect-changed-functions.sh main
#   ./scripts/detect-changed-functions.sh origin/main
# =============================================================================

set -euo pipefail

BASE_BRANCH="${1:-origin/main}"
FUNCTIONS_DIR="supabase/functions"
SHARED_DIR="$FUNCTIONS_DIR/_shared"

# Get all changed files under supabase/functions/
CHANGED_FILES=$(git diff --name-only "$BASE_BRANCH"...HEAD -- "$FUNCTIONS_DIR/" 2>/dev/null || \
                git diff --name-only "$BASE_BRANCH" HEAD -- "$FUNCTIONS_DIR/" 2>/dev/null || \
                echo "")

if [ -z "$CHANGED_FILES" ]; then
  echo "[]"
  exit 0
fi

# Separate _shared/ changes from function changes
SHARED_CHANGES=""
FUNCTION_CHANGES=""

while IFS= read -r file; do
  if [[ "$file" == "$SHARED_DIR/"* ]]; then
    SHARED_CHANGES="$SHARED_CHANGES $file"
  elif [[ "$file" == "$FUNCTIONS_DIR/"* ]] && [[ "$file" != "$FUNCTIONS_DIR/_shared/"* ]]; then
    FUNCTION_CHANGES="$FUNCTION_CHANGES $file"
  fi
done <<< "$CHANGED_FILES"

# Collect function names from directly changed functions
declare -A DEPLOY_FUNCTIONS

for file in $FUNCTION_CHANGES; do
  # Extract function name: supabase/functions/<name>/... -> <name>
  FUNC_NAME=$(echo "$file" | sed "s|$FUNCTIONS_DIR/||" | cut -d'/' -f1)
  if [ -n "$FUNC_NAME" ] && [ "$FUNC_NAME" != "_shared" ]; then
    DEPLOY_FUNCTIONS["$FUNC_NAME"]=1
  fi
done

# If _shared/ changed, find all functions that import from changed _shared/ files
if [ -n "$SHARED_CHANGES" ]; then
  AFFECTED_COUNT=0

  for shared_file in $SHARED_CHANGES; do
    # Get the relative import path (e.g., _shared/edgeAuth.ts -> edgeAuth.ts, _shared/ai/index.ts -> ai/index.ts)
    RELATIVE_PATH=$(echo "$shared_file" | sed "s|$SHARED_DIR/||")
    # Also handle imports without extension
    RELATIVE_NO_EXT=$(echo "$RELATIVE_PATH" | sed 's/\.ts$//')

    # Search all function index.ts files for imports from this _shared/ file
    # Handles: '../_shared/edgeAuth.ts', '../_shared/edgeAuth', '../_shared/ai/index.ts'
    IMPORTING_FUNCTIONS=$(grep -rl "from.*['\"].*_shared/$RELATIVE_NO_EXT" "$FUNCTIONS_DIR"/*/index.ts 2>/dev/null || true)

    # Also check for barrel imports (e.g., import from '../_shared/ai/')
    if [[ "$RELATIVE_PATH" == */index.ts ]]; then
      DIR_PATH=$(dirname "$RELATIVE_PATH")
      BARREL_IMPORTS=$(grep -rl "from.*['\"].*_shared/$DIR_PATH" "$FUNCTIONS_DIR"/*/index.ts 2>/dev/null || true)
      IMPORTING_FUNCTIONS="$IMPORTING_FUNCTIONS $BARREL_IMPORTS"
    fi

    for func_file in $IMPORTING_FUNCTIONS; do
      FUNC_NAME=$(echo "$func_file" | sed "s|$FUNCTIONS_DIR/||" | cut -d'/' -f1)
      if [ -n "$FUNC_NAME" ] && [ "$FUNC_NAME" != "_shared" ]; then
        DEPLOY_FUNCTIONS["$FUNC_NAME"]=1
        AFFECTED_COUNT=$((AFFECTED_COUNT + 1))
      fi
    done
  done

  # If a shared file affects >200 functions, fall back to deploy-all
  UNIQUE_COUNT=${#DEPLOY_FUNCTIONS[@]}
  TOTAL_FUNCTIONS=$(ls -d "$FUNCTIONS_DIR"/*/ 2>/dev/null | grep -v "_shared" | wc -l | tr -d ' ')

  if [ "$UNIQUE_COUNT" -gt 200 ]; then
    echo '"ALL"'
    exit 0
  fi
fi

# Output as JSON array
if [ ${#DEPLOY_FUNCTIONS[@]} -eq 0 ]; then
  echo "[]"
else
  RESULT="["
  FIRST=true
  for func in "${!DEPLOY_FUNCTIONS[@]}"; do
    if [ "$FIRST" = true ]; then
      FIRST=false
    else
      RESULT="$RESULT,"
    fi
    RESULT="$RESULT\"$func\""
  done
  RESULT="$RESULT]"
  echo "$RESULT"
fi
