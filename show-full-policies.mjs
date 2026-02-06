import dotenv from 'dotenv';
import { fileURLToPath } from 'url';
import { dirname, join } from 'path';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

dotenv.config({ path: join(__dirname, '.env.staging') });

const accessToken = process.env.SUPABASE_ACCESS_TOKEN;
const projectId = process.env.SUPABASE_PROJECT_ID;

console.log('🔍 Full policy definitions for org logos...\n');

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
        polname as policyname,
        polcmd as cmd,
        pg_get_expr(polqual, polrelid) as using_clause,
        pg_get_expr(polwithcheck, polrelid) as with_check_clause
      FROM pg_policy
      JOIN pg_class ON pg_policy.polrelid = pg_class.oid
      WHERE pg_class.relname = 'objects'
      AND polname ILIKE '%org%logo%'
      ORDER BY polname;
    `;

    const policies = await runSQL(sql);

    console.log(`Found ${policies.length} policies:\n`);

    policies.forEach(p => {
      console.log('═'.repeat(80));
      console.log(`📋 ${p.policyname} (${p.cmd})`);
      console.log('═'.repeat(80));

      if (p.using_clause) {
        console.log('\nUSING clause:');
        console.log(p.using_clause);

        if (p.using_clause.includes("split_part(name, '_'")) {
          console.log('\n✅ Uses UNDERSCORE delimiter - CORRECT!');
        } else if (p.using_clause.includes("split_part(name, '-'")) {
          console.log('\n❌ Uses HYPHEN delimiter - NEEDS FIX!');
        }
      }

      if (p.with_check_clause) {
        console.log('\nWITH CHECK clause:');
        console.log(p.with_check_clause);

        if (p.with_check_clause.includes("split_part(name, '_'")) {
          console.log('\n✅ Uses UNDERSCORE delimiter - CORRECT!');
        } else if (p.with_check_clause.includes("split_part(name, '-'")) {
          console.log('\n❌ Uses HYPHEN delimiter - NEEDS FIX!');
        }
      }

      console.log('\n');
    });

  } catch (error) {
    console.error('❌ Error:', error.message);
  }
}

main();
