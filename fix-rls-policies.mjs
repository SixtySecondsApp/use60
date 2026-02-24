import { readFileSync } from 'fs';
import dotenv from 'dotenv';
import { fileURLToPath } from 'url';
import { dirname, join } from 'path';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

dotenv.config({ path: join(__dirname, '.env.staging') });

const accessToken = process.env.SUPABASE_ACCESS_TOKEN;
const projectId = process.env.SUPABASE_PROJECT_ID;

console.log('🔒 Fixing RLS policies for org-logos bucket...\n');

async function runSQL(sql) {
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
    throw new Error(`${response.status}: ${error}`);
  }

  return await response.json();
}

async function main() {
  try {
    const sql = readFileSync(join(__dirname, 'fix-rls-policies.sql'), 'utf-8');

    console.log('Executing SQL...');
    await runSQL(sql);

    console.log('✅ RLS policies updated successfully!\n');

    // Verify
    console.log('🔍 Verifying policies...');
    const verifySQL = `
      SELECT policyname, cmd, qual
      FROM pg_policies
      WHERE tablename = 'objects'
      AND policyname LIKE '%org%logo%'
      ORDER BY policyname;
    `;

    const policies = await runSQL(verifySQL);
    console.log(`   ✅ Found ${policies.length} RLS policies:`);
    policies.forEach(p => {
      console.log(`      - ${p.policyname} (${p.cmd})`);
    });

    console.log('\n✨ Fix complete! Try uploading an organization logo again.\n');

  } catch (error) {
    console.error('❌ Error:', error.message);
    console.log('\n📋 Please run the SQL manually:');
    console.log('https://supabase.com/dashboard/project/' + projectId + '/sql/new\n');
    const sql = readFileSync(join(__dirname, 'fix-rls-policies.sql'), 'utf-8');
    console.log(sql);
    process.exit(1);
  }
}

main();
