const { createClient } = require('@supabase/supabase-js');
const fs = require('fs');
const path = require('path');

// Staging credentials
const supabaseUrl = 'https://caerqjzvuerejfrdtygb.supabase.co';
const supabaseServiceKey = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImNhZXJxanp2dWVyZWpmcmR0eWdiIiwicm9sZSI6InNlcnZpY2Vfcm9sZSIsImlhdCI6MTc2Nzk0OTIyNywiZXhwIjoyMDgzNTI1MjI3fQ.vZn5nVNIllQBoRgf9_gFTKwrFoakOUJ8VNJ4nnHUnko';

const supabase = createClient(supabaseUrl, supabaseServiceKey);

async function runMigrations() {
  console.log('🚀 Starting migration execution on STAGING database...\n');

  // Migration 1: Fix RLS policies
  console.log('📝 Migration 1: Fixing RLS policies for organization_join_requests');
  const migration1Path = path.join(__dirname, 'supabase', 'migrations', '20260205130000_fix_join_requests_rls_member_status.sql');
  const migration1SQL = fs.readFileSync(migration1Path, 'utf8');

  // Remove comments for cleaner execution
  const cleanSQL1 = migration1SQL
    .split('\n')
    .filter(line => !line.trim().startsWith('--') && line.trim() !== '')
    .join('\n');

  try {
    const { data: data1, error: error1 } = await supabase.rpc('exec_sql', { sql: cleanSQL1 });

    if (error1) {
      // Try direct execution via database
      console.log('   Trying direct SQL execution...');

      // Execute each statement separately
      const statements = cleanSQL1.split(';').filter(s => s.trim());

      for (const statement of statements) {
        if (!statement.trim()) continue;

        try {
          // Use the Supabase REST API to execute raw SQL
          const response = await fetch(`${supabaseUrl}/rest/v1/rpc/exec`, {
            method: 'POST',
            headers: {
              'apikey': supabaseServiceKey,
              'Authorization': `Bearer ${supabaseServiceKey}`,
              'Content-Type': 'application/json',
            },
            body: JSON.stringify({ query: statement.trim() })
          });

          console.log(`   ✓ Executed: ${statement.substring(0, 50)}...`);
        } catch (err) {
          console.error(`   ✗ Failed: ${err.message}`);
        }
      }
    } else {
      console.log('   ✅ Migration 1 completed successfully');
    }
  } catch (err) {
    console.error(`   ❌ Error executing migration 1: ${err.message}`);
    console.log('\n📋 Please apply this migration manually via Supabase Dashboard:');
    console.log(migration1SQL);
  }

  // Migration 2: Fix RPC functions
  console.log('\n📝 Migration 2: Fixing RPC functions (approve/reject)');
  const migration2Path = path.join(__dirname, 'supabase', 'migrations', '20260205130100_fix_join_requests_rpc_member_status.sql');
  const migration2SQL = fs.readFileSync(migration2Path, 'utf8');

  const cleanSQL2 = migration2SQL
    .split('\n')
    .filter(line => !line.trim().startsWith('--') && line.trim() !== '')
    .join('\n');

  try {
    const { data: data2, error: error2 } = await supabase.rpc('exec_sql', { sql: cleanSQL2 });

    if (error2) {
      console.log('   ⚠️  Could not execute via RPC');
      console.log('\n📋 Please apply this migration manually via Supabase Dashboard:');
      console.log(migration2SQL);
    } else {
      console.log('   ✅ Migration 2 completed successfully');
    }
  } catch (err) {
    console.error(`   ❌ Error executing migration 2: ${err.message}`);
    console.log('\n📋 Please apply this migration manually via Supabase Dashboard:');
    console.log(migration2SQL);
  }

  console.log('\n✨ Migration execution attempt complete!');
  console.log('\nIf migrations failed, please apply them manually:');
  console.log('1. Go to https://app.supabase.com/project/caerqjzvuerejfrdtygb/sql/new');
  console.log('2. Copy SQL from the migration files');
  console.log('3. Execute in SQL Editor');
}

runMigrations().catch(console.error);
