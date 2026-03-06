#!/usr/bin/env bash
# Generate a new Supabase migration file with a proper timestamp.
#
# Usage:
#   ./scripts/new-migration.sh add_user_preferences
#   ./scripts/new-migration.sh "fix rls policies on deals"
#
# Output:
#   supabase/migrations/20260306143022_add_user_preferences.sql

set -euo pipefail

if [ $# -eq 0 ]; then
  echo "Usage: $0 <description>"
  echo "  Example: $0 add_user_preferences"
  exit 1
fi

# Sanitise description: lowercase, underscores, no special chars
DESC=$(echo "$*" | tr '[:upper:]' '[:lower:]' | tr ' -' '_' | tr -cd 'a-z0-9_')

TIMESTAMP=$(date -u +"%Y%m%d%H%M%S")
FILENAME="supabase/migrations/${TIMESTAMP}_${DESC}.sql"

cat > "$FILENAME" << 'SQL'
-- Migration: DESCRIPTION
-- Date: TIMESTAMP_PLACEHOLDER
--
-- What this migration does:
--   <describe the change>
--
-- Rollback strategy:
--   <how to reverse if needed, or "N/A — additive only">

SQL

# Replace placeholders
if [[ "$OSTYPE" == "darwin"* ]]; then
  sed -i '' "s/DESCRIPTION/${DESC}/g; s/TIMESTAMP_PLACEHOLDER/${TIMESTAMP}/g" "$FILENAME"
else
  sed -i "s/DESCRIPTION/${DESC}/g; s/TIMESTAMP_PLACEHOLDER/${TIMESTAMP}/g" "$FILENAME"
fi

echo "Created: $FILENAME"
echo ""
echo "Next steps:"
echo "  1. Write your SQL in the file"
echo "  2. Test locally:  npx supabase db push --linked --dry-run"
echo "  3. Commit & push:  git add $FILENAME && git commit"
echo "  4. CI validates on PR, auto-applies on merge"
