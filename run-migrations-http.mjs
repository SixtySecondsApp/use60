import { readFileSync } from 'fs';
import { createClient } from '@supabase/supabase-js';
import dotenv from 'dotenv';
import { fileURLToPath } from 'url';
import { dirname, join } from 'path';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

dotenv.config({ path: join(__dirname, '.env.staging') });

const supabaseUrl = process.env.SUPABASE_URL;
const serviceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY;

console.log('🔧 Running migrations via Supabase client...\n');

const supabase = createClient(supabaseUrl, serviceRoleKey);

async function runSQL(sql) {
  // Try to execute via raw SQL
  const response = await fetch(`${supabaseUrl}/rest/v1/`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'apikey': serviceRoleKey,
      'Authorization': `Bearer ${serviceRoleKey}`,
      'Prefer': 'return=minimal'
    },
    body: JSON.stringify({ query: sql })
  });
  
  return response;
}

async function main() {
  // Migration 1
  console.log('📄 Migration 1: Adding columns...');
  const sql1 = readFileSync(join(__dirname, 'supabase', 'migrations', '20260203160000_add_org_logo_columns.sql'), 'utf-8');
  
  // Try direct table update approach instead
  const { error: error1 } = await supabase
    .from('organizations')
    .select('id')
    .limit(1);
    
  if (error1) {
    console.log('   ⚠️  Cannot verify connection');
  } else {
    console.log('   ✅ Connection verified');
  }
  
  console.log('\n⚠️  Direct SQL execution via API is not supported.');
  console.log('📋 Please run migrations manually in Supabase Dashboard:');
  console.log('👉 https://supabase.com/dashboard/project/caerqjzvuerejfrdtygb/sql/new\n');
  console.log('The SQL is in MIGRATIONS_TO_RUN.md');
}

main();
