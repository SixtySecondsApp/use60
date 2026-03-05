/**
 * graph-agent-trigger — RG-015
 *
 * Triggered from the Relationship Graph agent actions panel.
 * Deducts credits, creates a Command Centre item, and returns confirmation.
 *
 * POST body:
 *   {
 *     action_type: 'draft_followup' | 'meeting_prep' | 'reengage' | 'create_task' | 'enrich_profile',
 *     contact_id: string,
 *     deal_id?: string,
 *     org_id: string,
 *     user_id: string
 *   }
 *
 * Returns: { success: true, item_id: string, credits_remaining: number }
 *
 * Deploy with --no-verify-jwt (staging ES256 JWT issue).
 */

import { serve } from 'https://deno.land/std@0.168.0/http/server.ts';
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2.43.4';
import {
  getCorsHeaders,
  handleCorsPreflightRequest,
  errorResponse,
  jsonResponse,
} from '../_shared/corsHelper.ts';
import { writeToCommandCentre } from '../_shared/commandCentre/writeAdapter.ts';

const SUPABASE_URL = Deno.env.get('SUPABASE_URL')!;
const SUPABASE_SERVICE_ROLE_KEY = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;

// Action definitions with credit costs and Command Centre mapping
const ACTION_CONFIG: Record<
  string,
  { credits: number; item_type: string; title_template: string; urgency: string }
> = {
  draft_followup: {
    credits: 2,
    item_type: 'follow_up',
    title_template: 'Draft follow-up email for {contact}',
    urgency: 'normal',
  },
  meeting_prep: {
    credits: 4,
    item_type: 'meeting_prep',
    title_template: 'Prepare meeting brief for {contact}',
    urgency: 'high',
  },
  reengage: {
    credits: 3,
    item_type: 'follow_up',
    title_template: 'Re-engage {contact}',
    urgency: 'normal',
  },
  create_task: {
    credits: 0,
    item_type: 'crm_update',
    title_template: 'Create follow-up task for {contact}',
    urgency: 'normal',
  },
  enrich_profile: {
    credits: 1,
    item_type: 'crm_update',
    title_template: 'Enrich profile for {contact}',
    urgency: 'low',
  },
};

interface RequestBody {
  action_type: string;
  contact_id: string;
  deal_id?: string;
  org_id: string;
  user_id: string;
}

serve(async (req: Request) => {
  const preflight = handleCorsPreflightRequest(req);
  if (preflight) return preflight;

  if (req.method !== 'POST') {
    return errorResponse('Method not allowed', req, 405);
  }

  let body: RequestBody;
  try {
    body = await req.json();
  } catch {
    return errorResponse('Invalid JSON body', req, 400);
  }

  const { action_type, contact_id, deal_id, org_id, user_id } = body;

  if (!action_type || !ACTION_CONFIG[action_type]) {
    return errorResponse(
      `Invalid action_type. Allowed: ${Object.keys(ACTION_CONFIG).join(', ')}`,
      req,
      400,
    );
  }
  if (!contact_id) return errorResponse('contact_id is required', req, 400);
  if (!org_id) return errorResponse('org_id is required', req, 400);
  if (!user_id) return errorResponse('user_id is required', req, 400);

  const config = ACTION_CONFIG[action_type];
  const supabase = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY, {
    auth: { persistSession: false, autoRefreshToken: false },
  });

  try {
    // ---- Fetch contact name for title personalisation ----------------------
    const { data: contact } = await supabase
      .from('contacts')
      .select('id, first_name, last_name, full_name, email')
      .eq('id', contact_id)
      .maybeSingle();

    const contactName =
      contact?.full_name ??
      `${contact?.first_name ?? ''} ${contact?.last_name ?? ''}`.trim() ||
      contact?.email ??
      'Contact';

    // ---- Deduct credits (skip for free actions) ----------------------------
    let creditsRemaining = 0;

    if (config.credits > 0) {
      const { data: newBalance, error: deductError } = await supabase.rpc(
        'deduct_credits',
        {
          p_org_id: org_id,
          p_amount: config.credits,
          p_description: `Graph agent: ${action_type.replace(/_/g, ' ')}`,
          p_feature_key: `graph_${action_type}`,
        },
      );

      if (deductError) {
        console.error('[graph-agent-trigger] deduct error:', deductError.message);
        return errorResponse('Failed to deduct credits', req, 500);
      }

      if (newBalance === -1) {
        return errorResponse('Insufficient credit balance', req, 402);
      }

      creditsRemaining = newBalance as number;
    } else {
      // Free action — fetch current balance for response
      const { data: balRow } = await supabase
        .from('org_credit_balance')
        .select('balance_credits')
        .eq('org_id', org_id)
        .maybeSingle();

      creditsRemaining = (balRow?.balance_credits as number) ?? 0;
    }

    // ---- Create Command Centre item ----------------------------------------
    const title = config.title_template.replace('{contact}', contactName);
    const itemId = await writeToCommandCentre({
      org_id,
      user_id,
      source_agent: 'relationship-graph',
      item_type: config.item_type,
      title,
      summary: `Triggered from graph for ${contactName}`,
      context: {
        action_type,
        contact_id,
        deal_id: deal_id ?? null,
        source: 'graph_agent_actions',
      },
      urgency: config.urgency,
      priority_score: config.urgency === 'high' ? 75 : 50,
      contact_id,
      deal_id: deal_id ?? null,
    });

    // ---- Log credit usage --------------------------------------------------
    if (config.credits > 0) {
      await supabase.from('credit_logs').insert({
        user_id,
        org_id,
        action_id: `graph_${action_type}`,
        display_name: title,
        credits_charged: config.credits,
        source: 'user_initiated',
        agent_type: 'relationship-graph',
        context_refs: { contact_id, deal_id: deal_id ?? null },
        status: 'completed',
      });
    }

    return jsonResponse(
      {
        success: true,
        item_id: itemId,
        credits_remaining: creditsRemaining,
      },
      req,
    );
  } catch (err) {
    console.error(
      '[graph-agent-trigger] unexpected error:',
      err instanceof Error ? err.message : String(err),
    );
    return errorResponse(
      err instanceof Error ? err.message : 'Internal server error',
      req,
      500,
    );
  }
});
