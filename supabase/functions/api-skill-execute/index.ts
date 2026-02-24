/// <reference path="../deno.d.ts" />

/**
 * api-skill-execute
 *
 * Executes a single org-enabled skill (organization_skills) and returns the SkillResult contract.
 * Intended to be used by:
 * - Sequence execution (api-sequence-execute)
 * - Future MCP/Copilot execution paths that need deterministic contract output
 */

import { serve } from 'https://deno.land/std@0.168.0/http/server.ts';
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';
import {
  handleCorsPreflightRequest,
  jsonResponse,
  errorResponse,
} from '../_shared/corsHelper.ts';
import { executeAgentSkillWithContract } from '../_shared/agentSkillExecutor.ts';

interface SkillExecuteRequest {
  organization_id: string;
  skill_key: string;
  context?: Record<string, unknown>;
  dry_run?: boolean;
  store_full_output?: boolean;
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

    const body: SkillExecuteRequest = await req.json();
    const organizationId = String(body.organization_id || '').trim();
    const skillKey = String(body.skill_key || '').trim();
    const context = (body.context || {}) as Record<string, unknown>;

    if (!organizationId) return errorResponse('organization_id is required', req, 400);
    if (!skillKey) return errorResponse('skill_key is required', req, 400);

    // AUTHORIZATION: user must be a member of the organization
    const { data: membership, error: membershipError } = await supabase
      .from('organization_memberships')
      .select('role')
      .eq('org_id', organizationId)
      .eq('user_id', user.id)
      .maybeSingle();

    if (membershipError || !membership) {
      return errorResponse('Access denied to this organization', req, 403);
    }

    const result = await executeAgentSkillWithContract(supabase, {
      organizationId,
      userId: user.id,
      skillKey,
      context,
      dryRun: body.dry_run === true,
      storeFullOutput: body.store_full_output === true,
    });

    // IMPORTANT: Return the SkillResult contract directly (not wrapped)
    return jsonResponse(result, req);
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    console.error('[api-skill-execute] Error:', message);
    return errorResponse(message, req, 500);
  }
});

