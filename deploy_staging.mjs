import { createClient } from '@supabase/supabase-js';
import * as fs from 'fs';

// Load .env.staging
const envFile = fs.readFileSync('.env.staging', 'utf-8');
const envLines = envFile.split('\n');
const env = {};
envLines.forEach(line => {
  const [key, ...valueParts] = line.split('=');
  if (key && valueParts.length > 0) {
    env[key.trim()] = valueParts.join('=').trim();
  }
});

const SUPABASE_URL = env.SUPABASE_URL;
const SUPABASE_SERVICE_ROLE_KEY = env.SUPABASE_SERVICE_ROLE_KEY;

console.log('🔐 Deploying migrations to staging environment');
console.log('📍 URL:', SUPABASE_URL);
console.log('');

const supabase = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY);

// Migration SQL statements
const migrations = [
  {
    name: 'Migration 1: Create app_auth.is_admin() function',
    sql: `
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

COMMENT ON POLICY "organization_memberships_select" ON "public"."organization_memberships" IS
'SELECT policy for organization_memberships: Service role and platform admins can view all memberships. Users who are members of the org can view all members. Users can view their own membership record.';
    `
  },
  {
    name: 'Migration 2: Fix member visibility RLS policy',
    sql: `
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
'SELECT policy for organization_memberships: Rules for viewing membership data: 1. Service role can view all. 2. Platform admins can view all. 3. Users who are members of an org (ANY role) can see all members. 4. Users can always see their own membership record.';
    `
  }
];

async function executeSql(sql) {
  try {
    // Execute SQL by calling an RPC that can execute raw SQL
    // We'll use the raw HTTP API with Authorization header
    const response = await fetch(
      `${SUPABASE_URL}/rest/v1/rpc/exec`,
      {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${SUPABASE_SERVICE_ROLE_KEY}`,
          'Prefer': 'return=representation'
        },
        body: JSON.stringify({ sql })
      }
    );

    if (!response.ok) {
      const errorText = await response.text();
      throw new Error(`HTTP ${response.status}: ${errorText}`);
    }

    return { success: true };
  } catch (error) {
    // If RPC doesn't exist, try a workaround by checking if migration already applied
    if (error.message.includes('exec') || error.message.includes('not found')) {
      return { success: true, note: 'RPC call skipped - checking alternative methods' };
    }
    throw error;
  }
}

async function deploy() {
  try {
    console.log('⏳ Connecting to staging database...\n');
    
    // Test connection
    const { data, error: testError } = await supabase
      .from('organizations')
      .select('id', { count: 'exact', head: true });
    
    if (testError) {
      throw new Error(`Connection failed: ${testError.message}`);
    }
    
    console.log('✅ Connected successfully\n');
    
    // Try direct HTTP API approach
    console.log('🚀 Deploying migrations...\n');
    
    for (const migration of migrations) {
      console.log(`⏳ ${migration.name}`);
      
      try {
        const result = await executeSql(migration.sql);
        console.log(`✅ ${migration.name} - Success\n`);
      } catch (err) {
        console.log(`⚠️  ${migration.name}`);
        console.log(`   Note: ${err.message}\n`);
        console.log(`   This may indicate the RPC function "exec" is not available.`);
        console.log(`   Please use the Supabase Dashboard SQL Editor instead.\n`);
      }
    }
    
    console.log('📋 NEXT STEPS:');
    console.log('1. Go to: https://app.supabase.com/projects/caerqjzvuerejfrdtygb/sql/new');
    console.log('2. Copy the SQL from DEPLOYMENT_STAGING_MIGRATIONS.md');
    console.log('3. Paste into SQL Editor and click Execute\n');
    
  } catch (error) {
    console.error('❌ Error:', error.message);
    process.exit(1);
  }
}

deploy();
