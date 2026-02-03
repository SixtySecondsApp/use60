-- Create user_created email template for new user signup welcome email

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
  'user_created',
  'transactional',
  'Welcome to Sixty, {{first_name}}!',
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
        .footer { margin-top: 32px; padding-top: 20px; border-top: 1px solid #e5e7eb; font-size: 12px; color: #9ca3af; }
        ul { margin: 16px 0 16px 20px; color: #6b7280; }
        li { margin-bottom: 8px; }
    </style>
</head>
<body>
    <div class="container">
        <div class="email-wrapper">
            <h1>Welcome to Sixty, {{first_name}}!</h1>

            <p>Hi {{first_name}},</p>

            <p>Your Sixty account is ready. Let''s get you set up and syncing your first meeting.</p>

            <p style="text-align: center; margin-top: 32px;">
                <a href="{{setup_url}}" class="button">Complete Setup</a>
            </p>

            <p style="margin-top: 24px; font-size: 14px; color: #6b7280;">
                <strong>Next steps:</strong>
            </p>
            <ul style="color: #6b7280; font-size: 14px;">
                <li>{{onboarding_steps}}</li>
                <li>Sync your first meeting</li>
                <li>Invite your team members</li>
            </ul>

            <p style="font-size: 14px; color: #6b7280; margin-top: 16px;">
                Questions? We''re here to help at support@use60.com
            </p>

            <div class="footer">
                <p>Welcome aboard! We''re excited to have you.</p>
            </div>
        </div>
    </div>
</body>
</html>',
  'Hi {{first_name}},

Welcome to Sixty! Your account is ready.

Complete setup: {{setup_url}}

Next steps:
- {{onboarding_steps}}
- Sync your first meeting
- Invite your team members

Questions? Email support@use60.com

Welcome aboard!',
  true,
  '[{"name": "first_name", "description": "User''s first name"}, {"name": "user_name", "description": "User''s full name or username"}, {"name": "setup_url", "description": "URL to complete onboarding"}, {"name": "onboarding_steps", "description": "First action to take (e.g., Connect your calendar)"}]'::jsonb,
  NOW(),
  NOW()
);
