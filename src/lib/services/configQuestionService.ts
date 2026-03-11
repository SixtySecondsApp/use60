/**
 * Config Question Service — LEARN-UI-005
 *
 * Hooks for fetching pending and answered agent config questions
 * from the `agent_config_questions` table. Used by TeachSixtySection,
 * SalesMethodologySettings, InAppQuestionCard, and AnswerHistoryTimeline.
 */

import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { toast } from 'sonner';
import { supabase } from '@/lib/supabase/clientV2';

// ============================================================================
// Types
// ============================================================================

export type QuestionCategory =
  | 'revenue_pipeline'
  | 'daily_rhythm'
  | 'agent_behaviour'
  | 'methodology'
  | 'signals';

export type QuestionStatus = 'pending' | 'asked' | 'answered' | 'skipped' | 'expired';

export interface ConfigQuestion {
  id: string;
  org_id: string;
  user_id: string | null;
  template_id: string | null;
  config_key: string;
  category: QuestionCategory;
  question: string;        // mapped from question_text
  question_text: string;
  scope: 'org' | 'user';
  options: Array<{ label: string; value: string }> | null;
  priority: number;
  status: QuestionStatus;
  answer_value: unknown | null;
  answered_at: string | null;
  created_at: string;
}

export interface AnsweredQuestion extends ConfigQuestion {
  answer_value: unknown;
  answered_at: string;
}

// ============================================================================
// Query keys
// ============================================================================

const QUERY_KEYS = {
  pending: (orgId: string, userId?: string) =>
    ['config-questions', 'pending', orgId, userId] as const,
  answered: (orgId: string, userId?: string) =>
    ['config-questions', 'answered', orgId, userId] as const,
  completeness: (orgId: string, userId?: string) =>
    ['config-completeness', orgId, userId] as const,
};

// ============================================================================
// Mappers
// ============================================================================

function mapRow(row: Record<string, unknown>): ConfigQuestion {
  return {
    id: row.id as string,
    org_id: row.org_id as string,
    user_id: (row.user_id as string) ?? null,
    template_id: (row.template_id as string) ?? null,
    config_key: row.config_key as string,
    category: row.category as QuestionCategory,
    question: row.question_text as string,
    question_text: row.question_text as string,
    scope: row.scope as 'org' | 'user',
    options: row.options as Array<{ label: string; value: string }> | null,
    priority: row.priority as number,
    status: row.status as QuestionStatus,
    answer_value: row.answer_value ?? null,
    answered_at: (row.answered_at as string) ?? null,
    created_at: row.created_at as string,
  };
}

// ============================================================================
// Hooks
// ============================================================================

/**
 * Fetches pending (unanswered) config questions for an org/user.
 * Returns questions with status='pending' ordered by priority ASC.
 */
export function usePendingConfigQuestions(orgId: string, userId?: string) {
  return useQuery<ConfigQuestion[]>({
    queryKey: QUERY_KEYS.pending(orgId, userId),
    queryFn: async () => {
      // Fetch questions where status is pending, for this org
      // Include both org-scoped (user_id IS NULL) and user-scoped questions
      let query = supabase
        .from('agent_config_questions')
        .select(
          'id, org_id, user_id, template_id, config_key, question_text, category, scope, options, priority, status, answer_value, answered_at, created_at'
        )
        .eq('org_id', orgId)
        .eq('status', 'pending')
        .order('priority', { ascending: true })
        .order('created_at', { ascending: true });

      // Include org-scoped (user_id IS NULL) and user-scoped questions for this user
      if (userId) {
        query = query.or(`user_id.eq.${userId},user_id.is.null`);
      } else {
        query = query.is('user_id', null);
      }

      const { data, error } = await query;

      if (error) throw error;
      return (data ?? []).map(mapRow);
    },
    enabled: !!orgId,
    staleTime: 2 * 60 * 1000, // 2 minutes
  });
}

/**
 * Fetches answered config questions for the answer history timeline.
 * Returns questions with status='answered', ordered by answered_at DESC.
 */
export function useAnsweredQuestions(orgId: string, userId?: string) {
  return useQuery<AnsweredQuestion[]>({
    queryKey: QUERY_KEYS.answered(orgId, userId),
    queryFn: async () => {
      let query = supabase
        .from('agent_config_questions')
        .select(
          'id, org_id, user_id, template_id, config_key, question_text, category, scope, options, priority, status, answer_value, answered_at, created_at'
        )
        .eq('org_id', orgId)
        .eq('status', 'answered')
        .not('answered_at', 'is', null)
        .order('answered_at', { ascending: false })
        .limit(50);

      if (userId) {
        query = query.or(`user_id.eq.${userId},user_id.is.null`);
      } else {
        query = query.is('user_id', null);
      }

      const { data, error } = await query;

      if (error) throw error;
      return (data ?? []).map(mapRow) as AnsweredQuestion[];
    },
    enabled: !!orgId,
    staleTime: 2 * 60 * 1000,
  });
}

/**
 * Mutation to answer a config question.
 * Updates status to 'answered', sets answer_value and answered_at.
 * Invalidates pending + answered + completeness queries on success.
 */
export function useAnswerQuestion() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async ({
      questionId,
      answerValue,
      orgId,
      userId,
    }: {
      questionId: string;
      answerValue: unknown;
      orgId: string;
      userId?: string;
    }) => {
      const { data, error } = await supabase
        .from('agent_config_questions')
        .update({
          status: 'answered' as const,
          answer_value: answerValue,
          answered_at: new Date().toISOString(),
        })
        .eq('id', questionId)
        .eq('org_id', orgId)
        .select('id, org_id, user_id, config_key, question_text, category, status, answer_value, answered_at')
        .maybeSingle();

      if (error) throw error;
      return data;
    },
    onSuccess: (_data, variables) => {
      queryClient.invalidateQueries({
        queryKey: QUERY_KEYS.pending(variables.orgId, variables.userId),
      });
      queryClient.invalidateQueries({
        queryKey: QUERY_KEYS.answered(variables.orgId, variables.userId),
      });
      queryClient.invalidateQueries({
        queryKey: QUERY_KEYS.completeness(variables.orgId, variables.userId),
      });
      toast.success('Answer saved');
    },
    onError: (error: Error) => {
      toast.error(`Failed to save answer: ${error.message}`);
    },
  });
}

/**
 * Mutation to skip a config question.
 * Updates status to 'skipped'.
 */
export function useSkipQuestion() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async ({
      questionId,
      orgId,
    }: {
      questionId: string;
      orgId: string;
      userId?: string;
    }) => {
      const { error } = await supabase
        .from('agent_config_questions')
        .update({ status: 'skipped' as const })
        .eq('id', questionId)
        .eq('org_id', orgId);

      if (error) throw error;
    },
    onSuccess: (_data, variables) => {
      queryClient.invalidateQueries({
        queryKey: QUERY_KEYS.pending(variables.orgId, variables.userId),
      });
      queryClient.invalidateQueries({
        queryKey: QUERY_KEYS.completeness(variables.orgId, variables.userId),
      });
    },
    onError: (error: Error) => {
      toast.error(`Failed to skip question: ${error.message}`);
    },
  });
}
