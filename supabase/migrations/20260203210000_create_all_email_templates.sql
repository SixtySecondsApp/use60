-- Migration: Create all 18 standardized email templates
-- Date: 2026-02-03
-- Purpose: Establish centralized database templates for all email types
-- Idempotent: Yes - uses INSERT ... ON CONFLICT ... DO UPDATE

-- Note: Table encharge_email_templates is created by earlier migration
-- This migration inserts remaining 17 templates (organization_invitation already exists)

-- 1. Member Removed
INSERT INTO encharge_email_templates (
  template_name,
  template_type,
  subject_line,
  html_body,
  text_body,
  is_active,
  variables,
  created_at,
  updated_at
) VALUES (
  'member_removed',
  'member_removed',
  'You''ve been removed from {{organization_name}}',
  '<p>Hi {{recipient_name}},</p>
   <p>You have been removed from <strong>{{organization_name}}</strong> by {{admin_name}}.</p>
   <p>If you believe this is an error or have questions, please <a href="mailto:{{support_email}}">contact our support team</a>.</p>
   <p style="font-size: 12px; color: #6b7280; margin-top: 16px;">Your access to this organization and all associated data has been revoked.</p>',
  'Hi {{recipient_name}},

You have been removed from {{organization_name}} by {{admin_name}}.

If you believe this is an error or have questions, contact support: {{support_email}}

Your access to this organization and all associated data has been revoked.',
  TRUE,
  '[{"name": "recipient_name", "description": "Recipient''s first name"}, {"name": "organization_name", "description": "Organization name"}, {"name": "admin_name", "description": "Name of admin who removed"}, {"name": "support_email", "description": "Support email"}]'::jsonb,
  NOW(),
  NOW()
)
ON CONFLICT (template_name) DO UPDATE SET subject_line = EXCLUDED.subject_line, html_body = EXCLUDED.html_body, text_body = EXCLUDED.text_body, updated_at = NOW();

-- 2. Organization Approval
INSERT INTO encharge_email_templates (
  template_name,
  template_type,
  subject_line,
  html_body,
  text_body,
  is_active,
  variables,
  created_at,
  updated_at
) VALUES (
  'org_approval',
  'org_approval',
  'Your organization setup is complete',
  '<p>Hi {{recipient_name}},</p>
   <p>Congratulations! Your organization <strong>{{organization_name}}</strong> is now set up and ready to use Sixty.</p>
   <p><a href="{{action_url}}" style="background-color: #3b82f6; color: white; padding: 12px 32px; text-decoration: none; border-radius: 6px; font-weight: 500;">Get Started</a></p>',
  'Hi {{recipient_name}},

Congratulations! Your organization {{organization_name}} is now set up and ready to use Sixty.

Get started: {{action_url}}',
  TRUE,
  '[{"name": "recipient_name", "description": "Recipient''s first name"}, {"name": "organization_name", "description": "Organization name"}, {"name": "action_url", "description": "Get started URL"}]'::jsonb,
  NOW(),
  NOW()
)
ON CONFLICT (template_name) DO UPDATE SET subject_line = EXCLUDED.subject_line, html_body = EXCLUDED.html_body, text_body = EXCLUDED.text_body, updated_at = NOW();

-- 3. Waitlist Invite
INSERT INTO encharge_email_templates (
  template_name,
  template_type,
  subject_line,
  html_body,
  text_body,
  is_active,
  variables,
  created_at,
  updated_at
) VALUES (
  'waitlist_invite',
  'waitlist_invite',
  'Your early access to {{company_name}} is ready',
  '<p>Hi {{recipient_name}},</p>
   <p>Great news! Your early access to <strong>{{company_name}}</strong> is ready. Click below to get started.</p>
   <p><a href="{{action_url}}" style="background-color: #3b82f6; color: white; padding: 12px 32px; text-decoration: none; border-radius: 6px; font-weight: 500;">Get Started</a></p>
   <p style="font-size: 12px; color: #6b7280; margin-top: 16px;">This link expires in {{expiry_time}}.</p>',
  'Hi {{recipient_name}},

Great news! Your early access to {{company_name}} is ready.

Get started: {{action_url}}

This link expires in {{expiry_time}}.',
  TRUE,
  '[{"name": "recipient_name", "description": "Recipient''s first name"}, {"name": "company_name", "description": "Company name"}, {"name": "action_url", "description": "Access URL"}, {"name": "expiry_time", "description": "Expiration time"}]'::jsonb,
  NOW(),
  NOW()
)
ON CONFLICT (template_name) DO UPDATE SET subject_line = EXCLUDED.subject_line, html_body = EXCLUDED.html_body, text_body = EXCLUDED.text_body, updated_at = NOW();

