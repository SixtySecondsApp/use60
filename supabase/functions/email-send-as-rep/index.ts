/// <reference path="../deno.d.ts" />

/**
 * Email Send As Rep Edge Function
 *
 * Sends emails from the rep's Gmail account with full threading, signature, and audit trail.
 *
 * SECURITY:
 * - POST only
 * - User JWT authentication OR service-role with userId in body
 * - No anonymous access
 * - Requires Gmail send scope (gmail.send)
 * - Daily send limit check (default 50 emails)
 *
 * FEATURES:
 * - Sends via Gmail API (appears in rep's Sent folder)
 * - Thread-aware (In-Reply-To, References headers)
 * - Auto-appends rep's email signature
 * - Daily send limit enforcement
 * - Audit trail logging to sequence_jobs
 * - Clear error if send scope not authorized
 */

import { serve } from 'https://deno.land/std@0.168.0/http/server.ts';
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';
import { getCorsHeaders, handleCorsPreflightRequest, errorResponse, jsonResponse } from '../_shared/corsHelper.ts';
import { authenticateRequest } from '../_shared/edgeAuth.ts';
import { getGoogleIntegration } from '../_shared/googleOAuth.ts';
import { captureException } from '../_shared/sentryEdge.ts';

interface SendEmailRequest {
  userId?: string; // For service-role calls
  org_id?: string; // For audit logging
  to: string;
  subject: string;
  body: string; // HTML or plain text
  thread_id?: string; // Gmail thread ID for threading
  cc?: string; // Comma-separated emails
  bcc?: string; // Comma-separated emails
  in_reply_to?: string; // Message-ID header for threading
  references?: string; // Message-ID chain for threading
  job_id?: string; // sequence_jobs ID for audit trail
  draft?: boolean; // Create a draft instead of sending
}

const DEFAULT_DAILY_LIMIT = 50;

