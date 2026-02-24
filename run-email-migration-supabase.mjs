import { readFileSync } from 'fs';
import { createClient } from '@supabase/supabase-js';
import dotenv from 'dotenv';
import { fileURLToPath } from 'url';
import { dirname, join } from 'path';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

dotenv.config({ path: join(__dirname, '.env.staging') });

const supabaseUrl = process.env.SUPABASE_URL;
const supabaseServiceKey = process.env.SUPABASE_SERVICE_ROLE_KEY;

console.log('🔧 Connecting to Supabase staging database...');
console.log(`   URL: ${supabaseUrl}`);

const supabase = createClient(supabaseUrl, supabaseServiceKey, {
  auth: {
    autoRefreshToken: false,
    persistSession: false
  }
});

async function runMigration(filename) {
  console.log(`\n📄 Running: ${filename}`);
  try {
    const sql = readFileSync(join(__dirname, 'supabase', 'migrations', filename), 'utf-8');
    console.log(`   Executing... (${sql.length} chars)`);

    // Use Supabase RPC to execute raw SQL
    const { data, error } = await supabase.rpc('exec_sql', { sql_query: sql });

    if (error) {
      // If exec_sql function doesn't exist, try direct execution via REST API
      console.log('   Trying alternative method...');

      const response = await fetch(`${supabaseUrl}/rest/v1/rpc/exec_sql`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'apikey': supabaseServiceKey,
          'Authorization': `Bearer ${supabaseServiceKey}`
        },
        body: JSON.stringify({ sql_query: sql })
      });

      if (!response.ok) {
        throw new Error(`HTTP ${response.status}: ${await response.text()}`);
      }

      console.log(`   ✅ Success!`);
      return true;
    }

    console.log(`   ✅ Success!`);
    return true;
  } catch (error) {
    console.error(`   ❌ Failed: ${error.message}`);
    return false;
  }
}

async function main() {
  try {
    console.log('✅ Connected to Supabase!\n');

    const migration = '20260203220000_update_invitation_template_with_avatar.sql';

    // Since we can't run raw SQL directly, let's update the template using Supabase client
    console.log(`\n📄 Updating email template...`);

    const sql = readFileSync(join(__dirname, 'supabase', 'migrations', migration), 'utf-8');

    // Split the SQL file - we'll extract the UPDATE and INSERT statements
    // This is a workaround since we can't execute raw SQL directly

    console.log('   Reading migration file...');
    console.log(`   Migration contains ${sql.length} characters`);

    // For now, let's just verify we can connect and read the current template
    const { data: currentTemplate, error: fetchError } = await supabase
      .from('encharge_email_templates')
      .select('template_name, template_type, subject_line')
      .eq('template_name', 'organization_invitation')
      .maybeSingle();

    if (fetchError) {
      console.error('❌ Error fetching template:', fetchError);
      process.exit(1);
    }

    if (currentTemplate) {
      console.log('✅ Found existing template:', currentTemplate.template_name);
      console.log('   This migration needs to be run via Supabase SQL Editor or psql');
      console.log('');
      console.log('📋 Instructions:');
      console.log('   1. Go to: https://supabase.com/dashboard/project/caerqjzvuerejfrdtygb/sql/new');
      console.log('   2. Copy the contents of: supabase/migrations/20260203220000_update_invitation_template_with_avatar.sql');
      console.log('   3. Paste into the SQL Editor');
      console.log('   4. Click "Run" to execute');
      console.log('');
      console.log('Or use the Supabase CLI:');
      console.log('   npx supabase db push --db-url "your-connection-string"');
    } else {
      console.log('⚠️  Template not found - migration will create it');
    }

  } catch (error) {
    console.error('\n❌ Error:', error.message);
    process.exit(1);
  }
}

main();
