-- Create organization_invitation email template
-- Allows organization invitations to use database template instead of hardcoded HTML

INSERT INTO encharge_email_templates (
  id,
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
  gen_random_uuid(),
  'organization_invitation',
  'transactional',
  '{{inviter_name}} invited you to join {{organization_name}}',
  '<!DOCTYPE html>
<html>
<head>
    <meta charset="UTF-8">
    <meta name="viewport" content="width=device-width, initial-scale=1.0">
</head>
<body style="margin: 0; padding: 0; font-family: -apple-system, BlinkMacSystemFont, ''Segoe UI'', Roboto, sans-serif; background-color: #f9fafb; line-height: 1.6; color: #4b5563;">
    <div style="max-width: 600px; margin: 0 auto; padding: 20px; background-color: #f9fafb;">
        <div style="background-color: white; border-radius: 8px; padding: 40px; box-shadow: 0 1px 3px rgba(0,0,0,0.1);">
            <h1 style="color: #1f2937; margin: 0 0 20px 0; font-size: 28px; font-weight: 700; line-height: 1.3;">Join {{organization_name}} on Sixty</h1>

            <p style="color: #4b5563; margin: 0 0 16px 0; line-height: 1.6;">Hi {{recipient_name}},</p>

            <p style="color: #4b5563; margin: 0 0 24px 0; line-height: 1.6;">{{inviter_name}} has invited you to join <strong style="color: #1f2937;">{{organization_name}}</strong> on Sixty. Accept the invitation below to get started collaborating with your team.</p>

            <div style="text-align: center; margin: 32px 0;">
                <a href="{{invitation_url}}" style="display: inline-block; padding: 12px 32px; background-color: #3b82f6; color: white; text-decoration: none; border-radius: 6px; font-weight: 600; font-size: 16px; cursor: pointer;">Accept Invitation</a>
            </div>

            <p style="color: #6b7280; margin: 0 0 16px 0; font-size: 14px; line-height: 1.6;">
                Or copy and paste this link in your browser:<br style="display: block; margin: 8px 0;">
                <code style="background-color: #f3f4f6; padding: 8px 12px; border-radius: 4px; font-family: monospace; font-size: 12px; color: #374151; display: block; word-break: break-all; margin-top: 8px;">{{invitation_url}}</code>
            </p>

            <p style="color: #6b7280; margin: 0 0 24px 0; font-size: 14px; line-height: 1.6;">
                This invitation will expire in {{expiry_time}}.
            </p>

            <div style="margin-top: 32px; padding-top: 20px; border-top: 1px solid #e5e7eb; font-size: 12px; color: #9ca3af;">
                <p style="margin: 0; line-height: 1.6;">This is an automated message. If you have any questions, please contact us at <a href="mailto:support@use60.com" style="color: #3b82f6; text-decoration: none;">support@use60.com</a></p>
            </div>
        </div>
    </div>
</body>
</html>',
  'Hi {{recipient_name}},

{{inviter_name}} has invited you to join {{organization_name}} on Sixty.

Accept the invitation by clicking the link below:
{{invitation_url}}

Or copy and paste this link in your browser:
{{invitation_url}}

This invitation will expire in {{expiry_time}}.

This is an automated message. If you have any questions, please contact us at support@use60.com',
  true,
  '[{"name": "recipient_name", "description": "Recipient''s first name or email name"}, {"name": "organization_name", "description": "Name of the organization"}, {"name": "inviter_name", "description": "Name of person who sent the invite"}, {"name": "invitation_url", "description": "Full URL to accept invitation"}, {"name": "expiry_time", "description": "When invitation expires (e.g., 7 days)"}]'::jsonb,
  NOW(),
  NOW()
)
ON CONFLICT (template_name) DO UPDATE SET
  html_body = EXCLUDED.html_body,
  text_body = EXCLUDED.text_body,
  subject_line = EXCLUDED.subject_line,
  updated_at = NOW();
