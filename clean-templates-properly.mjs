import dotenv from 'dotenv';
import { fileURLToPath } from 'url';
import { dirname, join } from 'path';
import { readFileSync } from 'fs';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

dotenv.config({ path: join(__dirname, '.env.staging') });

const supabaseUrl = process.env.SUPABASE_URL;
const serviceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY;

// Read the reference template
const referenceHtml = `<!DOCTYPE html>
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
    html { color-scheme: light !important; background-color: #030712 !important; }
    body { color-scheme: light !important; background-color: #030712 !important; -webkit-text-fill-color: #F3F4F6 !important; }
    * { color-scheme: light !important; forced-color-adjust: none !important; }
    @media only screen and (max-width: 600px) {
      html, body { background-color: #111827 !important; color: #FFFFFF !important; }
      .email-container { width: 100% !important; border-radius: 0 !important; }
      .email-header { padding: 32px 20px 24px !important; }
      .email-logo { width: 64px !important; height: 64px !important; }
      .email-title { font-size: 24px !important; }
      .email-content { padding: 24px 20px !important; }
      .email-button { padding: 12px 24px !important; font-size: 15px !important; }
    }
  </style>
</head>
<body style="margin: 0; padding: 0; font-family: 'Inter', -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif; background-color: #030712; color: #FFFFFF;">
  <div style="background-color: #111827; min-height: 100vh;">
  <table role="presentation" cellspacing="0" cellpadding="0" border="0" width="100%" style="background-color: #030712;">
    <tr>
      <td align="center" style="padding: 20px 0;">
        <table role="presentation" cellspacing="0" cellpadding="0" border="0" width="600" class="email-container" style="max-width: 600px; background-color: #111827; border-radius: 16px; border: 1px solid #374151;">
          <tr>
            <td class="email-header" style="padding: 48px 40px 32px; text-align: center; background: linear-gradient(135deg, #111827 0%, #1F2937 100%);">
              <img src="https://ygdpgliavpxeugaajgrb.supabase.co/storage/v1/object/public/Logos/ac4efca2-1fe1-49b3-9d5e-6ac3d8bf3459/Icon.png" alt="Sixty" width="80" height="80" class="email-logo" style="display: block; margin: 0 auto 24px;" />
              <h1 class="email-title" style="color: #FFFFFF; font-size: 28px; font-weight: 700; margin: 0 0 12px 0; line-height: 1.2; letter-spacing: -0.02em;">{{TITLE}}</h1>
            </td>
          </tr>
          <tr>
            <td class="email-content" style="padding: 40px; background-color: #111827; color: #F3F4F6;">
{{CONTENT}}
            </td>
          </tr>
          <tr>
            <td class="email-footer" style="padding: 24px 40px; text-align: center; background-color: #111827; border-top: 1px solid #374151;">
              <p style="color: #D1D5DB; font-size: 14px; margin: 0 0 8px 0; font-weight: 500;">Sent by Sixty</p>
              <p style="color: #9CA3AF; font-size: 12px; margin: 0;">If you have questions, contact <a href="mailto:app@sixtyseconds.ai" style="color: #10B981; text-decoration: none;">app@sixtyseconds.ai</a></p>
            </td>
          </tr>
        </table>
      </td>
    </tr>
  </table>
  </div>
</body>
</html>`;

