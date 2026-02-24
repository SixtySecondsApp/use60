/**
 * Send Rejoin Invitation Email Edge Function
 *
 * Sends rejoin invitation emails to previously removed members via AWS SES
 * Supports database email templates with fallback to hardcoded template
 */

import { serve } from 'https://deno.land/std@0.190.0/http/server.ts';
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2.43.4';
import { sendEmail } from '../_shared/ses.ts';

const SUPABASE_URL = Deno.env.get('SUPABASE_URL')!;
const SUPABASE_SERVICE_ROLE_KEY = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
};

interface SendRejoinInvitationRequest {
  user_email: string;
  user_name?: string;
  organization_name: string;
  admin_name: string;
}

/**
 * Replace {{variable}} placeholders in a template string with actual values
 */
function processTemplate(template: string, variables: Record<string, any>): string {
  let processed = template;
  for (const [key, value] of Object.entries(variables)) {
    const regex = new RegExp(`\\{\\{${key}\\}\\}`, 'g');
    processed = processed.replace(regex, String(value || ''));
  }
  return processed;
}

/**
 * Generate HTML email template for rejoin invitation
 */
function generateRejoinEmailTemplate(
  recipientName: string,
  organizationName: string,
  adminName: string
): string {
  const dashboardUrl = 'https://app.use60.com/dashboard';

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
        .button { display: inline-block; padding: 12px 24px; background: #37bd7e; color: white; text-decoration: none; border-radius: 6px; font-weight: 500; }
        .highlight { background: #f0fdf4; border-left: 4px solid #37bd7e; padding: 16px; margin: 16px 0; }
        .footer { margin-top: 32px; padding-top: 20px; border-top: 1px solid #e5e7eb; font-size: 12px; color: #9ca3af; }
    </style>
</head>
<body>
    <div class="container">
        <div class="email-wrapper">
            <h1>Welcome Back to ${organizationName}</h1>

            <p>Hi ${recipientName},</p>

            <p>${adminName} from <strong>${organizationName}</strong> is inviting you to rejoin the organization on 60.</p>

            <div class="highlight">
                <p style="margin: 0;"><strong>Your previous data will be restored</strong></p>
                <p style="margin: 8px 0 0 0; font-size: 14px;">You'll have access to all your previous work and can continue collaborating with your team.</p>
            </div>

            <p style="text-align: center; margin-top: 32px;">
                <a href="${dashboardUrl}" class="button">Accept and Join</a>
            </p>

            <p style="font-size: 14px; color: #6b7280;">
                Or visit this link:<br>
                <code style="background: #f3f4f6; padding: 8px; border-radius: 4px; display: block; margin-top: 8px; word-break: break-all;">
                    ${dashboardUrl}
                </code>
            </p>

            <p>If you have any questions, please reach out to ${adminName} or contact support@use60.com</p>

            <div class="footer">
                <p>This is an automated message. Please do not reply to this email.</p>
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

  try {
    const {
      user_email,
      user_name,
      organization_name,
      admin_name,
    }: SendRejoinInvitationRequest = await req.json();

    // Validate inputs
    if (!user_email || !organization_name || !admin_name) {
      return new Response(
        JSON.stringify({
          success: false,
          error: 'Missing required parameters: user_email, organization_name, admin_name',
        }),
        {
          status: 400,
          headers: { ...corsHeaders, 'Content-Type': 'application/json' },
        }
      );
    }

    const recipientName = user_name || user_email.split('@')[0];
    const dashboardUrl = 'https://app.use60.com/dashboard';

    // Try to fetch database template
    let emailSubject: string;
    let emailHtml: string;
    let emailText: string;

    try {
      const supabaseAdmin = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY);

      const { data: template, error: templateError } = await supabaseAdmin
        .from('encharge_email_templates')
        .select('*')
        .eq('template_type', 'rejoin_invitation')
        .eq('is_active', true)
        .single();

      if (template && !templateError) {
        // Use database template
        const templateVariables = {
          recipient_name: recipientName,
          organization_name: organization_name,
          admin_name: admin_name,
          action_url: dashboardUrl,
        };

        emailSubject = processTemplate(template.subject_line, templateVariables);
        emailHtml = processTemplate(template.html_body, templateVariables);
        emailText = template.text_body
          ? processTemplate(template.text_body, templateVariables)
          : `${admin_name} from ${organization_name} is inviting you to rejoin on 60. Your previous data will be restored. Visit ${dashboardUrl} to accept.`;

        console.log('Using database template for rejoin_invitation');
      } else {
        // Fall back to hardcoded template
        console.log('Database template not found, using fallback. Error:', templateError?.message);
        emailSubject = `${admin_name} invited you to rejoin ${organization_name} on 60`;
        emailHtml = generateRejoinEmailTemplate(recipientName, organization_name, admin_name);
        emailText = `${admin_name} from ${organization_name} is inviting you to rejoin on 60. Your previous data will be restored. Visit ${dashboardUrl} to accept.`;
      }
    } catch (dbError) {
      // If database access fails entirely, fall back to hardcoded template
      console.error('Failed to fetch database template, using fallback:', dbError);
      emailSubject = `${admin_name} invited you to rejoin ${organization_name} on 60`;
      emailHtml = generateRejoinEmailTemplate(recipientName, organization_name, admin_name);
      emailText = `${admin_name} from ${organization_name} is inviting you to rejoin on 60. Your previous data will be restored. Visit ${dashboardUrl} to accept.`;
    }

    const result = await sendEmail({
      to: user_email,
      subject: emailSubject,
      html: emailHtml,
      text: emailText,
      from: 'invites@use60.com',
      fromName: '60',
    });

    if (!result.success) {
      console.error('Failed to send rejoin invitation email:', result.error);
      return new Response(
        JSON.stringify({
          success: false,
          error: result.error || 'Failed to send rejoin invitation email',
        }),
        {
          status: 500,
          headers: { ...corsHeaders, 'Content-Type': 'application/json' },
        }
      );
    }

    console.log(`Rejoin invitation email sent to ${user_email} for organization ${organization_name}`);
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
    console.error('Error in send-rejoin-invitation:', error);
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
