import { readFileSync } from 'fs';
import dotenv from 'dotenv';
import { fileURLToPath } from 'url';
import { dirname, join } from 'path';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

dotenv.config({ path: join(__dirname, '.env.staging') });

const supabaseUrl = process.env.SUPABASE_URL;
const serviceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY;

console.log('🔧 Applying migration via Supabase API...');

async function executeSql(sql) {
  // Method 1: Try using Supabase's pg_execute endpoint
  const queryEndpoint = `${supabaseUrl}/rest/v1/rpc/exec_sql`;

  try {
    console.log('Attempting Method 1: exec_sql RPC...');
    const response = await fetch(queryEndpoint, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'apikey': serviceRoleKey,
        'Authorization': `Bearer ${serviceRoleKey}`,
        'Prefer': 'return=representation'
      },
      body: JSON.stringify({ query: sql })
    });

    const result = await response.text();
    console.log('Response:', response.status, result);

    if (response.ok) {
      return { success: true, method: 'exec_sql' };
    }
  } catch (error) {
    console.log('Method 1 failed:', error.message);
  }

  // Method 2: Try executing via direct table update
  console.log('\nAttempting Method 2: Direct table update...');

  try {
    // Parse the migration SQL to extract the html_body, text_body, and variables
    const migration = readFileSync(
      join(__dirname, 'supabase', 'migrations', '20260203220000_update_invitation_template_with_avatar.sql'),
      'utf-8'
    );

    // We'll update the template using the REST API
    const updateEndpoint = `${supabaseUrl}/rest/v1/encharge_email_templates`;

    // First, get the current template
    const getResponse = await fetch(
      `${updateEndpoint}?template_name=eq.organization_invitation&select=*`,
      {
        headers: {
          'apikey': serviceRoleKey,
          'Authorization': `Bearer ${serviceRoleKey}`
        }
      }
    );

    const templates = await getResponse.json();
    console.log('Current template found:', templates.length > 0);

    // Read the new template HTML from the migration file
    const htmlBodyMatch = migration.match(/html_body = '([\s\S]*?)(?=',\s*text_body)/);
    const textBodyMatch = migration.match(/text_body = '([\s\S]*?)(?=',\s*variables)/);
    const variablesMatch = migration.match(/variables = '(\[[\s\S]*?\])'::jsonb/);

    if (!htmlBodyMatch || !textBodyMatch || !variablesMatch) {
      throw new Error('Could not parse migration SQL');
    }

    const newData = {
      html_body: htmlBodyMatch[1].replace(/''/g, "'"),
      text_body: textBodyMatch[1].replace(/''/g, "'"),
      variables: JSON.parse(variablesMatch[1]),
      updated_at: new Date().toISOString()
    };

    console.log('Updating template with new data...');
    console.log('- HTML body length:', newData.html_body.length);
    console.log('- Text body length:', newData.text_body.length);
    console.log('- Variables:', newData.variables.map(v => v.name).join(', '));

    const updateResponse = await fetch(
      `${updateEndpoint}?template_name=eq.organization_invitation`,
      {
        method: 'PATCH',
        headers: {
          'Content-Type': 'application/json',
          'apikey': serviceRoleKey,
          'Authorization': `Bearer ${serviceRoleKey}`,
          'Prefer': 'return=representation'
        },
        body: JSON.stringify(newData)
      }
    );

    const updateResult = await updateResponse.json();

    if (updateResponse.ok) {
      console.log('✅ Template updated successfully!');
      console.log('Updated template:', updateResult);
      return { success: true, method: 'direct_update', data: updateResult };
    } else {
      console.error('❌ Update failed:', updateResult);
      throw new Error(JSON.stringify(updateResult));
    }

  } catch (error) {
    console.error('Method 2 failed:', error.message);
    throw error;
  }
}

async function main() {
  try {
    const sql = readFileSync(
      join(__dirname, 'supabase', 'migrations', '20260203220000_update_invitation_template_with_avatar.sql'),
      'utf-8'
    );

    console.log(`Migration file: ${sql.length} characters\n`);

    const result = await executeSql(sql);

    if (result.success) {
      console.log(`\n🎉 Migration applied successfully using ${result.method}!`);

      // Verify
      console.log('\n🔍 Verifying update...');
      const verifyEndpoint = `${supabaseUrl}/rest/v1/encharge_email_templates?template_name=eq.organization_invitation&select=template_name,variables`;

      const verifyResponse = await fetch(verifyEndpoint, {
        headers: {
          'apikey': serviceRoleKey,
          'Authorization': `Bearer ${serviceRoleKey}`
        }
      });

      const verified = await verifyResponse.json();
      if (verified.length > 0) {
        const template = verified[0];
        const hasAvatar = template.variables.some(v => v.name === 'inviter_avatar_url');
        console.log(`✅ Template verified`);
        console.log(`   - Has avatar support: ${hasAvatar}`);
        console.log(`   - Variables: ${template.variables.length}`);
      }

      console.log('\n✨ Email template now includes profile photos!');
      console.log('👉 Test by sending an invitation from the app\n');
    }
  } catch (error) {
    console.error('\n❌ Migration failed:', error.message);
    process.exit(1);
  }
}

main();
