-- Add Sixty logo to organization invitation email template
-- Adds branded header with app logo above invitation content

UPDATE encharge_email_templates
SET
  html_body = '<!DOCTYPE html>
<html>
<head>
    <meta charset="UTF-8">
    <meta name="viewport" content="width=device-width, initial-scale=1.0">
</head>
<body style="margin: 0; padding: 0; font-family: -apple-system, BlinkMacSystemFont, ''Segoe UI'', Roboto, sans-serif; background-color: #f9fafb; line-height: 1.6; color: #4b5563;">
    <div style="max-width: 600px; margin: 0 auto; padding: 20px; background-color: #f9fafb;">
        <div style="background-color: white; border-radius: 8px; padding: 40px; box-shadow: 0 1px 3px rgba(0,0,0,0.1);">

            <!-- App Logo Header -->
            <div style="text-align: center; margin: 0 0 32px 0; padding-bottom: 24px; border-bottom: 1px solid #e5e7eb;">
                <img src="{{app_logo_url}}" alt="Sixty" style="height: 48px; width: auto; margin: 0 auto; display: block;" />
            </div>

            <h1 style="color: #1f2937; margin: 0 0 24px 0; font-size: 28px; font-weight: 700; line-height: 1.3; text-align: center;">Join {{organization_name}} on Sixty</h1>

            <!-- Inviter Section with Avatar -->
            <div style="text-align: center; margin: 0 0 32px 0; padding-bottom: 24px; border-bottom: 1px solid #e5e7eb;">
                <img src="{{inviter_avatar_url}}" alt="{{inviter_name}}" style="width: 64px; height: 64px; border-radius: 50%; object-fit: cover; margin: 0 auto 12px auto; display: block; border: 2px solid #e5e7eb;" />
                <p style="margin: 0; font-size: 14px; color: #6b7280; font-weight: 500;">Invited by {{inviter_name}}</p>
            </div>

            <p style="color: #4b5563; margin: 0 0 16px 0; line-height: 1.6; font-size: 16px;">Hi {{recipient_name}},</p>

            <p style="color: #4b5563; margin: 0 0 24px 0; line-height: 1.6; font-size: 16px;">{{inviter_name}} has invited you to join <strong style="color: #1f2937;">{{organization_name}}</strong> on Sixty. Accept the invitation below to get started collaborating with your team.</p>

            <div style="text-align: center; margin: 32px 0;">
                <a href="{{invitation_url}}" style="display: inline-block; padding: 14px 32px; background-color: #3b82f6; color: #ffffff; text-decoration: none; border-radius: 6px; font-weight: 600; font-size: 16px;">Accept Invitation</a>
            </div>

            <div style="background-color: #f3f4f6; padding: 16px; border-radius: 6px; margin: 24px 0;">
                <p style="margin: 0 0 8px 0; font-size: 13px; color: #6b7280; line-height: 1.5;">Or copy and paste this link in your browser:</p>
                <code style="display: block; background-color: #ffffff; padding: 10px 12px; border-radius: 4px; font-family: ''Monaco'', ''Courier New'', monospace; font-size: 12px; color: #374151; word-break: break-all; border: 1px solid #e5e7eb;">{{invitation_url}}</code>
            </div>

            <p style="color: #6b7280; margin: 0 0 16px 0; font-size: 14px; line-height: 1.6;">
                This invitation will expire in <strong>{{expiry_time}}</strong>.
            </p>

            <div style="margin-top: 32px; padding-top: 20px; border-top: 1px solid #e5e7eb; text-align: center;">
                <p style="margin: 0; font-size: 12px; color: #9ca3af; line-height: 1.6;">
                    This is an automated message from Sixty.<br/>
                    If you have any questions, contact us at <a href="mailto:{{support_email}}" style="color: #3b82f6; text-decoration: none;">{{support_email}}</a>
                </p>
            </div>
        </div>
    </div>
</body>
</html>',
  variables = '[
    {"name": "app_logo_url", "description": "URL to Sixty application logo"},
    {"name": "recipient_name", "description": "Recipient first name or email name"},
    {"name": "organization_name", "description": "Name of the organization"},
    {"name": "inviter_name", "description": "Name of person who sent the invite"},
    {"name": "inviter_avatar_url", "description": "URL to inviter profile photo or fallback avatar"},
    {"name": "invitation_url", "description": "Full URL to accept invitation"},
    {"name": "expiry_time", "description": "When invitation expires (e.g., 7 days)"},
    {"name": "support_email", "description": "Support contact email"}
  ]'::jsonb,
  updated_at = NOW()
WHERE template_name = 'organization_invitation';
