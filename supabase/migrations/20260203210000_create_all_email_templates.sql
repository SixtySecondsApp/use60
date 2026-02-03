-- Migration: Create all 18 standardized email templates
-- Date: 2026-02-03
-- Purpose: Establish centralized database templates for all email types
-- Idempotent: Yes - uses INSERT ... ON CONFLICT ... DO UPDATE

-- Ensure encharge_email_templates table exists with correct structure
CREATE TABLE IF NOT EXISTS encharge_email_templates (
  id BIGSERIAL PRIMARY KEY,
  template_type TEXT UNIQUE NOT NULL,
  template_name TEXT NOT NULL,
  subject_line TEXT NOT NULL,
  html_body TEXT NOT NULL,
  text_body TEXT,
  is_active BOOLEAN DEFAULT TRUE,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- Create indexes for faster lookups
CREATE INDEX IF NOT EXISTS idx_encharge_templates_type ON encharge_email_templates(template_type);
CREATE INDEX IF NOT EXISTS idx_encharge_templates_active ON encharge_email_templates(is_active);

---
-- EMAIL TEMPLATES
---

-- 1. Organization Invitation
INSERT INTO encharge_email_templates (template_type, template_name, subject_line, html_body, text_body, is_active)
VALUES (
  'organization_invitation',
  'Organization Invitation',
  'You''re invited to join {{organization_name}} on Sixty',
  '<p>Hi {{recipient_name}},</p>
   <p>{{inviter_name}} has invited you to join <strong>{{organization_name}}</strong> on Sixty. Sixty helps sales teams prepare for meetings and act on insights afterwards.</p>
   <p><a href="{{action_url}}" style="background-color: #3b82f6; color: white; padding: 12px 32px; text-decoration: none; border-radius: 6px; font-weight: 500;">Accept Invitation</a></p>
   <p style="font-size: 12px; color: #6b7280; margin-top: 16px;">This link expires in {{expiry_time}}.</p>
   <p style="font-size: 12px; color: #6b7280;">If you did not expect this invitation, you can safely ignore this email.</p>',
  'Hi {{recipient_name}},

{{inviter_name}} has invited you to join {{organization_name}} on Sixty.

Accept your invitation: {{action_url}}

This link expires in {{expiry_time}}.

If you did not expect this invitation, you can safely ignore this email.',
  TRUE
)
ON CONFLICT (template_type) DO UPDATE SET
  template_name = EXCLUDED.template_name,
  subject_line = EXCLUDED.subject_line,
  html_body = EXCLUDED.html_body,
  text_body = EXCLUDED.text_body,
  is_active = EXCLUDED.is_active,
  updated_at = NOW();

-- 2. Member Removed
INSERT INTO encharge_email_templates (template_type, template_name, subject_line, html_body, text_body, is_active)
VALUES (
  'member_removed',
  'Member Removed',
  'You''ve been removed from {{organization_name}}',
  '<p>Hi {{recipient_name}},</p>
   <p>You have been removed from <strong>{{organization_name}}</strong> by {{admin_name}}.</p>
   <p>If you believe this is an error or have questions, please <a href="mailto:{{support_email}}">contact our support team</a>.</p>
   <p style="font-size: 12px; color: #6b7280; margin-top: 16px;">Your access to this organization and all associated data has been revoked.</p>',
  'Hi {{recipient_name}},

You have been removed from {{organization_name}} by {{admin_name}}.

If you believe this is an error or have questions, please contact support: {{support_email}}

Your access to this organization and all associated data has been revoked.',
  TRUE
)
ON CONFLICT (template_type) DO UPDATE SET
  template_name = EXCLUDED.template_name,
  subject_line = EXCLUDED.subject_line,
  html_body = EXCLUDED.html_body,
  text_body = EXCLUDED.text_body,
  is_active = EXCLUDED.is_active,
  updated_at = NOW();

-- 3. Organization Approval
INSERT INTO encharge_email_templates (template_type, template_name, subject_line, html_body, text_body, is_active)
VALUES (
  'org_approval',
  'Organization Approved',
  'Your organization setup is complete',
  '<p>Hi {{recipient_name}},</p>
   <p>Congratulations! Your organization <strong>{{organization_name}}</strong> is now set up and ready to use Sixty.</p>
   <p><a href="{{action_url}}" style="background-color: #3b82f6; color: white; padding: 12px 32px; text-decoration: none; border-radius: 6px; font-weight: 500;">Get Started</a></p>
   <p style="font-size: 12px; color: #6b7280; margin-top: 16px;">You can now invite team members and start using Sixty to prepare for meetings.</p>',
  'Hi {{recipient_name}},

Congratulations! Your organization {{organization_name}} is now set up and ready to use Sixty.

Get started: {{action_url}}

You can now invite team members and start using Sixty to prepare for meetings.',
  TRUE
)
ON CONFLICT (template_type) DO UPDATE SET
  template_name = EXCLUDED.template_name,
  subject_line = EXCLUDED.subject_line,
  html_body = EXCLUDED.html_body,
  text_body = EXCLUDED.text_body,
  is_active = EXCLUDED.is_active,
  updated_at = NOW();

-- 4. Waitlist Invite
INSERT INTO encharge_email_templates (template_type, template_name, subject_line, html_body, text_body, is_active)
VALUES (
  'waitlist_invite',
  'Waitlist Invite',
  'Your early access to {{company_name}} is ready',
  '<p>Hi {{recipient_name}},</p>
   <p>Great news! Your early access to <strong>{{company_name}}</strong> is ready. Click below to get started.</p>
   <p><a href="{{action_url}}" style="background-color: #3b82f6; color: white; padding: 12px 32px; text-decoration: none; border-radius: 6px; font-weight: 500;">Get Started</a></p>
   <p style="font-size: 12px; color: #6b7280; margin-top: 16px;">This link expires in {{expiry_time}}.</p>',
  'Hi {{recipient_name}},

Great news! Your early access to {{company_name}} is ready.

Get started: {{action_url}}

This link expires in {{expiry_time}}.',
  TRUE
)
ON CONFLICT (template_type) DO UPDATE SET
  template_name = EXCLUDED.template_name,
  subject_line = EXCLUDED.subject_line,
  html_body = EXCLUDED.html_body,
  text_body = EXCLUDED.text_body,
  is_active = EXCLUDED.is_active,
  updated_at = NOW();

-- 5. Waitlist Welcome
INSERT INTO encharge_email_templates (template_type, template_name, subject_line, html_body, text_body, is_active)
VALUES (
  'waitlist_welcome',
  'Waitlist Welcome',
  'Welcome to {{company_name}}',
  '<p>Hi {{recipient_name}},</p>
   <p>You''re in! Your account is ready. Explore {{company_name}} and start using all features right away.</p>
   <p><a href="{{action_url}}" style="background-color: #3b82f6; color: white; padding: 12px 32px; text-decoration: none; border-radius: 6px; font-weight: 500;">Open {{company_name}}</a></p>
   <p style="font-size: 12px; color: #6b7280; margin-top: 16px;">Your login credentials have been sent separately. If you don''t see them, check your spam folder or contact support.</p>',
  'Hi {{recipient_name}},

You''re in! Your account is ready. Explore {{company_name}} and start using all features right away.

Open {{company_name}}: {{action_url}}

Your login credentials have been sent separately.',
  TRUE
)
ON CONFLICT (template_type) DO UPDATE SET
  template_name = EXCLUDED.template_name,
  subject_line = EXCLUDED.subject_line,
  html_body = EXCLUDED.html_body,
  text_body = EXCLUDED.text_body,
  is_active = EXCLUDED.is_active,
  updated_at = NOW();

-- 6. Welcome (General Onboarding)
INSERT INTO encharge_email_templates (template_type, template_name, subject_line, html_body, text_body, is_active)
VALUES (
  'welcome',
  'Welcome',
  'Welcome to {{organization_name}} on Sixty',
  '<p>Hi {{recipient_name}},</p>
   <p>Welcome to <strong>{{organization_name}}</strong> on Sixty! We''re excited to have you on board.</p>
   <p><a href="{{action_url}}" style="background-color: #3b82f6; color: white; padding: 12px 32px; text-decoration: none; border-radius: 6px; font-weight: 500;">Get Started</a></p>
   <p style="font-size: 12px; color: #6b7280; margin-top: 16px;">Need help getting started? Check out our <a href="https://use60.com/help">help center</a> or contact support.</p>',
  'Hi {{recipient_name}},

Welcome to {{organization_name}} on Sixty! We''re excited to have you on board.

Get started: {{action_url}}

Need help? Visit https://use60.com/help or contact support.',
  TRUE
)
ON CONFLICT (template_type) DO UPDATE SET
  template_name = EXCLUDED.template_name,
  subject_line = EXCLUDED.subject_line,
  html_body = EXCLUDED.html_body,
  text_body = EXCLUDED.text_body,
  is_active = EXCLUDED.is_active,
  updated_at = NOW();

-- 7. Fathom Connected
INSERT INTO encharge_email_templates (template_type, template_name, subject_line, html_body, text_body, is_active)
VALUES (
  'fathom_connected',
  'Fathom Connected',
  'Fathom analytics connected to {{organization_name}}',
  '<p>Hi {{recipient_name}},</p>
   <p>Great! Fathom analytics has been successfully connected to <strong>{{organization_name}}</strong>.</p>
   <p>Your meetings will now be indexed and analyzed automatically.</p>
   <p><a href="{{action_url}}" style="background-color: #3b82f6; color: white; padding: 12px 32px; text-decoration: none; border-radius: 6px; font-weight: 500;">View Analytics</a></p>',
  'Hi {{recipient_name}},

Great! Fathom analytics has been successfully connected to {{organization_name}}.

Your meetings will now be indexed and analyzed automatically.

View analytics: {{action_url}}',
  TRUE
)
ON CONFLICT (template_type) DO UPDATE SET
  template_name = EXCLUDED.template_name,
  subject_line = EXCLUDED.subject_line,
  html_body = EXCLUDED.html_body,
  text_body = EXCLUDED.text_body,
  is_active = EXCLUDED.is_active,
  updated_at = NOW();

-- 8. First Meeting Synced
INSERT INTO encharge_email_templates (template_type, template_name, subject_line, html_body, text_body, is_active)
VALUES (
  'first_meeting_synced',
  'First Meeting Synced',
  'Your first meeting is synced and ready',
  '<p>Hi {{recipient_name}},</p>
   <p>Your first meeting <strong>{{meeting_title}}</strong> has been synced to Sixty.</p>
   <p>Start preparing with Sixty''s AI-powered insights.</p>
   <p><a href="{{action_url}}" style="background-color: #3b82f6; color: white; padding: 12px 32px; text-decoration: none; border-radius: 6px; font-weight: 500;">View Meeting</a></p>',
  'Hi {{recipient_name}},

Your first meeting {{meeting_title}} has been synced to Sixty.

View meeting: {{action_url}}',
  TRUE
)
ON CONFLICT (template_type) DO UPDATE SET
  template_name = EXCLUDED.template_name,
  subject_line = EXCLUDED.subject_line,
  html_body = EXCLUDED.html_body,
  text_body = EXCLUDED.text_body,
  is_active = EXCLUDED.is_active,
  updated_at = NOW();

-- 9. Trial Ending
INSERT INTO encharge_email_templates (template_type, template_name, subject_line, html_body, text_body, is_active)
VALUES (
  'trial_ending',
  'Trial Ending',
  'Your Sixty trial ends in {{trial_days}} days',
  '<p>Hi {{recipient_name}},</p>
   <p>Your Sixty trial ends in <strong>{{trial_days}} days</strong>.</p>
   <p>Upgrade now to continue using all features and keep your data safe.</p>
   <p><a href="{{action_url}}" style="background-color: #3b82f6; color: white; padding: 12px 32px; text-decoration: none; border-radius: 6px; font-weight: 500;">Upgrade Now</a></p>
   <p style="font-size: 12px; color: #6b7280; margin-top: 16px;">No credit card required to continue trial. Cancel anytime.</p>',
  'Hi {{recipient_name}},

Your Sixty trial ends in {{trial_days}} days.

Upgrade now to continue using all features and keep your data safe.

Upgrade: {{action_url}}

No credit card required. Cancel anytime.',
  TRUE
)
ON CONFLICT (template_type) DO UPDATE SET
  template_name = EXCLUDED.template_name,
  subject_line = EXCLUDED.subject_line,
  html_body = EXCLUDED.html_body,
  text_body = EXCLUDED.text_body,
  is_active = EXCLUDED.is_active,
  updated_at = NOW();

-- 10. Trial Expired
INSERT INTO encharge_email_templates (template_type, template_name, subject_line, html_body, text_body, is_active)
VALUES (
  'trial_expired',
  'Trial Expired',
  'Your Sixty trial has expired',
  '<p>Hi {{recipient_name}},</p>
   <p>Your Sixty trial has ended. Your data will be retained for 30 days.</p>
   <p>Reactivate your account to continue using Sixty.</p>
   <p><a href="{{action_url}}" style="background-color: #3b82f6; color: white; padding: 12px 32px; text-decoration: none; border-radius: 6px; font-weight: 500;">Reactivate</a></p>
   <p style="font-size: 12px; color: #6b7280; margin-top: 16px;">Need help? Contact our support team for options.</p>',
  'Hi {{recipient_name}},

Your Sixty trial has ended. Your data will be retained for 30 days.

Reactivate your account: {{action_url}}

Questions? Contact support.',
  TRUE
)
ON CONFLICT (template_type) DO UPDATE SET
  template_name = EXCLUDED.template_name,
  subject_line = EXCLUDED.subject_line,
  html_body = EXCLUDED.html_body,
  text_body = EXCLUDED.text_body,
  is_active = EXCLUDED.is_active,
  updated_at = NOW();

-- 11. Subscription Confirmed
INSERT INTO encharge_email_templates (template_type, template_name, subject_line, html_body, text_body, is_active)
VALUES (
  'subscription_confirmed',
  'Subscription Confirmed',
  'Your {{plan_name}} subscription is confirmed',
  '<p>Hi {{recipient_name}},</p>
   <p>Thank you! Your <strong>{{plan_name}}</strong> subscription is confirmed.</p>
   <p>You now have full access to all Sixty features.</p>
   <p><a href="{{action_url}}" style="background-color: #3b82f6; color: white; padding: 12px 32px; text-decoration: none; border-radius: 6px; font-weight: 500;">Manage Subscription</a></p>
   <p style="font-size: 12px; color: #6b7280; margin-top: 16px;">Your subscription renews on {{renewal_date}}. You can manage your subscription anytime.</p>',
  'Hi {{recipient_name}},

Thank you! Your {{plan_name}} subscription is confirmed.

You now have full access to all Sixty features.

Manage subscription: {{action_url}}

Subscription renews on {{renewal_date}}.',
  TRUE
)
ON CONFLICT (template_type) DO UPDATE SET
  template_name = EXCLUDED.template_name,
  subject_line = EXCLUDED.subject_line,
  html_body = EXCLUDED.html_body,
  text_body = EXCLUDED.text_body,
  is_active = EXCLUDED.is_active,
  updated_at = NOW();

-- 12. Meeting Limit Warning
INSERT INTO encharge_email_templates (template_type, template_name, subject_line, html_body, text_body, is_active)
VALUES (
  'meeting_limit_warning',
  'Meeting Limit Warning',
  'You''re approaching your meeting limit',
  '<p>Hi {{recipient_name}},</p>
   <p>You''ve used {{current_meetings}} of {{meeting_limit}} meetings this month.</p>
   <p>You have {{remaining_meetings}} meetings remaining. Upgrade to increase your limit.</p>
   <p><a href="{{action_url}}" style="background-color: #3b82f6; color: white; padding: 12px 32px; text-decoration: none; border-radius: 6px; font-weight: 500;">Upgrade Plan</a></p>',
  'Hi {{recipient_name}},

You''ve used {{current_meetings}} of {{meeting_limit}} meetings this month.

You have {{remaining_meetings}} meetings remaining.

Upgrade to increase your limit: {{action_url}}',
  TRUE
)
ON CONFLICT (template_type) DO UPDATE SET
  template_name = EXCLUDED.template_name,
  subject_line = EXCLUDED.subject_line,
  html_body = EXCLUDED.html_body,
  text_body = EXCLUDED.text_body,
  is_active = EXCLUDED.is_active,
  updated_at = NOW();

-- 13. Upgrade Prompt
INSERT INTO encharge_email_templates (template_type, template_name, subject_line, html_body, text_body, is_active)
VALUES (
  'upgrade_prompt',
  'Upgrade Prompt',
  'Unlock {{feature_name}} with an upgrade',
  '<p>Hi {{recipient_name}},</p>
   <p>We noticed you''re interested in {{feature_name}}.</p>
   <p>This feature is available on our {{upgrade_plan}} plan. Upgrade today to unlock it.</p>
   <p><a href="{{action_url}}" style="background-color: #3b82f6; color: white; padding: 12px 32px; text-decoration: none; border-radius: 6px; font-weight: 500;">Upgrade Now</a></p>',
  'Hi {{recipient_name}},

We noticed you''re interested in {{feature_name}}.

This feature is available on our {{upgrade_plan}} plan.

Upgrade now: {{action_url}}',
  TRUE
)
ON CONFLICT (template_type) DO UPDATE SET
  template_name = EXCLUDED.template_name,
  subject_line = EXCLUDED.subject_line,
  html_body = EXCLUDED.html_body,
  text_body = EXCLUDED.text_body,
  is_active = EXCLUDED.is_active,
  updated_at = NOW();

-- 14. Email Change Verification
INSERT INTO encharge_email_templates (template_type, template_name, subject_line, html_body, text_body, is_active)
VALUES (
  'email_change_verification',
  'Email Change Verification',
  'Verify your new email address',
  '<p>Hi {{recipient_name}},</p>
   <p>You requested to change your email from <strong>{{old_email}}</strong> to <strong>{{new_email}}</strong>.</p>
   <p>Click below to verify this change.</p>
   <p><a href="{{action_url}}" style="background-color: #3b82f6; color: white; padding: 12px 32px; text-decoration: none; border-radius: 6px; font-weight: 500;">Verify Email</a></p>
   <p style="font-size: 12px; color: #6b7280; margin-top: 16px;">This link expires in {{expiry_time}}.</p>
   <p style="font-size: 12px; color: #6b7280;">If you didn''t request this change, please ignore this email.</p>',
  'Hi {{recipient_name}},

You requested to change your email from {{old_email}} to {{new_email}}.

Verify this change: {{action_url}}

This link expires in {{expiry_time}}.

If you didn''t request this, please ignore this email.',
  TRUE
)
ON CONFLICT (template_type) DO UPDATE SET
  template_name = EXCLUDED.template_name,
  subject_line = EXCLUDED.subject_line,
  html_body = EXCLUDED.html_body,
  text_body = EXCLUDED.text_body,
  is_active = EXCLUDED.is_active,
  updated_at = NOW();

-- 15. Password Reset
INSERT INTO encharge_email_templates (template_type, template_name, subject_line, html_body, text_body, is_active)
VALUES (
  'password_reset',
  'Password Reset',
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
  TRUE
)
ON CONFLICT (template_type) DO UPDATE SET
  template_name = EXCLUDED.template_name,
  subject_line = EXCLUDED.subject_line,
  html_body = EXCLUDED.html_body,
  text_body = EXCLUDED.text_body,
  is_active = EXCLUDED.is_active,
  updated_at = NOW();

-- 16. Join Request Approved
INSERT INTO encharge_email_templates (template_type, template_name, subject_line, html_body, text_body, is_active)
VALUES (
  'join_request_approved',
  'Join Request Approved',
  'Your request to join {{organization_name}} has been approved',
  '<p>Hi {{recipient_name}},</p>
   <p><strong>{{admin_name}}</strong> approved your request to join <strong>{{organization_name}}</strong>.</p>
   <p>You now have full access to the organization.</p>
   <p><a href="{{action_url}}" style="background-color: #3b82f6; color: white; padding: 12px 32px; text-decoration: none; border-radius: 6px; font-weight: 500;">Get Started</a></p>',
  'Hi {{recipient_name}},

{{admin_name}} approved your request to join {{organization_name}}.

You now have full access to the organization.

Get started: {{action_url}}',
  TRUE
)
ON CONFLICT (template_type) DO UPDATE SET
  template_name = EXCLUDED.template_name,
  subject_line = EXCLUDED.subject_line,
  html_body = EXCLUDED.html_body,
  text_body = EXCLUDED.text_body,
  is_active = EXCLUDED.is_active,
  updated_at = NOW();

-- 17. Join Request Rejected
INSERT INTO encharge_email_templates (template_type, template_name, subject_line, html_body, text_body, is_active)
VALUES (
  'join_request_rejected',
  'Join Request Rejected',
  'Your request to join {{organization_name}} could not be approved',
  '<p>Hi {{recipient_name}},</p>
   <p>Unfortunately, your request to join <strong>{{organization_name}}</strong> could not be approved at this time.</p>
   <p>{{#if rejection_reason}}<p>Reason: {{rejection_reason}}</p>{{/if}}</p>
   <p>If you have questions, please contact support.</p>
   <p><a href="mailto:{{support_email}}" style="background-color: #3b82f6; color: white; padding: 12px 32px; text-decoration: none; border-radius: 6px; font-weight: 500;">Contact Support</a></p>',
  'Hi {{recipient_name}},

Unfortunately, your request to join {{organization_name}} could not be approved at this time.

{{#if rejection_reason}}Reason: {{rejection_reason}}{{/if}}

If you have questions, contact support: {{support_email}}',
  TRUE
)
ON CONFLICT (template_type) DO UPDATE SET
  template_name = EXCLUDED.template_name,
  subject_line = EXCLUDED.subject_line,
  html_body = EXCLUDED.html_body,
  text_body = EXCLUDED.text_body,
  is_active = EXCLUDED.is_active,
  updated_at = NOW();

-- 18. Permission to Close
INSERT INTO encharge_email_templates (template_type, template_name, subject_line, html_body, text_body, is_active)
VALUES (
  'permission_to_close',
  'Permission to Close',
  'Permission needed: {{requester_name}} wants to close {{item_name}}',
  '<p>Hi {{recipient_name}},</p>
   <p><strong>{{requester_name}}</strong> is requesting permission to close {{item_type}}: <strong>{{item_name}}</strong>.</p>
   <p>Review and approve or deny this request.</p>
   <p><a href="{{action_url}}" style="background-color: #3b82f6; color: white; padding: 12px 32px; text-decoration: none; border-radius: 6px; font-weight: 500;">Review Request</a></p>',
  'Hi {{recipient_name}},

{{requester_name}} is requesting permission to close {{item_type}}: {{item_name}}.

Review and approve or deny this request: {{action_url}}',
  TRUE
)
ON CONFLICT (template_type) DO UPDATE SET
  template_name = EXCLUDED.template_name,
  subject_line = EXCLUDED.subject_line,
  html_body = EXCLUDED.html_body,
  text_body = EXCLUDED.text_body,
  is_active = EXCLUDED.is_active,
  updated_at = NOW();

-- Verify all 18 templates were created
-- SELECT COUNT(*) as template_count, COUNT(CASE WHEN is_active THEN 1 END) as active_count
-- FROM encharge_email_templates;
