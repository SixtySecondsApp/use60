import { readFileSync } from 'fs';
import dotenv from 'dotenv';
import { fileURLToPath } from 'url';
import { dirname, join } from 'path';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

dotenv.config({ path: join(__dirname, '.env.staging') });

const supabaseUrl = process.env.SUPABASE_URL;
const serviceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY;

console.log('🔧 Adding logo to email template...');

async function main() {
  try {
    const migration = readFileSync(
      join(__dirname, 'supabase', 'migrations', '20260203230000_add_logo_to_email_template.sql'),
      'utf-8'
    );

    // Parse the migration SQL to extract the html_body and variables
    const htmlBodyMatch = migration.match(/html_body = '([\s\S]*?)(?=',\s*variables)/);
    const variablesMatch = migration.match(/variables = '(\[[\s\S]*?\])'::jsonb/);

    if (!htmlBodyMatch || !variablesMatch) {
      throw new Error('Could not parse migration SQL');
    }

    const newData = {
      html_body: htmlBodyMatch[1].replace(/''/g, "'"),
      variables: JSON.parse(variablesMatch[1]),
      updated_at: new Date().toISOString()
    };

    console.log('Updating template with logo...');
    console.log('- HTML body length:', newData.html_body.length);
    console.log('- Variables:', newData.variables.map(v => v.name).join(', '));

    const updateEndpoint = `${supabaseUrl}/rest/v1/encharge_email_templates`;
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
        const hasLogo = template.variables.some(v => v.name === 'app_logo_url');
        const hasAvatar = template.variables.some(v => v.name === 'inviter_avatar_url');
        console.log(`✅ Template verified`);
        console.log(`   - Has logo support: ${hasLogo}`);
        console.log(`   - Has avatar support: ${hasAvatar}`);
        console.log(`   - Total variables: ${template.variables.length}`);
      }

      console.log('\n✨ Email template now includes Sixty logo!');
      console.log('👉 Test by sending an invitation from the app\n');
    } else {
      console.error('❌ Update failed:', updateResult);
      throw new Error(JSON.stringify(updateResult));
    }

  } catch (error) {
    console.error('\n❌ Migration failed:', error.message);
    process.exit(1);
  }
}

main();
