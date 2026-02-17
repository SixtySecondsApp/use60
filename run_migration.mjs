// Apply reactivation fixes to staging database using service role key
import { createClient } from '@supabase/supabase-js';
import { readFileSync } from 'fs';
import { fileURLToPath } from 'url';
import { dirname, join } from 'path';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

const SUPABASE_URL = 'https://caerqjzvuerejfrdtygb.supabase.co';
const SERVICE_ROLE_KEY = 'sbp_336aa889df4391ea4428485d357b70e29b365cec';

const supabase = createClient(SUPABASE_URL, SERVICE_ROLE_KEY, {
  auth: {
    autoRefreshToken: false,
    persistSession: false
  }
});

async function executeSqlStatements(statements) {
  console.log('\n🔧 Executing SQL statements...\n');

  for (const statement of statements) {
    const trimmed = statement.trim();
    if (!trimmed || trimmed.startsWith('--')) continue;

    console.log(`Executing: ${trimmed.substring(0, 80)}...`);

    try {
      const { data, error } = await supabase.rpc('exec_sql', { sql_query: trimmed });

      if (error) {
        console.error(`❌ Error:`, error.message);
        return false;
      }
      console.log(`✅ Success`);
    } catch (err) {
      console.error(`❌ Error:`, err.message);
      return false;
    }
  }

  return true;
}

async function main() {
  console.log('🚀 Applying reactivation fixes to staging database...');
  console.log(`📍 Database: ${SUPABASE_URL}\n`);

  // Read migration files
  const sql1Path = join(__dirname, 'supabase/migrations/20260217230000_fix_reactivation_rls_policies.sql');
  const sql2Path = join(__dirname, 'supabase/migrations/20260217230100_fix_reactivation_rpc_function.sql');

  const sql1 = readFileSync(sql1Path, 'utf8');
  const sql2 = readFileSync(sql2Path, 'utf8');

  // Split into individual statements
  const statements1 = sql1.split(';').filter(s => s.trim());
  const statements2 = sql2.split(';').filter(s => s.trim());

  console.log('📝 Migration 1: Fix RLS Policies');
  console.log(`   - ${statements1.length} statements to execute`);

  console.log('📝 Migration 2: Fix RPC Function');
  console.log(`   - ${statements2.length} statements to execute\n`);

  // Execute migrations
  const success1 = await executeSqlStatements(statements1);
  if (!success1) {
    console.error('\n❌ Migration 1 failed. Stopping.');
    process.exit(1);
  }

  const success2 = await executeSqlStatements(statements2);
  if (!success2) {
    console.error('\n❌ Migration 2 failed.');
    process.exit(1);
  }

  console.log('\n✅ All migrations applied successfully!');
  console.log('\n🎉 The reactivation buttons should now work correctly.');
}

main().catch(console.error);
