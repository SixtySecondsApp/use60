/**
 * cc-undo — Undo an auto-executed Command Centre item
 *
 * Rolls back a completed auto_exec item to 'ready' status within a 24-hour window.
 * Records a 'rejected' outcome in action_trust_scores to adjust future thresholds.
 *
 * Story: CC-017
 */

import { serve } from 'https://deno.land/std@0.168.0/http/server.ts';
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2.43.4';
import { getCorsHeaders, handleCorsPreflightRequest, jsonResponse, errorResponse } from '../_shared/corsHelper.ts';
import { undoAutoExecution } from '../_shared/commandCentre/undoExecution.ts';

serve(async (req: Request) => {
  // Handle CORS preflight
  const preflightResponse = handleCorsPreflightRequest(req);
  if (preflightResponse) return preflightResponse;

  try {
    // Auth: require JWT
    const authHeader = req.headers.get('Authorization');
    if (!authHeader) {
      return errorResponse('Missing authorization header', req, 401);
    }

    const supabaseClient = createClient(
      Deno.env.get('SUPABASE_URL')!,
      Deno.env.get('SUPABASE_ANON_KEY')!,
      { global: { headers: { Authorization: authHeader } } },
    );

    // Get authenticated user
    const { data: { user }, error: authError } = await supabaseClient.auth.getUser();
    if (authError || !user) {
      return errorResponse('Unauthorized', req, 401);
    }

    // Parse body
    const body = await req.json();
    const { item_id } = body;

    if (!item_id) {
      return errorResponse('item_id is required', req, 400);
    }

    // Use service role client for the undo operation (needs to bypass RLS for trust scoring)
    const serviceClient = createClient(
      Deno.env.get('SUPABASE_URL')!,
      Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!,
    );

    const result = await undoAutoExecution(serviceClient, item_id, user.id);

    if (!result.success) {
      return errorResponse(result.reason ?? 'Undo failed', req, 400);
    }

    return jsonResponse({ success: true }, req);
  } catch (err) {
    console.error('[cc-undo] Unexpected error:', err);
    return errorResponse('Internal server error', req, 500);
  }
});