// Template-specific content (cleaned from original migration files and existing templates)
const templateContent = {
  'organization_invitation': `<p style="color: #F3F4F6; font-size: 16px; line-height: 1.7; margin: 0 0 16px 0;">Hi {{recipient_name}},</p>
<p style="color: #F3F4F6; font-size: 16px; line-height: 1.7; margin: 0 0 24px 0;">{{inviter_name}} has invited you to join <strong style="color: #FFFFFF; font-weight: 600;">{{organization_name}}</strong> on Sixty. Accept the invitation below to get started collaborating with your team.</p>
<div style="text-align: center; margin: 32px 0;">
  <a href="{{invitation_url}}" class="email-button" style="display: inline-block; padding: 14px 32px; background: linear-gradient(135deg, #10B981 0%, #059669 100%); color: #FFFFFF; text-decoration: none; border-radius: 8px; font-weight: 600; font-size: 16px;">Accept Invitation</a>
</div>
<p style="color: #9CA3AF; font-size: 14px; margin: 24px 0 0 0; text-align: center;">This invitation expires in {{expiry_time}}</p>`,

  'member_removed': `<p style="color: #F3F4F6; font-size: 16px; line-height: 1.7; margin: 0 0 16px 0;">Hi {{recipient_name}},</p>
<p style="color: #F3F4F6; font-size: 16px; line-height: 1.7; margin: 0 0 16px 0;">You have been removed from <strong style="color: #FFFFFF; font-weight: 600;">{{organization_name}}</strong> by {{admin_name}}.</p>
<p style="color: #F3F4F6; font-size: 16px; line-height: 1.7; margin: 0;">If you believe this is an error or have questions, please contact our support team at <a href="mailto:{{support_email}}" style="color: #10B981; text-decoration: none;">{{support_email}}</a>.</p>`,

  'org_approval': `<p style="color: #F3F4F6; font-size: 16px; line-height: 1.7; margin: 0 0 16px 0;">Hi {{recipient_name}},</p>
<p style="color: #F3F4F6; font-size: 16px; line-height: 1.7; margin: 0 0 24px 0;">Congratulations! Your organization <strong style="color: #FFFFFF; font-weight: 600;">{{organization_name}}</strong> is now set up and ready to use Sixty.</p>
<div style="text-align: center; margin: 32px 0;">
  <a href="{{action_url}}" class="email-button" style="display: inline-block; padding: 14px 32px; background: linear-gradient(135deg, #10B981 0%, #059669 100%); color: #FFFFFF; text-decoration: none; border-radius: 8px; font-weight: 600; font-size: 16px;">Get Started</a>
</div>`,

  'email_change_verification': `<p style="color: #F3F4F6; font-size: 16px; line-height: 1.7; margin: 0 0 16px 0;">Hi {{recipient_name}},</p>
<p style="color: #F3F4F6; font-size: 16px; line-height: 1.7; margin: 0 0 24px 0;">You requested to change your email from <strong style="color: #FFFFFF; font-weight: 600;">{{old_email}}</strong> to <strong style="color: #FFFFFF; font-weight: 600;">{{new_email}}</strong>. Click below to verify this change.</p>
<div style="text-align: center; margin: 32px 0;">
  <a href="{{action_url}}" class="email-button" style="display: inline-block; padding: 14px 32px; background: linear-gradient(135deg, #10B981 0%, #059669 100%); color: #FFFFFF; text-decoration: none; border-radius: 8px; font-weight: 600; font-size: 16px;">Verify Email</a>
</div>
<p style="color: #9CA3AF; font-size: 14px; margin: 24px 0 0 0; text-align: center;">This link expires in {{expiry_time}}</p>`,

  'password_reset': `<p style="color: #F3F4F6; font-size: 16px; line-height: 1.7; margin: 0 0 16px 0;">Hi {{recipient_name}},</p>
<p style="color: #F3F4F6; font-size: 16px; line-height: 1.7; margin: 0 0 24px 0;">Click the button below to reset your password. This link will expire in {{expiry_time}}.</p>
<div style="text-align: center; margin: 32px 0;">
  <a href="{{action_url}}" class="email-button" style="display: inline-block; padding: 14px 32px; background: linear-gradient(135deg, #10B981 0%, #059669 100%); color: #FFFFFF; text-decoration: none; border-radius: 8px; font-weight: 600; font-size: 16px;">Reset Password</a>
</div>
<p style="color: #9CA3AF; font-size: 13px; margin: 24px 0 0 0; text-align: center;">If you didn't request this, please ignore this email.</p>`,

  'welcome': `<p style="color: #F3F4F6; font-size: 16px; line-height: 1.7; margin: 0 0 16px 0;">Hi {{recipient_name}},</p>
<p style="color: #F3F4F6; font-size: 16px; line-height: 1.7; margin: 0 0 24px 0;">Welcome to <strong style="color: #FFFFFF; font-weight: 600;">{{organization_name}}</strong> on Sixty! We're excited to have you on board.</p>
<div style="text-align: center; margin: 32px 0;">
  <a href="{{action_url}}" class="email-button" style="display: inline-block; padding: 14px 32px; background: linear-gradient(135deg, #10B981 0%, #059669 100%); color: #FFFFFF; text-decoration: none; border-radius: 8px; font-weight: 600; font-size: 16px;">Get Started</a>
</div>`,

  'trial_ending': `<p style="color: #F3F4F6; font-size: 16px; line-height: 1.7; margin: 0 0 16px 0;">Hi {{recipient_name}},</p>
<p style="color: #F3F4F6; font-size: 16px; line-height: 1.7; margin: 0 0 24px 0;">Your Sixty trial ends in <strong style="color: #FFFFFF; font-weight: 600;">{{trial_days}} days</strong>. Upgrade now to continue using all features and keep your data safe.</p>
<div style="text-align: center; margin: 32px 0;">
  <a href="{{action_url}}" class="email-button" style="display: inline-block; padding: 14px 32px; background: linear-gradient(135deg, #10B981 0%, #059669 100%); color: #FFFFFF; text-decoration: none; border-radius: 8px; font-weight: 600; font-size: 16px;">Upgrade Now</a>
</div>`,

  'trial_expired': `<p style="color: #F3F4F6; font-size: 16px; line-height: 1.7; margin: 0 0 16px 0;">Hi {{recipient_name}},</p>
<p style="color: #F3F4F6; font-size: 16px; line-height: 1.7; margin: 0 0 24px 0;">Your Sixty trial has ended. Your data will be retained for 30 days. Reactivate your account to continue using Sixty.</p>
<div style="text-align: center; margin: 32px 0;">
  <a href="{{action_url}}" class="email-button" style="display: inline-block; padding: 14px 32px; background: linear-gradient(135deg, #10B981 0%, #059669 100%); color: #FFFFFF; text-decoration: none; border-radius: 8px; font-weight: 600; font-size: 16px;">Reactivate</a>
</div>`,

  'waitlist_invite': `<p style="color: #F3F4F6; font-size: 16px; line-height: 1.7; margin: 0 0 16px 0;">Hi {{recipient_name}},</p>
<p style="color: #F3F4F6; font-size: 16px; line-height: 1.7; margin: 0 0 24px 0;">Great news! Your early access to <strong style="color: #FFFFFF; font-weight: 600;">{{company_name}}</strong> is ready. Click below to get started.</p>
<div style="text-align: center; margin: 32px 0;">
  <a href="{{action_url}}" class="email-button" style="display: inline-block; padding: 14px 32px; background: linear-gradient(135deg, #10B981 0%, #059669 100%); color: #FFFFFF; text-decoration: none; border-radius: 8px; font-weight: 600; font-size: 16px;">Get Started</a>
</div>
<p style="color: #9CA3AF; font-size: 14px; margin: 24px 0 0 0; text-align: center;">This link expires in {{expiry_time}}</p>`,

  'waitlist_welcome': `<p style="color: #F3F4F6; font-size: 16px; line-height: 1.7; margin: 0 0 16px 0;">Hi {{recipient_name}},</p>
<p style="color: #F3F4F6; font-size: 16px; line-height: 1.7; margin: 0 0 24px 0;">You're in! Your account is ready. Explore <strong style="color: #FFFFFF; font-weight: 600;">{{company_name}}</strong> and start using all features right away.</p>
<div style="text-align: center; margin: 32px 0;">
  <a href="{{action_url}}" class="email-button" style="display: inline-block; padding: 14px 32px; background: linear-gradient(135deg, #10B981 0%, #059669 100%); color: #FFFFFF; text-decoration: none; border-radius: 8px; font-weight: 600; font-size: 16px;">Open {{company_name}}</a>
</div>`,

  'fathom_connected': `<p style="color: #F3F4F6; font-size: 16px; line-height: 1.7; margin: 0 0 16px 0;">Hi {{recipient_name}},</p>
<p style="color: #F3F4F6; font-size: 16px; line-height: 1.7; margin: 0 0 16px 0;">Great! Fathom analytics has been successfully connected to <strong style="color: #FFFFFF; font-weight: 600;">{{organization_name}}</strong>.</p>
<p style="color: #F3F4F6; font-size: 16px; line-height: 1.7; margin: 0 0 24px 0;">Your meetings will now be indexed and analyzed automatically.</p>
<div style="text-align: center; margin: 32px 0;">
  <a href="{{action_url}}" class="email-button" style="display: inline-block; padding: 14px 32px; background: linear-gradient(135deg, #10B981 0%, #059669 100%); color: #FFFFFF; text-decoration: none; border-radius: 8px; font-weight: 600; font-size: 16px;">View Analytics</a>
</div>`,

  'first_meeting_synced': `<p style="color: #F3F4F6; font-size: 16px; line-height: 1.7; margin: 0 0 16px 0;">Hi {{recipient_name}},</p>
<p style="color: #F3F4F6; font-size: 16px; line-height: 1.7; margin: 0 0 16px 0;">Your first meeting <strong style="color: #FFFFFF; font-weight: 600;">{{meeting_title}}</strong> has been synced to Sixty.</p>
<p style="color: #F3F4F6; font-size: 16px; line-height: 1.7; margin: 0 0 24px 0;">Start preparing with Sixty's AI-powered insights.</p>
<div style="text-align: center; margin: 32px 0;">
  <a href="{{action_url}}" class="email-button" style="display: inline-block; padding: 14px 32px; background: linear-gradient(135deg, #10B981 0%, #059669 100%); color: #FFFFFF; text-decoration: none; border-radius: 8px; font-weight: 600; font-size: 16px;">View Meeting</a>
</div>`,

  'subscription_confirmed': `<p style="color: #F3F4F6; font-size: 16px; line-height: 1.7; margin: 0 0 16px 0;">Hi {{recipient_name}},</p>
<p style="color: #F3F4F6; font-size: 16px; line-height: 1.7; margin: 0 0 16px 0;">Thank you! Your <strong style="color: #FFFFFF; font-weight: 600;">{{plan_name}}</strong> subscription is confirmed.</p>
<p style="color: #F3F4F6; font-size: 16px; line-height: 1.7; margin: 0 0 24px 0;">You now have full access to all Sixty features.</p>
<div style="text-align: center; margin: 32px 0;">
  <a href="{{action_url}}" class="email-button" style="display: inline-block; padding: 14px 32px; background: linear-gradient(135deg, #10B981 0%, #059669 100%); color: #FFFFFF; text-decoration: none; border-radius: 8px; font-weight: 600; font-size: 16px;">Manage Subscription</a>
</div>`,

  'meeting_limit_warning': `<p style="color: #F3F4F6; font-size: 16px; line-height: 1.7; margin: 0 0 16px 0;">Hi {{recipient_name}},</p>
<p style="color: #F3F4F6; font-size: 16px; line-height: 1.7; margin: 0 0 16px 0;">You've used <strong style="color: #FFFFFF; font-weight: 600;">{{current_meetings}}</strong> of <strong style="color: #FFFFFF; font-weight: 600;">{{meeting_limit}}</strong> meetings this month.</p>
<p style="color: #F3F4F6; font-size: 16px; line-height: 1.7; margin: 0 0 24px 0;">You have <strong style="color: #FFFFFF; font-weight: 600;">{{remaining_meetings}}</strong> meetings remaining. Upgrade to increase your limit.</p>
<div style="text-align: center; margin: 32px 0;">
  <a href="{{action_url}}" class="email-button" style="display: inline-block; padding: 14px 32px; background: linear-gradient(135deg, #10B981 0%, #059669 100%); color: #FFFFFF; text-decoration: none; border-radius: 8px; font-weight: 600; font-size: 16px;">Upgrade Plan</a>
</div>`,

  'upgrade_prompt': `<p style="color: #F3F4F6; font-size: 16px; line-height: 1.7; margin: 0 0 16px 0;">Hi {{recipient_name}},</p>
<p style="color: #F3F4F6; font-size: 16px; line-height: 1.7; margin: 0 0 16px 0;">We noticed you're interested in <strong style="color: #FFFFFF; font-weight: 600;">{{feature_name}}</strong>.</p>
<p style="color: #F3F4F6; font-size: 16px; line-height: 1.7; margin: 0 0 24px 0;">This feature is available on our <strong style="color: #FFFFFF; font-weight: 600;">{{upgrade_plan}}</strong> plan. Upgrade today to unlock it.</p>
<div style="text-align: center; margin: 32px 0;">
  <a href="{{action_url}}" class="email-button" style="display: inline-block; padding: 14px 32px; background: linear-gradient(135deg, #10B981 0%, #059669 100%); color: #FFFFFF; text-decoration: none; border-radius: 8px; font-weight: 600; font-size: 16px;">Upgrade Now</a>
</div>`,

  'join_request_approved': `<p style="color: #F3F4F6; font-size: 16px; line-height: 1.7; margin: 0 0 16px 0;">Hi {{recipient_name}},</p>
<p style="color: #F3F4F6; font-size: 16px; line-height: 1.7; margin: 0 0 16px 0;"><strong style="color: #FFFFFF; font-weight: 600;">{{admin_name}}</strong> approved your request to join <strong style="color: #FFFFFF; font-weight: 600;">{{organization_name}}</strong>.</p>
<p style="color: #F3F4F6; font-size: 16px; line-height: 1.7; margin: 0 0 24px 0;">You now have full access to the organization.</p>
<div style="text-align: center; margin: 32px 0;">
  <a href="{{action_url}}" class="email-button" style="display: inline-block; padding: 14px 32px; background: linear-gradient(135deg, #10B981 0%, #059669 100%); color: #FFFFFF; text-decoration: none; border-radius: 8px; font-weight: 600; font-size: 16px;">Get Started</a>
</div>`,

  'join_request_rejected': `<p style="color: #F3F4F6; font-size: 16px; line-height: 1.7; margin: 0 0 16px 0;">Hi {{recipient_name}},</p>
<p style="color: #F3F4F6; font-size: 16px; line-height: 1.7; margin: 0 0 24px 0;">Unfortunately, your request to join <strong style="color: #FFFFFF; font-weight: 600;">{{organization_name}}</strong> could not be approved at this time.</p>
<p style="color: #F3F4F6; font-size: 16px; line-height: 1.7; margin: 0;">If you have questions, please contact support at <a href="mailto:{{support_email}}" style="color: #10B981; text-decoration: none;">{{support_email}}</a>.</p>`,

  'permission_to_close': `<p style="color: #F3F4F6; font-size: 16px; line-height: 1.7; margin: 0 0 16px 0;">Hi {{recipient_name}},</p>
<p style="color: #F3F4F6; font-size: 16px; line-height: 1.7; margin: 0 0 16px 0;"><strong style="color: #FFFFFF; font-weight: 600;">{{requester_name}}</strong> is requesting permission to close {{item_type}}: <strong style="color: #FFFFFF; font-weight: 600;">{{item_name}}</strong>.</p>
<p style="color: #F3F4F6; font-size: 16px; line-height: 1.7; margin: 0 0 24px 0;">Review and approve or deny this request.</p>
<div style="text-align: center; margin: 32px 0;">
  <a href="{{action_url}}" class="email-button" style="display: inline-block; padding: 14px 32px; background: linear-gradient(135deg, #10B981 0%, #059669 100%); color: #FFFFFF; text-decoration: none; border-radius: 8px; font-weight: 600; font-size: 16px;">Review Request</a>
</div>`,

  'user_created': `<p style="color: #F3F4F6; font-size: 16px; line-height: 1.7; margin: 0 0 16px 0;">Hi {{user_name}},</p>
<p style="color: #F3F4F6; font-size: 16px; line-height: 1.7; margin: 0 0 24px 0;">Welcome to Sixty! Your account has been created and is ready to use.</p>
<div style="text-align: center; margin: 32px 0;">
  <a href="{{setup_url}}" class="email-button" style="display: inline-block; padding: 14px 32px; background: linear-gradient(135deg, #10B981 0%, #059669 100%); color: #FFFFFF; text-decoration: none; border-radius: 8px; font-weight: 600; font-size: 16px;">Complete Setup</a>
</div>`,

  'magic_link_waitlist': `<p style="color: #F3F4F6; font-size: 16px; line-height: 1.7; margin: 0 0 16px 0;">Hi there,</p>
<p style="color: #F3F4F6; font-size: 16px; line-height: 1.7; margin: 0 0 24px 0;">Welcome to early access! Click the button below to access your account.</p>
<div style="text-align: center; margin: 32px 0;">
  <a href="{{magic_link}}" class="email-button" style="display: inline-block; padding: 14px 32px; background: linear-gradient(135deg, #10B981 0%, #059669 100%); color: #FFFFFF; text-decoration: none; border-radius: 8px; font-weight: 600; font-size: 16px;">Access Account</a>
</div>`
};

