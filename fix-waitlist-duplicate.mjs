import dotenv from 'dotenv';
import { fileURLToPath } from 'url';
import { dirname, join } from 'path';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

dotenv.config({ path: join(__dirname, '.env.staging') });

const supabaseUrl = process.env.SUPABASE_URL;
const serviceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY;

async function fixWaitlistDuplicate() {
  console.log('🔍 Finding waitlist_invite duplicates...\n');

  const response = await fetch(
    `${supabaseUrl}/rest/v1/encharge_email_templates?template_type=eq.waitlist_invite&select=id,template_name,created_at,is_active&order=created_at.asc`,
    {
      headers: {
        'apikey': serviceRoleKey,
        'Authorization': `Bearer ${serviceRoleKey}`
      }
    }
  );

  const templates = await response.json();
  console.log('Found templates:');
  templates.forEach((t, idx) => {
    console.log(`${idx + 1}. "${t.template_name}" - ${t.created_at} - Active: ${t.is_active}`);
  });

  const active = templates.filter(t => t.is_active);

  if (active.length > 1) {
    // Keep the newer one, deactivate the older one
    const toDeactivate = active[0]; // Older one
    console.log(`\n❌ Deactivating: "${toDeactivate.template_name}"`);

    await fetch(
      `${supabaseUrl}/rest/v1/encharge_email_templates?id=eq.${toDeactivate.id}`,
      {
        method: 'PATCH',
        headers: {
          'Content-Type': 'application/json',
          'apikey': serviceRoleKey,
          'Authorization': `Bearer ${serviceRoleKey}`,
          'Prefer': 'return=representation'
        },
        body: JSON.stringify({
          is_active: false,
          updated_at: new Date().toISOString()
        })
      }
    );

    console.log('✅ Duplicate removed');
  } else {
    console.log('\n✅ No active duplicates found');
  }
}

fixWaitlistDuplicate();