-- 4. Waitlist Welcome
INSERT INTO encharge_email_templates (
  template_name,
  template_type,
  subject_line,
  html_body,
  text_body,
  is_active,
  variables,
  created_at,
  updated_at
) VALUES (
  'waitlist_welcome',
  'waitlist_welcome',
  'Welcome to {{company_name}}',
  '<p>Hi {{recipient_name}},</p>
   <p>You''re in! Your account is ready. Explore {{company_name}} and start using all features right away.</p>
   <p><a href="{{action_url}}" style="background-color: #3b82f6; color: white; padding: 12px 32px; text-decoration: none; border-radius: 6px; font-weight: 500;">Open {{company_name}}</a></p>',
  'Hi {{recipient_name}},

You''re in! Your account is ready. Explore {{company_name}} and start using all features right away.

Open {{company_name}}: {{action_url}}',
  TRUE,
  '[{"name": "recipient_name", "description": "Recipient''s first name"}, {"name": "company_name", "description": "Company name"}, {"name": "action_url", "description": "App URL"}]'::jsonb,
  NOW(),
  NOW()
)
ON CONFLICT (template_name) DO UPDATE SET subject_line = EXCLUDED.subject_line, html_body = EXCLUDED.html_body, text_body = EXCLUDED.text_body, updated_at = NOW();

-- 5. Welcome (General Onboarding)
INSERT INTO encharge_email_templates (
  template_name,
  template_type,
  subject_line,
  html_body,
  text_body,
  is_active,
  variables,
  created_at,
  updated_at
) VALUES (
  'welcome',
  'welcome',
  'Welcome to {{organization_name}} on Sixty',
  '<p>Hi {{recipient_name}},</p>
   <p>Welcome to <strong>{{organization_name}}</strong> on Sixty! We''re excited to have you on board.</p>
   <p><a href="{{action_url}}" style="background-color: #3b82f6; color: white; padding: 12px 32px; text-decoration: none; border-radius: 6px; font-weight: 500;">Get Started</a></p>',
  'Hi {{recipient_name}},

Welcome to {{organization_name}} on Sixty! We''re excited to have you on board.

Get started: {{action_url}}',
  TRUE,
  '[{"name": "recipient_name", "description": "Recipient''s first name"}, {"name": "organization_name", "description": "Organization name"}, {"name": "action_url", "description": "Get started URL"}]'::jsonb,
  NOW(),
  NOW()
)
ON CONFLICT (template_name) DO UPDATE SET subject_line = EXCLUDED.subject_line, html_body = EXCLUDED.html_body, text_body = EXCLUDED.text_body, updated_at = NOW();

-- 6. Fathom Connected
INSERT INTO encharge_email_templates (
  template_name,
  template_type,
  subject_line,
  html_body,
  text_body,
  is_active,
  variables,
  created_at,
  updated_at
) VALUES (
  'fathom_connected',
  'fathom_connected',
  'Fathom analytics connected to {{organization_name}}',
  '<p>Hi {{recipient_name}},</p>
   <p>Great! Fathom analytics has been successfully connected to <strong>{{organization_name}}</strong>.</p>
   <p>Your meetings will now be indexed and analyzed automatically.</p>
   <p><a href="{{action_url}}" style="background-color: #3b82f6; color: white; padding: 12px 32px; text-decoration: none; border-radius: 6px; font-weight: 500;">View Analytics</a></p>',
  'Hi {{recipient_name}},

Great! Fathom analytics has been successfully connected to {{organization_name}}.

Your meetings will now be indexed and analyzed automatically.

View analytics: {{action_url}}',
  TRUE,
  '[{"name": "recipient_name", "description": "Recipient''s first name"}, {"name": "organization_name", "description": "Organization name"}, {"name": "action_url", "description": "Analytics URL"}]'::jsonb,
  NOW(),
  NOW()
)
ON CONFLICT (template_name) DO UPDATE SET subject_line = EXCLUDED.subject_line, html_body = EXCLUDED.html_body, text_body = EXCLUDED.text_body, updated_at = NOW();

