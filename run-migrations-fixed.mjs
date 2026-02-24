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

// Construct proper connection string for Supabase Pooler
const password = process.env.SUPABASE_DATABASE_PASSWORD;
const connectionString = `postgres://postgres.caerqjzvuerejfrdtygb:${password}@aws-0-eu-west-1.pooler.supabase.com:5432/postgres`;

console.log('🔧 Connecting to Supabase staging database (pooler)...');

const client = new Client({
  connectionString,
  ssl: { rejectUnauthorized: false },
  connectionTimeoutMillis: 10000,
});

async function runMigration(filename) {
  console.log(`\n📄 Running migration: ${filename}`);

  try {
    const sql = readFileSync(join(__dirname, 'supabase', 'migrations', filename), 'utf-8');

    console.log(`   Executing SQL (${sql.length} characters)...`);
    await client.query(sql);

    console.log(`   ✅ Migration completed: ${filename}`);
    return true;
  } catch (error) {
    console.error(`   ❌ Migration failed: ${filename}`);
    console.error(`   Error: ${error.message}`);
    if (error.code) console.error(`   Code: ${error.code}`);
    return false;
  }
}

async function main() {
  try {
    console.log('Connecting...');
    await client.connect();
    console.log('✅ Connected to staging database\n');

    const migrations = [
      '20260203160000_add_org_logo_columns.sql',
      '20260203160100_setup_org_logos_bucket_rls.sql'
    ];

    let allSuccess = true;

    for (const migration of migrations) {
      const success = await runMigration(migration);
      if (!success) {
        allSuccess = false;
        // Continue with remaining migrations
      }
    }

    if (allSuccess) {
      console.log('\n🎉 All migrations completed successfully!');

      // Verify migrations
      console.log('\n🔍 Verifying migrations...');
      const { rows: columns } = await client.query(`
        SELECT column_name, data_type, is_nullable
        FROM information_schema.columns
        WHERE table_name = 'organizations'
        AND column_name IN ('logo_url', 'remove_logo')
        ORDER BY column_name;
      `);

      console.log('   Organizations table columns:');
      columns.forEach(col => {
        console.log(`   - ${col.column_name}: ${col.data_type} (nullable: ${col.is_nullable})`);
      });

      const { rows: buckets } = await client.query(`
        SELECT id, name, public, file_size_limit
        FROM storage.buckets
        WHERE id = 'org-logos';
      `);

      if (buckets.length > 0) {
        console.log('   Storage bucket:');
        console.log(`   - Name: ${buckets[0].name}`);
        console.log(`   - Public: ${buckets[0].public}`);
        console.log(`   - Size limit: ${buckets[0].file_size_limit} bytes (${(buckets[0].file_size_limit / 1024 / 1024).toFixed(1)}MB)`);
      }

      console.log('\n✅ Feature ready to use!');
    } else {
      console.log('\n⚠️ Some migrations had errors. Check above for details.');
    }
  } catch (error) {
    console.error('❌ Fatal error:', error.message);
    if (error.code) console.error('   Code:', error.code);
    process.exit(1);
  } finally {
    await client.end();
    console.log('\n🔌 Database connection closed');
  }
}

main();
