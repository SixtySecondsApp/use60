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
    <style>
        * { margin: 0; padding: 0; box-sizing: border-box; }
        body { font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif; line-height: 1.6; color: #4b5563; background: #f9fafb; }
        .container { max-width: 600px; margin: 0 auto; padding: 20px; background: #f9fafb; }
        .email-wrapper { background: white; border-radius: 8px; padding: 40px; box-shadow: 0 1px 3px rgba(0,0,0,0.1); }
        h1 { color: #1f2937; margin-bottom: 20px; font-size: 28px; font-weight: 700; }
        p { color: #4b5563; margin-bottom: 16px; line-height: 1.6; }
        a { color: #3b82f6; text-decoration: none; }
        .button { display: inline-block; padding: 12px 28px; background: #3b82f6; color: white; text-decoration: none; border-radius: 6px; font-weight: 500; font-size: 14px; }
        .button:hover { background: #2563eb; }
        code { background: #f3f4f6; padding: 2px 6px; border-radius: 4px; font-family: monospace; font-size: 12px; color: #374151; }
        .footer { margin-top: 32px; padding-top: 20px; border-top: 1px solid #e5e7eb; font-size: 12px; color: #9ca3af; }
    </style>
</head>
<body>
    <div class="container">
        <div class="email-wrapper">
            <h1>Join {{organization_name}} on Sixty</h1>

            <p>Hi {{recipient_name}},</p>

            <p>{{inviter_name}} has invited you to join <strong>{{organization_name}}</strong> on Sixty.
            Accept the invitation below to get started collaborating with your team.</p>

            <p style="text-align: center; margin-top: 32px;">
                <a href="{{invitation_url}}" class="button">Accept Invitation</a>
            </p>

            <p style="font-size: 14px; color: #6b7280;">
                Or copy and paste this link in your browser:<br>
                <code style="background: #f3f4f6; padding: 8px; border-radius: 4px; display: block; margin-top: 8px; word-break: break-all;">
                    {{invitation_url}}
                </code>
            </p>

            <p style="font-size: 14px; color: #6b7280;">
                This invitation will expire in {{expiry_time}}.
            </p>

            <div class="footer">
                <p>This is an automated message. If you have any questions, please contact us at support@use60.com</p>
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
);
