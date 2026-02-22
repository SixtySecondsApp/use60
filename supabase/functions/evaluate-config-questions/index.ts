/**
 * evaluate-config-questions (LEARN-005)
 *
 * Contextual question trigger evaluation engine for PRD-23 Progressive Agent
 * Learning. Called by other agents/crons when system events occur (morning
 * briefing delivered, meeting processed, CRM update approved) to check whether
 * a pending configuration question should be surfaced to the user.
 *
 * Flow:
 *   1. Receive POST { org_id, user_id, trigger_event, event_data? }
 *   2. Validate JWT and create user-scoped client
 *   3. Call questionEvaluator to check eligibility (RPC + delivery gates)
 *   4. Resolve delivery channel (Slack vs in-app)
 *   5. Log the eligible question and return result
 *      (LEARN-006 will implement actual delivery)
 *
 * Returns: { delivered: boolean, question_id?, channel?, reason? }
 *
 * Auth: JWT-protected (user-scoped client respects RLS).
 * Deploy: npx supabase functions deploy evaluate-config-questions --project-ref <ref>
 * Staging: npx supabase functions deploy evaluate-config-questions --project-ref caerqjzvuerejfrdtygb --no-verify-jwt
 */

import { serve } from 'https://deno.land/std@0.168.0/http/server.ts';
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2.43.4';
import {
  getCorsHeaders,
  handleCorsPreflightRequest,
  jsonResponse,
  errorResponse,
} from '../_shared/corsHelper.ts';
import {
  evaluateQuestionTrigger,
  resolveDeliveryChannel,
} from '../_shared/config/questionEvaluator.ts';
import { getSlackRecipient } from '../_shared/proactive/recipients.ts';
import { getSlackOrgSettings } from '../_shared/proactive/settings.ts';

// =============================================================================
// Config
// =============================================================================

const SUPABASE_URL = Deno.env.get('SUPABASE_URL')!;
const SUPABASE_ANON_KEY = Deno.env.get('SUPABASE_ANON_KEY')!;

// =============================================================================
// Types
// =============================================================================

interface EvaluateRequest {
  org_id: string;
  user_id: string;
  trigger_event: string;
  event_data?: Record<string, unknown>;
}

interface EvaluateResponse {
  delivered: boolean;
  question_id?: string;
  channel?: 'slack' | 'in_app';
  reason?: string;
}

// =============================================================================
// Handler
// =============================================================================

