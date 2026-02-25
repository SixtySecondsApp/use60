/**
 * HITL Callback: Send Follow-up Email
 *
 * Triggered by `slack-interactive` after a HITL approval action.
 * On approve/edit, sends the email via the existing `google-gmail` edge function.
 *
 * SECURITY:
 * - POST only
 * - FAIL-CLOSED: service role only (called server-to-server)
 */

import { serve } from 'https://deno.land/std@0.168.0/http/server.ts';
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';
import { handleCorsPreflightRequest, errorResponse, jsonResponse } from '../_shared/corsHelper.ts';
import { isServiceRoleAuth } from '../_shared/edgeAuth.ts';

const SUPABASE_URL = Deno.env.get('SUPABASE_URL')!;
const SUPABASE_SERVICE_ROLE_KEY = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;

type CallbackPayload = {
  approval_id: string;
  resource_type: string;
  action: 'approved' | 'rejected' | 'edited';
  content?: Record<string, unknown>;
  original_content?: Record<string, unknown>;
  callback_metadata?: Record<string, unknown>;
};

function pickString(v: unknown): string | null {
  if (typeof v !== 'string') return null;
  const s = v.trim();
  return s ? s : null;
}

serve(async (req) => {
  const preflight = handleCorsPreflightRequest(req);
  if (preflight) return preflight;

  if (req.method !== 'POST') {
    return errorResponse('Method not allowed', req, 405);
  }

  try {
    const authHeader = req.headers.get('Authorization');
    if (!isServiceRoleAuth(authHeader, SUPABASE_SERVICE_ROLE_KEY)) {
      return errorResponse('Unauthorized', req, 401);
    }

    const payload = (await req.json().catch(() => ({}))) as Partial<CallbackPayload>;
    const approvalId = pickString(payload.approval_id);
    const action = payload.action;

    if (!approvalId || !action) {
      return errorResponse('Missing approval_id or action', req, 400);
    }

    const supabase = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY, {
      auth: { persistSession: false, autoRefreshToken: false },
    });

    const { data: approval, error: approvalErr } = await supabase
      .from('hitl_pending_approvals')
      .select('id, org_id, user_id, status, original_content, edited_content, metadata')
      .eq('id', approvalId)
      .maybeSingle();

    if (approvalErr || !approval) {
      return errorResponse('Approval not found', req, 404);
    }

    // For rejects, we do nothing other than log a mirrored in-app notification.
    if (action === 'rejected') {
      if (approval.user_id) {
        await supabase.from('notifications').insert({
          user_id: approval.user_id,
          title: 'Follow-up email rejected',
          message: 'You rejected the follow-up email draft.',
          type: 'info',
          category: 'workflow',
          entity_type: 'email_draft',
          entity_id: null,
          action_url: '/meetings',
          metadata: { approval_id: approvalId, source: 'hitl' },
        });
      }

      return jsonResponse({ success: true, action: 'rejected', approvalId }, req);
    }

    // Determine final email content (prefer callback content).
    const content = (payload.content || approval.edited_content || approval.original_content || {}) as Record<string, unknown>;

    const to =
      pickString(content.recipientEmail) ||
      pickString(content.recipient) ||
      pickString(content.to);
    const subject = pickString(content.subject) || 'Following up';
    const body = pickString(content.body) || '';

    if (!approval.user_id) {
      return errorResponse('Approval has no user_id (cannot send email)', req, 400);
    }

    if (!to || !body) {
      return errorResponse('Email draft missing recipient or body', req, 400);
    }

    const cc = Array.isArray(content.cc) ? content.cc.filter((e: unknown) => typeof e === 'string' && (e as string).trim()) : [];

    // Send email via google-gmail edge function
    const gmailResp = await fetch(`${SUPABASE_URL}/functions/v1/google-gmail?action=send`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${SUPABASE_SERVICE_ROLE_KEY}`,
      },
      body: JSON.stringify({
        userId: approval.user_id,
        to,
        subject,
        body,
        isHtml: false,
        ...(cc.length > 0 ? { cc: cc.join(',') } : {}),
      }),
    });

    const gmailPayload = await gmailResp.json().catch(() => ({}));
    const gmailOk = gmailResp.ok && !gmailPayload?.error;

    // Persist send result onto the approval record (best-effort)
    await supabase
      .from('hitl_pending_approvals')
      .update({
        metadata: {
          ...(approval.metadata || {}),
          email_send: {
            ok: gmailOk,
            to,
            subject,
            messageId: gmailPayload?.id,
            threadId: gmailPayload?.threadId,
            error: gmailOk ? null : (gmailPayload?.error || gmailPayload?.message || `HTTP ${gmailResp.status}`),
            sent_at: new Date().toISOString(),
          },
        },
      })
      .eq('id', approvalId);

    // Mirror to in-app (success/failure)
    await supabase.from('notifications').insert({
      user_id: approval.user_id,
      title: gmailOk ? 'Follow-up email sent' : 'Follow-up email failed',
      message: gmailOk
        ? `Sent to ${to}`
        : `Could not send to ${to}. ${pickString(gmailPayload?.error) || 'Check your Gmail connection.'}`,
      type: gmailOk ? 'success' : 'error',
      category: 'workflow',
      entity_type: 'email_draft',
      entity_id: null,
      action_url: '/meetings',
      metadata: { approval_id: approvalId, source: 'hitl', gmail: gmailOk ? { id: gmailPayload?.id } : { error: gmailPayload?.error } },
    });

    return jsonResponse(
      {
        success: gmailOk,
        approvalId,
        action,
        gmail: gmailOk ? { id: gmailPayload?.id, threadId: gmailPayload?.threadId } : { error: gmailPayload?.error || gmailPayload },
      },
      req
    );
  } catch (error) {
    console.error('[hitl-send-followup-email] Error:', error);
    return errorResponse(error instanceof Error ? error.message : 'Internal server error', req, 500);
  }
});

