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

    const migration = '20260203220000_update_invitation_template_with_avatar.sql';

    const success = await runMigration(migration);

    if (success) {
      console.log('\n🎉 Email template migration completed successfully!\n');

      // Verify
      console.log('🔍 Verifying template...');

      const { rows } = await client.query(`
        SELECT template_name, template_type, subject_line,
               (variables->>'inviter_avatar_url') IS NOT NULL AS has_avatar_variable
        FROM encharge_email_templates
        WHERE template_name = 'organization_invitation';
      `);

      if (rows.length > 0) {
        const template = rows[0];
        console.log(`   ✅ Template updated:`);
        console.log(`      - Name: ${template.template_name}`);
        console.log(`      - Type: ${template.template_type}`);
        console.log(`      - Subject: ${template.subject_line}`);
        console.log(`      - Has avatar support: ${template.has_avatar_variable}`);
      }

      console.log('\n✨ Email template now includes profile photos!');
      console.log('👉 Test by sending an invitation from the app\n');
    } else {
      console.log(`\n⚠️  Migration failed.`);
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
