import dotenv from 'dotenv';
import { fileURLToPath } from 'url';
import { dirname, join } from 'path';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

dotenv.config({ path: join(__dirname, '.env.staging') });

const supabaseUrl = process.env.SUPABASE_URL;
const serviceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY;

console.log('🎨 EMAIL TEMPLATE DESIGN VERIFICATION\n');

async function verifyDesign() {
  const response = await fetch(
    `${supabaseUrl}/rest/v1/encharge_email_templates?is_active=eq.true&select=template_name,template_type,html_body&order=template_name.asc`,
    {
      headers: {
        'apikey': serviceRoleKey,
        'Authorization': `Bearer ${serviceRoleKey}`
      }
    }
  );

  const templates = await response.json();

  console.log(`Checking ${templates.length} active templates...\n`);

  const issues = {
    missingLogo: [],
    missingDoctype: [],
    missingHtmlTag: [],
    bareHtml: []
  };

  templates.forEach(t => {
    const html = t.html_body.toLowerCase();

    // Check for Sixty logo
    if (!html.includes('app_logo_url') && !html.includes('logo')) {
      issues.missingLogo.push(t.template_name);
    }

    // Check for proper HTML structure
    if (!html.includes('<!doctype') && !html.includes('<html')) {
      issues.bareHtml.push(t.template_name);
    }
  });

  // Report findings
  console.log('📊 Design Verification Results:\n');

  if (issues.missingLogo.length > 0) {
    console.log('⚠️  Missing Sixty Logo:');
    issues.missingLogo.forEach(name => console.log(`   - ${name}`));
    console.log('');
  } else {
    console.log('✅ All templates reference logo\n');
  }

  if (issues.bareHtml.length > 0) {
    console.log('⚠️  Missing HTML Structure (bare HTML):');
    issues.bareHtml.forEach(name => console.log(`   - ${name}`));
    console.log('');
  } else {
    console.log('✅ All templates have proper HTML structure\n');
  }

  // Show sample of good template
  const goodTemplate = templates.find(t =>
    t.html_body.toLowerCase().includes('app_logo_url') ||
    t.html_body.toLowerCase().includes('<img')
  );

  if (goodTemplate) {
    console.log('📝 Sample of well-formatted template:');
    console.log(`Template: ${goodTemplate.template_name}`);
    console.log(`First 500 chars:\n${goodTemplate.html_body.substring(0, 500)}...\n`);
  }

  // Summary
  console.log('\n📈 Summary:');
  console.log(`   Total templates checked: ${templates.length}`);
  console.log(`   Missing logo: ${issues.missingLogo.length}`);
  console.log(`   Bare HTML (no structure): ${issues.bareHtml.length}`);

  if (issues.missingLogo.length === 0 && issues.bareHtml.length === 0) {
    console.log('\n✅ All templates pass design verification!');
  } else {
    console.log('\n⚠️  Some templates need design updates');
  }
}

verifyDesign();
