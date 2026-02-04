/**
 * Execution History Service
 *
 * Fetches execution history from copilot_executions + copilot_tool_calls
 * for the Copilot Lab History tab and per-skill/sequence History tabs.
 */

import { supabase } from '../supabase/clientV2';
import type {
  ExecutionHistoryItem,
  ExecutionHistoryFilters,
} from '@/lib/types/executionHistory';

// ============================================================================
// Fetch execution history (list view)
// ============================================================================

export async function getExecutionHistory(
  orgId: string,
  filters: ExecutionHistoryFilters = {}
): Promise<{ success: boolean; data?: ExecutionHistoryItem[]; error?: string }> {
  try {
    const { data, error } = await supabase.rpc('get_execution_history', {
      p_org_id: orgId,
      p_skill_key: filters.skillKey || null,
      p_sequence_key: filters.sequenceKey || null,
      p_user_id: filters.userId || null,
      p_success_only: filters.success ?? null,
      p_limit: filters.limit || 50,
      p_offset: filters.offset || 0,
    });

    if (error) {
      console.error('[executionHistoryService] getExecutionHistory error:', error);
      return { success: false, error: error.message };
    }

    // Parse tool_calls from JSONB if needed
    const items: ExecutionHistoryItem[] = (data || []).map((row: any) => ({
      ...row,
      tool_calls: typeof row.tool_calls === 'string'
        ? JSON.parse(row.tool_calls)
        : (row.tool_calls || []),
      structured_response: typeof row.structured_response === 'string'
        ? JSON.parse(row.structured_response)
        : (row.structured_response || null),
    }));

    return { success: true, data: items };
  } catch (err) {
    console.error('[executionHistoryService] getExecutionHistory exception:', err);
    return { success: false, error: err instanceof Error ? err.message : 'Unknown error' };
  }
}

// ============================================================================
// Fetch single execution detail
// ============================================================================

export async function getExecutionDetail(
  executionId: string
): Promise<{ success: boolean; data?: ExecutionHistoryItem; error?: string }> {
  try {
    // Fetch execution
    const { data: execution, error: execError } = await supabase
      .from('copilot_executions')
      .select('id, user_id, user_message, skill_key, sequence_key, success, error_message, tools_used, tool_call_count, iterations, started_at, completed_at, duration_ms, total_tokens, structured_response')
      .eq('id', executionId)
      .maybeSingle();

    if (execError) {
      return { success: false, error: execError.message };
    }
    if (!execution) {
      return { success: false, error: 'Execution not found' };
    }

    // Fetch tool calls
    const { data: toolCalls, error: tcError } = await supabase
      .from('copilot_tool_calls')
      .select('id, tool_name, skill_id, skill_key, input, output, status, error_message, started_at, completed_at, duration_ms')
      .eq('execution_id', executionId)
      .order('started_at', { ascending: true });

    if (tcError) {
      return { success: false, error: tcError.message };
    }

    const item: ExecutionHistoryItem = {
      execution_id: execution.id,
      user_id: execution.user_id,
      user_message: execution.user_message,
      skill_key: execution.skill_key,
      sequence_key: execution.sequence_key,
      success: execution.success,
      error_message: execution.error_message,
      tools_used: execution.tools_used || [],
      tool_call_count: execution.tool_call_count || 0,
      iterations: execution.iterations || 1,
      started_at: execution.started_at,
      completed_at: execution.completed_at,
      duration_ms: execution.duration_ms,
      total_tokens: execution.total_tokens,
      has_structured_response: !!execution.structured_response,
      structured_response: execution.structured_response || null,
      tool_calls: (toolCalls || []).map((tc: any) => ({
        id: tc.id,
        tool_name: tc.tool_name,
        skill_id: tc.skill_id,
        skill_key: tc.skill_key,
        input: tc.input || {},
        output: tc.output,
        status: tc.status,
        error_message: tc.error_message,
        started_at: tc.started_at,
        completed_at: tc.completed_at,
        duration_ms: tc.duration_ms,
      })),
    };

    return { success: true, data: item };
  } catch (err) {
    console.error('[executionHistoryService] getExecutionDetail exception:', err);
    return { success: false, error: err instanceof Error ? err.message : 'Unknown error' };
  }
}
