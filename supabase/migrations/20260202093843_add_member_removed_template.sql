-- Migration: Add member_removed email template
-- Purpose: Email notification for users removed from organization
-- Story: ORGREM-011

INSERT INTO public.waitlist_email_templates (template_type, subject_line, email_body, created_at)
VALUES (
  'member_removed',
  'You have been removed from {{org_name}}',
  '<!DOCTYPE html>
<html>
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <style>
    body { font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, "Helvetica Neue", Arial, sans-serif; line-height: 1.6; color: #333; max-width: 600px; margin: 0 auto; padding: 20px; }
    .header { background: linear-gradient(135deg, #667eea 0%, #764ba2 100%); color: white; padding: 30px; border-radius: 8px 8px 0 0; text-align: center; }
    .content { background: #ffffff; padding: 30px; border: 1px solid #e0e0e0; border-top: none; border-radius: 0 0 8px 8px; }
    .button { display: inline-block; padding: 12px 24px; background: #667eea; color: white; text-decoration: none; border-radius: 6px; margin: 20px 0; }
    .footer { text-align: center; padding: 20px; color: #666; font-size: 14px; }
  </style>
</head>
<body>
  <div class="header">
    <h1>Organization Membership Update</h1>
  </div>
  <div class="content">
    <p>Hi {{user_first_name}},</p>

    <p>You have been removed from <strong>{{org_name}}</strong> by an administrator.</p>

    <p>Your account remains active, and you can still:</p>
    <ul>
      <li>Request to rejoin <strong>{{org_name}}</strong> (requires admin approval)</li>
      <li>Join a different organization</li>
      <li>Create a new organization</li>
    </ul>

    <p>All data you created while a member of {{org_name}} has been preserved.</p>

    <p>If you believe this was done in error, you can reach out to the organization administrator at <a href="mailto:{{admin_email}}">{{admin_email}}</a>.</p>

    <a href="{{rejoin_url}}" class="button">Request to Rejoin</a>
  </div>
  <div class="footer">
    <p>If you need assistance, contact support at <a href="mailto:{{support_email}}">{{support_email}}</a></p>
    <p>&copy; 2026 Sixty. All rights reserved.</p>
  </div>
</body>
</html>',
  NOW()
)
ON CONFLICT (template_type) DO UPDATE
SET
  subject_line = EXCLUDED.subject_line,
  email_body = EXCLUDED.email_body,
  updated_at = NOW();
