/**
 * Send Support Ticket Email Edge Function
 *
 * Fires after a support ticket is created.
 * Sends notification to support@sixtyseconds.video and a confirmation to the user.
 *
 * Called from: useSupportTickets.ts (after ticket insert)
 * Auth: JWT-protected (default)
 */

import { serve } from 'https://deno.land/std@0.190.0/http/server.ts';
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2.43.4';
import { getCorsHeaders } from '../_shared/corsHelper.ts';
import { sendEmail } from '../_shared/ses.ts';

const SUPABASE_URL = Deno.env.get('SUPABASE_URL')!;
const SUPABASE_SERVICE_ROLE_KEY = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;
const SUPPORT_EMAIL = 'support@sixtyseconds.video';
const APP_URL = Deno.env.get('APP_URL') || 'https://app.use60.com';

interface SendSupportTicketEmailRequest {
  ticket_id: string;
  subject: string;
  description: string;
  category: string;
  priority: string;
  user_email: string;
  user_name?: string;
}

serve(async (req) => {
  const corsHeaders = getCorsHeaders(req);

  if (req.method === 'OPTIONS') {
    return new Response('ok', { headers: corsHeaders });
  }

  try {
    const supabase = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY);

    const body: SendSupportTicketEmailRequest = await req.json();
    const { ticket_id, subject, description, category, priority, user_email, user_name } = body;

    if (!ticket_id || !subject || !user_email) {
      return new Response(
        JSON.stringify({ success: false, error: 'Missing required fields' }),
        { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    const ticketRef = ticket_id.slice(0, 8).toUpperCase();
    const priorityEmoji = priority === 'urgent' ? '🔴' : priority === 'high' ? '🟠' : priority === 'medium' ? '🟡' : '🟢';
    const userName = user_name || user_email;

    // 1. Notify support team
    const supportEmailHtml = `
      <div style="font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', sans-serif; max-width: 600px; margin: 0 auto; color: #111827;">
        <div style="background: #1a1a1a; padding: 24px; border-radius: 12px 12px 0 0;">
          <h1 style="color: white; margin: 0; font-size: 20px;">New Support Ticket</h1>
          <p style="color: #9ca3af; margin: 4px 0 0; font-size: 14px;">Ticket #${ticketRef}</p>
        </div>
        <div style="background: white; border: 1px solid #e5e7eb; border-top: none; border-radius: 0 0 12px 12px; padding: 24px;">
          <table style="width: 100%; border-collapse: collapse; margin-bottom: 20px;">
            <tr>
              <td style="padding: 8px 0; font-size: 14px; color: #6b7280; width: 100px;"><strong>From:</strong></td>
              <td style="padding: 8px 0; font-size: 14px;">${userName} &lt;${user_email}&gt;</td>
            </tr>
            <tr>
              <td style="padding: 8px 0; font-size: 14px; color: #6b7280;"><strong>Priority:</strong></td>
              <td style="padding: 8px 0; font-size: 14px;">${priorityEmoji} ${priority.charAt(0).toUpperCase() + priority.slice(1)}</td>
            </tr>
            <tr>
              <td style="padding: 8px 0; font-size: 14px; color: #6b7280;"><strong>Category:</strong></td>
              <td style="padding: 8px 0; font-size: 14px;">${category.replace('_', ' ').replace(/\b\w/g, (l) => l.toUpperCase())}</td>
            </tr>
          </table>
          <div style="border-top: 1px solid #e5e7eb; padding-top: 20px;">
            <h2 style="font-size: 16px; margin: 0 0 12px; color: #111827;">${subject}</h2>
            <p style="font-size: 14px; line-height: 1.6; color: #374151; white-space: pre-wrap;">${description}</p>
          </div>
          <div style="margin-top: 24px; padding-top: 20px; border-top: 1px solid #e5e7eb;">
            <a href="${APP_URL}/admin/support" style="display: inline-block; background: #2563eb; color: white; padding: 10px 20px; border-radius: 8px; text-decoration: none; font-size: 14px; font-weight: 500;">View in Dashboard</a>
          </div>
        </div>
      </div>
    `;

    // 2. Confirmation email to user
    const userConfirmationHtml = `
      <div style="font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', sans-serif; max-width: 600px; margin: 0 auto; color: #111827;">
        <div style="background: #1a1a1a; padding: 24px; border-radius: 12px 12px 0 0;">
          <h1 style="color: white; margin: 0; font-size: 20px;">We got your ticket</h1>
          <p style="color: #9ca3af; margin: 4px 0 0; font-size: 14px;">Reference #${ticketRef}</p>
        </div>
        <div style="background: white; border: 1px solid #e5e7eb; border-top: none; border-radius: 0 0 12px 12px; padding: 24px;">
          <p style="font-size: 15px; line-height: 1.6; margin: 0 0 16px;">Hi ${userName.split(' ')[0]},</p>
          <p style="font-size: 15px; line-height: 1.6; margin: 0 0 16px;">
            We've received your support ticket and will get back to you as soon as possible.
          </p>
          <div style="background: #f9fafb; border: 1px solid #e5e7eb; border-radius: 8px; padding: 16px; margin: 20px 0;">
            <p style="font-size: 13px; color: #6b7280; margin: 0 0 8px;"><strong>Ticket:</strong> #${ticketRef}</p>
            <p style="font-size: 14px; font-weight: 500; margin: 0;">${subject}</p>
          </div>
          <p style="font-size: 14px; color: #6b7280; line-height: 1.6;">
            You can track your ticket status at <a href="${APP_URL}/support" style="color: #2563eb; text-decoration: none;">${APP_URL}/support</a>
          </p>
          <p style="font-size: 14px; color: #374151; margin-top: 24px;">The 60 Support Team</p>
        </div>
      </div>
    `;

    // Send both emails (don't fail if one fails)
    const [supportResult, userResult] = await Promise.allSettled([
      sendEmail({
        to: SUPPORT_EMAIL,
        subject: `[Ticket #${ticketRef}] ${priorityEmoji} ${subject}`,
        html: supportEmailHtml,
        replyTo: user_email,
      }),
      sendEmail({
        to: user_email,
        subject: `Support ticket received — #${ticketRef}`,
        html: userConfirmationHtml,
        fromName: '60 Support',
      }),
    ]);

    console.log('[send-support-ticket-email] Support email:', supportResult);
    console.log('[send-support-ticket-email] User confirmation:', userResult);

    return new Response(
      JSON.stringify({
        success: true,
        ticketRef,
        supportEmailSent: supportResult.status === 'fulfilled',
        userEmailSent: userResult.status === 'fulfilled',
      }),
      { status: 200, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );
  } catch (error) {
    console.error('[send-support-ticket-email] Error:', error);
    return new Response(
      JSON.stringify({ success: false, error: error instanceof Error ? error.message : 'Unknown error' }),
      { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );
  }
});
