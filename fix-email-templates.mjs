import dotenv from 'dotenv';
import { fileURLToPath } from 'url';
import { dirname, join } from 'path';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

dotenv.config({ path: join(__dirname, '.env.staging') });

const supabaseUrl = process.env.SUPABASE_URL;
const serviceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY;

console.log('🔧 EMAIL TEMPLATE FIX SCRIPT\n');
console.log('Using:', supabaseUrl);
console.log('');

async function apiRequest(endpoint, method = 'GET', body = null) {
  const url = `${supabaseUrl}/rest/v1/${endpoint}`;
  const headers = {
    'Content-Type': 'application/json',
    'apikey': serviceRoleKey,
    'Authorization': `Bearer ${serviceRoleKey}`,
    'Prefer': 'return=representation'
  };

  const options = { method, headers };
  if (body) options.body = JSON.stringify(body);

  const response = await fetch(url, options);
  if (!response.ok) {
    const error = await response.text();
    throw new Error(`API Error: ${response.status} - ${error}`);
  }

  const text = await response.text();
  return text ? JSON.parse(text) : null;
}

async function fixTemplateTypes() {
  console.log('1️⃣ Fixing wrong template_type values...\n');

  // Fix organization_invitation template_type
  console.log('   Fixing organization_invitation (transactional → organization_invitation)');
  await apiRequest(
    'encharge_email_templates?template_name=eq.organization_invitation',
    'PATCH',
    { template_type: 'organization_invitation', updated_at: new Date().toISOString() }
  );

  // Fix waitlist invitation template_type
  console.log('   Fixing Waitlist Invitation (waitlist_invitation → waitlist_invite)');
  await apiRequest(
    'encharge_email_templates?template_name=eq.Waitlist Invitation - Set Password',
    'PATCH',
    { template_type: 'waitlist_invite', updated_at: new Date().toISOString() }
  );

  console.log('   ✅ Template types fixed\n');
}

async function removeDuplicates() {
  console.log('2️⃣ Removing duplicate Welcome templates...\n');

  // Get both welcome templates
  const templates = await apiRequest(
    'encharge_email_templates?template_type=eq.welcome&select=id,template_name,created_at&order=created_at.asc'
  );

  if (templates.length > 1) {
    // Keep the newer one, delete the older one
    const toDelete = templates[0]; // Older one
    console.log(`   Deleting older template: "${toDelete.template_name}" (${toDelete.created_at})`);

    await apiRequest(
      `encharge_email_templates?id=eq.${toDelete.id}`,
      'PATCH',
      { is_active: false, updated_at: new Date().toISOString() }
    );

    console.log('   ✅ Duplicate removed\n');
  } else {
    console.log('   ℹ️  No duplicates found\n');
  }
}

async function populateVariables() {
  console.log('3️⃣ Populating variables arrays...\n');

  const variableDefinitions = {
    'organization_invitation': [
      { name: 'app_logo_url', description: 'Sixty logo URL' },
      { name: 'recipient_name', description: 'Recipient\'s first name' },
      { name: 'organization_name', description: 'Organization name' },
      { name: 'inviter_name', description: 'Name of person who invited' },
      { name: 'inviter_avatar_url', description: 'Inviter\'s avatar URL' },
      { name: 'invitation_url', description: 'Accept invitation URL' },
      { name: 'expiry_time', description: 'Link expiration time' },
      { name: 'support_email', description: 'Support email address' }
    ],
    'email_change_verification': [
      { name: 'recipient_name', description: 'Recipient\'s first name' },
      { name: 'old_email', description: 'Current email address' },
      { name: 'new_email', description: 'New email address' },
      { name: 'action_url', description: 'Verification URL' },
      { name: 'expiry_time', description: 'Link expiration time' }
    ],
    'password_reset': [
      { name: 'recipient_name', description: 'Recipient\'s first name' },
      { name: 'action_url', description: 'Password reset URL' },
      { name: 'expiry_time', description: 'Link expiration time' }
    ],
    'trial_ending': [
      { name: 'recipient_name', description: 'Recipient\'s first name' },
      { name: 'trial_days', description: 'Days until trial ends' },
      { name: 'action_url', description: 'Upgrade URL' }
    ],
    'trial_expired': [
      { name: 'recipient_name', description: 'Recipient\'s first name' },
      { name: 'action_url', description: 'Reactivate URL' }
    ],
    'welcome': [
      { name: 'recipient_name', description: 'Recipient\'s first name' },
      { name: 'organization_name', description: 'Organization name' },
      { name: 'action_url', description: 'Get started URL' }
    ],
    'waitlist_welcome': [
      { name: 'recipient_name', description: 'Recipient\'s first name' },
      { name: 'company_name', description: 'Company name' },
      { name: 'action_url', description: 'App URL' }
    ],
    'waitlist_invite': [
      { name: 'recipient_name', description: 'Recipient\'s first name' },
      { name: 'company_name', description: 'Company name' },
      { name: 'action_url', description: 'Access URL' },
      { name: 'expiry_time', description: 'Link expiration time' }
    ]
  };

  for (const [templateType, variables] of Object.entries(variableDefinitions)) {
    console.log(`   Updating ${templateType}`);
    await apiRequest(
      `encharge_email_templates?template_type=eq.${templateType}`,
      'PATCH',
      { variables, updated_at: new Date().toISOString() }
    );
  }

  console.log('   ✅ Variables populated\n');
}

async function verifyFixes() {
  console.log('4️⃣ Verifying fixes...\n');

  const templates = await apiRequest(
    'encharge_email_templates?select=template_name,template_type,variables,is_active&order=template_name.asc'
  );

  const active = templates.filter(t => t.is_active);
  console.log(`   Total templates: ${templates.length}`);
  console.log(`   Active templates: ${active.length}`);
  console.log(`   Inactive templates: ${templates.length - active.length}`);

  // Check for duplicates
  const typeCount = {};
  active.forEach(t => {
    typeCount[t.template_type] = (typeCount[t.template_type] || 0) + 1;
  });

  const duplicates = Object.entries(typeCount).filter(([, count]) => count > 1);
  if (duplicates.length > 0) {
    console.log('\n   ⚠️  Still have duplicates:');
    duplicates.forEach(([type, count]) => console.log(`      ${type}: ${count}`));
  } else {
    console.log('   ✅ No duplicates');
  }

  // Check variables
  const noVariables = active.filter(t => !t.variables || t.variables.length === 0);
  if (noVariables.length > 0) {
    console.log(`\n   ⚠️  ${noVariables.length} templates still missing variables:`);
    noVariables.forEach(t => console.log(`      ${t.template_name} (${t.template_type})`));
  } else {
    console.log('   ✅ All templates have variables defined');
  }

  console.log('');
}

async function main() {
  try {
    await fixTemplateTypes();
    await removeDuplicates();
    await populateVariables();
    await verifyFixes();

    console.log('✅ EMAIL TEMPLATE FIX COMPLETE\n');
    console.log('📋 Next steps:');
    console.log('   1. Review email-template-audit-report.md for missing templates');
    console.log('   2. Run the migration to create 10 missing templates');
    console.log('   3. Test each template with the edge function');

  } catch (error) {
    console.error('❌ Error:', error.message);
    process.exit(1);
  }
}

main();
