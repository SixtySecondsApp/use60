/**
 * useAgentSequences Hook
 *
 * React Query hooks for managing agent sequences - skills that orchestrate
 * multiple other skills in a defined order with context passing.
 */

import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { supabase } from '../supabase/clientV2';
import type { PlatformSkillFrontmatter } from '../services/platformSkillService';

// =============================================================================
// Types
// =============================================================================

// HITL (Human-in-the-Loop) configuration for a sequence step
export interface HITLConfig {
  enabled: boolean;
  request_type: 'confirmation' | 'question' | 'choice' | 'input';
  prompt: string; // The question/message to show the user (supports ${variable} interpolation)
  options?: Array<{ value: string; label: string }>; // For 'choice' type
  default_value?: string; // Default if timeout uses 'use_default'
  channels: Array<'slack' | 'in_app'>; // Where to send notifications
  slack_channel_id?: string; // Specific Slack channel (optional)
  assigned_to_user_id?: string; // Specific user to respond (optional)
  timeout_minutes: number; // How long to wait (default: 60)
  timeout_action: 'fail' | 'continue' | 'use_default'; // What to do on timeout
}

/**
 * Execution mode for sequence steps
 * - sequential: Run one at a time (default)
 * - parallel: Run concurrently with other parallel steps in same group
 */
export type StepExecutionMode = 'sequential' | 'parallel';

export interface SequenceStep {
  order: number;
  // Either a skill_key (runs an AI skill document) OR an action (execute_action capability call)
  skill_key?: string;
  action?: string;
  input_mapping?: Record<string, string>; // { targetParam: "${sourceVar}" }
  output_key?: string;
  on_failure?: 'stop' | 'continue' | 'fallback';
  fallback_skill_key?: string;
  // HITL configuration - pause and ask user before/after this step
  hitl_before?: HITLConfig; // Ask user BEFORE executing this step
  hitl_after?: HITLConfig; // Ask user AFTER executing this step (e.g., to approve output)
  // Parallel execution support
  execution_mode?: StepExecutionMode; // Default: 'sequential'
  parallel_group?: string; // Group ID for parallel steps (steps with same group run together)
  // Conditional execution
  condition?: string; // Expression like "${previous_step.success}" to conditionally skip
  // Timeout for this specific step
  timeout_ms?: number;
}

export interface SequenceFrontmatter extends PlatformSkillFrontmatter {
  sequence_steps: SequenceStep[];
}

export interface AgentSequence {
  id: string;
  skill_key: string;
  category: 'agent-sequence';
  frontmatter: SequenceFrontmatter;
  content_template: string;
  version: number;
  is_active: boolean;
  created_by: string | null;
  created_at: string;
  updated_at: string;
}

// HITL request record from the database
export interface HITLRequest {
  id: string;
  execution_id: string;
  sequence_key: string;
  step_index: number;
  organization_id: string;
  requested_by_user_id: string;
  assigned_to_user_id: string | null;
  request_type: 'confirmation' | 'question' | 'choice' | 'input';
  prompt: string;
  options: Array<{ value: string; label: string }>;
  default_value: string | null;
  channels: Array<'slack' | 'in_app'>;
  slack_channel_id: string | null;
  slack_message_ts: string | null;
  timeout_minutes: number;
  timeout_action: 'fail' | 'continue' | 'use_default';
  expires_at: string | null;
  execution_context: Record<string, unknown>;
  status: 'pending' | 'responded' | 'expired' | 'cancelled';
  response_value: string | null;
  response_context: Record<string, unknown>;
  responded_by_user_id: string | null;
  responded_at: string | null;
  response_channel: string | null;
  created_at: string;
  updated_at: string;
}

export interface SequenceExecution {
  id: string;
  sequence_key: string;
  organization_id: string;
  user_id: string;
  status: 'pending' | 'running' | 'completed' | 'failed' | 'cancelled' | 'waiting_hitl';
  input_context: Record<string, unknown>;
  step_results: StepResult[];
  final_output: Record<string, unknown> | null;
  error_message: string | null;
  failed_step_index: number | null;
  is_simulation: boolean;
  mock_data_used: Record<string, unknown> | null;
  started_at: string;
  completed_at: string | null;
  duration_ms?: number;
  // HITL tracking
  waiting_for_hitl: boolean;
  current_hitl_request_id: string | null;
}

export interface StepResult {
  step_index: number;
  skill_key: string;
  status: 'pending' | 'running' | 'completed' | 'failed' | 'skipped' | 'waiting_hitl';
  input: Record<string, unknown>;
  output: Record<string, unknown> | null;
  error: string | null;
  started_at: string | null;
  completed_at: string | null;
  duration_ms: number | null;
  // HITL information
  hitl_request_id?: string; // ID of current/completed HITL request
  hitl_response?: {
    value: string;
    context: Record<string, unknown>;
    responded_by: string;
    responded_at: string;
    channel: 'slack' | 'in_app';
  };
  // Parallel execution tracking
  execution_mode?: StepExecutionMode;
  parallel_group?: string;
  parallel_batch_index?: number; // Which parallel batch this step was in
}

