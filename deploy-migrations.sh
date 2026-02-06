#!/bin/bash

# Deploy migrations to staging Supabase database
# Usage: ./deploy-migrations.sh

set -e

echo "🔐 Deploying migrations to staging environment"
echo ""

# Load environment variables from .env.staging
export $(cat .env.staging | grep -v '^#' | xargs)

PROJECT_ID="caerqjzvuerejfrdtygb"
HOST="db.${PROJECT_ID}.supabase.co"

echo "📍 Project: $PROJECT_ID"
echo "📍 Host: $HOST"
echo ""

# Check if SUPABASE_DATABASE_PASSWORD is set
if [ -z "$SUPABASE_DATABASE_PASSWORD" ]; then
    echo "❌ Error: SUPABASE_DATABASE_PASSWORD not found in .env.staging"
    exit 1
fi

echo "⏳ Connecting to staging database..."
echo ""

# Create a temporary SQL file combining both migrations
cat > /tmp/staging_deploy.sql << 'SQL_EOF'
-- Migration 1: Create app_auth.is_admin() function
CREATE SCHEMA IF NOT EXISTS app_auth;

CREATE OR REPLACE FUNCTION app_auth.is_admin()
RETURNS boolean AS $$
BEGIN
  RETURN EXISTS (
    SELECT 1 FROM public.profiles
    WHERE id = auth.uid()
    AND is_admin = true
  );
END;
$$ LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'public';

DROP POLICY IF EXISTS "organization_memberships_select" ON "public"."organization_memberships";

CREATE POLICY "organization_memberships_select" ON "public"."organization_memberships"
FOR SELECT
USING (
  "public"."is_service_role"()
  OR "app_auth"."is_admin"()
  OR ("public"."get_org_role"("auth"."uid"(), "org_id") = ANY (ARRAY['owner'::"text", 'admin'::"text", 'member'::"text", 'readonly'::"text"]))
  OR ("user_id" = "auth"."uid"())
);

-- Migration 2: Fix member visibility RLS policy
DROP POLICY IF EXISTS "organization_memberships_select" ON "public"."organization_memberships";

CREATE POLICY "organization_memberships_select" ON "public"."organization_memberships"
FOR SELECT
USING (
  "public"."is_service_role"()
  OR "app_auth"."is_admin"()
  OR ("public"."get_org_role"("auth"."uid"(), "org_id") IS NOT NULL)
  OR ("user_id" = "auth"."uid"())
);

COMMENT ON POLICY "organization_memberships_select" ON "public"."organization_memberships" IS
'SELECT policy for organization_memberships: Rules for viewing membership data: 1. Service role can view all. 2. Platform admins can view all. 3. Users who are members of an org can see all members. 4. Users can always see their own membership record.';

SELECT 'Migrations deployed successfully' as result;
SQL_EOF

# Execute migrations using psql
PGPASSWORD="$SUPABASE_DATABASE_PASSWORD" psql \
  -h "$HOST" \
  -U postgres \
  -d postgres \
  -p 5432 \
  -f /tmp/staging_deploy.sql

if [ $? -eq 0 ]; then
    echo ""
    echo "═══════════════════════════════════════════════════════════════════"
    echo "✨ SUCCESS: Migrations deployed to staging!"
    echo "═══════════════════════════════════════════════════════════════════"
    echo ""
    echo "🎉 Next steps:"
    echo "1. Refresh your staging app: https://localhost:5175"
    echo "2. Go to Organizations page"
    echo "3. Verify:"
    echo "   ✓ Testing Software: 1 member + owner name"
    echo "   ✓ Sixty Seconds: 3 members + owner name"
    echo ""
    rm -f /tmp/staging_deploy.sql
else
    echo ""
    echo "❌ Deployment failed"
    exit 1
fi
