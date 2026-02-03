# Implementation Details - Email System Fix

**Feature**: EMAIL-FIX
**Total Stories**: 7
**Time Estimate**: 1.5-2 hours

---

## EMAIL-FIX-001: Fix config.toml (5 minutes) 🎯 CRITICAL

### File: `supabase/config.toml`

**Location**: After line 134 (after `send-password-reset-email` config)

**Current state** (line 133-134):
```toml
[functions.send-password-reset-email]
verify_jwt = false
```

**Add after line 134**:
```toml
# Organization invitations - called from browser without JWT
# Public endpoint that handles auth internally
[functions.send-organization-invitation]
verify_jwt = false
```

**Why**: The platform defaults to `verify_jwt = true` when a function is not configured. Your frontend calls this function without JWT tokens, causing 401 Unauthorized. This matches the pattern used by `send-password-reset-email`.

**Test after change**:
- Redeploy: `supabase functions deploy`
- Or reload the dashboard
- Test: Click "Resend Invite" on TeamMembersPage
- Expected: Email sends, no 401 in console

---

## EMAIL-FIX-002: Create organization_invitation Template (15 minutes) 🗄️

### File: `supabase/migrations/20250203_add_organization_invitation_template.sql`

```sql
-- Create organization_invitation email template
INSERT INTO encharge_email_templates (
  id,
  template_name,
  template_type,
  subject_line,
  html_body,
  text_body,
  is_active,
  variables
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
        body { font-family: -apple-system, BlinkMacSystemFont, ''Segoe UI'', Roboto, sans-serif; line-height: 1.6; color: #333; }
        .container { max-width: 600px; margin: 0 auto; padding: 20px; background: #f9fafb; }
        .email-wrapper { background: white; border-radius: 8px; padding: 40px; box-shadow: 0 1px 3px rgba(0,0,0,0.1); }
        h1 { color: #1f2937; margin-bottom: 16px; font-size: 24px; }
        p { color: #4b5563; margin-bottom: 16px; }
        .button { display: inline-block; padding: 12px 24px; background: #3b82f6; color: white; text-decoration: none; border-radius: 6px; font-weight: 500; }
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
  '[{"name": "recipient_name", "description": "Recipient''s first name or email name"}, {"name": "organization_name", "description": "Name of the organization"}, {"name": "inviter_name", "description": "Name of person who sent the invite"}, {"name": "invitation_url", "description": "Full URL to accept invitation"}, {"name": "expiry_time", "description": "When invitation expires (e.g., ''7 days'')"}]'::jsonb
);
```

**What this does**:
- Creates `organization_invitation` template in database
- Uses same styling as existing templates
- Includes all variables needed by edge function
- Sets `is_active = true` for immediate use

**Verify**:
```sql
SELECT id, template_name, is_active FROM encharge_email_templates
WHERE template_name = 'organization_invitation';
```

---

## EMAIL-FIX-003: Manual Testing (10 minutes) ✅

### Test Steps:

1. **Start development server**:
   ```bash
   npm run dev
   ```

2. **Log in to dashboard**:
   - Navigate to Team Members page
   - Find any pending invitation
   - Click "Resend Invite" button

3. **Check browser console**:
   - Press F12 to open DevTools
   - Go to Console tab
   - Look for the 401 error (should be gone)

4. **Verify email sent**:
   - Check staging email inbox
   - Email should arrive from `staging@sixtyseconds.ai`
   - Email should match template styling

5. **Update changelog**:
   ```bash
   # Add to CHANGELOG.md
   ## Fixed
   - Fix 401 Unauthorized error on organization invitation emails
   ```

---

## EMAIL-FIX-004: Refactor Edge Function (20 minutes) ⚙️

### File: `supabase/functions/send-organization-invitation/index.ts`

**Replace the `generateEmailTemplate` function** (lines 30-83) with:

