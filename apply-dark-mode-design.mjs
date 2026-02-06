import dotenv from 'dotenv';
import { fileURLToPath } from 'url';
import { dirname, join } from 'path';
import { readFileSync } from 'fs';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

dotenv.config({ path: join(__dirname, '.env.staging') });

const supabaseUrl = process.env.SUPABASE_URL;
const serviceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY;

// Read the reference template to get the exact CSS
const DARK_MODE_HEAD = `<!DOCTYPE html>
<html>
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <meta http-equiv="X-UA-Compatible" content="IE=edge">
  <meta name="color-scheme" content="light">
  <meta name="supported-color-schemes" content="light">
  <title>{{subject_line}}</title>
  <link rel="preconnect" href="https://fonts.googleapis.com">
  <link rel="preconnect" href="https://fonts.gstatic.com" crossorigin>
  <link href="https://fonts.googleapis.com/css2?family=Inter:wght@400;500;600;700&display=swap" rel="stylesheet">
  <style type="text/css">
    /* Reset */
    body, table, td, p, a, li, blockquote { -webkit-text-size-adjust: 100%; -ms-text-size-adjust: 100%; }
    table, td { mso-table-lspace: 0pt; mso-table-rspace: 0pt; }
    img { -ms-interpolation-mode: bicubic; border: 0; outline: none; text-decoration: none; }

    /* Base styles - Desktop */
    html {
      color-scheme: light !important;
      background-color: #030712 !important;
      margin: 0 !important;
      padding: 0 !important;
      height: 100% !important;
    }
    body {
      color-scheme: light !important;
      background-color: #030712 !important;
      margin: 0 !important;
      padding: 0 !important;
      height: 100% !important;
      width: 100% !important;
      -webkit-text-fill-color: #F3F4F6 !important;
    }

    * {
      color-scheme: light !important;
      forced-color-adjust: none !important;
    }

    /* Gmail Dark Mode Prevention */
    u + .body .gmail-blend-screen,
    u + .body .gmail-blend-difference,
    .msg-html-content,
    .msg-html-content *,
    [data-ogsc] .msg-html-content,
    [data-ogsc] .msg-html-content * {
      background-color: #111827 !important;
      color: #FFFFFF !important;
      -webkit-text-fill-color: #FFFFFF !important;
      forced-color-adjust: none !important;
    }

    u + .body {
      background-color: #111827 !important;
      color-scheme: light !important;
    }

    @media screen and (-webkit-min-device-pixel-ratio: 0) {
      .msg-html-content,
      .msg-html-content table,
      .msg-html-content td {
        background-color: #111827 !important;
        color: #FFFFFF !important;
        -webkit-text-fill-color: #FFFFFF !important;
      }
    }

    /* Mobile Styles */
    @media only screen and (max-width: 600px) {
      html, body {
        width: 100% !important;
        background-color: #111827 !important;
        color: #FFFFFF !important;
        -webkit-text-fill-color: #FFFFFF !important;
      }

      .email-container {
        width: 100% !important;
        border-radius: 0 !important;
      }

      .email-header {
        padding: 32px 20px 24px !important;
      }

      .email-logo {
        width: 64px !important;
        height: 64px !important;
      }

      .email-title {
        font-size: 24px !important;
      }

      .email-subtitle {
        font-size: 16px !important;
      }

      .email-content {
        padding: 24px 20px !important;
      }

      .email-button {
        padding: 12px 24px !important;
        font-size: 15px !important;
      }
    }
  </style>
</head>`;

function wrapInDarkModeTemplate(content, title) {
  return `${DARK_MODE_HEAD}
<body style="margin: 0 !important; padding: 0 !important; font-family: 'Inter', -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif; background-color: #030712 !important; -webkit-font-smoothing: antialiased; color: #FFFFFF !important; width: 100% !important;">
  <div style="background-color: #111827 !important; min-height: 100vh; width: 100% !important;">
  <table role="presentation" cellspacing="0" cellpadding="0" border="0" width="100%" style="background-color: #030712 !important; padding: 0; margin: 0 auto; width: 100% !important;">
    <tr>
      <td align="center" style="padding: 20px 0; background-color: #030712 !important;">
        <table role="presentation" cellspacing="0" cellpadding="0" border="0" width="600" class="email-container" style="max-width: 600px; width: 100%; background-color: #111827 !important; border-radius: 16px; overflow: hidden; border: 1px solid #374151 !important;">

          <!-- Header with Logo -->
          <tr>
            <td class="email-header" style="padding: 48px 40px 32px; text-align: center; background-color: #111827 !important; background: linear-gradient(135deg, #111827 0%, #1F2937 100%) !important;">
              <img src="https://ygdpgliavpxeugaajgrb.supabase.co/storage/v1/object/public/Logos/ac4efca2-1fe1-49b3-9d5e-6ac3d8bf3459/Icon.png" alt="Sixty" width="80" height="80" class="email-logo" style="display: block; margin: 0 auto 24px; max-width: 80px;" />
              <h1 class="email-title" style="color: #FFFFFF !important; font-size: 28px; font-weight: 700; margin: 0 0 12px 0; line-height: 1.2; letter-spacing: -0.02em;">${title}</h1>
            </td>
          </tr>

          <!-- Main Content -->
          <tr>
            <td class="email-content" style="padding: 40px 40px; background-color: #111827 !important; color: #F3F4F6 !important;">
              ${content}
            </td>
          </tr>

          <!-- Footer -->
          <tr>
            <td class="email-footer" style="padding: 24px 40px; text-align: center; background-color: #111827 !important; border-top: 1px solid #374151 !important;">
              <p style="color: #D1D5DB !important; font-size: 14px; margin: 0 0 8px 0; font-weight: 500;">Sent by Sixty</p>
              <p style="color: #9CA3AF !important; font-size: 12px; margin: 0;">If you have questions, contact <a href="mailto:app@sixtyseconds.ai" style="color: #10B981 !important; text-decoration: none;">app@sixtyseconds.ai</a></p>
            </td>
          </tr>

        </table>
      </td>
    </tr>
  </table>
  </div>
</body>
</html>`;
}

