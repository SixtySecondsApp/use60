import { serve } from 'https://deno.land/std@0.168.0/http/server.ts';
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2.43.4';
import {
  getCorsHeaders,
  handleCorsPreflightRequest,
  jsonResponse,
  errorResponse,
} from '../_shared/corsHelper.ts';
import {
  buildSupportTicketNotification,
  buildSupportReplyNotification,
  buildSupportStatusChange,
} from '../_shared/slackBlocks.ts';

/**
 * support-ticket-notification — Sends email notifications for support ticket events.
 *
 * Triggered by:
 *   - ticket_created: New ticket opened
 *   - new_reply: User or agent posted a message
 *   - status_changed: Ticket status updated
 *
 * POST body:
 *   {
 *     event: 'ticket_created' | 'new_reply' | 'status_changed',
 *     ticket_id: string,
 *     message_id?: string,     // required for new_reply
 *     new_status?: string,     // required for status_changed
 *   }
 */

const SUPABASE_URL = Deno.env.get('SUPABASE_URL')!;
const SUPABASE_SERVICE_ROLE_KEY = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;
const RESEND_API_KEY = Deno.env.get('RESEND_API_KEY');
const FROM_EMAIL = Deno.env.get('SUPPORT_FROM_EMAIL') || 'support@use60.com';
const SUPPORT_TEAM_EMAIL = Deno.env.get('SUPPORT_TEAM_EMAIL') || 'team@use60.com';
const APP_URL = Deno.env.get('FRONTEND_URL') || 'https://app.use60.com';
const SUPPORT_SLACK_CHANNEL_ID = Deno.env.get('SUPPORT_SLACK_CHANNEL_ID');
const SLACK_BOT_TOKEN = Deno.env.get('SLACK_BOT_TOKEN');

type NotificationEvent = 'ticket_created' | 'new_reply' | 'status_changed';

interface NotificationPayload {
  event: NotificationEvent;
  ticket_id: string;
  message_id?: string;
  new_status?: string;
}

interface EmailPayload {
  from: string;
  to: string;
  subject: string;
  html: string;
}

async function sendEmail(payload: EmailPayload): Promise<void> {
  if (!RESEND_API_KEY) {
    console.log('[support-ticket-notification] RESEND_API_KEY not set, skipping email send');
    return;
  }

  const response = await fetch('https://api.resend.com/emails', {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${RESEND_API_KEY}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify(payload),
  });

  if (!response.ok) {
    const error = await response.text();
    throw new Error(`Failed to send email via Resend: ${error}`);
  }
}

async function postToSlackChannel(botToken: string, channelId: string, blocks: any[], fallbackText: string) {
  const resp = await fetch('https://slack.com/api/chat.postMessage', {
    method: 'POST',
    headers: { 'Authorization': `Bearer ${botToken}`, 'Content-Type': 'application/json' },
    body: JSON.stringify({ channel: channelId, blocks, text: fallbackText }),
  });
  if (!resp.ok) {
    const body = await resp.text();
    console.error('[support-ticket-notification] Slack post failed:', resp.status, body);
  }
}

function buildEmailHtml(
  title: string,
  body: string,
  ticketId: string,
  ticketSubject: string
): string {
  const ticketUrl = `${APP_URL}/support?ticket=${ticketId}`;
  const shortId = ticketId.slice(0, 8).toUpperCase();

  return `
<!DOCTYPE html>
<html>
<head>
  <meta charset="utf-8" />
  <title>${title}</title>
</head>
<body style="font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', sans-serif; background: #f5f5f5; margin: 0; padding: 20px;">
  <div style="max-width: 560px; margin: 0 auto; background: white; border-radius: 12px; overflow: hidden; border: 1px solid #e5e7eb;">
    <!-- Header -->
    <div style="background: #2563eb; padding: 24px 28px;">
      <p style="color: white; font-size: 18px; font-weight: 600; margin: 0;">60 Support</p>
    </div>
    <!-- Body -->
    <div style="padding: 28px;">
      <h2 style="font-size: 16px; color: #111827; margin: 0 0 8px 0;">${title}</h2>
      <p style="font-size: 14px; color: #6b7280; margin: 0 0 16px 0; line-height: 1.5;">${body}</p>
      <!-- Ticket info -->
      <div style="background: #f9fafb; border: 1px solid #e5e7eb; border-radius: 8px; padding: 16px; margin-bottom: 20px;">
        <p style="font-size: 12px; color: #9ca3af; margin: 0 0 4px 0; text-transform: uppercase; letter-spacing: 0.05em;">Ticket</p>
        <p style="font-size: 14px; font-weight: 600; color: #111827; margin: 0 0 4px 0;">${ticketSubject}</p>
        <p style="font-size: 12px; color: #6b7280; margin: 0;">Ticket #${shortId}</p>
      </div>
      <!-- CTA -->
      <a href="${ticketUrl}" style="display: inline-block; background: #2563eb; color: white; text-decoration: none; padding: 10px 20px; border-radius: 8px; font-size: 14px; font-weight: 500;">
        View Ticket
      </a>
    </div>
    <!-- Footer -->
    <div style="padding: 16px 28px; border-top: 1px solid #e5e7eb;">
      <p style="font-size: 12px; color: #9ca3af; margin: 0;">
        You're receiving this because you have an open support ticket with 60.
        <a href="${APP_URL}/support" style="color: #2563eb;">Manage tickets</a>
      </p>
    </div>
  </div>
</body>
</html>`;
}

