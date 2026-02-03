import { readFileSync } from 'fs';
import pg from 'pg';
import dotenv from 'dotenv';
import { fileURLToPath } from 'url';
import { dirname, join } from 'path';

const { Client } = pg;
const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

dotenv.config({ path: join(__dirname, '.env.staging') });

// Correct format for Supabase Pooler: postgres.[project-ref]:[password]@host
const password = process.env.SUPABASE_DATABASE_PASSWORD;
const connectionString = `postgres://postgres.caerqjzvuerejfrdtygb:${password}@aws-0-eu-west-1.pooler.supabase.com:5432/postgres`;

console.log('🔧 Connecting to Supabase staging (pooler mode)...');

const client = new Client({
  connectionString,
  ssl: { rejectUnauthorized: false }
});

async function runMigration(filename) {
  console.log(`\n📄 ${filename}`);
  try {
    const sql = readFileSync(join(__dirname, 'supabase', 'migrations', filename), 'utf-8');
    await client.query(sql);
    console.log(`   ✅ Success`);
    return true;
  } catch (error) {
    console.error(`   ❌ ${error.message}`);
    return false;
  }
}

async function main() {
  try {
    await client.connect();
    console.log('✅ Connected\n');

    await runMigration('20260203160000_add_org_logo_columns.sql');
    await runMigration('20260203160100_setup_org_logos_bucket_rls.sql');

    console.log('\n🔍 Verifying...');
    const { rows } = await client.query(`
      SELECT column_name FROM information_schema.columns
      WHERE table_name = 'organizations' AND column_name IN ('logo_url', 'remove_logo');
    `);
    console.log(`   Found ${rows.length} new columns`);

    console.log('\n🎉 Migrations complete!');
  } catch (error) {
    console.error('❌ Error:', error.message);
  } finally {
    await client.end();
  }
}

main();
