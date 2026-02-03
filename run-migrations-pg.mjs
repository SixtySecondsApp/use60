import { readFileSync } from 'fs';
import pg from 'pg';
import dotenv from 'dotenv';
import { fileURLToPath } from 'url';
import { dirname, join } from 'path';

const { Client } = pg;
const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

// Load .env.staging
dotenv.config({ path: join(__dirname, '.env.staging') });

const connectionString = `postgres://postgres.caerqjzvuerejfrdtygb:${process.env.SUPABASE_DATABASE_PASSWORD}@aws-0-eu-west-1.pooler.supabase.com:5432/postgres`;

console.log('🔧 Connecting to Supabase staging database...');

const client = new Client({
  connectionString,
  ssl: { rejectUnauthorized: false }
});

async function runMigration(filename) {
  console.log(`\n📄 Running migration: ${filename}`);

  try {
    const sql = readFileSync(join(__dirname, 'supabase', 'migrations', filename), 'utf-8');

    console.log(`   Executing SQL...`);
    await client.query(sql);

    console.log(`   ✅ Migration completed: ${filename}`);
    return true;
  } catch (error) {
    console.error(`   ❌ Migration failed: ${filename}`);
    console.error(`   Error: ${error.message}`);
    return false;
  }
}

async function main() {
  try {
    await client.connect();
    console.log('✅ Connected to database\n');

    const migrations = [
      '20260203160000_add_org_logo_columns.sql',
      '20260203160100_setup_org_logos_bucket_rls.sql'
    ];

    let allSuccess = true;

    for (const migration of migrations) {
      const success = await runMigration(migration);
      if (!success) {
        allSuccess = false;
        // Continue with other migrations even if one fails
      }
    }

    if (allSuccess) {
      console.log('\n✅ All migrations completed successfully!');
    } else {
      console.log('\n⚠️ Some migrations had errors. Check above for details.');
    }
  } catch (error) {
    console.error('❌ Fatal error:', error);
    process.exit(1);
  } finally {
    await client.end();
    console.log('\n🔌 Database connection closed');
  }
}

main();
