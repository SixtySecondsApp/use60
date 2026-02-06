import dotenv from 'dotenv';
import { fileURLToPath } from 'url';
import { dirname, join } from 'path';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

dotenv.config({ path: join(__dirname, '.env.staging') });

const supabaseUrl = process.env.SUPABASE_URL;
const serviceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY;

console.log('🔍 EMAIL TEMPLATE AUDIT\n');
console.log('Using:', supabaseUrl);
console.log('');

async function getEmailTemplates() {
  const endpoint = `${supabaseUrl}/rest/v1/encharge_email_templates`;

  const response = await fetch(
    `${endpoint}?select=template_name,template_type,subject_line,variables,is_active,created_at,updated_at&order=template_name.asc`,
    {
      method: 'GET',
      headers: {
        'Content-Type': 'application/json',
        'apikey': serviceRoleKey,
        'Authorization': `Bearer ${serviceRoleKey}`
      }
    }
  );

  if (!response.ok) {
    const error = await response.text();
    throw new Error(`Failed to fetch templates: ${error}`);
  }

  return await response.json();
}

async function auditTemplates() {
  try {
    const templates = await getEmailTemplates();

    console.log(`📊 Found ${templates.length} email templates\n`);

    // Check for duplicates
    const nameCount = {};
    templates.forEach(t => {
      nameCount[t.template_name] = (nameCount[t.template_name] || 0) + 1;
    });

    const duplicates = Object.entries(nameCount).filter(([name, count]) => count > 1);

    if (duplicates.length > 0) {
      console.log('⚠️  DUPLICATES FOUND:');
      duplicates.forEach(([name, count]) => {
        console.log(`   ${name}: ${count} copies`);
      });
      console.log('');
    } else {
      console.log('✅ No duplicates found\n');
    }

    // List all templates
    console.log('📋 ALL TEMPLATES:\n');
    templates.forEach((t, idx) => {
      console.log(`${idx + 1}. ${t.template_name}`);
      console.log(`   Type: ${t.template_type}`);
      console.log(`   Subject: ${t.subject_line}`);
      console.log(`   Active: ${t.is_active}`);
      console.log(`   Created: ${new Date(t.created_at).toISOString().split('T')[0]}`);
      console.log(`   Updated: ${new Date(t.updated_at).toISOString().split('T')[0]}`);

      if (t.variables) {
        const vars = Array.isArray(t.variables) ? t.variables : [];
        const varNames = vars.map(v => v.name).join(', ');
        console.log(`   Variables: ${varNames || '(none)'}`);
      }
      console.log('');
    });

    // Export template names for code search
    console.log('\n📝 Template names to search in code:');
    const uniqueNames = [...new Set(templates.map(t => t.template_name))];
    uniqueNames.forEach(name => console.log(`   '${name}'`));

    return templates;
  } catch (error) {
    console.error('❌ Error:', error.message);
    throw error;
  }
}

auditTemplates();
