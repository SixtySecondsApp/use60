-- Migration: Add rejoin_rejected email template
-- Purpose: Email notification when rejoin request is declined
-- Story: ORGREM-012

INSERT INTO public.waitlist_email_templates (template_type, subject_line, email_body, created_at)
VALUES (
  'rejoin_rejected',
  'Your request to rejoin {{org_name}} was declined',
  '<!DOCTYPE html>
<html>
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <style>
    body { font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, "Helvetica Neue", Arial, sans-serif; line-height: 1.6; color: #333; max-width: 600px; margin: 0 auto; padding: 20px; }
    .header { background: linear-gradient(135deg, #667eea 0%, #764ba2 100%); color: white; padding: 30px; border-radius: 8px 8px 0 0; text-align: center; }
    .content { background: #ffffff; padding: 30px; border: 1px solid #e0e0e0; border-top: none; border-radius: 0 0 8px 8px; }
    .info-box { background: #f8f9fa; border-left: 4px solid #667eea; padding: 15px; margin: 20px 0; }
    .button { display: inline-block; padding: 12px 24px; background: #667eea; color: white; text-decoration: none; border-radius: 6px; margin: 20px 0; }
    .footer { text-align: center; padding: 20px; color: #666; font-size: 14px; }
  </style>
</head>
<body>
  <div class="header">
    <h1>Rejoin Request Update</h1>
  </div>
  <div class="content">
    <p>Hi {{user_first_name}},</p>

    <p>Your request to rejoin <strong>{{org_name}}</strong> has been declined.</p>

    {{#if rejection_reason}}
    <div class="info-box">
      <strong>Reason provided:</strong><br>
      {{rejection_reason}}
    </div>
    {{/if}}

    <p>If you have questions about this decision, you can contact {{admin_name}} or the organization administrators.</p>

    <p><strong>What you can do next:</strong></p>
    <ul>
      <li>Join a different organization</li>
      <li>Create your own organization</li>
      <li>Contact support if you need assistance</li>
    </ul>

    <a href="{{onboarding_url}}" class="button">Explore Other Organizations</a>
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