-- 7. First Meeting Synced
INSERT INTO encharge_email_templates (
  template_name,
  template_type,
  subject_line,
  html_body,
  text_body,
  is_active,
  variables,
  created_at,
  updated_at
) VALUES (
  'first_meeting_synced',
  'first_meeting_synced',
  'Your first meeting is synced and ready',
  '<p>Hi {{recipient_name}},</p>
   <p>Your first meeting <strong>{{meeting_title}}</strong> has been synced to Sixty.</p>
   <p>Start preparing with Sixty''s AI-powered insights.</p>
   <p><a href="{{action_url}}" style="background-color: #3b82f6; color: white; padding: 12px 32px; text-decoration: none; border-radius: 6px; font-weight: 500;">View Meeting</a></p>',
  'Hi {{recipient_name}},

Your first meeting {{meeting_title}} has been synced to Sixty.

View meeting: {{action_url}}',
  TRUE,
  '[{"name": "recipient_name", "description": "Recipient''s first name"}, {"name": "meeting_title", "description": "Meeting title"}, {"name": "action_url", "description": "Meeting URL"}]'::jsonb,
  NOW(),
  NOW()
)
ON CONFLICT (template_name) DO UPDATE SET subject_line = EXCLUDED.subject_line, html_body = EXCLUDED.html_body, text_body = EXCLUDED.text_body, updated_at = NOW();

-- 8. Trial Ending
INSERT INTO encharge_email_templates (
  template_name,
  template_type,
  subject_line,
  html_body,
  text_body,
  is_active,
  variables,
  created_at,
  updated_at
) VALUES (
  'trial_ending',
  'trial_ending',
  'Your Sixty trial ends in {{trial_days}} days',
  '<p>Hi {{recipient_name}},</p>
   <p>Your Sixty trial ends in <strong>{{trial_days}} days</strong>.</p>
   <p>Upgrade now to continue using all features and keep your data safe.</p>
   <p><a href="{{action_url}}" style="background-color: #3b82f6; color: white; padding: 12px 32px; text-decoration: none; border-radius: 6px; font-weight: 500;">Upgrade Now</a></p>',
  'Hi {{recipient_name}},

Your Sixty trial ends in {{trial_days}} days.

Upgrade now to continue using all features and keep your data safe.

Upgrade: {{action_url}}',
  TRUE,
  '[{"name": "recipient_name", "description": "Recipient''s first name"}, {"name": "trial_days", "description": "Days until trial ends"}, {"name": "action_url", "description": "Upgrade URL"}]'::jsonb,
  NOW(),
  NOW()
)
ON CONFLICT (template_name) DO UPDATE SET subject_line = EXCLUDED.subject_line, html_body = EXCLUDED.html_body, text_body = EXCLUDED.text_body, updated_at = NOW();

-- 9. Trial Expired
INSERT INTO encharge_email_templates (
  template_name,
  template_type,
  subject_line,
  html_body,
  text_body,
  is_active,
  variables,
  created_at,
  updated_at
) VALUES (
  'trial_expired',
  'trial_expired',
  'Your Sixty trial has expired',
  '<p>Hi {{recipient_name}},</p>
   <p>Your Sixty trial has ended. Your data will be retained for 30 days.</p>
   <p>Reactivate your account to continue using Sixty.</p>
   <p><a href="{{action_url}}" style="background-color: #3b82f6; color: white; padding: 12px 32px; text-decoration: none; border-radius: 6px; font-weight: 500;">Reactivate</a></p>',
  'Hi {{recipient_name}},

Your Sixty trial has ended. Your data will be retained for 30 days.

Reactivate your account: {{action_url}}

Questions? Contact support.',
  TRUE,
  '[{"name": "recipient_name", "description": "Recipient''s first name"}, {"name": "action_url", "description": "Reactivate URL"}]'::jsonb,
  NOW(),
  NOW()
)
ON CONFLICT (template_name) DO UPDATE SET subject_line = EXCLUDED.subject_line, html_body = EXCLUDED.html_body, text_body = EXCLUDED.text_body, updated_at = NOW();