serve(async (req: Request) => {
  // Handle CORS preflight
  const preflight = handleCorsPreflightRequest(req);
  if (preflight) return preflight;

  const corsHeaders = getCorsHeaders(req);

  if (req.method !== 'POST') {
    return errorResponse('Method not allowed', req, 405);
  }

  let payload: NotificationPayload;
  try {
    payload = await req.json();
  } catch {
    return errorResponse('Invalid JSON body', req, 400);
  }

  const { event, ticket_id, message_id, new_status } = payload;

  if (!event || !ticket_id) {
    return errorResponse('event and ticket_id are required', req, 400);
  }

  // Use service role for reading ticket + user email data
  const supabase = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY);

  // Fetch ticket
  const { data: ticket, error: ticketError } = await supabase
    .from('support_tickets')
    .select('id, subject, status, user_id, org_id, priority, category, description, created_at')
    .eq('id', ticket_id)
    .maybeSingle();

  if (ticketError || !ticket) {
    console.error('[support-ticket-notification] Ticket not found:', ticketError);
    return errorResponse('Ticket not found', req, 404);
  }

  // Fetch ticket owner's email
  const { data: userData, error: userError } = await supabase.auth.admin.getUserById(ticket.user_id);
  if (userError || !userData?.user?.email) {
    console.error('[support-ticket-notification] User not found:', userError);
    return errorResponse('User not found', req, 404);
  }

  const userEmail = userData.user.email;

  try {
    if (event === 'ticket_created') {
      // Notify user: ticket received
      await sendEmail({
        from: FROM_EMAIL,
        to: userEmail,
        subject: `[60 Support] Ticket received: ${ticket.subject}`,
        html: buildEmailHtml(
          'We received your support ticket',
          'Thanks for reaching out! Our support team will review your ticket and respond as soon as possible.',
          ticket.id,
          ticket.subject
        ),
      });

      // Notify support team
      await sendEmail({
        from: FROM_EMAIL,
        to: SUPPORT_TEAM_EMAIL,
        subject: `[New Ticket] ${ticket.subject} — ${ticket.priority} priority`,
        html: buildEmailHtml(
          `New ${ticket.priority} priority ticket`,
          `A new support ticket has been opened. Please review and respond promptly.`,
          ticket.id,
          ticket.subject
        ),
      });

      // Post to Slack
      if (SLACK_BOT_TOKEN && SUPPORT_SLACK_CHANNEL_ID) {
        try {
          // Fetch org name and user profile for richer Slack message
          const [{ data: org }, { data: profile }] = await Promise.all([
            supabase.from('organizations').select('name').eq('id', ticket.org_id).maybeSingle(),
            supabase.from('profiles').select('full_name, email').eq('id', ticket.user_id).maybeSingle(),
          ]);

          const blocks = buildSupportTicketNotification({
            ticketId: ticket.id,
            subject: ticket.subject,
            description: ticket.description ?? '',
            orgName: org?.name ?? 'Unknown Org',
            userName: profile?.full_name ?? profile?.email ?? userEmail,
            category: ticket.category ?? 'general',
            priority: ticket.priority ?? 'medium',
            status: ticket.status ?? 'open',
            createdAt: ticket.created_at ?? new Date().toISOString(),
          });

          await postToSlackChannel(SLACK_BOT_TOKEN, SUPPORT_SLACK_CHANNEL_ID, blocks, `New support ticket: ${ticket.subject}`);
        } catch (slackErr) {
          console.error('[support-ticket-notification] Slack notification error (ticket_created):', slackErr);
        }
      } else {
        console.log('[support-ticket-notification] Slack env vars not set, skipping Slack notification');
      }
    } else if (event === 'new_reply' && message_id) {
      // Fetch message
      const { data: message } = await supabase
        .from('support_messages')
        .select('id, sender_type, content, sender_id')
        .eq('id', message_id)
        .maybeSingle();

      if (message) {
        if (message.sender_type === 'agent') {
          // Notify user: agent replied
          await sendEmail({
            from: FROM_EMAIL,
            to: userEmail,
            subject: `[60 Support] Reply on: ${ticket.subject}`,
            html: buildEmailHtml(
              'Our team has replied to your ticket',
              `You have a new reply from our support team. Log in to view and respond.`,
              ticket.id,
              ticket.subject
            ),
          });
        } else {
          // Notify support team: user replied
          await sendEmail({
            from: FROM_EMAIL,
            to: SUPPORT_TEAM_EMAIL,
            subject: `[Reply] ${ticket.subject}`,
            html: buildEmailHtml(
              'A customer replied to their ticket',
              `The customer has added a new message to their ticket. Please review and respond.`,
              ticket.id,
              ticket.subject
            ),
          });

          // Post to Slack (user replies only — agent replies don't need channel notification)
          if (SLACK_BOT_TOKEN && SUPPORT_SLACK_CHANNEL_ID) {
            try {
              const [{ data: org }, { data: profile }] = await Promise.all([
                supabase.from('organizations').select('name').eq('id', ticket.org_id).maybeSingle(),
                supabase.from('profiles').select('full_name, email').eq('id', ticket.user_id).maybeSingle(),
              ]);

              const blocks = buildSupportReplyNotification({
                ticketId: ticket.id,
                subject: ticket.subject,
                description: ticket.description ?? '',
                orgName: org?.name ?? 'Unknown Org',
                userName: profile?.full_name ?? profile?.email ?? userEmail,
                category: ticket.category ?? 'general',
                priority: ticket.priority ?? 'medium',
                status: ticket.status ?? 'open',
                createdAt: ticket.created_at ?? new Date().toISOString(),
                replyPreview: message.content ?? '',
                replierName: profile?.full_name ?? profile?.email ?? userEmail,
              });

              await postToSlackChannel(SLACK_BOT_TOKEN, SUPPORT_SLACK_CHANNEL_ID, blocks, `New reply on ticket: ${ticket.subject}`);
            } catch (slackErr) {
              console.error('[support-ticket-notification] Slack notification error (new_reply):', slackErr);
            }
          } else {
            console.log('[support-ticket-notification] Slack env vars not set, skipping Slack notification');
          }
        }
      }
    } else if (event === 'status_changed' && new_status) {
      const statusLabel: Record<string, string> = {
        in_progress: 'is now being reviewed',
        waiting_on_customer: 'needs your input',
        resolved: 'has been resolved',
        closed: 'has been closed',
      };

      const label = statusLabel[new_status] ?? `status changed to ${new_status}`;

      await sendEmail({
        from: FROM_EMAIL,
        to: userEmail,
        subject: `[60 Support] Ticket update: ${ticket.subject}`,
        html: buildEmailHtml(
          `Your ticket ${label}`,
          `We wanted to let you know that the status of your support ticket has been updated. Click below to view your ticket.`,
          ticket.id,
          ticket.subject
        ),
      });

      // Post to Slack
      if (SLACK_BOT_TOKEN && SUPPORT_SLACK_CHANNEL_ID) {
        try {
          const blocks = buildSupportStatusChange({
            ticketId: ticket.id,
            subject: ticket.subject,
            oldStatus: ticket.status ?? 'open',
            newStatus: new_status,
            changedBy: 'Support Team',
          });

          await postToSlackChannel(SLACK_BOT_TOKEN, SUPPORT_SLACK_CHANNEL_ID, blocks, `Ticket status updated: ${ticket.subject}`);
        } catch (slackErr) {
          console.error('[support-ticket-notification] Slack notification error (status_changed):', slackErr);
        }
      } else {
        console.log('[support-ticket-notification] Slack env vars not set, skipping Slack notification');
      }
    }

    return jsonResponse({ success: true, event }, req);
  } catch (err) {
    console.error('[support-ticket-notification] Failed to send notification:', err);
    return errorResponse('Failed to send notification', req, 500);
  }
});