serve(async (req: Request) => {
  // Handle CORS preflight
  const preflight = handleCorsPreflightRequest(req);
  if (preflight) return preflight;

  const corsHeaders = getCorsHeaders(req);

  // Only accept POST
  if (req.method !== 'POST') {
    return errorResponse('Method not allowed', req, 405);
  }

  try {
    // -------------------------------------------------------------------------
    // Auth: Read JWT from Authorization header, create user-scoped client
    // -------------------------------------------------------------------------
    const authHeader = req.headers.get('Authorization');
    if (!authHeader) {
      return errorResponse('Missing Authorization header', req, 401);
    }

    const supabase = createClient(SUPABASE_URL, SUPABASE_ANON_KEY, {
      global: { headers: { Authorization: authHeader } },
    });

    // Validate the JWT and get the authenticated user
    const { data: { user }, error: authError } = await supabase.auth.getUser();
    if (authError || !user) {
      console.error('[evaluate-config-questions] Auth error:', authError?.message);
      return errorResponse('Unauthorized', req, 401);
    }

    // -------------------------------------------------------------------------
    // Parse + validate request body
    // -------------------------------------------------------------------------
    let body: EvaluateRequest;
    try {
      body = await req.json();
    } catch {
      return errorResponse('Invalid JSON body', req, 400);
    }

    const { org_id, user_id, trigger_event, event_data } = body;

    if (!org_id || !user_id || !trigger_event) {
      return errorResponse('org_id, user_id, and trigger_event are required', req, 400);
    }

    // Security: user can only evaluate questions for themselves (RLS enforces
    // at DB level too, but we short-circuit here for clarity)
    if (user.id !== user_id) {
      console.warn('[evaluate-config-questions] User ID mismatch', {
        jwt_user: user.id,
        requested_user: user_id,
      });
      return errorResponse('Forbidden: cannot evaluate questions for another user', req, 403);
    }

    console.log('[evaluate-config-questions] Evaluating trigger', {
      org_id,
      user_id,
      trigger_event,
    });

    // -------------------------------------------------------------------------
    // Step 1: Evaluate whether a question is eligible for delivery
    // -------------------------------------------------------------------------
    const eligibility = await evaluateQuestionTrigger(
      supabase,
      org_id,
      user_id,
      trigger_event,
      event_data,
    );

    if (!eligibility.eligible) {
      const response: EvaluateResponse = {
        delivered: false,
        reason: eligibility.reason,
      };

      console.log('[evaluate-config-questions] No eligible question', {
        reason: eligibility.reason,
        next_eligible_at: eligibility.next_eligible_at,
      });

      return jsonResponse(response, req);
    }

    // -------------------------------------------------------------------------
    // Step 2: Resolve delivery channel
    // -------------------------------------------------------------------------
    const channel = await resolveDeliveryChannel(supabase, org_id, user_id);

    console.log('[evaluate-config-questions] Eligible question found', {
      question_id: eligibility.question_id,
      config_key: eligibility.config_key,
      category: eligibility.category,
      channel,
    });

    // -------------------------------------------------------------------------
    // Step 3: Determine channel-specific context for logging
    // -------------------------------------------------------------------------
    let channelContext: Record<string, unknown> = { channel };

    if (channel === 'slack') {
      try {
        const [recipient, slackSettings] = await Promise.all([
          getSlackRecipient(supabase, org_id, user_id),
          getSlackOrgSettings(supabase, org_id),
        ]);

        if (recipient?.slackUserId && slackSettings?.botAccessToken) {
          channelContext = {
            channel,
            slack_user_id: recipient.slackUserId,
            slack_bot_token_present: true,
          };
        } else {
          // Slack mapping exists but org token missing — fall back to in-app
          console.warn('[evaluate-config-questions] Slack recipient found but no bot token, falling back to in_app');
          channelContext = { channel: 'in_app', fallback_reason: 'no_bot_token' };
        }
      } catch (err) {
        console.warn('[evaluate-config-questions] Error fetching Slack context, falling back to in_app:', err);
        channelContext = { channel: 'in_app', fallback_reason: 'slack_context_error' };
      }
    }

    const resolvedChannel = (channelContext.channel as 'slack' | 'in_app') ?? 'in_app';

    // -------------------------------------------------------------------------
    // Step 4: Log delivery intent
    //
    // LEARN-006 will implement actual message delivery (Slack DM with Block Kit
    // question card, or in-app notification). For now we log the intent and
    // return the eligible question so callers can see what would be delivered.
    // -------------------------------------------------------------------------
    console.log('[evaluate-config-questions] LEARN-006 delivery stub — would deliver via', resolvedChannel, {
      question_id: eligibility.question_id,
      config_key: eligibility.config_key,
      question_text: eligibility.question_text?.substring(0, 80),
      options_count: Array.isArray(eligibility.options) ? eligibility.options.length : 0,
      ...channelContext,
    });

    // Log to agent_config_question_log for audit trail (fail gracefully)
    try {
      await supabase
        .from('agent_config_question_log')
        .insert({
          org_id,
          user_id,
          question_id: eligibility.question_id,
          event_type: 'delivered',
          channel: resolvedChannel,
          metadata: {
            trigger_event,
            evaluation_stub: true, // Remove when LEARN-006 implements delivery
            ...channelContext,
          },
        });
    } catch (logErr) {
      // Non-fatal: audit log failure should not block the response
      console.warn('[evaluate-config-questions] Failed to write audit log:', logErr);
    }

    // -------------------------------------------------------------------------
    // Return result
    // -------------------------------------------------------------------------
    const response: EvaluateResponse = {
      delivered: true,
      question_id: eligibility.question_id,
      channel: resolvedChannel,
    };

    return jsonResponse(response, req);
  } catch (err) {
    console.error('[evaluate-config-questions] Unhandled error:', err);
    return errorResponse(
      'Internal server error',
      req,
      500,
    );
  }
});
