import { createClient } from '@supabase/supabase-js';

const supabaseUrl = 'https://caerqjzvuerejfrdtygb.supabase.co';
const serviceRoleKey = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImNhZXJxanp2dWVyZWpmcmR0eWdiIiwicm9sZSI6InNlcnZpY2Vfcm9sZSIsImlhdCI6MTc2Nzk0OTIyNywiZXhwIjoyMDgzNTI1MjI3fQ.vZn5nVNIllQBoRgf9_gFTKwrFoakOUJ8VNJ4nnHUnko';

const supabase = createClient(supabaseUrl, serviceRoleKey);

async function applyMigrations() {
  try {
    console.log('🔄 Connecting to staging environment...');
    console.log('   URL:', supabaseUrl);
    
    // Test connection
    const { data, error: testError } = await supabase.from('organizations').select('count');
    if (testError) {
      console.error('❌ Connection test failed:', testError.message);
      process.exit(1);
    }
    console.log('✅ Connected successfully');
    
    console.log('\n⚠️  Note: The Supabase JS client does not have direct SQL execution.');
    console.log('   Please use the Supabase Dashboard or CLI to apply these migrations:');
    console.log('\n📋 Migration 1: 20260205170000_fix_organization_memberships_rls_policy.sql');
    console.log('   Creates app_auth.is_admin() function and updates RLS policy');
    console.log('\n📋 Migration 2: 20260205180000_fix_organization_member_visibility.sql');
    console.log('   Fixes RLS policy to allow org members to see all members');
    console.log('\n✨ Alternatively, copy the SQL from /tmp/staging_migrations.sql');
    console.log('   and paste it into Supabase Dashboard > SQL Editor');
    
  } catch (error) {
    console.error('❌ Error:', error);
    process.exit(1);
  }
}

applyMigrations();
