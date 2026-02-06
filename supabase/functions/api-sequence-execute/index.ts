/// <reference path="../deno.d.ts" />

/**
 * api-sequence-execute
 *
 * Executes a multi-step agent sequence (category=agent-sequence) for an organization.
 * Persists progress/results into sequence_executions.
 *
 * NOTE: This is a pragmatic first implementation:
 * - Resolves input_mapping expressions like ${trigger.params.foo} and ${outputs.some_key}
 * - Executes each step via the unified org skill executor (api-skill-execute contract)
 * - Supports on_failure: stop|continue|fallback (fallback_skill_key)
 * - HITL is intentionally not implemented yet (will be a Phase C+ enhancement)
 */

import { serve } from 'https://deno.land/std@0.168.0/http/server.ts';
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';
import {
  handleCorsPreflightRequest,
  jsonResponse,
  errorResponse,
} from '../_shared/corsHelper.ts';
import { executeSequence } from '../_shared/sequenceExecutor.ts';

interface SequenceExecuteRequest {
  organization_id: string;
  sequence_key: string;
  sequence_context?: Record<string, unknown>;
  is_simulation?: boolean;
}

serve(async (req) => {
  const corsResponse = handleCorsPreflightRequest(req);
  if (corsResponse) return corsResponse;

  if (req.method !== 'POST') {
    return errorResponse('Method not allowed', req, 405);
  }

  const authHeader = req.headers.get('Authorization');
  if (!authHeader) {
    return errorResponse('No authorization header', req, 401);
  }

  try {
    const supabaseUrl = Deno.env.get('SUPABASE_URL') || '';
    const supabaseServiceKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') || '';
    const supabase = createClient(supabaseUrl, supabaseServiceKey, {
      global: { headers: { Authorization: authHeader } },
      auth: { persistSession: false, autoRefreshToken: false },
    });

    // Verify user token
    const token = authHeader.replace('Bearer ', '');
    const {
      data: { user },
      error: userError,
    } = await supabase.auth.getUser(token);

    if (userError || !user) {
      return errorResponse('Invalid authentication token', req, 401);
    }

    const body: SequenceExecuteRequest = await req.json();
    const organizationId = String(body.organization_id || '').trim();
    const sequenceKey = String(body.sequence_key || '').trim();
    const sequenceContext = (body.sequence_context || {}) as Record<string, unknown>;
    const isSimulation = body.is_simulation === true;

    if (!organizationId) return errorResponse('organization_id is required', req, 400);
    if (!sequenceKey) return errorResponse('sequence_key is required', req, 400);

    const result = await executeSequence(supabase, {
      organizationId,
      userId: user.id,
      sequenceKey,
      sequenceContext,
      isSimulation,
    });

    return jsonResponse(result, req);
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    console.error('[api-sequence-execute] Error:', message);
    return errorResponse(message, req, 500);
  }
});

