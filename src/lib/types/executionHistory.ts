/**
 * Execution History Types
 *
 * Types for the execution history replay system.
 * Used by Copilot Lab History tab and per-skill/sequence History tabs.
 */

import type { CopilotResponse } from './copilot';

// ============================================================================
// Core Types
// ============================================================================

export interface ExecutionToolCall {
  id: string;
  tool_name: string;
  skill_id: string | null;
  skill_key: string | null;
  input: Record<string, unknown>;
  output: unknown;
  status: 'running' | 'completed' | 'error';
  error_message: string | null;
  started_at: string;
  completed_at: string | null;
  duration_ms: number | null;
}

export interface ExecutionHistoryItem {
  execution_id: string;
  user_id: string;
  user_message: string;
  skill_key: string | null;
  sequence_key: string | null;
  success: boolean;
  error_message: string | null;
  tools_used: string[];
  tool_call_count: number;
  iterations: number;
  started_at: string;
  completed_at: string | null;
  duration_ms: number | null;
  total_tokens: number | null;
  has_structured_response: boolean;
  structured_response: CopilotResponse | null;
  tool_calls: ExecutionToolCall[];
}

// ============================================================================
// Filter Types
// ============================================================================

export interface ExecutionHistoryFilters {
  skillKey?: string;
  sequenceKey?: string;
  userId?: string;
  success?: boolean | null;
  hasStructuredResponse?: boolean;
  search?: string;
  limit?: number;
  offset?: number;
}

// ============================================================================
// Derived Types
// ============================================================================

/** Lightweight list item (without full structured_response payload) */
export type ExecutionHistoryListItem = Omit<ExecutionHistoryItem, 'structured_response' | 'tool_calls'> & {
  structured_response_type: string | null;
};
