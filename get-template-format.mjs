import dotenv from 'dotenv';
import { fileURLToPath } from 'url';
import { dirname, join } from 'path';
import { writeFileSync } from 'fs';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

dotenv.config({ path: join(__dirname, '.env.staging') });

const supabaseUrl = process.env.SUPABASE_URL;
const serviceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY;

async function getTemplate() {
  const response = await fetch(
    `${supabaseUrl}/rest/v1/encharge_email_templates?template_name=eq.organization_invitation&select=*`,
    {
      headers: {
        'apikey': serviceRoleKey,
        'Authorization': `Bearer ${serviceRoleKey}`
      }
    }
  );

  const templates = await response.json();
  const template = templates[0];

  console.log('organization_invitation template:');
  console.log('\n=== HTML BODY ===');
  console.log(template.html_body);

  // Save to file for easier viewing
  writeFileSync('template-reference.html', template.html_body);
  console.log('\n✅ Saved to template-reference.html');
}

getTemplate();