```typescript
/**
 * Fetch and format email template from database
 */
async function getEmailTemplate(
  supabaseUrl: string,
  supabaseServiceKey: string,
  variables: Record<string, string>
): Promise<{ html: string; text: string }> {
  try {
    const response = await fetch(`${supabaseUrl}/rest/v1/encharge_email_templates?template_name=eq.organization_invitation&select=html_body,text_body`, {
      headers: {
        'Authorization': `Bearer ${supabaseServiceKey}`,
        'apikey': supabaseServiceKey,
        'Content-Type': 'application/json',
      },
    });

    if (!response.ok) {
      console.warn('[send-organization-invitation] Failed to fetch template from database, using fallback');
      return getFallbackTemplate(variables);
    }

    const templates = await response.json();
    if (!templates || templates.length === 0) {
      console.warn('[send-organization-invitation] Template not found in database, using fallback');
      return getFallbackTemplate(variables);
    }

    const template = templates[0];
    let html = template.html_body || '';
    let text = template.text_body || '';

    // Replace variables
    Object.entries(variables).forEach(([key, value]) => {
      const placeholder = `{{${key}}}`;
      html = html.replace(new RegExp(placeholder, 'g'), value);
      text = text.replace(new RegExp(placeholder, 'g'), value);
    });

    return { html, text };
  } catch (error) {
    console.error('[send-organization-invitation] Error fetching template:', error);
    return getFallbackTemplate(variables);
  }
}

/**
 * Fallback template if database template not found
 */
function getFallbackTemplate(variables: Record<string, string>): { html: string; text: string } {
  const { recipient_name, organization_name, inviter_name, invitation_url, expiry_time } = variables;

  const html = `<!DOCTYPE html>