-- 10. Subscription Confirmed
INSERT INTO encharge_email_templates (
  template_name,
  template_type,
  subject_line,
  html_body,
  text_body,
  is_active,
  variables,
  created_at,
  updated_at
) VALUES (
  'subscription_confirmed',
  'subscription_confirmed',
  'Your {{plan_name}} subscription is confirmed',
  '<p>Hi {{recipient_name}},</p>
   <p>Thank you! Your <strong>{{plan_name}}</strong> subscription is confirmed.</p>
   <p>You now have full access to all Sixty features.</p>
   <p><a href="{{action_url}}" style="background-color: #3b82f6; color: white; padding: 12px 32px; text-decoration: none; border-radius: 6px; font-weight: 500;">Manage Subscription</a></p>',
  'Hi {{recipient_name}},

Thank you! Your {{plan_name}} subscription is confirmed.

You now have full access to all Sixty features.

Manage subscription: {{action_url}}',
  TRUE,
  '[{"name": "recipient_name", "description": "Recipient''s first name"}, {"name": "plan_name", "description": "Plan name"}, {"name": "action_url", "description": "Manage subscription URL"}]'::jsonb,
  NOW(),
  NOW()
)
ON CONFLICT (template_name) DO UPDATE SET subject_line = EXCLUDED.subject_line, html_body = EXCLUDED.html_body, text_body = EXCLUDED.text_body, updated_at = NOW();

-- 11. Meeting Limit Warning
INSERT INTO encharge_email_templates (
  template_name,
  template_type,
  subject_line,
  html_body,
  text_body,
  is_active,
  variables,
  created_at,
  updated_at
) VALUES (
  'meeting_limit_warning',
  'meeting_limit_warning',
  'You''re approaching your meeting limit',
  '<p>Hi {{recipient_name}},</p>
   <p>You''ve used {{current_meetings}} of {{meeting_limit}} meetings this month.</p>
   <p>You have {{remaining_meetings}} meetings remaining. Upgrade to increase your limit.</p>
   <p><a href="{{action_url}}" style="background-color: #3b82f6; color: white; padding: 12px 32px; text-decoration: none; border-radius: 6px; font-weight: 500;">Upgrade Plan</a></p>',
  'Hi {{recipient_name}},

You''ve used {{current_meetings}} of {{meeting_limit}} meetings this month.

You have {{remaining_meetings}} meetings remaining.

Upgrade to increase your limit: {{action_url}}',
  TRUE,
  '[{"name": "recipient_name", "description": "Recipient''s first name"}, {"name": "current_meetings", "description": "Current meeting count"}, {"name": "meeting_limit", "description": "Monthly limit"}, {"name": "action_url", "description": "Upgrade URL"}]'::jsonb,
  NOW(),
  NOW()
)
ON CONFLICT (template_name) DO UPDATE SET subject_line = EXCLUDED.subject_line, html_body = EXCLUDED.html_body, text_body = EXCLUDED.text_body, updated_at = NOW();

-- 12. Upgrade Prompt
INSERT INTO encharge_email_templates (
  template_name,
  template_type,
  subject_line,
  html_body,
  text_body,
  is_active,
  variables,
  created_at,
  updated_at
) VALUES (
  'upgrade_prompt',
  'upgrade_prompt',
  'Unlock {{feature_name}} with an upgrade',
  '<p>Hi {{recipient_name}},</p>
   <p>We noticed you''re interested in {{feature_name}}.</p>
   <p>This feature is available on our {{upgrade_plan}} plan. Upgrade today to unlock it.</p>
   <p><a href="{{action_url}}" style="background-color: #3b82f6; color: white; padding: 12px 32px; text-decoration: none; border-radius: 6px; font-weight: 500;">Upgrade Now</a></p>',
  'Hi {{recipient_name}},

We noticed you''re interested in {{feature_name}}.

This feature is available on our {{upgrade_plan}} plan.

Upgrade now: {{action_url}}',
  TRUE,
  '[{"name": "recipient_name", "description": "Recipient''s first name"}, {"name": "feature_name", "description": "Feature name"}, {"name": "upgrade_plan", "description": "Plan name"}, {"name": "action_url", "description": "Upgrade URL"}]'::jsonb,
  NOW(),
  NOW()
)
ON CONFLICT (template_name) DO UPDATE SET subject_line = EXCLUDED.subject_line, html_body = EXCLUDED.html_body, text_body = EXCLUDED.text_body, updated_at = NOW();

