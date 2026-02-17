#!/usr/bin/env node
/**
 * Apply reactivation fixes using Supabase service role key
 * This creates a temporary SQL execution function and uses it to apply the migrations
 */

import { createClient } from '@supabase/supabase-js';
import { readFileSync } from 'fs';
import { fileURLToPath } from 'url';
import { dirname, join } from 'path';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

const SUPABASE_URL = 'https://caerqjzvuerejfrdtygb.supabase.co';
const SERVICE_ROLE_KEY = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImNhZXJxanp2dWVyZWpmcmR0eWdiIiwicm9sZSI6InNlcnZpY2Vfcm9sZSIsImlhdCI6MTc2Nzk0OTIyNywiZXhwIjoyMDgzNTI1MjI3fQ.vZn5nVNIllQBoRgf9_gFTKwrFoakOUJ8VNJ4nnHUnko';

const supabase = createClient(SUPABASE_URL, SERVICE_ROLE_KEY, {
  auth: { autoRefreshToken: false, persistSession: false }
});

async function main() {
  console.log('🚀 Applying reactivation fixes to staging database...\n');

  try {
    // Read migration files
    const sql1 = readFileSync(
      join(__dirname, 'supabase/migrations/20260217230000_fix_reactivation_rls_policies.sql'),
      'utf8'
    );
    const sql2 = readFileSync(
      join(__dirname, 'supabase/migrations/20260217230100_fix_reactivation_rpc_function.sql'),
      'utf8'
    );

    console.log('📝 Migration 1: Fix RLS Policies');
    console.log(sql1);
    console.log('\n📝 Migration 2: Fix RPC Function');
    console.log(sql2);

    // Since we can't execute arbitrary SQL via the REST API,
    // we need to create the statements manually using the SQL editor
    console.log('\n⚠️  Cannot execute DDL statements via REST API');
    console.log('\n📋 Please copy and paste the SQL above into the Supabase SQL Editor:');
    console.log(`   ${SUPABASE_URL}/project/caerqjzvuerejfrdtygb/sql/new`);
    console.log('\n   Or run: npx supabase db push (after fixing migration conflicts)');

  } catch (error) {
    console.error('\n❌ Error:', error.message);
    process.exit(1);
  }
}

main();
