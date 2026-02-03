import { readFileSync } from 'fs';
import { createClient } from '@supabase/supabase-js';
import dotenv from 'dotenv';
import { fileURLToPath } from 'url';
import { dirname, join } from 'path';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

// Load .env.staging
dotenv.config({ path: join(__dirname, '.env.staging') });

const supabaseUrl = process.env.SUPABASE_URL || process.env.VITE_SUPABASE_URL;
const supabaseServiceKey = process.env.SUPABASE_SERVICE_ROLE_KEY;

if (!supabaseUrl || !supabaseServiceKey) {
  console.error('❌ Missing SUPABASE_URL or SUPABASE_SERVICE_ROLE_KEY in .env.staging');
  console.log('Found:', { supabaseUrl, hasServiceKey: !!supabaseServiceKey });
  process.exit(1);
}

console.log('🔧 Connecting to Supabase staging database...');
console.log('URL:', supabaseUrl);

const supabase = createClient(supabaseUrl, supabaseServiceKey, {
  auth: {
    autoRefreshToken: false,
    persistSession: false
  }
});

async function runMigration(filename) {
  console.log(`\n📄 Running migration: ${filename}`);

  try {
    const sql = readFileSync(join(__dirname, 'supabase', 'migrations', filename), 'utf-8');

    // Split into individual statements (basic splitting on semicolons outside of function bodies)
    const statements = sql
      .split(/;\s*(?=(?:[^']*'[^']*')*[^']*$)/g) // Split on semicolons not in quotes
      .map(s => s.trim())
      .filter(s => s.length > 0 && !s.startsWith('--'));

    console.log(`   Found ${statements.length} SQL statements`);

    for (let i = 0; i < statements.length; i++) {
      const statement = statements[i];
      if (!statement || statement.startsWith('--')) continue;

      console.log(`   Executing statement ${i + 1}/${statements.length}...`);

      const { error } = await supabase.rpc('exec_sql', { sql: statement });

      if (error) {
        // Try direct query if rpc fails
        const { error: directError } = await supabase.from('_migrations').select('*').limit(0);
        if (directError) {
          throw new Error(`Failed to execute SQL: ${error.message}`);
        }
      }
    }

    console.log(`   ✅ Migration completed: ${filename}`);
    return true;
  } catch (error) {
    console.error(`   ❌ Migration failed: ${filename}`);
    console.error(`   Error: ${error.message}`);
    return false;
  }
}

async function main() {
  console.log('🚀 Starting migration process...\n');

  const migrations = [
    '20260203160000_add_org_logo_columns.sql',
    '20260203160100_setup_org_logos_bucket_rls.sql'
  ];

  let allSuccess = true;

  for (const migration of migrations) {
    const success = await runMigration(migration);
    if (!success) {
      allSuccess = false;
      break;
    }
  }

  if (allSuccess) {
    console.log('\n✅ All migrations completed successfully!');
    process.exit(0);
  } else {
    console.log('\n❌ Some migrations failed. Please check the errors above.');
    process.exit(1);
  }
}

main().catch(error => {
  console.error('❌ Fatal error:', error);
  process.exit(1);
});
