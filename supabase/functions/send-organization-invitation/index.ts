/**
 * Send Organization Invitation Email Edge Function
 *
 * Sends invitation emails to join an organization using AWS SES
 * Supports database email templates with fallback to hardcoded template
 */

import { serve } from 'https://deno.land/std@0.190.0/http/server.ts';
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2.39.3';
import { sendEmail } from '../_shared/ses.ts';

// Determine CORS origin - allow localhost for development and known production domains
const getAllowedOrigin = (req: Request): string => {
  const origin = req.headers.get('origin');
  if (
    origin?.includes('localhost') ||
    origin?.includes('127.0.0.1') ||
    origin?.includes('192.168.')
  ) {
    return origin || '*';
  }
  if (origin?.includes('use60.com')) {
    return origin || '*';
  }
  return '*';
};

const corsHeaders = (req?: Request) => ({
  'Access-Control-Allow-Origin': req ? getAllowedOrigin(req) : '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
  'Access-Control-Max-Age': '86400',
});

interface SendInvitationRequest {
  to_email: string;
  to_name?: string;
  organization_name: string;
  inviter_name: string;
  invitation_url: string;
}

/**
 * Replace {{variable}} placeholders in a template string with actual values.
 */
function processTemplate(templateStr: string, variables: Record<string, any>): string {
  let processed = templateStr;
  for (const [key, value] of Object.entries(variables)) {
    processed = processed.replace(new RegExp(`\{\{${key}\}\}`, 'g'), String(value || ''));
  }
  return processed;
}

/**
 * Generate HTML email template for organization invitation
 * Dark gradient theme matching the 60 brand
 * Used as fallback when no database template is found.
 */
function generateEmailTemplate(
  recipientName: string,
  organizationName: string,
  inviterName: string,
  invitationUrl: string
): string {
  return `<!DOCTYPE html>
<html>
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>Join ${organizationName} on 60</title>
</head>
<body style="margin: 0; padding: 0; background-color: #0a0d14; font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, 'Helvetica Neue', Arial, sans-serif;">
  <table width="100%" cellpadding="0" cellspacing="0" style="background-color: #0a0d14;">
    <tr>
      <td align="center" style="padding: 40px 20px;">
        <table width="600" cellpadding="0" cellspacing="0" style="background: linear-gradient(135deg, rgba(16, 185, 129, 0.1) 0%, rgba(168, 85, 247, 0.1) 100%); border: 1px solid rgba(255, 255, 255, 0.1); border-radius: 16px; overflow: hidden;">

          <!-- Header -->
          <tr>
            <td style="padding: 40px 40px 20px; text-align: center;">
              <h1 style="margin: 0; font-size: 32px; font-weight: bold; background: linear-gradient(to right, #10b981, #a855f7); -webkit-background-clip: text; -webkit-text-fill-color: transparent; background-clip: text;">
                60
              </h1>
            </td>
          </tr>

          <!-- Content -->
          <tr>
            <td style="padding: 0 40px 40px;">
              <p style="margin: 0 0 24px; font-size: 18px; color: #ffffff; text-align: center;">
                <strong>${inviterName}</strong> has invited you to join <strong>${organizationName}</strong>
              </p>

              <div style="background: rgba(255, 255, 255, 0.05); border: 1px solid rgba(255, 255, 255, 0.1); border-radius: 12px; padding: 24px; margin-bottom: 24px;">
                <p style="margin: 0 0 8px; font-size: 16px; color: #ffffff;">
                  Hi ${recipientName || 'there'},
                </p>
                <p style="margin: 0 0 16px; font-size: 16px; color: #d1d5db; line-height: 1.6;">
                  You've been invited to collaborate with <strong style="color: #ffffff;">${organizationName}</strong> on 60 — the AI-powered sales intelligence platform.
                </p>
                <p style="margin: 0; font-size: 16px; color: #d1d5db; line-height: 1.6;">
                  Accept the invitation below to get started with your team.
                </p>
              </div>

              <div style="text-align: center; margin-bottom: 24px;">
                <a href="${invitationUrl}" style="display: inline-block; background: linear-gradient(to right, #10b981, #a855f7); color: #ffffff; text-decoration: none; padding: 16px 32px; border-radius: 8px; font-size: 16px; font-weight: 600;">
                  Accept Invitation
                </a>
              </div>

              <div style="background: rgba(59, 130, 246, 0.1); border: 1px solid rgba(59, 130, 246, 0.2); border-radius: 8px; padding: 16px; text-align: center;">
                <p style="margin: 0; font-size: 13px; color: #93c5fd; word-break: break-all;">
                  Or copy this link: <a href="${invitationUrl}" style="color: #10b981; text-decoration: none;">${invitationUrl}</a>
                </p>
              </div>

              <p style="margin: 16px 0 0; font-size: 13px; color: #6b7280; text-align: center;">
                This invitation will expire in 7 days.
              </p>
            </td>
          </tr>

          <!-- Footer -->
          <tr>
            <td style="padding: 20px 40px; text-align: center; border-top: 1px solid rgba(255, 255, 255, 0.1);">
              <p style="margin: 0; font-size: 12px; color: #6b7280; line-height: 1.6;">
                You received this email because ${inviterName} invited you to join ${organizationName} on 60.<br>
                If you have any questions, contact us at <a href="mailto:support@use60.com" style="color: #10b981; text-decoration: none;">support@use60.com</a>
              </p>
            </td>
          </tr>
        </table>
      </td>
    </tr>
  </table>
</body>
</html>`.trim();
}

