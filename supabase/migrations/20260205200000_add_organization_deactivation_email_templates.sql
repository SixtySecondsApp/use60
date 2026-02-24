-- Migration: Add Organization Deactivation Email Templates
-- Date: 2026-02-05
-- Purpose: Create email templates for organization deactivation workflow
-- Idempotent: Yes - uses INSERT ... ON CONFLICT ... DO UPDATE

-- 1. Organization Deactivated - Owner
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
  'organization_deactivated_owner',
  'organization_deactivated_owner',
  'Your organization {{organization_name}} has been deactivated',
  '<h2>Organization Deactivated</h2>
   <p>Hi {{recipient_name}},</p>
   <p>You have successfully deactivated <strong>{{organization_name}}</strong>.</p>
   <div style="background-color: #f3f4f6; border-left: 4px solid #ef4444; padding: 16px; margin: 24px 0; border-radius: 4px;">
     <p style="margin: 0; color: #7f1d1d; font-weight: 500;">⏰ Important: 30-Day Reactivation Window</p>
     <p style="margin: 8px 0 0 0; color: #374151; font-size: 14px;">
       Your organization will be permanently deleted on <strong>{{deletion_date}}</strong>. You have until then to reactivate it.
     </p>
   </div>
   <div style="margin: 24px 0;">
     <a href="{{reactivation_url}}" style="background-color: #3b82f6; color: white; padding: 12px 32px; text-decoration: none; border-radius: 6px; font-weight: 500; display: inline-block;">Reactivate Organization</a>
   </div>
   <div style="background-color: #f9fafb; padding: 16px; border-radius: 6px; margin-top: 24px;">
     <p style="margin: 0 0 12px 0; color: #374151; font-weight: 500;">What happens next:</p>
     <ul style="margin: 8px 0 0 0; padding-left: 20px; color: #6b7280; font-size: 14px;">
       <li>All members immediately lose access to {{organization_name}}</li>
       <li>Data will be permanently deleted on {{deletion_date}} unless you reactivate</li>
       <li>You can still accept rejoin requests from members</li>
     </ul>
   </div>
   <p style="margin-top: 24px; color: #6b7280; font-size: 12px;">
     Questions? Contact us at <a href="mailto:{{support_email}}" style="color: #3b82f6; text-decoration: none;">{{support_email}}</a>
   </p>',
  'Hi {{recipient_name}},

You have successfully deactivated {{organization_name}}.

IMPORTANT: 30-Day Reactivation Window
Your organization will be permanently deleted on {{deletion_date}}. You have until then to reactivate it.

To reactivate: {{reactivation_url}}

What happens next:
- All members immediately lose access to {{organization_name}}
- Data will be permanently deleted on {{deletion_date}} unless you reactivate
- You can still accept rejoin requests from members

Questions? Contact support: {{support_email}}',
  TRUE,
  '[
    {"name": "recipient_name", "description": "Owner''s first name"},
    {"name": "organization_name", "description": "Organization name"},
    {"name": "deletion_date", "description": "Date when data will be deleted (30 days from now)"},
    {"name": "reactivation_url", "description": "Link to reactivate organization"},
    {"name": "support_email", "description": "Support email address"}
  ]'::jsonb,
  NOW(),
  NOW()
)
ON CONFLICT (template_name) DO UPDATE SET subject_line = EXCLUDED.subject_line, html_body = EXCLUDED.html_body, text_body = EXCLUDED.text_body, updated_at = NOW();

-- 2. Organization Deactivated - Member
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
  'organization_deactivated_member',
  'organization_deactivated_member',
  'Access to {{organization_name}} has been revoked',
  '<h2>Organization Access Revoked</h2>
   <p>Hi {{recipient_name}},</p>
   <p><strong>{{organization_name}}</strong> has been deactivated by its owner. You no longer have access to this organization.</p>
   <div style="background-color: #f3f4f6; border-left: 4px solid #f59e0b; padding: 16px; margin: 24px 0; border-radius: 4px;">
     <p style="margin: 0; color: #78350f; font-weight: 500;">📅 30-Day Recovery Window</p>
     <p style="margin: 8px 0 0 0; color: #374151; font-size: 14px;">
       The organization owner can reactivate {{organization_name}} within 30 days. If reactivated, you can request to rejoin.
     </p>
   </div>
   <div style="background-color: #f9fafb; padding: 16px; border-radius: 6px; margin-top: 24px;">
     <p style="margin: 0 0 12px 0; color: #374151; font-weight: 500;">What you can do:</p>
     <ul style="margin: 8px 0 0 0; padding-left: 20px; color: #6b7280; font-size: 14px;">
       <li>Once reactivated, request to rejoin the organization</li>
       <li>Contact {{organization_owner_email}} if you think this was a mistake</li>
       <li>All your personal data remains secure</li>
     </ul>
   </div>
   <p style="margin-top: 24px; color: #6b7280; font-size: 12px;">
     Questions? Contact us at <a href="mailto:{{support_email}}" style="color: #3b82f6; text-decoration: none;">{{support_email}}</a>
   </p>',
  'Hi {{recipient_name}},

{{organization_name}} has been deactivated by its owner. You no longer have access to this organization.

📅 30-Day Recovery Window
The organization owner can reactivate {{organization_name}} within 30 days. If reactivated, you can request to rejoin.

What you can do:
- Once reactivated, request to rejoin the organization
- Contact {{organization_owner_email}} if you think this was a mistake
- All your personal data remains secure

Questions? Contact support: {{support_email}}',
  TRUE,
  '[
    {"name": "recipient_name", "description": "Member''s first name"},
    {"name": "organization_name", "description": "Organization name"},
    {"name": "organization_owner_email", "description": "Email of organization owner"},
    {"name": "support_email", "description": "Support email address"}
  ]'::jsonb,
  NOW(),
  NOW()
)
ON CONFLICT (template_name) DO UPDATE SET subject_line = EXCLUDED.subject_line, html_body = EXCLUDED.html_body, text_body = EXCLUDED.text_body, updated_at = NOW();