export interface CreateSequenceInput {
  skill_key: string;
  frontmatter: SequenceFrontmatter;
  content_template: string;
}

export interface UpdateSequenceInput {
  frontmatter?: SequenceFrontmatter;
  content_template?: string;
  is_active?: boolean;
}

// =============================================================================
// Query Keys
// =============================================================================

export const SEQUENCE_QUERY_KEYS = {
  all: ['agent-sequences'] as const,
  lists: () => [...SEQUENCE_QUERY_KEYS.all, 'list'] as const,
  list: () => [...SEQUENCE_QUERY_KEYS.lists()] as const,
  detail: (id: string) => [...SEQUENCE_QUERY_KEYS.all, 'detail', id] as const,
  byKey: (key: string) => [...SEQUENCE_QUERY_KEYS.all, 'key', key] as const,
  executions: () => [...SEQUENCE_QUERY_KEYS.all, 'executions'] as const,
  executionsBySequence: (sequenceKey: string) =>
    [...SEQUENCE_QUERY_KEYS.executions(), sequenceKey] as const,
  execution: (id: string) => [...SEQUENCE_QUERY_KEYS.executions(), 'detail', id] as const,
  // HITL query keys
  hitlRequests: () => [...SEQUENCE_QUERY_KEYS.all, 'hitl-requests'] as const,
  hitlRequestsByOrg: (orgId: string) =>
    [...SEQUENCE_QUERY_KEYS.hitlRequests(), 'org', orgId] as const,
  hitlRequestsByExecution: (executionId: string) =>
    [...SEQUENCE_QUERY_KEYS.hitlRequests(), 'execution', executionId] as const,
  hitlRequest: (id: string) =>
    [...SEQUENCE_QUERY_KEYS.hitlRequests(), 'detail', id] as const,
  pendingHitlRequests: (orgId: string) =>
    [...SEQUENCE_QUERY_KEYS.hitlRequests(), 'pending', orgId] as const,
};

// =============================================================================
// HITL Helpers
// =============================================================================

/**
 * Create a default HITL configuration
 */
export function createDefaultHITLConfig(
  requestType: HITLConfig['request_type'] = 'confirmation'
): HITLConfig {
  return {
    enabled: false,
    request_type: requestType,
    prompt: '',
    options: requestType === 'choice' ? [{ value: 'yes', label: 'Yes' }, { value: 'no', label: 'No' }] : undefined,
    default_value: undefined,
    channels: ['in_app'],
    timeout_minutes: 60,
    timeout_action: 'fail',
  };
}

// =============================================================================
// Hooks
// =============================================================================

/**
 * Fetch all agent sequences
 */
export function useAgentSequences() {
  return useQuery({
    queryKey: SEQUENCE_QUERY_KEYS.list(),
    queryFn: async (): Promise<AgentSequence[]> => {
      const { data, error } = await supabase
        .from('platform_skills')
        .select('*')
        .eq('category', 'agent-sequence')
        .order('skill_key');

      if (error) throw error;
      return (data || []) as AgentSequence[];
    },
  });
}

/**
 * Fetch a single agent sequence by ID
 */
export function useAgentSequence(id: string | undefined) {
  return useQuery({
    queryKey: SEQUENCE_QUERY_KEYS.detail(id || ''),
    queryFn: async (): Promise<AgentSequence | null> => {
      if (!id) return null;

      const { data, error } = await supabase
        .from('platform_skills')
        .select('*')
        .eq('id', id)
        .eq('category', 'agent-sequence')
        .single();

      if (error) throw error;
      return data as AgentSequence;
    },
    enabled: !!id,
  });
}

/**
 * Fetch a single agent sequence by skill_key
 */
export function useAgentSequenceByKey(skillKey: string | undefined) {
  return useQuery({
    queryKey: SEQUENCE_QUERY_KEYS.byKey(skillKey || ''),
    queryFn: async (): Promise<AgentSequence | null> => {
      if (!skillKey) return null;

      const { data, error } = await supabase
        .from('platform_skills')
        .select('*')
        .eq('skill_key', skillKey)
        .eq('category', 'agent-sequence')
        .single();

      if (error) throw error;
      return data as AgentSequence;
    },
    enabled: !!skillKey,
  });
}

/**
 * Fetch executions for a specific sequence
 */