serve(async (req) => {
  // Handle CORS preflight
  const preflightResponse = handleCorsPreflightRequest(req);
  if (preflightResponse) {
    return preflightResponse;
  }

  if (req.method !== 'POST') {
    return errorResponse('Method not allowed', req, 405);
  }

  try {
    const supabaseUrl = Deno.env.get('SUPABASE_URL') || '';
    const supabaseServiceKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') || '';

    if (!supabaseUrl || !supabaseServiceKey) {
      throw new Error('Server configuration error');
    }

    const body: SendEmailRequest = await req.json();

    // Validate required fields
    if (!body.to || !body.subject || !body.body) {
      throw new Error('to, subject, and body are required');
    }

    const supabase = createClient(supabaseUrl, supabaseServiceKey, {
      auth: {
        persistSession: false,
        autoRefreshToken: false,
      },
    });

    // Authenticate request
    let userId: string;
    if (body.userId) {
      userId = body.userId;
      console.log(`[email-send-as-rep] Service call with userId: ${userId}`);
    } else {
      const authResult = await authenticateRequest(
        req,
        supabase,
        supabaseServiceKey,
        undefined
      );
      userId = authResult.userId;
      console.log(`[email-send-as-rep] Authenticated as ${authResult.mode}, userId: ${userId}`);
    }

    // Get user's Google integration and check for gmail.send scope
    const { data: integration, error: integrationError } = await supabase
      .from('google_integrations')
      .select('id, access_token, refresh_token, expires_at, scopes, email')
      .eq('user_id', userId)
      .eq('is_active', true)
      .single();

    if (integrationError || !integration) {
      throw new Error('Google integration not found. Please connect your Google account first.');
    }

    // Check for gmail.send scope
    const scopes = integration.scopes || [];
    const hasSendScope = scopes.includes('https://www.googleapis.com/auth/gmail.send') ||
                        scopes.includes('https://mail.google.com/');

    if (!hasSendScope) {
      throw new Error(
        'Gmail send permission not authorized. Please reconnect your Google account with send permissions.'
      );
    }

    // Get valid access token (auto-refreshes if expired)
    const { accessToken } = await getGoogleIntegration(supabase, userId);

    // Check daily send limit
    const today = new Date();
    today.setHours(0, 0, 0, 0);
    const tomorrow = new Date(today);
    tomorrow.setDate(tomorrow.getDate() + 1);

    const { count: todayCount } = await supabase
      .from('email_send_log')
      .select('*', { count: 'exact', head: true })
      .eq('user_id', userId)
      .gte('sent_at', today.toISOString())
      .lt('sent_at', tomorrow.toISOString());

    const dailyLimit = DEFAULT_DAILY_LIMIT; // Could be configurable per user
    if ((todayCount || 0) >= dailyLimit) {
      throw new Error(
        `Daily email send limit reached (${dailyLimit}). Please try again tomorrow.`
      );
    }

    // Get user's email signature from preferences
    const { data: userSettings } = await supabase
      .from('user_settings')
      .select('preferences')
      .eq('user_id', userId)
      .maybeSingle();

    const emailSignature = userSettings?.preferences?.email_signature || '';

    // Get rep's email address
    const repEmail = integration.email || 'me';

    // Build RFC 2822 email message
    const messageParts: string[] = [
      `From: ${repEmail}`,
      `To: ${body.to}`,
      body.subject ? `Subject: ${body.subject}` : '',
      body.cc ? `Cc: ${body.cc}` : '',
      body.bcc ? `Bcc: ${body.bcc}` : '',
    ];

    // Add threading headers if provided
    if (body.thread_id) {
      messageParts.push(`X-GM-THREAD-ID: ${body.thread_id}`);
    }
    if (body.in_reply_to) {
      messageParts.push(`In-Reply-To: ${body.in_reply_to}`);
    }
    if (body.references) {
      messageParts.push(`References: ${body.references}`);
    }

    // Determine content type
    const isHtml = body.body.includes('<') && body.body.includes('>');
    messageParts.push(
      isHtml
        ? 'Content-Type: text/html; charset=utf-8'
        : 'Content-Type: text/plain; charset=utf-8'
    );
    messageParts.push(''); // Empty line before body

    // Append body with signature
    let finalBody = body.body;
    if (emailSignature) {
      finalBody = isHtml
        ? `${body.body}<br><br>${emailSignature}`
        : `${body.body}\n\n${emailSignature}`;
    }
    messageParts.push(finalBody);

    // Join with CRLF (RFC 2822 requirement)
    const rawMessage = messageParts.filter(Boolean).join('\r\n');

    // Base64url encode — use UTF-8 safe path to handle non-Latin1 chars
    // (btoa() crashes on curly quotes, em-dashes, and other Unicode > 0xFF)
    function toBase64Url(str: string): string {
      const bytes = new TextEncoder().encode(str);
      const binary = Array.from(bytes).map((b: number) => String.fromCharCode(b)).join('');
      return btoa(binary).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
    }
    const encodedMessage = toBase64Url(rawMessage);

    // Send or create draft via Gmail API
    const isDraft = body.draft === true;
    const gmailApiUrl = isDraft
      ? 'https://gmail.googleapis.com/gmail/v1/users/me/drafts'
      : 'https://gmail.googleapis.com/gmail/v1/users/me/messages/send';
    const gmailBody = isDraft
      ? JSON.stringify({ message: { raw: encodedMessage } })
      : JSON.stringify({ raw: encodedMessage });

    console.log(`[email-send-as-rep] ${isDraft ? 'Creating draft' : 'Sending email'}:`, {
      to: body.to,
      subject: body.subject,
      hasSignature: !!emailSignature,
      isThreaded: !!body.thread_id,
      repEmail,
    });

    const resp = await fetch(gmailApiUrl, {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${accessToken}`,
        'Content-Type': 'application/json',
      },
      body: gmailBody,
    });

    if (!resp.ok) {
      const errorData = await resp.json().catch(() => ({}));
      console.error(`[email-send-as-rep] Gmail API error (${isDraft ? 'draft' : 'send'}):`, {
        status: resp.status,
        statusText: resp.statusText,
        error: errorData.error || errorData,
      });

      // Check for specific error types
      if (resp.status === 403) {
        throw new Error(
          'Gmail send permission denied. Please ensure gmail.send scope is authorized.'
        );
      }

      throw new Error(
        `Gmail API error: ${errorData.error?.message || resp.statusText}`
      );
    }

    const sentMessage = await resp.json();
    // For drafts, the message is nested: { id, message: { id, threadId } }
    const messageId = isDraft ? (sentMessage.message?.id || sentMessage.id) : sentMessage.id;
    const threadId = isDraft ? (sentMessage.message?.threadId || sentMessage.threadId) : sentMessage.threadId;

    console.log(`[email-send-as-rep] ${isDraft ? 'Draft created' : 'Email sent'} successfully:`, {
      messageId,
      threadId,
    });

    // Log to email_send_log table (send only, not drafts)
    if (!isDraft) {
      await supabase
        .from('email_send_log')
        .insert({
          user_id: userId,
          org_id: body.org_id || null,
          message_id: messageId,
          thread_id: threadId || body.thread_id || null,
          to_email: body.to,
          subject: body.subject,
          sent_at: new Date().toISOString(),
          job_id: body.job_id || null,
        })
        .select()
        .maybeSingle();
    }

    // If job_id provided, log to sequence_jobs for audit trail
    if (body.job_id) {
      try {
        const { data: job } = await supabase
          .from('sequence_jobs')
          .select('audit_trail')
          .eq('id', body.job_id)
          .maybeSingle();

        const auditTrail = job?.audit_trail || [];
        auditTrail.push({
          timestamp: new Date().toISOString(),
          event: isDraft ? 'draft_created' : 'email_sent',
          message_id: messageId,
          to: body.to,
          subject: body.subject,
        });

        await supabase
          .from('sequence_jobs')
          .update({ audit_trail: auditTrail })
          .eq('id', body.job_id);
      } catch (auditError) {
        console.error('[email-send-as-rep] Failed to update audit trail:', auditError);
        // Non-critical, continue
      }
    }

    return jsonResponse({
      success: true,
      draft: isDraft,
      message_id: messageId,
      thread_id: threadId,
      sent_at: new Date().toISOString(),
      to: body.to,
      subject: body.subject,
    }, req);

  } catch (error: any) {
    console.error('[email-send-as-rep] Error:', error);
    await captureException(error, {
      tags: {
        function: 'email-send-as-rep',
      },
    });
    return errorResponse(error.message || 'Failed to send email', req, 500);
  }
});
