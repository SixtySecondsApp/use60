import { Client } from 'pg';
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

const PASSWORD = env.SUPABASE_DATABASE_PASSWORD;
const PROJECT_ID = 'caerqjzvuerejfrdtygb';

const connectionString = `postgresql://postgres:${PASSWORD}@db.${PROJECT_ID}.supabase.co:5432/postgres`;

console.log('🔐 Deploying migrations to staging environment');
console.log('📍 Project:', PROJECT_ID);
console.log('📍 Database: postgres');
console.log('');

const client = new Client({
  connectionString: connectionString,
  ssl: { rejectUnauthorized: false }
});

const migrations = [
  {
    name: '20260205170000_fix_organization_memberships_rls_policy.sql',
    sql: fs.readFileSync('supabase/migrations/20260205170000_fix_organization_memberships_rls_policy.sql', 'utf-8')
  },
  {
    name: '20260205180000_fix_organization_member_visibility.sql',
    sql: fs.readFileSync('supabase/migrations/20260205180000_fix_organization_member_visibility.sql', 'utf-8')
  }
];

async function deploy() {
  try {
    console.log('⏳ Connecting to staging database...');
    await client.connect();
    console.log('✅ Connected successfully\n');
    
    console.log('🚀 Deploying migrations:\n');
    
    let deployed = 0;
    for (const migration of migrations) {
      console.log(`⏳ ${migration.name}`);
      try {
        // Split SQL statements and execute each one
        const statements = migration.sql
          .split(';')
          .map(s => s.trim())
          .filter(s => s.length > 0 && !s.startsWith('--'));
        
        for (const statement of statements) {
          if (statement.trim()) {
            await client.query(statement);
          }
        }
        
        console.log(`✅ ${migration.name} - Success\n`);
        deployed++;
      } catch (err) {
        console.error(`❌ ${migration.name} - Error:`);
        console.error(`   ${err.message}\n`);
      }
    }
    
    console.log('');
    console.log('═'.repeat(60));
    console.log(`✨ Deployment complete: ${deployed}/${migrations.length} migrations applied`);
    console.log('═'.repeat(60));
    console.log('');
    console.log('🎉 Next steps:');
    console.log('1. Refresh your staging app: https://localhost:5175');
    console.log('2. Go to Organizations page');
    console.log('3. Verify member counts and owner info display correctly');
    console.log('');
    console.log('📊 Expected results:');
    console.log('   ✓ Testing Software: 1 member + owner name');
    console.log('   ✓ Sixty Seconds: 3 members + owner name');
    console.log('');
    
  } catch (error) {
    console.error('❌ Connection error:', error.message);
    process.exit(1);
  } finally {
    await client.end();
    console.log('✅ Database connection closed');
  }
}

deploy();
