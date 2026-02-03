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
            <h1>Join ${organizationName} on Sixty</h1>

            <p>Hi ${recipientName || 'there'},</p>

            <p>${inviterName} has invited you to join <strong>${organizationName}</strong> on Sixty.
            Accept the invitation below to get started collaborating with your team.</p>

            <p style="text-align: center; margin-top: 32px;">
                <a href="${invitationUrl}" class="button">Accept Invitation</a>
            </p>

            <p style="font-size: 14px; color: #6b7280;">
                Or copy and paste this link in your browser:<br>
                <code style="background: #f3f4f6; padding: 8px; border-radius: 4px; display: block; margin-top: 8px; word-break: break-all;">
                    ${invitationUrl}
                </code>
            </p>

            <p style="font-size: 14px; color: #6b7280;">
                This invitation will expire in 7 days.
            </p>

            <div class="footer">
                <p>This is an automated message. If you have any questions, please contact us at support@use60.com</p>
            </div>
        </div>
    </div>
</body>
</html>`;
}

serve(async (req) => {
  // Handle CORS preflight
  if (req.method === 'OPTIONS') {
    return new Response('ok', {
      headers: corsHeaders,
    });
  }

  // Only allow POST requests
  if (req.method !== 'POST') {
    return new Response('Method not allowed', {
      status: 405,
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
      fromName: 'Sixty',
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