export function useSequenceExecutions(
  sequenceKey: string | undefined,
  options?: {
    isSimulation?: boolean;
    status?: SequenceExecution['status'];
    limit?: number;
  }
) {
  return useQuery({
    queryKey: [...SEQUENCE_QUERY_KEYS.executionsBySequence(sequenceKey || ''), options],
    queryFn: async (): Promise<SequenceExecution[]> => {
      if (!sequenceKey) return [];

      let query = supabase
        .from('sequence_executions')
        .select('*')
        .eq('sequence_key', sequenceKey)
        .order('created_at', { ascending: false });

      if (options?.isSimulation !== undefined) {
        query = query.eq('is_simulation', options.isSimulation);
      }
      if (options?.status) {
        query = query.eq('status', options.status);
      }
      if (options?.limit) {
        query = query.limit(options.limit);
      }

      const { data, error } = await query;

      if (error) throw error;
      return (data || []) as SequenceExecution[];
    },
    enabled: !!sequenceKey,
  });
}

/**
 * Fetch a single execution by ID
 */
export function useSequenceExecution(executionId: string | undefined) {
  return useQuery({
    queryKey: SEQUENCE_QUERY_KEYS.execution(executionId || ''),
    queryFn: async (): Promise<SequenceExecution | null> => {
      if (!executionId) return null;

      const { data, error } = await supabase
        .from('sequence_executions')
        .select('*')
        .eq('id', executionId)
        .single();

      if (error) throw error;
      return data as SequenceExecution;
    },
    enabled: !!executionId,
  });
}

/**
 * CRUD operations for agent sequences
 */
export function useAgentSequenceOperations(userId: string) {
  const queryClient = useQueryClient();

  const createMutation = useMutation({
    mutationFn: async (input: CreateSequenceInput) => {
      const { data, error } = await supabase
        .from('platform_skills')
        .insert({
          skill_key: input.skill_key,
          category: 'agent-sequence',
          frontmatter: input.frontmatter,
          content_template: input.content_template,
          created_by: userId,
        })
        .select()
        .single();

      if (error) throw error;
      return data as AgentSequence;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: SEQUENCE_QUERY_KEYS.all });
    },
  });

  const updateMutation = useMutation({
    mutationFn: async ({ id, input }: { id: string; input: UpdateSequenceInput }) => {
      const { data, error } = await supabase
        .from('platform_skills')
        .update({
          ...input,
          updated_at: new Date().toISOString(),
        })
        .eq('id', id)
        .select()
        .single();

      if (error) throw error;
      return data as AgentSequence;
    },
    onSuccess: (data) => {
      queryClient.invalidateQueries({ queryKey: SEQUENCE_QUERY_KEYS.all });
      queryClient.setQueryData(SEQUENCE_QUERY_KEYS.detail(data.id), data);
    },
  });

  const deleteMutation = useMutation({
    mutationFn: async (id: string) => {
      const { error } = await supabase.from('platform_skills').delete().eq('id', id);

      if (error) throw error;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: SEQUENCE_QUERY_KEYS.all });
    },
  });

  const toggleActiveMutation = useMutation({
    mutationFn: async ({ id, isActive }: { id: string; isActive: boolean }) => {
      const { data, error } = await supabase
        .from('platform_skills')
        .update({ is_active: isActive, updated_at: new Date().toISOString() })
        .eq('id', id)
        .select()
        .single();

      if (error) throw error;
      return data as AgentSequence;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: SEQUENCE_QUERY_KEYS.all });
    },
  });

  const cloneMutation = useMutation({
    mutationFn: async (sourceId: string) => {
      // First fetch the source sequence
      const { data: source, error: fetchError } = await supabase
        .from('platform_skills')
        .select('*')
        .eq('id', sourceId)
        .single();

      if (fetchError) throw fetchError;

      // Create a clone with a new skill_key
      const newSkillKey = `${source.skill_key}-copy-${Date.now()}`;
      const newFrontmatter = {
        ...source.frontmatter,
        name: `${source.frontmatter.name} (Copy)`,
      };

      const { data, error } = await supabase
        .from('platform_skills')
        .insert({
          skill_key: newSkillKey,
          category: 'agent-sequence',
          frontmatter: newFrontmatter,
          content_template: source.content_template,
          created_by: userId,
        })
        .select()
        .single();

      if (error) throw error;
      return data as AgentSequence;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: SEQUENCE_QUERY_KEYS.all });
    },
  });

  return {
    create: createMutation,
    update: updateMutation,
    delete: deleteMutation,
    toggleActive: toggleActiveMutation,
    clone: cloneMutation,
  };
}

/**
 * Get all available skills that can be used in sequences
 * (all skills except agent-sequence category)
 */
export function useAvailableSkillsForSequence() {
  return useQuery({
    queryKey: ['available-skills-for-sequence'],
    queryFn: async () => {
      const { data, error } = await supabase
        .from('platform_skills')
        .select('id, skill_key, category, frontmatter, is_active')
        .neq('category', 'agent-sequence')
        .eq('is_active', true)
        .order('category')
        .order('skill_key');

      if (error) throw error;
      return data || [];
    },
  });
}
