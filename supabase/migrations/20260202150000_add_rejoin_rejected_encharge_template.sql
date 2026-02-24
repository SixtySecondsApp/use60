-- Migration: Add rejoin_rejected email template to encharge_email_templates
-- Purpose: Email notification when rejoin request is declined
-- Story: ORGREM-015 (fixing ORGREM-012)
-- Note: Previous migration added to wrong table (waitlist_email_templates)

INSERT INTO encharge_email_templates (
  template_name,
  template_type,
  subject_line,
  html_body,
  text_body,
  variables,
  is_active,
  created_at,
  updated_at
) VALUES (
  'Rejoin Request Rejected',
  'rejoin_rejected',
  'Your request to rejoin {{org_name}} was declined',
  '<!DOCTYPE html><html><head><meta charset="UTF-8"><meta name="viewport" content="width=device-width, initial-scale=1.0"><meta http-equiv="X-UA-Compatible" content="IE=edge"><meta name="color-scheme" content="light"><meta name="supported-color-schemes" content="light"><title>Rejoin Request Update - Sixty Seconds</title><link rel="preconnect" href="https://fonts.googleapis.com"><link rel="preconnect" href="https://fonts.gstatic.com" crossorigin><link href="https://fonts.googleapis.com/css2?family=Inter:wght@400;500;600;700&display=swap" rel="stylesheet"><style type="text/css">body, table, td, p, a, li, blockquote { -webkit-text-size-adjust: 100%; -ms-text-size-adjust: 100%; }table, td { mso-table-lspace: 0pt; mso-table-rspace: 0pt; }img { -ms-interpolation-mode: bicubic; border: 0; outline: none; text-decoration: none; }html {color-scheme: light !important;background-color: #030712 !important;margin: 0 !important;padding: 0 !important;height: 100% !important;}body {color-scheme: light !important;background-color: #030712 !important;margin: 0 !important;padding: 0 !important;height: 100% !important;width: 100% !important;-webkit-text-fill-color: #F3F4F6 !important;}* {color-scheme: light !important;forced-color-adjust: none !important;}</style></head><body style="margin: 0 !important; padding: 0 !important; font-family: ''Inter'', -apple-system, BlinkMacSystemFont, ''Segoe UI'', Roboto, sans-serif; background-color: #030712 !important; -webkit-font-smoothing: antialiased; -moz-osx-font-smoothing: grayscale; color-scheme: light !important; forced-color-adjust: none !important; -webkit-text-fill-color: #FFFFFF !important; color: #FFFFFF !important; width: 100% !important;"><div style="background-color: #111827 !important; min-height: 100vh; width: 100% !important; margin: 0 !important; padding: 0 !important;"><table role="presentation" cellspacing="0" cellpadding="0" border="0" width="100%" style="background-color: #030712 !important; padding: 0; margin: 0 auto; width: 100% !important; forced-color-adjust: none !important;"><tr style="background-color: #030712 !important;"><td align="center" style="padding: 20px 0; background-color: #030712 !important; forced-color-adjust: none !important;"><table role="presentation" cellspacing="0" cellpadding="0" border="0" width="600" class="email-container" style="max-width: 600px; width: 100%; background-color: #111827 !important; border-radius: 16px; overflow: hidden; border: 1px solid #374151 !important; forced-color-adjust: none !important; -webkit-text-fill-color: #F3F4F6 !important; mso-table-lspace: 0pt; mso-table-rspace: 0pt;"><tr style="background-color: #111827 !important;"><td class="email-header" style="padding: 48px 40px 32px; text-align: center; background-color: #111827 !important; background: linear-gradient(135deg, #111827 0%, #1F2937 100%) !important; forced-color-adjust: none !important; -webkit-text-fill-color: #FFFFFF !important; color: #FFFFFF !important;"><img src="https://ygdpgliavpxeugaajgrb.supabase.co/storage/v1/object/public/Logos/ac4efca2-1fe1-49b3-9d5e-6ac3d8bf3459/Icon.png" alt="Sixty Seconds" width="80" height="80" class="email-logo" style="display: block; margin: 0 auto 24px; border: 0; max-width: 80px; width: 80px; height: auto; forced-color-adjust: none !important; background-color: transparent !important;" /><h1 class="email-title" style="color: #FFFFFF !important; -webkit-text-fill-color: #FFFFFF !important; font-size: 28px; font-weight: 700; margin: 0 0 12px 0; line-height: 1.2; letter-spacing: -0.02em; background-color: transparent !important; forced-color-adjust: none !important; text-shadow: none !important;">Rejoin Request Update</h1><p class="email-subtitle" style="color: #F3F4F6 !important; -webkit-text-fill-color: #F3F4F6 !important; font-size: 18px; margin: 0; line-height: 1.5; font-weight: 400; background-color: transparent !important; forced-color-adjust: none !important;">Your request was not approved</p></td></tr><tr style="background-color: #111827 !important; forced-color-adjust: none !important;"><td class="email-content" style="padding: 40px 40px; background-color: #111827 !important; forced-color-adjust: none !important; -webkit-text-fill-color: #F3F4F6 !important; color: #F3F4F6 !important;"><table role="presentation" cellspacing="0" cellpadding="0" border="0" width="100%" style="margin-bottom: 32px; background-color: #111827 !important; forced-color-adjust: none !important;"><tr style="background-color: #111827 !important; forced-color-adjust: none !important;"><td style="background-color: #111827 !important; forced-color-adjust: none !important;"><p class="email-welcome-text" style="color: #F3F4F6 !important; -webkit-text-fill-color: #F3F4F6 !important; font-size: 16px; line-height: 1.7; margin: 0 0 20px 0; text-align: center; background-color: #111827 !important; forced-color-adjust: none !important;">Hi {{user_first_name}},</p><p class="email-welcome-text" style="color: #F3F4F6 !important; -webkit-text-fill-color: #F3F4F6 !important; font-size: 16px; line-height: 1.7; margin: 0 0 20px 0; text-align: center; background-color: #111827 !important; forced-color-adjust: none !important;">Your request to rejoin <strong>{{org_name}}</strong> has been declined by the organization admin.</p></td></tr></table><table role="presentation" cellspacing="0" cellpadding="0" border="0" width="100%" style="margin-bottom: 32px; background-color: #1F2937 !important; border-radius: 8px; border-left: 4px solid #667eea; forced-color-adjust: none !important;"><tr style="background-color: #1F2937 !important; forced-color-adjust: none !important;"><td style="padding: 20px; background-color: #1F2937 !important; forced-color-adjust: none !important;"><p style="color: #F3F4F6 !important; -webkit-text-fill-color: #F3F4F6 !important; font-size: 14px; line-height: 1.6; margin: 0 0 8px 0; font-weight: 600; background-color: transparent !important; forced-color-adjust: none !important;">Reason provided:</p><p style="color: #D1D5DB !important; -webkit-text-fill-color: #D1D5DB !important; font-size: 14px; line-height: 1.6; margin: 0; background-color: transparent !important; forced-color-adjust: none !important;">{{rejection_reason}}</p></td></tr></table><table role="presentation" cellspacing="0" cellpadding="0" border="0" width="100%" style="margin-bottom: 32px; background-color: #111827 !important; forced-color-adjust: none !important;"><tr style="background-color: #111827 !important; forced-color-adjust: none !important;"><td style="background-color: #111827 !important; forced-color-adjust: none !important;"><p class="email-welcome-text" style="color: #F3F4F6 !important; -webkit-text-fill-color: #F3F4F6 !important; font-size: 16px; line-height: 1.7; margin: 0 0 20px 0; background-color: #111827 !important; forced-color-adjust: none !important;">If you have questions about this decision, you can contact {{admin_name}} or the organization administrators.</p><p style="color: #F3F4F6 !important; -webkit-text-fill-color: #F3F4F6 !important; font-size: 16px; line-height: 1.7; margin: 0 0 12px 0; font-weight: 600; background-color: transparent !important; forced-color-adjust: none !important;">What you can do next:</p><ul style="color: #D1D5DB !important; -webkit-text-fill-color: #D1D5DB !important; font-size: 15px; line-height: 1.7; margin: 0 0 20px 0; padding-left: 20px; background-color: transparent !important; forced-color-adjust: none !important;"><li style="margin-bottom: 8px;">Join a different organization</li><li style="margin-bottom: 8px;">Create your own organization</li><li style="margin-bottom: 0;">Contact support if you need assistance</li></ul></td></tr></table><table role="presentation" cellspacing="0" cellpadding="0" border="0" width="100%" style="margin-bottom: 32px; background-color: #111827 !important; forced-color-adjust: none !important;"><tr style="background-color: #111827 !important; forced-color-adjust: none !important;"><td align="center" style="padding-bottom: 24px; background-color: #111827 !important; forced-color-adjust: none !important;"><a href="{{onboarding_url}}" class="email-button" style="display: inline-block; padding: 14px 32px; background-color: #667eea !important; background: linear-gradient(135deg, #667eea 0%, #764ba2 100%) !important; color: #FFFFFF !important; -webkit-text-fill-color: #FFFFFF !important; text-decoration: none; border-radius: 8px; font-weight: 600; font-size: 16px; box-shadow: 0 4px 15px rgba(102, 126, 234, 0.3); line-height: 1.4; forced-color-adjust: none !important;">Explore Other Organizations</a></td></tr></table></td></tr><tr style="background-color: #111827 !important;"><td class="email-footer" style="padding: 24px 40px; text-align: center; background-color: #111827 !important; border-top: 1px solid #374151 !important; forced-color-adjust: none !important; -webkit-text-fill-color: #D1D5DB !important;"><p class="email-footer-text" style="color: #D1D5DB !important; -webkit-text-fill-color: #D1D5DB !important; font-size: 14px; margin: 0 0 8px 0; font-weight: 500; line-height: 1.4; background-color: transparent !important; forced-color-adjust: none !important;">Sent by Sixty Seconds</p><p class="email-footer-small" style="color: #9CA3AF !important; -webkit-text-fill-color: #9CA3AF !important; font-size: 12px; margin: 0; line-height: 1.4; background-color: transparent !important; forced-color-adjust: none !important;">If you need assistance, contact support at {{support_email}}</p></td></tr></table></td></tr></table></div></body></html>',
  'REJOIN REQUEST UPDATE

Hi {{user_first_name}},

Your request to rejoin {{org_name}} has been declined by the organization admin.

Reason provided:
{{rejection_reason}}

If you have questions about this decision, you can contact {{admin_name}} or the organization administrators.

What you can do next:
- Join a different organization
- Create your own organization
- Contact support if you need assistance

Explore Other Organizations: {{onboarding_url}}

---

If you need assistance, contact support at {{support_email}}

Sent by Sixty Seconds
© 2026 Sixty Seconds - AI Sales Assistant',
  '{"user_first_name": "User first name", "org_name": "Organization name", "rejection_reason": "Reason for rejection", "admin_name": "Admin name or email", "onboarding_url": "URL to onboarding flow", "support_email": "Support email address"}',
  true,
  NOW(),
  NOW()
) ON CONFLICT (template_type) DO UPDATE
SET
  template_name = EXCLUDED.template_name,
  subject_line = EXCLUDED.subject_line,
  html_body = EXCLUDED.html_body,
  text_body = EXCLUDED.text_body,
  variables = EXCLUDED.variables,
  is_active = EXCLUDED.is_active,
  updated_at = NOW();