async function updateTemplate(template) {
  const content = templateContent[template.template_type] || templateContent[template.template_name.toLowerCase().replace(/ /g, '_')];

  if (!content) {
    console.log(`⚠️  ${template.template_name} - No predefined content, skipping`);
    return;
  }

  const title = template.subject_line.replace(/\{\{/g, '').replace(/\}\}/g, '').replace(/_/g, ' ');
  const html = referenceHtml.replace('{{TITLE}}', title).replace('{{CONTENT}}', content);

  const response = await fetch(
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

  if (!response.ok) {
    throw new Error(`HTTP ${response.status}`);
  }

  return await response.json();
}

async function main() {
  console.log('🧹 CLEANING ALL TEMPLATES WITH FRESH CONTENT\n');

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

  let updated = 0;
  let skipped = 0;
  let errors = 0;

  for (const template of templates) {
    try {
      const result = await updateTemplate(template);
      if (result) {
        console.log(`✅ ${template.template_name}`);
        updated++;
      } else {
        skipped++;
      }
    } catch (error) {
      console.log(`❌ ${template.template_name}: ${error.message}`);
      errors++;
    }
  }

  console.log(`\n📊 Summary:`);
  console.log(`   Updated: ${updated}`);
  console.log(`   Skipped: ${skipped}`);
  console.log(`   Errors: ${errors}`);
  console.log(`   Total: ${templates.length}`);

  if (updated + skipped === templates.length) {
    console.log('\n✅ All templates are now clean!');
  }
}

main();
