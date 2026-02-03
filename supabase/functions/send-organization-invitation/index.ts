/**
 * Send Organization Invitation Email Edge Function
 *
 * Sends invitation emails to join an organization using AWS SES
 * No Encharge dependency - pure AWS SES implementation
 *
 * Authentication: Uses custom secret from EDGE_FUNCTION_SECRET environment variable
 * This bypasses platform JWT verification and allows any authenticated request
 */

import { serve } from 'https://deno.land/std@0.190.0/http/server.ts';
import { sendEmail } from '../_shared/ses.ts';

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type, x-edge-function-secret',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
  'Access-Control-Allow-Credentials': 'true',
};

/**
 * Verify custom edge function secret
 */
function verifySecret(req: Request): boolean {
  const secret = Deno.env.get('EDGE_FUNCTION_SECRET');
  if (!secret) {
    console.warn('[send-organization-invitation] No EDGE_FUNCTION_SECRET configured');
    return false;
  }

  // Check for secret in headers (preferred method)
  const headerSecret = req.headers.get('x-edge-function-secret');
  if (headerSecret && headerSecret === secret) {
    return true;
  }

  // Check for JWT in Authorization header (fallback for old code)
  const authHeader = req.headers.get('authorization');
  if (authHeader?.startsWith('Bearer ')) {
    // If JWT is provided, accept it (allows transitional period)
    return true;
  }

  // If running locally (no secret), allow requests for development
  if (!Deno.env.get('EDGE_FUNCTION_SECRET')) {
    console.log('[send-organization-invitation] Running in development mode (no secret)');
    return true;
  }

  return false;
}

interface SendInvitationRequest {
  to_email: string;
  to_name?: string;
  organization_name: string;
  inviter_name: string;
  invitation_url: string;
}

/**
 * Fetch and format email template from database
 */
async function getEmailTemplate(
  supabaseUrl: string,
  supabaseServiceKey: string,
  variables: Record<string, string>
): Promise<{ html: string; text: string }> {
  try {
    const response = await fetch(
      `${supabaseUrl}/rest/v1/encharge_email_templates?template_name=eq.organization_invitation&select=html_body,text_body`,
      {
        headers: {
          'Authorization': `Bearer ${supabaseServiceKey}`,
          'apikey': supabaseServiceKey,
          'Content-Type': 'application/json',
        },
      }
    );

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

    // Replace variables in template
    Object.entries(variables).forEach(([key, value]) => {
      const placeholder = `{{${key}}}`;
      html = html.replace(new RegExp(placeholder, 'g'), value);
      text = text.replace(new RegExp(placeholder, 'g'), value);
    });

    console.log('[send-organization-invitation] Successfully fetched and formatted template from database');
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

serve(async (req) => {
  console.log(`[send-organization-invitation] ${req.method} request received`);

  // Handle CORS preflight
  if (req.method === 'OPTIONS') {
    console.log('[send-organization-invitation] Responding to OPTIONS request');
    return new Response('ok', {
      status: 200,
      headers: corsHeaders,
    });
  }

  // Only allow POST requests
  if (req.method !== 'POST') {
    console.log(`[send-organization-invitation] Invalid method: ${req.method}`);
    return new Response(JSON.stringify({ error: 'Method not allowed' }), {
      status: 405,
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });
  }

  // Verify custom authentication
  if (!verifySecret(req)) {
    console.error('[send-organization-invitation] Authentication failed: invalid secret or missing authorization');
    return new Response(JSON.stringify({ error: 'Unauthorized: invalid credentials' }), {
      status: 401,
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });
  }

  try {
    console.log('[send-organization-invitation] Parsing request body');
    const {
      to_email,
      to_name,
      organization_name,
      inviter_name,
      invitation_url,
    }: SendInvitationRequest = await req.json();

    console.log(`[send-organization-invitation] Sending to: ${to_email}`);


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

    const supabaseUrl = Deno.env.get('SUPABASE_URL') || '';
    const supabaseServiceKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') || '';

    const variables = {
      recipient_name: recipientName,
      organization_name: organization_name,
      inviter_name: inviter_name,
      invitation_url: invitation_url,
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
