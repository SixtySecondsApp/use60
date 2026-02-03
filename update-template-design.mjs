import dotenv from 'dotenv';
import { fileURLToPath } from 'url';
import { dirname, join } from 'path';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

dotenv.config({ path: join(__dirname, '.env.staging') });

const supabaseUrl = process.env.SUPABASE_URL;
const serviceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY;

// Wrap content in proper email HTML structure
function wrapInEmailTemplate(content, subject) {
  return `<!DOCTYPE html>
<html>
<head>
    <meta charset="UTF-8">
    <meta name="viewport" content="width=device-width, initial-scale=1.0">
    <meta http-equiv="X-UA-Compatible" content="IE=edge">
    <title>${subject}</title>
</head>
<body style="margin: 0; padding: 0; font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif; background-color: #f9fafb; line-height: 1.6; color: #4b5563;">
    <div style="max-width: 600px; margin: 0 auto; padding: 20px; background-color: #f9fafb;">
        <div style="background-color: white; border-radius: 8px; padding: 40px; box-shadow: 0 1px 3px rgba(0,0,0,0.1);">

            <!-- Sixty Logo Header -->
            <div style="text-align: center; margin: 0 0 32px 0; padding-bottom: 24px; border-bottom: 1px solid #e5e7eb;">
                <img src="https://app.use60.com/sixty-logo.png" alt="Sixty" style="height: 48px; width: auto; margin: 0 auto; display: block;" />
            </div>

            ${content}

            <div style="margin-top: 32px; padding-top: 20px; border-top: 1px solid #e5e7eb; text-align: center;">
                <p style="margin: 0; font-size: 12px; color: #9ca3af; line-height: 1.6;">
                    This is an automated message from Sixty.<br/>
                    If you have any questions, contact us at <a href="mailto:app@sixtyseconds.ai" style="color: #3b82f6; text-decoration: none;">app@sixtyseconds.ai</a>
                </p>
            </div>
        </div>
    </div>
</body>
</html>`;
}

// Convert simple paragraph HTML to styled version
function styleContent(html) {
  return html
    .replace(/<p>/g, '<p style="color: #4b5563; margin: 0 0 16px 0; line-height: 1.6; font-size: 16px;">')
    .replace(/<strong>/g, '<strong style="color: #1f2937;">')
    .replace(/<a href="([^"]+)" style="([^"]+)">/g, '<div style="text-align: center; margin: 32px 0;"><a href="$1" style="display: inline-block; padding: 14px 32px; background-color: #3b82f6; color: #ffffff; text-decoration: none; border-radius: 6px; font-weight: 600; font-size: 16px;">');
}

const templatesToUpdate = [
  'member_removed',
  'org_approval',
  'join_request_approved',
  'join_request_rejected',
  'fathom_connected',
  'first_meeting_synced',
  'subscription_confirmed',
  'meeting_limit_warning',
  'upgrade_prompt',
  'permission_to_close'
];

async function updateTemplate(templateName) {
  // Get current template
  const getResponse = await fetch(
    `${supabaseUrl}/rest/v1/encharge_email_templates?template_name=eq.${templateName}&select=*`,
    {
      headers: {
        'apikey': serviceRoleKey,
        'Authorization': `Bearer ${serviceRoleKey}`
      }
    }
  );

  const templates = await getResponse.json();
  if (templates.length === 0) {
    throw new Error(`Template ${templateName} not found`);
  }

  const template = templates[0];

  // Wrap in proper email structure
  const styledContent = styleContent(template.html_body);
  const wrappedHtml = wrapInEmailTemplate(styledContent, template.subject_line);

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
        html_body: wrappedHtml,
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
  console.log('🎨 UPDATING TEMPLATE DESIGNS\n');
  console.log(`Updating ${templatesToUpdate.length} templates with proper HTML structure and Sixty logo...\n`);

  let updated = 0;
  let errors = 0;

  for (const templateName of templatesToUpdate) {
    try {
      await updateTemplate(templateName);
      console.log(`✅ ${templateName}`);
      updated++;
    } catch (error) {
      console.log(`❌ ${templateName}: ${error.message}`);
      errors++;
    }
  }

  console.log(`\n📊 Summary:`);
  console.log(`   Updated: ${updated}`);
  console.log(`   Errors: ${errors}`);
  console.log(`   Total: ${templatesToUpdate.length}`);

  if (updated === templatesToUpdate.length) {
    console.log('\n✅ All templates now have proper design with Sixty logo!');
  }
}

main();
