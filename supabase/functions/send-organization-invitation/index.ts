/**
 * Send Organization Invitation Email Edge Function
 *
 * Sends invitation emails to join an organization using AWS SES
 * No Encharge dependency - pure AWS SES implementation
 */

import { serve } from 'https://deno.land/std@0.190.0/http/server.ts';
import { sendEmail } from '../_shared/ses.ts';

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
};

interface SendInvitationRequest {
  to_email: string;
  to_name?: string;
  organization_name: string;
  inviter_name: string;
  invitation_url: string;
}

/**
 * Generate HTML email template for organization invitation
 * Dark gradient theme matching the 60 brand
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
      headers: corsHeaders,
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
          headers: { ...corsHeaders, 'Content-Type': 'application/json' },
        }
      );
    }

    const recipientName = to_name || to_email.split('@')[0];
    const emailHtml = generateEmailTemplate(
      recipientName,
      organization_name,
      inviter_name,
      invitation_url
    );

    const result = await sendEmail({
      to: to_email,
      subject: `${inviter_name} invited you to join ${organization_name}`,
      html: emailHtml,
      text: `${inviter_name} invited you to join ${organization_name}. Click the link below to accept:\n\n${invitation_url}`,
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
          headers: { ...corsHeaders, 'Content-Type': 'application/json' },
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
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
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
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      }
    );
  }
});
