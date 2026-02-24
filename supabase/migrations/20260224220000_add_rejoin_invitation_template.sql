-- Add rejoin_invitation email template
-- Uses WHERE NOT EXISTS since template_type has no UNIQUE constraint
-- template_name has a UNIQUE constraint, so we use ON CONFLICT for upsert behavior
INSERT INTO encharge_email_templates (
  template_name,
  template_type,
  subject_line,
  html_body,
  text_body,
  variables,
  is_active
)
SELECT
  'rejoin_invitation',
  'rejoin_invitation',
  '{{admin_name}} invited you to rejoin {{organization_name}} on 60',
  '<!DOCTYPE html>
<html>
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
</head>
<body style="margin: 0; padding: 0; background-color: #f9fafb; font-family: -apple-system, BlinkMacSystemFont, ''Segoe UI'', Roboto, ''Helvetica Neue'', Arial, sans-serif;">
  <table width="100%" cellpadding="0" cellspacing="0" style="background-color: #f9fafb;">
    <tr>
      <td align="center" style="padding: 40px 20px;">
        <table width="600" cellpadding="0" cellspacing="0" style="background: #ffffff; border: 1px solid #e5e7eb; border-radius: 12px; overflow: hidden;">
          <tr>
            <td style="padding: 40px 40px 20px; text-align: center;">
              <h1 style="margin: 0; font-size: 28px; font-weight: bold; color: #1f2937;">Welcome Back to {{organization_name}}</h1>
            </td>
          </tr>
          <tr>
            <td style="padding: 0 40px 40px;">
              <p style="margin: 0 0 16px; font-size: 16px; color: #4b5563;">Hi {{recipient_name}},</p>
              <p style="margin: 0 0 16px; font-size: 16px; color: #4b5563; line-height: 1.6;">{{admin_name}} from <strong style="color: #1f2937;">{{organization_name}}</strong> is inviting you to rejoin the organization on 60.</p>
              <div style="background: #f0fdf4; border-left: 4px solid #37bd7e; padding: 16px; margin: 20px 0; border-radius: 0 8px 8px 0;">
                <p style="margin: 0; font-weight: 600; color: #1f2937;">Your previous data will be restored</p>
                <p style="margin: 8px 0 0 0; font-size: 14px; color: #4b5563;">You''ll have access to all your previous work and can continue collaborating with your team.</p>
              </div>
              <div style="text-align: center; margin: 32px 0 24px;">
                <a href="{{action_url}}" style="display: inline-block; background: #3b82f6; color: #ffffff; text-decoration: none; padding: 14px 28px; border-radius: 8px; font-size: 16px; font-weight: 600;">Accept and Rejoin</a>
              </div>
              <p style="margin: 0; font-size: 13px; color: #9ca3af; text-align: center;">If you have any questions, contact {{admin_name}} or email support@use60.com</p>
            </td>
          </tr>
          <tr>
            <td style="padding: 20px 40px; text-align: center; border-top: 1px solid #e5e7eb;">
              <p style="margin: 0; font-size: 12px; color: #9ca3af;">This is an automated message from 60.</p>
            </td>
          </tr>
        </table>
      </td>
    </tr>
  </table>
</body>
</html>',
  '{{admin_name}} from {{organization_name}} is inviting you to rejoin on 60. Your previous data will be restored. Visit {{action_url}} to accept.',
  '{"recipient_name": "Recipient name", "organization_name": "Organization name", "admin_name": "Admin who sent invite", "action_url": "Dashboard URL"}'::jsonb,
  true
WHERE NOT EXISTS (
  SELECT 1 FROM encharge_email_templates WHERE template_type = 'rejoin_invitation'
);