-- 13. Email Change Verification
INSERT INTO encharge_email_templates (
  template_name,
  template_type,
  subject_line,
  html_body,
  text_body,
  is_active,
  variables,
  created_at,
  updated_at
) VALUES (
  'email_change_verification',
  'email_change_verification',
  'Verify your new email address',
  '<p>Hi {{recipient_name}},</p>
   <p>You requested to change your email from <strong>{{old_email}}</strong> to <strong>{{new_email}}</strong>.</p>
   <p>Click below to verify this change.</p>
   <p><a href="{{action_url}}" style="background-color: #3b82f6; color: white; padding: 12px 32px; text-decoration: none; border-radius: 6px; font-weight: 500;">Verify Email</a></p>
   <p style="font-size: 12px; color: #6b7280; margin-top: 16px;">This link expires in {{expiry_time}}.</p>',
  'Hi {{recipient_name}},

You requested to change your email from {{old_email}} to {{new_email}}.

Verify this change: {{action_url}}

This link expires in {{expiry_time}}.',
  TRUE,
  '[{"name": "recipient_name", "description": "Recipient''s first name"}, {"name": "old_email", "description": "Current email"}, {"name": "new_email", "description": "New email"}, {"name": "action_url", "description": "Verify URL"}, {"name": "expiry_time", "description": "Expiration time"}]'::jsonb,
  NOW(),
  NOW()
)
ON CONFLICT (template_name) DO UPDATE SET subject_line = EXCLUDED.subject_line, html_body = EXCLUDED.html_body, text_body = EXCLUDED.text_body, updated_at = NOW();

-- 14. Password Reset
INSERT INTO encharge_email_templates (
  template_name,
  template_type,
  subject_line,
  html_body,
  text_body,
  is_active,
  variables,
  created_at,
  updated_at
) VALUES (
  'password_reset',
  'password_reset',
  'Reset your Sixty password',
  '<p>Hi {{recipient_name}},</p>
   <p>Click the button below to reset your password.</p>
   <p>This link will expire in {{expiry_time}}.</p>
   <p><a href="{{action_url}}" style="background-color: #3b82f6; color: white; padding: 12px 32px; text-decoration: none; border-radius: 6px; font-weight: 500;">Reset Password</a></p>
   <p style="font-size: 12px; color: #6b7280; margin-top: 16px;">If you didn''t request a password reset, please ignore this email.</p>',
  'Hi {{recipient_name}},

Click the link below to reset your password.

Reset password: {{action_url}}

This link expires in {{expiry_time}}.

If you didn''t request this, please ignore this email.',
  TRUE,
  '[{"name": "recipient_name", "description": "Recipient''s first name"}, {"name": "action_url", "description": "Reset URL"}, {"name": "expiry_time", "description": "Expiration time"}]'::jsonb,
  NOW(),
  NOW()
)
ON CONFLICT (template_name) DO UPDATE SET subject_line = EXCLUDED.subject_line, html_body = EXCLUDED.html_body, text_body = EXCLUDED.text_body, updated_at = NOW();

