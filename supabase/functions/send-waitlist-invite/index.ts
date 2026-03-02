import { serve } from 'https://deno.land/std@0.168.0/http/server.ts';
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2.43.4';
import { sendEmail } from '../_shared/ses.ts';
import { verifyCronSecret } from '../_shared/edgeAuth.ts';

const SUPABASE_URL = Deno.env.get('SUPABASE_URL')!;
const SUPABASE_SERVICE_ROLE_KEY = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;

interface InviteRequest {
  invites: Array<{
    id: string;
    email: string;
  }>;
  referral_url: string;
  sender_name: string;
}

interface InviteResult {
  invite_id: string;
  email: string;
  success: boolean;
  error?: string;
}

serve(async (req) => {
  // Handle CORS preflight
  if (req.method === 'OPTIONS') {
    return new Response('ok', {
      headers: {
        'Access-Control-Allow-Origin': '*',
        'Access-Control-Allow-Methods': 'POST',
        'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
      },
    });
  }

  // Auth: require cron secret
  const cronSecret = Deno.env.get('CRON_SECRET');
  if (!verifyCronSecret(req, cronSecret)) {
    return new Response(JSON.stringify({ error: 'Unauthorized' }), {
      status: 401,
      headers: { 'Content-Type': 'application/json', 'Access-Control-Allow-Origin': '*' },
    });
  }

  try {
    const { invites, referral_url, sender_name }: InviteRequest = await req.json();

    // Validate inputs
    if (!invites || invites.length === 0) {
      throw new Error('No invites provided');
    }

    if (!referral_url || !sender_name) {
      throw new Error('Missing required parameters: referral_url and sender_name');
    }

    // Initialize Supabase client
    const supabase = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY);

    const results: InviteResult[] = [];

    // Send emails using AWS SES
    for (const invite of invites) {
      try {
        const emailHtml = generateEmailTemplate(sender_name, referral_url);

        const result = await sendEmail({
          to: invite.email,
          subject: `${sender_name} invited you to skip the line for Meeting Intelligence`,
          html: emailHtml,
          from: 'invites@sixtyseconds.ai',
          fromName: 'Meeting Intelligence',
        });

        if (!result.success) {
          throw new Error(result.error || 'Failed to send email');
        }

        results.push({
          invite_id: invite.id,
          email: invite.email,
          success: true,
        });

      } catch (error) {
        console.error(`Failed to send invite to ${invite.email}:`, error);
        results.push({
          invite_id: invite.id,
          email: invite.email,
          success: false,
          error: error instanceof Error ? error.message : 'Unknown error',
        });
      }
    }

    return new Response(
      JSON.stringify({ results }),
      {
        headers: {
          'Content-Type': 'application/json',
          'Access-Control-Allow-Origin': '*',
        },
      }
    );

  } catch (error) {
    console.error('Edge function error:', error);
    return new Response(
      JSON.stringify({
        error: error instanceof Error ? error.message : 'Unknown error',
      }),
      {
        status: 400,
        headers: {
          'Content-Type': 'application/json',
          'Access-Control-Allow-Origin': '*',
        },
      }
    );
  }
});

function generateEmailTemplate(senderName: string, referralUrl: string): string {
  return `
<!DOCTYPE html>
<html>
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>Meeting Intelligence Invite</title>
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
                Meeting Intelligence
              </h1>
            </td>
          </tr>

          <!-- Content -->
          <tr>
            <td style="padding: 0 40px 40px;">
              <p style="margin: 0 0 24px; font-size: 18px; color: #ffffff; text-align: center;">
                <strong>${senderName}</strong> thinks you'd love to reclaim 10+ hours every week
              </p>

              <div style="background: rgba(255, 255, 255, 0.05); border: 1px solid rgba(255, 255, 255, 0.1); border-radius: 12px; padding: 24px; margin-bottom: 24px;">
                <p style="margin: 0 0 16px; font-size: 16px; color: #d1d5db; line-height: 1.6;">
                  Meeting Intelligence is the AI-powered tool that automatically:
                </p>
                <ul style="margin: 0; padding-left: 20px; color: #d1d5db; font-size: 16px; line-height: 1.8;">
                  <li>Captures every meeting insight and action item</li>
                  <li>Generates smart summaries and follow-ups</li>
                  <li>Syncs directly to your CRM</li>
                  <li>Eliminates manual note-taking forever</li>
                </ul>
              </div>

              <div style="text-align: center; margin-bottom: 24px;">
                <a href="${referralUrl}" style="display: inline-block; background: linear-gradient(to right, #10b981, #a855f7); color: #ffffff; text-decoration: none; padding: 16px 32px; border-radius: 8px; font-size: 16px; font-weight: 600;">
                  Join the Waitlist & Skip the Line
                </a>
              </div>

              <div style="background: rgba(59, 130, 246, 0.1); border: 1px solid rgba(59, 130, 246, 0.2); border-radius: 8px; padding: 16px; text-align: center;">
                <p style="margin: 0; font-size: 14px; color: #93c5fd;">
                  💡 <strong style="color: #ffffff;">Special Offer:</strong> Lock in 50% off for life by joining now
                </p>
              </div>
            </td>
          </tr>

          <!-- Footer -->
          <tr>
            <td style="padding: 20px 40px; text-align: center; border-top: 1px solid rgba(255, 255, 255, 0.1);">
              <p style="margin: 0; font-size: 12px; color: #6b7280; line-height: 1.6;">
                You received this email because ${senderName} invited you to Meeting Intelligence.<br>
                <a href="${referralUrl}" style="color: #10b981; text-decoration: none;">Join the waitlist</a> or ignore this email if you're not interested.
              </p>
            </td>
          </tr>
        </table>
      </td>
    </tr>
  </table>
</body>
</html>
  `.trim();
}
