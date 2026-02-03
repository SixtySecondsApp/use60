import { readFileSync } from 'fs';
import dotenv from 'dotenv';
import { fileURLToPath } from 'url';
import { dirname, join } from 'path';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

dotenv.config({ path: join(__dirname, '.env.staging') });

const accessToken = process.env.SUPABASE_ACCESS_TOKEN;
const projectId = process.env.SUPABASE_PROJECT_ID;

console.log('🔧 Running migrations via Supabase Management API...\n');
console.log('Project ID:', projectId);
console.log('Access Token:', accessToken ? `${accessToken.substring(0, 10)}...` : 'MISSING');

if (!accessToken || !projectId) {
  console.error('\n❌ Missing SUPABASE_ACCESS_TOKEN or SUPABASE_PROJECT_ID in .env.staging');
  process.exit(1);
}

async function runMigrationSQL(sql) {
  const response = await fetch(
    `https://api.supabase.com/v1/projects/${projectId}/database/query`,
    {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${accessToken}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({ query: sql })
    }
  );

  if (!response.ok) {
    const error = await response.text();
    throw new Error(`API error (${response.status}): ${error}`);
  }

  return await response.json();
}

async function runMigration(filename) {
  console.log(`\n📄 Running: ${filename}`);
  try {
    const sql = readFileSync(join(__dirname, 'supabase', 'migrations', filename), 'utf-8');
    console.log(`   Executing... (${sql.length} chars)`);

    const result = await runMigrationSQL(sql);

    console.log(`   ✅ Success!`);
    return true;
  } catch (error) {
    console.error(`   ❌ Failed: ${error.message}`);
    return false;
  }
}

async function main() {
  try {
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

      const verifySQL = `
        SELECT column_name, data_type, is_nullable
        FROM information_schema.columns
        WHERE table_name = 'organizations'
        AND column_name IN ('logo_url', 'remove_logo')
        ORDER BY column_name;
      `;

      const result = await runMigrationSQL(verifySQL);
      console.log(`   ✅ Found ${result.length || 0} new columns in organizations table`);

      console.log('\n✨ Feature is now live on staging!');
      console.log('👉 Test it at: Settings → Organization Management → Settings tab\n');
    } else {
      console.log(`\n⚠️  ${successCount}/${migrations.length} migrations succeeded.`);
    }
  } catch (error) {
    console.error('\n❌ Error:', error.message);
    process.exit(1);
  }
}

main();
