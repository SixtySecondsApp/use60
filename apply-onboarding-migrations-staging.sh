#!/bin/bash

# Staging database credentials from .env.staging
DB_HOST="aws-0-eu-west-1.pooler.supabase.com"
DB_PORT="5432"
DB_NAME="postgres"
DB_USER="postgres.caerqjzvuerejfrdtygb"
DB_PASSWORD="Gi7JO1tz2NupAzHt"

echo "🚀 Applying onboarding bug fix migrations to STAGING database..."
echo "   Database: $DB_HOST"
echo "   User: $DB_USER"
echo ""

# Array of migrations to apply
migrations=(
  "20260205130000_fix_join_requests_rls_member_status.sql"
  "20260205130100_fix_join_requests_rpc_member_status.sql"
  "20260205140000_add_org_deletion_scheduler.sql"
  "20260205140100_rpc_deactivate_organization_by_owner.sql"
  "20260205150000_fix_fuzzy_matching_active_members.sql"
)

migration_count=${#migrations[@]}
success_count=0
failed_count=0

for i in "${!migrations[@]}"; do
  migration="${migrations[$i]}"
  migration_num=$((i + 1))

  echo "📝 Migration $migration_num/$migration_count: $migration"

  # Check if file exists
  if [ ! -f "supabase/migrations/$migration" ]; then
    echo "   ⚠️  File not found, skipping..."
    echo ""
    continue
  fi

  # Apply migration
  PGPASSWORD=$DB_PASSWORD psql -h $DB_HOST -p $DB_PORT -U $DB_USER -d $DB_NAME -f "supabase/migrations/$migration" 2>&1 | while read line; do
    # Filter out notices and show only errors
    if [[ $line == ERROR* ]] || [[ $line == FATAL* ]]; then
      echo "   ❌ $line"
    elif [[ $line == NOTICE* ]]; then
      # Show success notices
      if [[ $line == *"✅"* ]]; then
        echo "   $line"
      fi
    fi
  done

  if [ ${PIPESTATUS[0]} -eq 0 ]; then
    echo "   ✅ Migration $migration_num applied successfully"
    ((success_count++))
  else
    echo "   ❌ Migration $migration_num failed"
    ((failed_count++))
    echo ""
    echo "❌ Stopping due to migration failure"
    exit 1
  fi

  echo ""
done

echo ""
echo "✨ Migration Summary:"
echo "   Total: $migration_count"
echo "   Success: $success_count"
echo "   Failed: $failed_count"
echo ""

if [ $failed_count -eq 0 ]; then
  echo "🎉 All migrations applied successfully!"
  echo ""
  echo "🧪 Next steps:"
  echo "   1. Test onboarding flow with company website"
  echo "   2. Verify no auto-join (should create join request)"
  echo "   3. Test empty org filtering"
  echo "   4. Check error messages are user-friendly"
else
  echo "⚠️  Some migrations failed. Please review errors above."
  exit 1
fi
