import dotenv from 'dotenv';
import { fileURLToPath } from 'url';
import { dirname, join } from 'path';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

dotenv.config({ path: join(__dirname, '.env.staging') });

const supabaseUrl = process.env.SUPABASE_URL;
const serviceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY;

console.log('📝 CREATING MISSING EMAIL TEMPLATES\n');

const missingTemplates = [
  {
    template_name: 'member_removed',
    template_type: 'member_removed',
    subject_line: 'You\'ve been removed from {{organization_name}}',
    html_body: '<p>Hi {{recipient_name}},</p><p>You have been removed from <strong>{{organization_name}}</strong> by {{admin_name}}.</p><p>If you believe this is an error or have questions, please <a href="mailto:{{support_email}}">contact our support team</a>.</p><p style="font-size: 12px; color: #6b7280; margin-top: 16px;">Your access to this organization and all associated data has been revoked.</p>',
    text_body: 'Hi {{recipient_name}},\n\nYou have been removed from {{organization_name}} by {{admin_name}}.\n\nIf you believe this is an error or have questions, contact support: {{support_email}}\n\nYour access to this organization and all associated data has been revoked.',
    variables: [
      { name: 'recipient_name', description: 'Recipient\'s first name' },
      { name: 'organization_name', description: 'Organization name' },
      { name: 'admin_name', description: 'Name of admin who removed' },
      { name: 'support_email', description: 'Support email' }
    ]
  },
  {
    template_name: 'org_approval',
    template_type: 'org_approval',
    subject_line: 'Your organization setup is complete',
    html_body: '<p>Hi {{recipient_name}},</p><p>Congratulations! Your organization <strong>{{organization_name}}</strong> is now set up and ready to use Sixty.</p><p><a href="{{action_url}}" style="background-color: #3b82f6; color: white; padding: 12px 32px; text-decoration: none; border-radius: 6px; font-weight: 500;">Get Started</a></p>',
    text_body: 'Hi {{recipient_name}},\n\nCongratulations! Your organization {{organization_name}} is now set up and ready to use Sixty.\n\nGet started: {{action_url}}',
    variables: [
      { name: 'recipient_name', description: 'Recipient\'s first name' },
      { name: 'organization_name', description: 'Organization name' },
      { name: 'action_url', description: 'Get started URL' }
    ]
  },
  {
    template_name: 'join_request_approved',
    template_type: 'join_request_approved',
    subject_line: 'Your request to join {{organization_name}} has been approved',
    html_body: '<p>Hi {{recipient_name}},</p><p><strong>{{admin_name}}</strong> approved your request to join <strong>{{organization_name}}</strong>.</p><p>You now have full access to the organization.</p><p><a href="{{action_url}}" style="background-color: #3b82f6; color: white; padding: 12px 32px; text-decoration: none; border-radius: 6px; font-weight: 500;">Get Started</a></p>',
    text_body: 'Hi {{recipient_name}},\n\n{{admin_name}} approved your request to join {{organization_name}}.\n\nYou now have full access to the organization.\n\nGet started: {{action_url}}',
    variables: [
      { name: 'recipient_name', description: 'Recipient\'s first name' },
      { name: 'admin_name', description: 'Approving admin' },
      { name: 'organization_name', description: 'Organization name' },
      { name: 'action_url', description: 'Get started URL' }
    ]
  },
  {
    template_name: 'join_request_rejected',
    template_type: 'join_request_rejected',
    subject_line: 'Your request to join {{organization_name}} could not be approved',
    html_body: '<p>Hi {{recipient_name}},</p><p>Unfortunately, your request to join <strong>{{organization_name}}</strong> could not be approved at this time.</p><p>If you have questions, please contact support.</p><p><a href="mailto:{{support_email}}" style="background-color: #3b82f6; color: white; padding: 12px 32px; text-decoration: none; border-radius: 6px; font-weight: 500;">Contact Support</a></p>',
    text_body: 'Hi {{recipient_name}},\n\nUnfortunately, your request to join {{organization_name}} could not be approved at this time.\n\nIf you have questions, contact support: {{support_email}}',
    variables: [
      { name: 'recipient_name', description: 'Recipient\'s first name' },
      { name: 'organization_name', description: 'Organization name' },
      { name: 'support_email', description: 'Support email' }
    ]
  },
  {
    template_name: 'fathom_connected',
    template_type: 'fathom_connected',
    subject_line: 'Fathom analytics connected to {{organization_name}}',
    html_body: '<p>Hi {{recipient_name}},</p><p>Great! Fathom analytics has been successfully connected to <strong>{{organization_name}}</strong>.</p><p>Your meetings will now be indexed and analyzed automatically.</p><p><a href="{{action_url}}" style="background-color: #3b82f6; color: white; padding: 12px 32px; text-decoration: none; border-radius: 6px; font-weight: 500;">View Analytics</a></p>',
    text_body: 'Hi {{recipient_name}},\n\nGreat! Fathom analytics has been successfully connected to {{organization_name}}.\n\nYour meetings will now be indexed and analyzed automatically.\n\nView analytics: {{action_url}}',
    variables: [
      { name: 'recipient_name', description: 'Recipient\'s first name' },
      { name: 'organization_name', description: 'Organization name' },
      { name: 'action_url', description: 'Analytics URL' }
    ]
  },
  {
    template_name: 'first_meeting_synced',
    template_type: 'first_meeting_synced',
    subject_line: 'Your first meeting is synced and ready',
    html_body: '<p>Hi {{recipient_name}},</p><p>Your first meeting <strong>{{meeting_title}}</strong> has been synced to Sixty.</p><p>Start preparing with Sixty\'s AI-powered insights.</p><p><a href="{{action_url}}" style="background-color: #3b82f6; color: white; padding: 12px 32px; text-decoration: none; border-radius: 6px; font-weight: 500;">View Meeting</a></p>',
    text_body: 'Hi {{recipient_name}},\n\nYour first meeting {{meeting_title}} has been synced to Sixty.\n\nView meeting: {{action_url}}',
    variables: [
      { name: 'recipient_name', description: 'Recipient\'s first name' },
      { name: 'meeting_title', description: 'Meeting title' },
      { name: 'action_url', description: 'Meeting URL' }
    ]
  },
  {
    template_name: 'subscription_confirmed',
    template_type: 'subscription_confirmed',
    subject_line: 'Your {{plan_name}} subscription is confirmed',
    html_body: '<p>Hi {{recipient_name}},</p><p>Thank you! Your <strong>{{plan_name}}</strong> subscription is confirmed.</p><p>You now have full access to all Sixty features.</p><p><a href="{{action_url}}" style="background-color: #3b82f6; color: white; padding: 12px 32px; text-decoration: none; border-radius: 6px; font-weight: 500;">Manage Subscription</a></p>',
    text_body: 'Hi {{recipient_name}},\n\nThank you! Your {{plan_name}} subscription is confirmed.\n\nYou now have full access to all Sixty features.\n\nManage subscription: {{action_url}}',
    variables: [
      { name: 'recipient_name', description: 'Recipient\'s first name' },
      { name: 'plan_name', description: 'Plan name' },
      { name: 'action_url', description: 'Manage subscription URL' }
    ]
  },
  {
    template_name: 'meeting_limit_warning',
    template_type: 'meeting_limit_warning',
    subject_line: 'You\'re approaching your meeting limit',
    html_body: '<p>Hi {{recipient_name}},</p><p>You\'ve used {{current_meetings}} of {{meeting_limit}} meetings this month.</p><p>You have {{remaining_meetings}} meetings remaining. Upgrade to increase your limit.</p><p><a href="{{action_url}}" style="background-color: #3b82f6; color: white; padding: 12px 32px; text-decoration: none; border-radius: 6px; font-weight: 500;">Upgrade Plan</a></p>',
    text_body: 'Hi {{recipient_name}},\n\nYou\'ve used {{current_meetings}} of {{meeting_limit}} meetings this month.\n\nYou have {{remaining_meetings}} meetings remaining.\n\nUpgrade to increase your limit: {{action_url}}',
    variables: [
      { name: 'recipient_name', description: 'Recipient\'s first name' },
      { name: 'current_meetings', description: 'Current meeting count' },
      { name: 'meeting_limit', description: 'Monthly limit' },
      { name: 'remaining_meetings', description: 'Meetings remaining' },
      { name: 'action_url', description: 'Upgrade URL' }
    ]
  },
  {
    template_name: 'upgrade_prompt',
    template_type: 'upgrade_prompt',
    subject_line: 'Unlock {{feature_name}} with an upgrade',
    html_body: '<p>Hi {{recipient_name}},</p><p>We noticed you\'re interested in {{feature_name}}.</p><p>This feature is available on our {{upgrade_plan}} plan. Upgrade today to unlock it.</p><p><a href="{{action_url}}" style="background-color: #3b82f6; color: white; padding: 12px 32px; text-decoration: none; border-radius: 6px; font-weight: 500;">Upgrade Now</a></p>',
    text_body: 'Hi {{recipient_name}},\n\nWe noticed you\'re interested in {{feature_name}}.\n\nThis feature is available on our {{upgrade_plan}} plan.\n\nUpgrade now: {{action_url}}',
    variables: [
      { name: 'recipient_name', description: 'Recipient\'s first name' },
      { name: 'feature_name', description: 'Feature name' },
      { name: 'upgrade_plan', description: 'Plan name' },
      { name: 'action_url', description: 'Upgrade URL' }
    ]
  },
  {
    template_name: 'permission_to_close',
    template_type: 'permission_to_close',
    subject_line: 'Permission needed: {{requester_name}} wants to close {{item_name}}',
    html_body: '<p>Hi {{recipient_name}},</p><p><strong>{{requester_name}}</strong> is requesting permission to close {{item_type}}: <strong>{{item_name}}</strong>.</p><p>Review and approve or deny this request.</p><p><a href="{{action_url}}" style="background-color: #3b82f6; color: white; padding: 12px 32px; text-decoration: none; border-radius: 6px; font-weight: 500;">Review Request</a></p>',
    text_body: 'Hi {{recipient_name}},\n\n{{requester_name}} is requesting permission to close {{item_type}}: {{item_name}}.\n\nReview and approve or deny this request: {{action_url}}',
    variables: [
      { name: 'recipient_name', description: 'Recipient\'s first name' },
      { name: 'requester_name', description: 'Who requested' },
      { name: 'item_type', description: 'Type of item' },
      { name: 'item_name', description: 'Item name' },
      { name: 'action_url', description: 'Review URL' }
    ]
  }
];

async function createTemplate(template) {
  const response = await fetch(
    `${supabaseUrl}/rest/v1/encharge_email_templates`,
    {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'apikey': serviceRoleKey,
        'Authorization': `Bearer ${serviceRoleKey}`,
        'Prefer': 'return=representation'
      },
      body: JSON.stringify({
        ...template,
        is_active: true
      })
    }
  );

  if (!response.ok) {
    const error = await response.text();
    throw new Error(`Failed to create ${template.template_name}: ${error}`);
  }

  return await response.json();
}

async function main() {
  console.log(`Creating ${missingTemplates.length} missing templates...\n`);

  let created = 0;
  let errors = 0;

  for (const template of missingTemplates) {
    try {
      await createTemplate(template);
      console.log(`✅ ${template.template_name} (${template.template_type})`);
      created++;
    } catch (error) {
      console.log(`❌ ${template.template_name}: ${error.message}`);
      errors++;
    }
  }

  console.log(`\n📊 Summary:`);
  console.log(`   Created: ${created}`);
  console.log(`   Errors: ${errors}`);
  console.log(`   Total: ${missingTemplates.length}`);
}

main();
