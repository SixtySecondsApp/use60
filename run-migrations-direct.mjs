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

// Try direct connection (port 6543 for direct mode, not pooler)
const connectionString = `postgres://postgres.caerqjzvuerejfrdtygb:${password}@aws-0-eu-west-1.pooler.supabase.com:6543/postgres`;

console.log('🔧 Connecting via transaction pooler (port 6543)...');
console.log('Password length:', password ? password.length : 0);

const client = new Client({
  connectionString,
  ssl: { rejectUnauthorized: false },
  connectionTimeoutMillis: 15000,
});

async function runMigration(filename) {
  console.log(`\n📄 ${filename}`);
  try {
    const sql = readFileSync(join(__dirname, 'supabase', 'migrations', filename), 'utf-8');
    await client.query(sql);
    console.log(`   ✅ Success!`);
    return true;
  } catch (error) {
    console.error(`   ❌ ${error.message}`);
    return false;
  }
}

async function main() {
  try {
    await client.connect();
    console.log('✅ Connected!\n');

    await runMigration('20260203160000_add_org_logo_columns.sql');
    await runMigration('20260203160100_setup_org_logos_bucket_rls.sql');

    console.log('\n🎉 Migrations complete!');
  } catch (error) {
    console.error('\n❌', error.message);
  } finally {
    await client.end();
  }
}

main();
