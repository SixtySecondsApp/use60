import { readFileSync } from 'fs';
import pg from 'pg';
import dotenv from 'dotenv';
import { fileURLToPath } from 'url';
import { dirname, join } from 'path';

const { Client } = pg;
const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

dotenv.config({ path: join(__dirname, '.env.staging') });

const password = process.env.SUPABASE_DATABASE_PASSWORD;
const connectionString = `postgres://postgres.caerqjzvuerejfrdtygb:${password}@aws-0-eu-west-1.pooler.supabase.com:5432/postgres`;

console.log('🔧 Connecting to Supabase staging database...');

const client = new Client({
  connectionString,
  ssl: { rejectUnauthorized: false },
  connectionTimeoutMillis: 15000,
});

async function runMigration(filename) {
  console.log(`\n📄 Running: ${filename}`);
  try {
    const sql = readFileSync(join(__dirname, 'supabase', 'migrations', filename), 'utf-8');
    console.log(`   Executing... (${sql.length} chars)`);

    await client.query(sql);

    console.log(`   ✅ Success!`);
    return true;
  } catch (error) {
    console.error(`   ❌ Failed: ${error.message}`);
    if (error.code) console.error(`   Code: ${error.code}`);
    return false;
  }
}

async function main() {
  try {
    await client.connect();
    console.log('✅ Connected to staging database!\n');

    const migrations = [
      '20260203160000_add_org_logo_columns.sql',
      '20260203160100_setup_org_logos_bucket_rls.sql'
    ];

    let successCount = 0;

    for (const migration of migrations) {
      const success = await runMigration(migration);
      if (success) successCount++;
    }

    if (successCount === migrations.length) {
      console.log('\n🎉 All migrations completed successfully!\n');

      // Verify
      console.log('🔍 Verifying migrations...');

      const { rows: columns } = await client.query(`
        SELECT column_name, data_type, is_nullable
        FROM information_schema.columns
        WHERE table_name = 'organizations'
        AND column_name IN ('logo_url', 'remove_logo')
        ORDER BY column_name;
      `);

      console.log(`   ✅ Found ${columns.length} new columns in organizations table:`);
      columns.forEach(col => {
        console.log(`      - ${col.column_name} (${col.data_type})`);
      });

      const { rows: buckets } = await client.query(`
        SELECT id, name, public, file_size_limit
        FROM storage.buckets
        WHERE id = 'org-logos';
      `);

      if (buckets.length > 0) {
        const bucket = buckets[0];
        console.log(`   ✅ Storage bucket created:`);
        console.log(`      - Name: ${bucket.name}`);
        console.log(`      - Public: ${bucket.public}`);
        console.log(`      - Size limit: ${(bucket.file_size_limit / 1024 / 1024).toFixed(1)}MB`);
      }

      console.log('\n✨ Feature is now live on staging!');
      console.log('👉 Test it at: Settings → Organization Management → Settings tab\n');
    } else {
      console.log(`\n⚠️  ${successCount}/${migrations.length} migrations succeeded.`);
    }
  } catch (error) {
    console.error('\n❌ Connection error:', error.message);
    if (error.code) console.error('   Code:', error.code);
    process.exit(1);
  } finally {
    await client.end();
    console.log('🔌 Connection closed');
  }
}

main();