-- 3. Organization Deletion Warning (Day 25 - 5 days remaining)
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
  'organization_deletion_warning',
  'organization_deletion_warning',
  'Last chance: Reactivate {{organization_name}} before deletion',
  '<h2>Final Notice: {{organization_name}} Deletion Scheduled</h2>
   <p>Hi {{recipient_name}},</p>
   <p>We''re writing to remind you that <strong>{{organization_name}}</strong> will be <strong>permanently deleted</strong> on {{deletion_date}}.</p>
   <div style="background-color: #fee2e2; border: 2px solid #ef4444; padding: 16px; margin: 24px 0; border-radius: 4px;">
     <p style="margin: 0; color: #7f1d1d; font-weight: 600; font-size: 16px;">⚠️ Only {{days_remaining}} days remaining</p>
     <p style="margin: 8px 0 0 0; color: #991b1b; font-size: 14px;">
       After {{deletion_date}}, all organization data, messages, and records will be permanently erased and cannot be recovered.
     </p>
   </div>
   <div style="margin: 24px 0;">
     <a href="{{reactivation_url}}" style="background-color: #ef4444; color: white; padding: 12px 32px; text-decoration: none; border-radius: 6px; font-weight: 500; display: inline-block;">Reactivate Now</a>
   </div>
   <p style="margin-top: 24px; color: #374151;">
     This is your final notice. Please act immediately if you wish to preserve your organization data.
   </p>
   <p style="margin-top: 16px; color: #6b7280; font-size: 12px;">
     If you have any issues or need assistance, contact us at <a href="mailto:{{support_email}}" style="color: #3b82f6; text-decoration: none;">{{support_email}}</a>
   </p>',
  'Hi {{recipient_name}},

FINAL NOTICE: {{organization_name}} Deletion Scheduled

We''re writing to remind you that {{organization_name}} will be permanently deleted on {{deletion_date}}.

⚠️ ONLY {{days_remaining}} DAYS REMAINING

After {{deletion_date}}, all organization data, messages, and records will be permanently erased and cannot be recovered.

To reactivate immediately: {{reactivation_url}}

This is your final notice. Please act immediately if you wish to preserve your organization data.

If you have any issues or need assistance, contact support: {{support_email}}',
  TRUE,
  '[
    {"name": "recipient_name", "description": "Owner''s first name"},
    {"name": "organization_name", "description": "Organization name"},
    {"name": "deletion_date", "description": "Final deletion date"},
    {"name": "days_remaining", "description": "Number of days until deletion (typically 5)"},
    {"name": "reactivation_url", "description": "Link to reactivate organization immediately"},
    {"name": "support_email", "description": "Support email address"}
  ]'::jsonb,
  NOW(),
  NOW()
)
ON CONFLICT (template_name) DO UPDATE SET subject_line = EXCLUDED.subject_line, html_body = EXCLUDED.html_body, text_body = EXCLUDED.text_body, updated_at = NOW();

-- 4. Organization Permanently Deleted
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
  'organization_permanently_deleted',
  'organization_permanently_deleted',
  'Organization {{organization_name}} has been permanently deleted',
  '<h2>Organization Permanently Deleted</h2>
   <p>Hi {{recipient_name}},</p>
   <p>This is to confirm that <strong>{{organization_name}}</strong> has been permanently deleted on {{deleted_date}}.</p>
   <div style="background-color: #f3f4f6; border-left: 4px solid #6b7280; padding: 16px; margin: 24px 0; border-radius: 4px;">
     <p style="margin: 0; color: #374151; font-weight: 500;">All organization data has been erased</p>
     <p style="margin: 8px 0 0 0; color: #6b7280; font-size: 14px;">
       All data including messages, records, and configurations have been permanently deleted and cannot be recovered.
     </p>
   </div>
   <div style="background-color: #f9fafb; padding: 16px; border-radius: 6px; margin-top: 24px;">
     <p style="margin: 0; color: #374151; font-weight: 500;">What happens now:</p>
     <ul style="margin: 8px 0 0 0; padding-left: 20px; color: #6b7280; font-size: 14px;">
       <li>Your account is unaffected and remains active</li>
       <li>You can create new organizations or join other organizations</li>
       <li>Any recurring subscriptions have been cancelled</li>
     </ul>
   </div>
   <p style="margin-top: 24px; color: #6b7280; font-size: 12px;">
     If you believe this was done in error or have questions, contact us immediately at <a href="mailto:{{support_email}}" style="color: #3b82f6; text-decoration: none;">{{support_email}}</a>
   </p>',
  'Hi {{recipient_name}},

Organization Permanently Deleted

This is to confirm that {{organization_name}} has been permanently deleted on {{deleted_date}}.

All organization data has been erased and cannot be recovered.

What happens now:
- Your account is unaffected and remains active
- You can create new organizations or join other organizations
- Any recurring subscriptions have been cancelled

If you believe this was done in error or have questions, contact support immediately: {{support_email}}',
  TRUE,
  '[
    {"name": "recipient_name", "description": "Owner''s first name"},
    {"name": "organization_name", "description": "Organization name"},
    {"name": "deleted_date", "description": "Date when organization was deleted"},
    {"name": "support_email", "description": "Support email address"}
  ]'::jsonb,
  NOW(),
  NOW()
)
ON CONFLICT (template_name) DO UPDATE SET subject_line = EXCLUDED.subject_line, html_body = EXCLUDED.html_body, text_body = EXCLUDED.text_body, updated_at = NOW();