// Extract just the body content from existing HTML
function extractContent(html) {
  // Remove DOCTYPE, html, head, body tags and extract just the content
  let content = html;

  // Remove everything before <body> and after </body>
  content = content.replace(/[\s\S]*<body[^>]*>/i, '');
  content = content.replace(/<\/body>[\s\S]*/i, '');

  // Remove outer wrapper divs
  content = content.replace(/^\s*<div[^>]*>/i, '');
  content = content.replace(/<\/div>\s*$/i, '');

  // Remove old logo sections
  content = content.replace(/<div[^>]*>\s*<img[^>]*sixty-logo[^>]*>[\s\S]*?<\/div>/gi, '');
  content = content.replace(/<!-- Sixty Logo Header -->[\s\S]*?<\/div>/gi, '');
  content = content.replace(/<!-- App Logo Header -->[\s\S]*?<\/div>/gi, '');

  // Style paragraphs for dark mode
  content = content.replace(/<p>/g, '<p style="color: #F3F4F6 !important; font-size: 16px; line-height: 1.7; margin: 0 0 16px 0;">');
  content = content.replace(/<p style="[^"]*">/g, '<p style="color: #F3F4F6 !important; font-size: 16px; line-height: 1.7; margin: 0 0 16px 0;">');

  // Style strong tags
  content = content.replace(/<strong>/g, '<strong style="color: #FFFFFF !important; font-weight: 600;">');
  content = content.replace(/<strong style="[^"]*">/g, '<strong style="color: #FFFFFF !important; font-weight: 600;">');

  // Style links/buttons
  content = content.replace(/<a href="([^"]*)"[^>]*>/g, '<a href="$1" style="display: inline-block; padding: 14px 32px; background: linear-gradient(135deg, #10B981 0%, #059669 100%) !important; color: #FFFFFF !important; text-decoration: none; border-radius: 8px; font-weight: 600; font-size: 16px; margin: 24px 0;">');

  return content.trim();
}

async function updateAllTemplates() {
  console.log('🎨 APPLYING DARK MODE DESIGN TO ALL TEMPLATES\n');

  // Get all active templates
  const response = await fetch(
    `${supabaseUrl}/rest/v1/encharge_email_templates?is_active=eq.true&select=*&order=template_name.asc`,
    {
      headers: {
        'apikey': serviceRoleKey,
        'Authorization': `Bearer ${serviceRoleKey}`
      }
    }
  );

  const templates = await response.json();
  console.log(`Found ${templates.length} active templates\n`);

  let updated = 0;
  let errors = 0;

  for (const template of templates) {
    try {
      // Extract content and wrap in dark mode template
      const content = extractContent(template.html_body);
      const title = template.subject_line.replace(/\{\{/g, '').replace(/\}\}/g, '').replace(/_/g, ' ');
      const darkModeHtml = wrapInDarkModeTemplate(content, title);

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
            html_body: darkModeHtml,
            updated_at: new Date().toISOString()
          })
        }
      );

      if (!updateResponse.ok) {
        throw new Error(`HTTP ${updateResponse.status}`);
      }

      console.log(`✅ ${template.template_name}`);
      updated++;

    } catch (error) {
      console.log(`❌ ${template.template_name}: ${error.message}`);
      errors++;
    }
  }

  console.log(`\n📊 Summary:`);
  console.log(`   Updated: ${updated}`);
  console.log(`   Errors: ${errors}`);
  console.log(`   Total: ${templates.length}`);

  if (updated === templates.length) {
    console.log('\n✅ All templates now use dark mode design!');
  }
}

updateAllTemplates();
