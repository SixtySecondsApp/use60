import { serve } from 'https://deno.land/std@0.168.0/http/server.ts';
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2.43.4';
import {
  getCorsHeaders,
  handleCorsPreflightRequest,
  jsonResponse,
  errorResponse,
} from '../_shared/corsHelper.ts';

serve(async (req) => {
  // Handle CORS preflight
  const preflightResponse = handleCorsPreflightRequest(req);
  if (preflightResponse) {
    return preflightResponse;
  }

  try {
    const supabaseUrl = Deno.env.get('SUPABASE_URL')!;
    const supabaseServiceKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;
    const supabase = createClient(supabaseUrl, supabaseServiceKey);

    const now = new Date().toISOString();

    // Find tasks where expires_at < now AND ai_status NOT IN ('approved', 'executed', 'expired')
    const { data: expiredTasks, error: selectError } = await supabase
      .from('tasks')
      .select('id')
      .lt('expires_at', now)
      .not('ai_status', 'in', '(approved,executed,expired)');

    if (selectError) {
      throw new Error(`Failed to query expired tasks: ${selectError.message}`);
    }

    if (!expiredTasks || expiredTasks.length === 0) {
      return jsonResponse(
        {
          success: true,
          expired_count: 0,
          message: 'No tasks to expire',
        },
        req
      );
    }

    const taskIds = expiredTasks.map((t) => t.id);

    // Update matching tasks: status = 'expired', ai_status = 'expired'
    const { error: updateError } = await supabase
      .from('tasks')
      .update({
        status: 'expired',
        ai_status: 'expired',
        updated_at: now,
      })
      .in('id', taskIds);

    if (updateError) {
      throw new Error(`Failed to update expired tasks: ${updateError.message}`);
    }

    return jsonResponse(
      {
        success: true,
        expired_count: taskIds.length,
        expired_task_ids: taskIds,
      },
      req
    );
  } catch (error) {
    console.error('Error in task-auto-expire:', error);
    return errorResponse(
      error instanceof Error ? error.message : 'Internal server error',
      req,
      500
    );
  }
});
