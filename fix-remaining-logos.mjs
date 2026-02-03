import dotenv from 'dotenv';
import { fileURLToPath } from 'url';
import { dirname, join } from 'path';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

dotenv.config({ path: join(__dirname, '.env.staging') });

const supabaseUrl = process.env.SUPABASE_URL;
const serviceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY;

const templatesToFix = [
  { name: 'Trial Ending Soon', type: 'trial_ending' },
  { name: 'Trial Expired', type: 'trial_expired' },
  { name: 'user_created', type: 'transactional' }
];

async function addLogoToTemplate(templateType, templateName) {
  // Get current template
  const getResponse = await fetch(
    `${supabaseUrl}/rest/v1/encharge_email_templates?template_type=eq.${templateType}&select=*`,
    {
      headers: {
        'apikey': serviceRoleKey,
        'Authorization': `Bearer ${serviceRoleKey}`
      }
    }
  );

  const templates = await getResponse.json();
  if (templates.length === 0) {
    throw new Error(`Template not found: ${templateName}`);
  }

  const template = templates[0];
  let html = template.html_body;

  // Check if logo already exists
  if (html.toLowerCase().includes('sixty-logo') || html.toLowerCase().includes('app_logo_url')) {
    console.log(`ℹ️  ${templateName} already has logo`);
    return;
  }

  // Find the body tag and add logo after it
  const logoHtml = `
            <!-- Sixty Logo Header -->
            <div style="text-align: center; margin: 0 0 32px 0; padding-bottom: 24px; border-bottom: 1px solid #e5e7eb;">
                <img src="https://app.use60.com/sixty-logo.png" alt="Sixty" style="height: 48px; width: auto; margin: 0 auto; display: block;" />
            </div>
`;

  // Insert logo after the opening div following body tag
  html = html.replace(
    /(<body[^>]*>[\s\S]*?<div[^>]*>[\s\S]*?<div[^>]*>)/,
    `$1${logoHtml}`
  );

  // Update template
  const updateResponse = await fetch(
    `${supabaseUrl}/rest/v1/encharge_email_templates?id=eq.${template.id}`,
    {
      method: 'PATCH',
      headers: {
        'Content-Type': 'application/json',
        'apikey': serviceRoleKey,
        'Authorization': `Bearer ${serviceRoleKey}`,
        'Prefer': 'return=representation'
      },
      body: JSON.stringify({
        html_body: html,
        updated_at: new Date().toISOString()
      })
    }
  );

  if (!updateResponse.ok) {
    const error = await updateResponse.text();
    throw new Error(`Failed to update: ${error}`);
  }

  return await updateResponse.json();
}

async function main() {
  console.log('🎨 ADDING LOGO TO REMAINING TEMPLATES\n');

  let updated = 0;
  let errors = 0;

  for (const template of templatesToFix) {
    try {
      await addLogoToTemplate(template.type, template.name);
      console.log(`✅ ${template.name}`);
      updated++;
    } catch (error) {
      console.log(`❌ ${template.name}: ${error.message}`);
      errors++;
    }
  }

  console.log(`\n📊 Summary:`);
  console.log(`   Updated: ${updated}`);
  console.log(`   Errors: ${errors}`);

  if (errors === 0) {
    console.log('\n✅ All templates now have Sixty logo!');
  }
}

main();