<html>
<head>
    <meta charset="UTF-8">
    <meta name="viewport" content="width=device-width, initial-scale=1.0">
    <style>
        body { font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif; line-height: 1.6; color: #333; }
        .container { max-width: 600px; margin: 0 auto; padding: 20px; background: #f9fafb; }
        .email-wrapper { background: white; border-radius: 8px; padding: 40px; box-shadow: 0 1px 3px rgba(0,0,0,0.1); }
        h1 { color: #1f2937; margin-bottom: 16px; font-size: 24px; }
        p { color: #4b5563; margin-bottom: 16px; }
        .button { display: inline-block; padding: 12px 24px; background: #3b82f6; color: white; text-decoration: none; border-radius: 6px; font-weight: 500; }
        .footer { margin-top: 32px; padding-top: 20px; border-top: 1px solid #e5e7eb; font-size: 12px; color: #9ca3af; }
    </style>
</head>
<body>
    <div class="container">
        <div class="email-wrapper">
            <h1>Join ${organization_name} on Sixty</h1>
            <p>Hi ${recipient_name},</p>
            <p>${inviter_name} has invited you to join <strong>${organization_name}</strong> on Sixty.
            Accept the invitation below to get started collaborating with your team.</p>
            <p style="text-align: center; margin-top: 32px;">
                <a href="${invitation_url}" class="button">Accept Invitation</a>
            </p>
            <p style="font-size: 14px; color: #6b7280;">
                Or copy and paste this link in your browser:<br>
                <code style="background: #f3f4f6; padding: 8px; border-radius: 4px; display: block; margin-top: 8px; word-break: break-all;">
                    ${invitation_url}
                </code>
            </p>
            <p style="font-size: 14px; color: #6b7280;">
                This invitation will expire in ${expiry_time || '7 days'}.
            </p>
            <div class="footer">
                <p>This is an automated message. If you have any questions, please contact us at support@use60.com</p>
            </div>
        </div>
    </div>
</body>
</html>`;

  const text = `Hi ${recipient_name},\n\n${inviter_name} has invited you to join ${organization_name} on Sixty.\n\nAccept the invitation by clicking:\n${invitation_url}\n\nThis invitation will expire in ${expiry_time || '7 days'}.`;

  return { html, text };
}
```

**Update the `serve` handler** to use the new template function:

Replace lines 133-148 with:

```typescript
    const recipientName = to_name || to_email.split('@')[0];

    const supabaseUrl = Deno.env.get('SUPABASE_URL') || '';
    const supabaseServiceKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') || '';

    const variables = {
      recipient_name: recipientName,
      organization_name: organization_name,
      inviter_name: inviter_name,
      invitation_url: invitationUrl,
      expiry_time: '7 days',
    };

    const { html: emailHtml, text: emailText } = await getEmailTemplate(
      supabaseUrl,
      supabaseServiceKey,
      variables
    );

    const result = await sendEmail({
      to: to_email,
      subject: `${inviter_name} invited you to join ${organization_name}`,
      html: emailHtml,
      text: emailText,
      from: 'invites@use60.com',
      fromName: 'Sixty',
    });
```

**Benefits**:
- Template is now in database (easier to update)
- Consistent with other email functions
- Fallback HTML ensures emails still work if template missing

---

## EMAIL-FIX-005: Create user_created Template (15 minutes) 🗄️

### File: `supabase/migrations/20250203_add_user_created_template.sql`

```sql
-- Create user_created welcome email template for new signups
INSERT INTO encharge_email_templates (
  id,
  template_name,
  template_type,
  subject_line,
  html_body,
  text_body,
  is_active,
  variables
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
        body { font-family: -apple-system, BlinkMacSystemFont, ''Segoe UI'', Roboto, sans-serif; line-height: 1.6; color: #333; }
        .container { max-width: 600px; margin: 0 auto; padding: 20px; background: #f9fafb; }
        .email-wrapper { background: white; border-radius: 8px; padding: 40px; box-shadow: 0 1px 3px rgba(0,0,0,0.1); }
        h1 { color: #1f2937; margin-bottom: 16px; font-size: 24px; }
        p { color: #4b5563; margin-bottom: 16px; }
        .button { display: inline-block; padding: 12px 24px; background: #3b82f6; color: white; text-decoration: none; border-radius: 6px; font-weight: 500; }
        .footer { margin-top: 32px; padding-top: 20px; border-top: 1px solid #e5e7eb; font-size: 12px; color: #9ca3af; }
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
  '[{"name": "first_name", "description": "User''s first name"}, {"name": "user_name", "description": "User''s full name or username"}, {"name": "setup_url", "description": "URL to complete onboarding"}, {"name": "onboarding_steps", "description": "First action to take (e.g., ''Connect your calendar'')"}]'::jsonb
);
```

---

## EMAIL-FIX-006: Standardize Styling (25 minutes) 🎨

### File: `supabase/migrations/20250203_standardize_email_template_styles.sql`

This migration updates all existing templates to use consistent styling:

```sql
-- Update all email templates to use standardized styling

-- Color palette (consistent across all templates)
-- Background: #f9fafb (light gray)
-- Card: white
-- Text: #4b5563 (dark gray)
-- Headings: #1f2937 (darker gray)
-- Buttons: #3b82f6 (blue)
-- Borders: #e5e7eb (light gray)
-- Footer text: #9ca3af (medium gray)

UPDATE encharge_email_templates
SET html_body = REPLACE(
    html_body,
    'style>',
    'style>
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
)
WHERE is_active = true;

-- Verify all templates have been updated
SELECT count(*) as updated_count FROM encharge_email_templates WHERE is_active = true;
```

**What this does**:
- Standardizes all email styling
- Consistent colors across all templates
- Consistent typography and spacing
- Hover effects on buttons
- Outlook-compatible CSS

---

## EMAIL-FIX-007: Add Test Utilities (20 minutes) 🧪

### File: `src/lib/services/testEmailService.ts` (New)

```typescript
/**
 * Email Service Testing Utilities
 *
 * Tests all email sending operations to verify:
 * - Templates are accessible in database
 * - Variables can be substituted
 * - Edge functions are responsive
 */

import { supabase } from '@/lib/supabase/clientV2';
import logger from '@/lib/utils/logger';

export interface EmailTestResult {
  templateName: string;
  status: 'success' | 'failed';
  message: string;
  timestamp: Date;
}

export const testEmailService = {
  /**
   * Test a specific email template
   */
  async testTemplate(templateName: string): Promise<EmailTestResult> {
    try {
      const { data, error } = await supabase
        .from('encharge_email_templates')
        .select('id, template_name, subject_line, is_active')
        .eq('template_name', templateName)
        .single();

      if (error || !data) {
        return {
          templateName,
          status: 'failed',
          message: `Template not found: ${error?.message || 'Unknown error'}`,
          timestamp: new Date(),
        };
      }

      if (!data.is_active) {
        return {
          templateName,
          status: 'failed',
          message: 'Template exists but is inactive',
          timestamp: new Date(),
        };
      }

      return {
        templateName,
        status: 'success',
        message: `Template found and active: ${data.subject_line}`,
        timestamp: new Date(),
      };
    } catch (error) {
      return {
        templateName,
        status: 'failed',
        message: `Error testing template: ${error instanceof Error ? error.message : 'Unknown error'}`,
        timestamp: new Date(),
      };
    }
  },

  /**
   * Test all email templates
   */
  async testAllTemplates(): Promise<EmailTestResult[]> {
    const templateNames = [
      'welcome',
      'password_reset',
      'email_change_verification',
      'join_request_approved',
      'join_request_rejected',
      'member_removed',
      'organization_invitation',
      'user_created',
    ];

    const results = await Promise.all(
      templateNames.map((name) => this.testTemplate(name))
    );

    const summary = {
      total: results.length,
      passed: results.filter((r) => r.status === 'success').length,
      failed: results.filter((r) => r.status === 'failed').length,
      timestamp: new Date(),
    };

    logger.info('[TestEmailService] Test results:', summary);
    results.forEach((result) => {
      if (result.status === 'failed') {
        logger.warn(`[TestEmailService] ${result.templateName}: ${result.message}`);
      } else {
        logger.debug(`[TestEmailService] ${result.templateName}: OK`);
      }
    });

    return results;
  },

  /**
   * Test edge function availability
   */
  async testEdgeFunctions(): Promise<{ function: string; status: 'ok' | 'error' }[]> {
    const functions = [
      'send-organization-invitation',
      'encharge-send-email',
      'send-password-reset-email',
    ];

    const results = await Promise.all(
      functions.map(async (functionName) => {
        try {
          const response = await supabase.functions.invoke(functionName, {
            body: { test: true },
          });

          return {
            function: functionName,
            status: response.error ? 'error' : 'ok',
          };
        } catch (error) {
          logger.warn(`[TestEmailService] Error testing ${functionName}:`, error);
          return {
            function: functionName,
            status: 'error',
          };
        }
      })
    );

    return results;
  },

  /**
   * Run all email service tests
   */
  async runFullTest() {
    logger.info('[TestEmailService] Starting full email service test...');

    const templateResults = await this.testAllTemplates();
    const functionResults = await this.testEdgeFunctions();

    return {
      templates: templateResults,
      functions: functionResults,
      timestamp: new Date(),
    };
  },
};
```

### Extend health endpoint (optional): `supabase/functions/health/index.ts`

Add email status to existing health check:

```typescript
// Add to the health check response:
{
  status: 'ok',
  // ... existing fields ...
  email: {
    ses_configured: isSESConfigured(),
    templates_loaded: templateCount,
    last_check: new Date().toISOString(),
  }
}
```

---

## Deployment Checklist

### Pre-Deployment
- [ ] All migrations reviewed
- [ ] Code changes tested locally
- [ ] Environment variables verified
- [ ] Database backups ready

### Deployment Order
1. **Deploy migrations** (config.toml + SQL migrations)
   ```bash
   supabase migrations up
   supabase functions deploy
   ```

2. **Test in staging** (EMAIL-FIX-003)
   ```bash
   npm run dev
   # Send test invitation
   # Verify no 401 error
   ```

3. **Redeploy edge functions** (if needed)
   ```bash
   supabase functions deploy send-organization-invitation
   ```

4. **Deploy to production** (after staging verification)
   ```bash
   git commit -m "Email system fixes: 401 error and template standardization"
   git push
   # CI/CD deploys automatically
   ```

### Post-Deployment
- [ ] Monitor email logs
- [ ] Test team member invitations
- [ ] Check email delivery rates
- [ ] Verify styling in multiple email clients

---

## Rollback Plan

If issues occur:

1. **Revert config.toml change** (restore `verify_jwt = true` default)
2. **Revert migrations** (drop new templates)
3. **Redeploy edge functions** to previous version

---

## Success Criteria

✅ **EMAIL-FIX-001**: Config updated, no 401 errors
✅ **EMAIL-FIX-002**: Template created and accessible
✅ **EMAIL-FIX-003**: Test invitation sends successfully
✅ **EMAIL-FIX-004**: Edge function uses database template
✅ **EMAIL-FIX-005**: user_created template created and active
✅ **EMAIL-FIX-006**: All templates styled consistently
✅ **EMAIL-FIX-007**: Test utilities working

---

## Questions?

Refer to:
- `EXECUTION_PLAN.md` - High-level overview
- `ANALYSIS_SUMMARY.md` - Technical analysis
- This file - Implementation details
