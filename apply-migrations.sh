#!/bin/bash

# Staging database credentials
DB_HOST="aws-0-eu-west-1.pooler.supabase.com"
DB_PORT="5432"
DB_NAME="postgres"
DB_USER="postgres.caerqjzvuerejfrdtygb"
DB_PASSWORD="Gi7JO1tz2NupAzHt"

echo "🚀 Applying migrations to STAGING database..."
echo ""

# Migration 1: Fix RLS policies
echo "📝 Migration 1: Fixing RLS policies"
echo "   Executing: 20260205130000_fix_join_requests_rls_member_status.sql"

# Drop existing policies
echo "DROP POLICY IF EXISTS \"org_admins_view_join_requests\" ON organization_join_requests;
DROP POLICY IF EXISTS \"org_admins_update_join_requests\" ON organization_join_requests;

CREATE POLICY \"org_admins_view_join_requests\"
  ON organization_join_requests
  FOR SELECT
  USING (
    org_id IN (
      SELECT org_id FROM organization_memberships
      WHERE user_id = auth.uid()
      AND role IN ('owner', 'admin')
      AND member_status = 'active'
    )
  );

CREATE POLICY \"org_admins_update_join_requests\"
  ON organization_join_requests
  FOR UPDATE
  USING (
    org_id IN (
      SELECT org_id FROM organization_memberships
      WHERE user_id = auth.uid()
      AND role IN ('owner', 'admin')
      AND member_status = 'active'
    )
  );" | PGPASSWORD=$DB_PASSWORD psql -h $DB_HOST -p $DB_PORT -U $DB_USER -d $DB_NAME

if [ $? -eq 0 ]; then
  echo "   ✅ Migration 1 applied successfully"
else
  echo "   ❌ Migration 1 failed"
  exit 1
fi

echo ""
echo "📝 Migration 2: Fixing RPC functions"
echo "   Executing: 20260205130100_fix_join_requests_rpc_member_status.sql"

# Apply migration 2 from file
PGPASSWORD=$DB_PASSWORD psql -h $DB_HOST -p $DB_PORT -U $DB_USER -d $DB_NAME -f supabase/migrations/20260205130100_fix_join_requests_rpc_member_status.sql

if [ $? -eq 0 ]; then
  echo "   ✅ Migration 2 applied successfully"
else
  echo "   ❌ Migration 2 failed"
  exit 1
fi

echo ""
echo "✨ All migrations applied successfully!"
echo ""
echo "🧪 Next steps:"
echo "   1. Test that active admins can see join requests"
echo "   2. Verify error messages display correctly"
echo "   3. Check auto-refresh works (30s interval)"