-- 15. Join Request Approved
INSERT INTO encharge_email_templates (
  template_name,
  template_type,
  subject_line,
  html_body,
  text_body,
  is_active,
  variables,
  created_at,
  updated_at
) VALUES (
  'join_request_approved',
  'join_request_approved',
  'Your request to join {{organization_name}} has been approved',
  '<p>Hi {{recipient_name}},</p>
   <p><strong>{{admin_name}}</strong> approved your request to join <strong>{{organization_name}}</strong>.</p>
   <p>You now have full access to the organization.</p>
   <p><a href="{{action_url}}" style="background-color: #3b82f6; color: white; padding: 12px 32px; text-decoration: none; border-radius: 6px; font-weight: 500;">Get Started</a></p>',
  'Hi {{recipient_name}},

{{admin_name}} approved your request to join {{organization_name}}.

You now have full access to the organization.

Get started: {{action_url}}',
  TRUE,
  '[{"name": "recipient_name", "description": "Recipient''s first name"}, {"name": "admin_name", "description": "Approving admin"}, {"name": "organization_name", "description": "Organization name"}, {"name": "action_url", "description": "Get started URL"}]'::jsonb,
  NOW(),
  NOW()
)
ON CONFLICT (template_name) DO UPDATE SET subject_line = EXCLUDED.subject_line, html_body = EXCLUDED.html_body, text_body = EXCLUDED.text_body, updated_at = NOW();

-- 16. Join Request Rejected
INSERT INTO encharge_email_templates (
  template_name,
  template_type,
  subject_line,
  html_body,
  text_body,
  is_active,
  variables,
  created_at,
  updated_at
) VALUES (
  'join_request_rejected',
  'join_request_rejected',
  'Your request to join {{organization_name}} could not be approved',
  '<p>Hi {{recipient_name}},</p>
   <p>Unfortunately, your request to join <strong>{{organization_name}}</strong> could not be approved at this time.</p>
   <p>If you have questions, please contact support.</p>
   <p><a href="mailto:{{support_email}}" style="background-color: #3b82f6; color: white; padding: 12px 32px; text-decoration: none; border-radius: 6px; font-weight: 500;">Contact Support</a></p>',
  'Hi {{recipient_name}},

Unfortunately, your request to join {{organization_name}} could not be approved at this time.

If you have questions, contact support: {{support_email}}',
  TRUE,
  '[{"name": "recipient_name", "description": "Recipient''s first name"}, {"name": "organization_name", "description": "Organization name"}, {"name": "support_email", "description": "Support email"}]'::jsonb,
  NOW(),
  NOW()
)
ON CONFLICT (template_name) DO UPDATE SET subject_line = EXCLUDED.subject_line, html_body = EXCLUDED.html_body, text_body = EXCLUDED.text_body, updated_at = NOW();

-- 17. Permission to Close
INSERT INTO encharge_email_templates (
  template_name,
  template_type,
  subject_line,
  html_body,
  text_body,
  is_active,
  variables,
  created_at,
  updated_at
) VALUES (
  'permission_to_close',
  'permission_to_close',
  'Permission needed: {{requester_name}} wants to close {{item_name}}',
  '<p>Hi {{recipient_name}},</p>
   <p><strong>{{requester_name}}</strong> is requesting permission to close {{item_type}}: <strong>{{item_name}}</strong>.</p>
   <p>Review and approve or deny this request.</p>
   <p><a href="{{action_url}}" style="background-color: #3b82f6; color: white; padding: 12px 32px; text-decoration: none; border-radius: 6px; font-weight: 500;">Review Request</a></p>',
  'Hi {{recipient_name}},

{{requester_name}} is requesting permission to close {{item_type}}: {{item_name}}.

Review and approve or deny this request: {{action_url}}',
  TRUE,
  '[{"name": "recipient_name", "description": "Recipient''s first name"}, {"name": "requester_name", "description": "Who requested"}, {"name": "item_type", "description": "Type of item"}, {"name": "item_name", "description": "Item name"}, {"name": "action_url", "description": "Review URL"}]'::jsonb,
  NOW(),
  NOW()
)
ON CONFLICT (template_name) DO UPDATE SET subject_line = EXCLUDED.subject_line, html_body = EXCLUDED.html_body, text_body = EXCLUDED.text_body, updated_at = NOW();

-- Verify all 18 templates exist
-- SELECT COUNT(*) as template_count FROM encharge_email_templates WHERE template_name IN (
--   'organization_invitation', 'member_removed', 'org_approval', 'waitlist_invite', 'waitlist_welcome',
--   'welcome', 'fathom_connected', 'first_meeting_synced', 'trial_ending', 'trial_expired',
--   'subscription_confirmed', 'meeting_limit_warning', 'upgrade_prompt', 'email_change_verification',
--   'password_reset', 'join_request_approved', 'join_request_rejected', 'permission_to_close'
-- );