serve(async (req) => {
  // Handle CORS preflight
  if (req.method === 'OPTIONS') {
    return new Response('ok', {
      headers: corsHeaders(req),
    });
  }

  try {
    const {
      to_email,
      to_name,
      organization_name,
      inviter_name,
      invitation_url,
    }: SendInvitationRequest = await req.json();

    // Validate inputs
    if (!to_email || !organization_name || !inviter_name || !invitation_url) {
      return new Response(
        JSON.stringify({
          success: false,
          error: 'Missing required parameters: to_email, organization_name, inviter_name, invitation_url',
        }),
        {
          status: 400,
          headers: { ...corsHeaders(req), 'Content-Type': 'application/json' },
        }
      );
    }

    const recipientName = to_name || to_email.split('@')[0];

    // Try to fetch email template from database
    let emailHtml: string;
    let emailSubject: string;
    let emailText: string;

    try {
      const SUPABASE_URL = Deno.env.get('SUPABASE_URL')!;
      const SUPABASE_SERVICE_ROLE_KEY = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;

      const supabaseAdmin = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY, {
        auth: { autoRefreshToken: false, persistSession: false },
      });

      const { data: template } = await supabaseAdmin
        .from('encharge_email_templates')
        .select('subject_line, html_body, text_body')
        .eq('template_type', 'organization_invitation')
        .eq('is_active', true)
        .maybeSingle();

      if (template) {
        const vars = {
          recipient_name: recipientName,
          organization_name: organization_name,
          inviter_name: inviter_name,
          action_url: invitation_url,
          invitation_url: invitation_url,
        };
        emailHtml = processTemplate(template.html_body, vars);
        emailSubject = processTemplate(template.subject_line, vars);
        emailText = template.text_body
          ? processTemplate(template.text_body, vars)
          : `${inviter_name} invited you to join ${organization_name}. Click: ${invitation_url}`;
        console.log('Using database email template for organization_invitation');
      } else {
        // No template found in DB - use hardcoded fallback
        emailHtml = generateEmailTemplate(recipientName, organization_name, inviter_name, invitation_url);
        emailSubject = `${inviter_name} invited you to join ${organization_name}`;
        emailText = `${inviter_name} invited you to join ${organization_name}. Click the link below to accept:

${invitation_url}`;
        console.log('No database template found for organization_invitation, using fallback');
      }
    } catch (templateError) {
      // If DB lookup fails for any reason, fall back to hardcoded template
      console.warn('Failed to fetch email template from database, using fallback:', templateError);
      emailHtml = generateEmailTemplate(recipientName, organization_name, inviter_name, invitation_url);
      emailSubject = `${inviter_name} invited you to join ${organization_name}`;
      emailText = `${inviter_name} invited you to join ${organization_name}. Click the link below to accept:

${invitation_url}`;
    }

    const result = await sendEmail({
      to: to_email,
      subject: emailSubject,
      html: emailHtml,
      text: emailText,
      from: 'invites@use60.com',
      fromName: '60',
    });

    if (!result.success) {
      console.error('Failed to send invitation email:', result.error);
      return new Response(
        JSON.stringify({
          success: false,
          error: result.error || 'Failed to send invitation email',
        }),
        {
          status: 500,
          headers: { ...corsHeaders(req), 'Content-Type': 'application/json' },
        }
      );
    }

    console.log(`Invitation email sent to ${to_email} for organization ${organization_name}`);
    return new Response(
      JSON.stringify({
        success: true,
        messageId: result.messageId,
      }),
      {
        status: 200,
        headers: { ...corsHeaders(req), 'Content-Type': 'application/json' },
      }
    );
  } catch (error) {
    console.error('Error in send-organization-invitation:', error);
    return new Response(
      JSON.stringify({
        success: false,
        error: error instanceof Error ? error.message : 'Unknown error',
      }),
      {
        status: 500,
        headers: { ...corsHeaders(req), 'Content-Type': 'application/json' },
      }
    );
  }
});
