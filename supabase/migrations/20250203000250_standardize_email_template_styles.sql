-- Standardize email template styling across all active templates
-- Ensures consistent colors, fonts, spacing, and button styling

-- Update all email templates to use standardized styling
UPDATE encharge_email_templates
SET html_body = REPLACE(
    REPLACE(
        REPLACE(
            html_body,
            '<style>',
            '<style>
        * { margin: 0; padding: 0; box-sizing: border-box; }
        body { font-family: -apple-system, BlinkMacSystemFont, ''Segoe UI'', Roboto, sans-serif; line-height: 1.6; color: #4b5563; background: #f9fafb; }
        .container { max-width: 600px; margin: 0 auto; padding: 20px; background: #f9fafb; }
        .email-wrapper { background: white; border-radius: 8px; padding: 40px; box-shadow: 0 1px 3px rgba(0,0,0,0.1); }
        h1 { color: #1f2937; margin-bottom: 20px; font-size: 28px; font-weight: 700; }
        h2 { color: #1f2937; margin-bottom: 16px; font-size: 20px; font-weight: 600; }
        p { color: #4b5563; margin-bottom: 16px; line-height: 1.6; }
        a { color: #3b82f6; text-decoration: none; }
        .button { display: inline-block; padding: 12px 28px; background: #3b82f6; color: white; text-decoration: none; border-radius: 6px; font-weight: 500; font-size: 14px; }
        .button:hover { background: #2563eb; }
        code { background: #f3f4f6; padding: 2px 6px; border-radius: 4px; font-family: monospace; font-size: 12px; color: #374151; }
        .footer { margin-top: 32px; padding-top: 20px; border-top: 1px solid #e5e7eb; font-size: 12px; color: #9ca3af; }
        ul { margin: 16px 0 16px 20px; color: #6b7280; }
        li { margin-bottom: 8px; }
            </style>'
        ),
        'style>        body',
        'style>
        body'
    ),
    'style>        .container',
    'style>
        .container'
)
WHERE is_active = true;

-- Verify update
SELECT COUNT(*) as updated_count FROM encharge_email_templates WHERE is_active = true;
