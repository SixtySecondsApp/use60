// supabase/functions/answer-config-question/index.ts
// In-app handler for answering contextual agent config questions.
//
// POST { question_id: string; answer: unknown }
// JWT auth required — user-scoped Supabase client enforces RLS.
// Returns { success: true, config_key: string, scope: 'org' | 'user' }

import { serve } from 'https://deno.land/std@0.168.0/http/server.ts';
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2.43.4';
import {
  getCorsHeaders,
  handleCorsPreflightRequest,
  jsonResponse,
  errorResponse,
} from '../_shared/corsHelper.ts';

// =============================================================================
// Types
// =============================================================================

interface AgentConfigQuestion {
  id: string;
  org_id: string;
  user_id: string | null;
  config_key: string;
  category: string;
  scope: 'org' | 'user';
  status: string;
}

// =============================================================================
// Entry point
// =============================================================================

serve(async (req: Request) => {
  // Handle CORS preflight
  const preflight = handleCorsPreflightRequest(req);
  if (preflight) return preflight;

  if (req.method !== 'POST') {
    return errorResponse('Method not allowed', req, 405);
  }

  const supabaseUrl = Deno.env.get('SUPABASE_URL')!;
  const supabaseAnonKey = Deno.env.get('SUPABASE_ANON_KEY')!;
  const serviceRoleKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;

  // -------------------------------------------------------------------------
  // Auth — user-scoped client (respects RLS)
  // -------------------------------------------------------------------------
  const authHeader = req.headers.get('Authorization');
  if (!authHeader) {
    return errorResponse('Unauthorized', req, 401);
  }

  const userClient = createClient(supabaseUrl, supabaseAnonKey, {
    global: { headers: { Authorization: authHeader } },
  });

  const { data: { user }, error: authError } = await userClient.auth.getUser();
  if (authError || !user) {
    console.error('[answer-config-question] Auth error:', authError);
    return errorResponse('Unauthorized', req, 401);
  }

  // -------------------------------------------------------------------------
  // Parse request body
  // -------------------------------------------------------------------------
  let body: { question_id?: string; answer?: unknown };
  try {
    body = await req.json();
  } catch {
    return errorResponse('Invalid JSON body', req, 400);
  }

  const { question_id, answer } = body;

  if (!question_id || typeof question_id !== 'string') {
    return errorResponse('question_id is required', req, 400);
  }
  if (answer === undefined) {
    return errorResponse('answer is required', req, 400);
  }

  // -------------------------------------------------------------------------
  // Service client for writes that bypass RLS (org overrides, logs)
  // -------------------------------------------------------------------------
  const serviceClient = createClient(supabaseUrl, serviceRoleKey);

  // -------------------------------------------------------------------------
  // 1. Look up the question via user-scoped client (RLS enforces ownership)
  // -------------------------------------------------------------------------
  const { data: question, error: questionError } = await userClient
    .from('agent_config_questions')
    .select('id, org_id, user_id, config_key, category, scope, status')
    .eq('id', question_id)
    .maybeSingle();

  if (questionError) {
    console.error('[answer-config-question] Question lookup error:', questionError);
    return errorResponse('Failed to look up question', req, 500);
  }

  if (!question) {
    // Either doesn't exist or RLS blocked the read (not owned by this user/org)
    return errorResponse('Question not found or access denied', req, 404);
  }

  const q = question as AgentConfigQuestion;

  if (q.status === 'answered') {
    // Idempotent — surface current state without re-writing
    return jsonResponse(
      { success: true, config_key: q.config_key, scope: q.scope, already_answered: true },
      req,
    );
  }

  // -------------------------------------------------------------------------
  // 2. Authorization check
  //    - user-scoped questions: only the question owner can answer
  //    - org-scoped questions: any org admin/owner can answer
  // -------------------------------------------------------------------------
  if (q.scope === 'user') {
    if (q.user_id !== user.id) {
      return errorResponse('Forbidden: this question belongs to another user', req, 403);
    }
  } else {
    // org scope — verify the caller is an admin or owner of the org
    const { data: membership, error: membershipError } = await serviceClient
      .from('organization_members')
      .select('role')
      .eq('organization_id', q.org_id)
      .eq('user_id', user.id)
      .maybeSingle();

    if (membershipError) {
      console.error('[answer-config-question] Membership lookup error:', membershipError);
      return errorResponse('Failed to verify org membership', req, 500);
    }

    if (!membership || !['owner', 'admin'].includes(membership.role)) {
      return errorResponse('Forbidden: org admin or owner required for org-scoped questions', req, 403);
    }
  }

  // -------------------------------------------------------------------------
  // 3. Write answer to config engine
  // -------------------------------------------------------------------------
  if (q.scope === 'org') {
    const { error: upsertError } = await serviceClient
      .from('agent_config_org_overrides')
      .upsert(
        {
          org_id: q.org_id,
          agent_type: 'global',
          config_key: q.config_key,
          config_value: answer,
        },
        { onConflict: 'agent_config_org_overrides_unique' },
      );

    if (upsertError) {
      console.error('[answer-config-question] Org override upsert error:', upsertError);
      return errorResponse('Failed to save org setting', req, 500);
    }
  } else {
    // scope === 'user'
    const { error: upsertError } = await serviceClient
      .from('agent_config_user_overrides')
      .upsert(
        {
          org_id: q.org_id,
          user_id: user.id,
          agent_type: 'global',
          config_key: q.config_key,
          config_value: answer,
        },
        { onConflict: 'org_id,user_id,agent_type,config_key' },
      );

    if (upsertError) {
      console.error('[answer-config-question] User override upsert error:', upsertError);
      return errorResponse('Failed to save user setting', req, 500);
    }
  }

  // -------------------------------------------------------------------------
  // 4. Mark question as answered
  // -------------------------------------------------------------------------
  const { error: updateError } = await serviceClient
    .from('agent_config_questions')
    .update({
      status: 'answered',
      answered_at: new Date().toISOString(),
      answer_value: answer,
    })
    .eq('id', question_id);

  if (updateError) {
    // Non-fatal — config write succeeded; log and continue
    console.error('[answer-config-question] Failed to mark question answered:', updateError);
  }

  // -------------------------------------------------------------------------
  // 5. Log the answered event
  // -------------------------------------------------------------------------
  const { error: logError } = await serviceClient
    .from('agent_config_question_log')
    .insert({
      org_id: q.org_id,
      user_id: user.id,
      question_id,
      event_type: 'answered',
      channel: 'in_app',
      metadata: { config_key: q.config_key, answer },
    });

  if (logError) {
    console.error('[answer-config-question] Log insert error:', logError);
  }

  // -------------------------------------------------------------------------
  // 6. Return success
  // -------------------------------------------------------------------------
  return jsonResponse(
    { success: true, config_key: q.config_key, scope: q.scope },
    req,
  );
});
