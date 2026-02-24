import dotenv from 'dotenv';
import { fileURLToPath } from 'url';
import { dirname, join } from 'path';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

dotenv.config({ path: join(__dirname, '.env.staging') });

const accessToken = process.env.SUPABASE_ACCESS_TOKEN;
const projectId = process.env.SUPABASE_PROJECT_ID;

console.log('🔍 Checking policy definitions...\n');

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
    const sql = `
      SELECT
        policyname,
        cmd,
        COALESCE(qual, '') as using_clause,
        COALESCE(with_check, '') as with_check_clause
      FROM pg_policies
      WHERE tablename = 'objects'
      AND (policyname ILIKE '%org%' AND policyname ILIKE '%logo%')
      ORDER BY policyname;
    `;

    const policies = await runSQL(sql);

    console.log(`Found ${policies.length} org logo policies:\n`);

    policies.forEach(p => {
      console.log(`📋 ${p.policyname} (${p.cmd})`);

      const fullDef = p.using_clause + ' ' + p.with_check_clause;

      if (fullDef.includes("split_part(name, '_'")) {
        console.log('   ✅ Uses UNDERSCORE delimiter (correct!)');
      } else if (fullDef.includes("split_part(name, '-'")) {
        console.log('   ❌ Uses HYPHEN delimiter (needs update!)');
      } else {
        console.log('   ℹ️  No split_part found (possibly SELECT policy)');
      }

      // Show a snippet
      const snippet = fullDef.substring(0, 150);
      if (snippet.length > 0) {
        console.log(`   Definition: ${snippet}...`);
      }
      console.log('');
    });

    console.log('\n✅ Check complete!\n');

  } catch (error) {
    console.error('❌ Error:', error.message);
  }
}

main();
