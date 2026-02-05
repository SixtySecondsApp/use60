import * as fs from 'fs';

// Load .env.staging
const envFile = fs.readFileSync('.env.staging', 'utf-8');
const envLines = envFile.split('\n');
const env = {};
envLines.forEach(line => {
  const match = line.match(/^([^=]+)=(.*)$/);
  if (match) {
    env[match[1].trim()] = match[2].trim();
  }
});

const SUPABASE_URL = env.SUPABASE_URL;
const SUPABASE_SERVICE_ROLE_KEY = env.SUPABASE_SERVICE_ROLE_KEY;
const ACCESS_TOKEN = env.SUPABASE_ACCESS_TOKEN;

console.log('🔐 Deploying migrations to staging environment');
console.log('📍 URL:', SUPABASE_URL);
console.log('');

// Read migration files
const migration1 = fs.readFileSync('supabase/migrations/20260205170000_fix_organization_memberships_rls_policy.sql', 'utf-8');
const migration2 = fs.readFileSync('supabase/migrations/20260205180000_fix_organization_member_visibility.sql', 'utf-8');

const migrations = [
  {
    name: '20260205170000_fix_organization_memberships_rls_policy.sql',
    sql: migration1
  },
  {
    name: '20260205180000_fix_organization_member_visibility.sql',
    sql: migration2
  }
];

async function executeSql(sql) {
  // Try using the Management API to execute SQL
  const response = await fetch(
    `${SUPABASE_URL}/rest/v1/rpc/exec`,
    {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${SUPABASE_SERVICE_ROLE_KEY}`,
        'apikey': SUPABASE_SERVICE_ROLE_KEY
      },
      body: JSON.stringify({ sql })
    }
  );

  if (!response.ok) {
    const text = await response.text();
    throw new Error(`${response.status}: ${text}`);
  }

  return response.json();
}

async function deploy() {
  try {
    console.log('🚀 Deploying migrations via Supabase API:\n');

    let deployed = 0;
    for (const migration of migrations) {
      console.log(`⏳ ${migration.name}`);

      try {
        // Split statements
        const statements = migration.sql
          .split(';')
          .map(s => s.trim())
          .filter(s => s.length > 0 && !s.startsWith('--'));

        // Execute as single batch with the exec RPC
        const combinedSql = statements.filter(s => s).join(';\n') + ';';
        await executeSql(combinedSql);

        console.log(`✅ ${migration.name}\n`);
        deployed++;
      } catch (err) {
        console.log(`⚠️  ${migration.name}`);
        console.log(`   Error: ${err.message}\n`);
      }
    }

    console.log('═'.repeat(70));
    if (deployed > 0) {
      console.log(`✨ SUCCESS: Deployed ${deployed} migrations`);
      console.log('═'.repeat(70));
      console.log('');
      console.log('🎉 Your staging environment is now updated!');
      console.log('');
      console.log('Next steps:');
      console.log('1. Refresh staging app: https://localhost:5175');
      console.log('2. Check Organizations page for member counts');
    } else {
      console.log('❌ Failed to deploy migrations');
      console.log('═'.repeat(70));
    }
  } catch (error) {
    console.error('❌ Error:', error.message);
    process.exit(1);
  }
}

deploy();
