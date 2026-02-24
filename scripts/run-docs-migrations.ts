import { createClient } from '@supabase/supabase-js';
import { readFileSync } from 'fs';
import { resolve } from 'path';

const supabaseUrl = process.env.VITE_SUPABASE_URL || 'https://wbgmnyekgqklggilgqag.supabase.co';
const supabaseServiceKey = process.env.SUPABASE_SERVICE_ROLE_KEY;

if (!supabaseServiceKey) {
  console.error('❌ SUPABASE_SERVICE_ROLE_KEY not found in environment');
  process.exit(1);
}

const supabase = createClient(supabaseUrl, supabaseServiceKey);

async function runMigration(filename: string) {
  console.log(`\n📄 Running migration: ${filename}`);

  const sqlPath = resolve(__dirname, '..', 'supabase', 'migrations', filename);
  const sql = readFileSync(sqlPath, 'utf-8');

  const { data, error } = await supabase.rpc('exec_sql', { sql_string: sql });

  if (error) {
    console.error(`❌ Error: ${error.message}`);
    return false;
  }

  console.log(`✅ Success`);
  return true;
}

async function main() {
  console.log('🚀 Running Documentation CMS migrations...\n');

  const migrations = [
    '20260206100000_docs_cms_schema.sql',
    '20260206100001_seed_ops_intelligence_docs.sql',
  ];

  for (const migration of migrations) {
    const success = await runMigration(migration);
    if (!success) {
      console.error('\n❌ Migration failed, stopping.');
      process.exit(1);
    }
  }

  console.log('\n✅ All migrations completed successfully!');
  console.log('📝 You should now see articles at /docs');
}

main();
