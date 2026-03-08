/**
 * Handler extracted from cc-undo/index.ts
 * CC-017: Undo an auto-executed Command Centre item
 */

import { createClient } from 'https://esm.sh/@supabase/supabase-js@2.43.4';
import { jsonResponse, errorResponse } from '../../_shared/corsHelper.ts';
import { undoAutoExecution } from '../../_shared/commandCentre/undoExecution.ts';

export async function handleUndo(req: Request): Promise<Response> {
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
}
