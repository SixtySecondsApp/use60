/**
 * configQuestionService — LEARN-UI-006
 *
 * Handles fetching pending agent_config_questions and submitting answers
 * via the answer-config-question edge function.
 */

import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { toast } from 'sonner';
import { supabase } from '@/lib/supabase/clientV2';

// ============================================================================
// Types
// ============================================================================

export type QuestionStatus = 'pending' | 'asked' | 'answered' | 'skipped' | 'expired';
export type QuestionCategory =
  | 'revenue_pipeline'
  | 'daily_rhythm'
  | 'agent_behaviour'
  | 'methodology'
  | 'signals';
export type AnswerType = 'single_select' | 'multi_select' | 'free_text' | 'scale';
export type DeliveryChannel = 'slack' | 'in_app';

export interface QuestionOption {
  label: string;
  value: string;
  description?: string;
}

export interface AgentConfigQuestion {
  id: string;
  template_id: string;
  org_id: string;
  user_id: string | null;
  status: QuestionStatus;
  delivery_channel: DeliveryChannel;
  answer_value: string | null;
  asked_at: string | null;
  answered_at: string | null;
  skipped_at: string | null;
  expires_at: string | null;
  created_at: string;
  // from template join
  question_text: string;
  category: QuestionCategory;
  answer_type: AnswerType;
  options: QuestionOption[] | null;
  config_key: string;
  scope: 'org' | 'user';
  priority: 'critical' | 'high' | 'medium' | 'low';
}

export interface SubmitAnswerPayload {
  question_id: string;
  answer_value: string;
  answered_via?: 'in_app' | 'slack';
}

export interface SkipAnswerPayload {
  question_id: string;
  skip_reason?: string;
}

// ============================================================================
// Query keys
// ============================================================================

const QK = {
  pendingQuestions: (orgId: string, userId?: string) =>
    ['config-questions', 'pending', orgId, userId] as const,
  allQuestions: (orgId: string, userId?: string) =>
    ['config-questions', 'all', orgId, userId] as const,
};

// ============================================================================
// Fetch helpers
// ============================================================================

async function fetchPendingQuestions(
  orgId: string,
  userId?: string
): Promise<AgentConfigQuestion[]> {
  // Join questions with templates to get question text, category, options etc.
  const query = supabase
    .from('agent_config_questions')
    .select(
      `id, template_id, org_id, user_id, status, delivery_channel,
       answer_value, asked_at, answered_at, skipped_at, expires_at, created_at,
       agent_config_question_templates (
         question_text, category, answer_type, options, config_key, scope, priority
       )`
    )
    .eq('org_id', orgId)
    .eq('status', 'pending')
    .order('created_at', { ascending: true });

  if (userId) {
    query.or(`user_id.eq.${userId},user_id.is.null`);
  }

  const { data, error } = await query;
  if (error) throw error;

  return ((data as any[]) ?? []).map((row) => ({
    id: row.id,
    template_id: row.template_id,
    org_id: row.org_id,
    user_id: row.user_id,
    status: row.status,
    delivery_channel: row.delivery_channel,
    answer_value: row.answer_value,
    asked_at: row.asked_at,
    answered_at: row.answered_at,
    skipped_at: row.skipped_at,
    expires_at: row.expires_at,
    created_at: row.created_at,
    question_text: row.agent_config_question_templates?.question_text ?? '',
    category: row.agent_config_question_templates?.category ?? 'agent_behaviour',
    answer_type: row.agent_config_question_templates?.answer_type ?? 'single_select',
    options: row.agent_config_question_templates?.options ?? null,
    config_key: row.agent_config_question_templates?.config_key ?? '',
    scope: row.agent_config_question_templates?.scope ?? 'user',
    priority: row.agent_config_question_templates?.priority ?? 'medium',
  }));
}

async function fetchAllQuestions(
  orgId: string,
  userId?: string
): Promise<AgentConfigQuestion[]> {
  const query = supabase
    .from('agent_config_questions')
    .select(
      `id, template_id, org_id, user_id, status, delivery_channel,
       answer_value, asked_at, answered_at, skipped_at, expires_at, created_at,
       agent_config_question_templates (
         question_text, category, answer_type, options, config_key, scope, priority
       )`
    )
    .eq('org_id', orgId)
    .order('created_at', { ascending: false })
    .limit(100);

  if (userId) {
    query.or(`user_id.eq.${userId},user_id.is.null`);
  }

  const { data, error } = await query;
  if (error) throw error;

  return ((data as any[]) ?? []).map((row) => ({
    id: row.id,
    template_id: row.template_id,
    org_id: row.org_id,
    user_id: row.user_id,
    status: row.status,
    delivery_channel: row.delivery_channel,
    answer_value: row.answer_value,
    asked_at: row.asked_at,
    answered_at: row.answered_at,
    skipped_at: row.skipped_at,
    expires_at: row.expires_at,
    created_at: row.created_at,
    question_text: row.agent_config_question_templates?.question_text ?? '',
    category: row.agent_config_question_templates?.category ?? 'agent_behaviour',
    answer_type: row.agent_config_question_templates?.answer_type ?? 'single_select',
    options: row.agent_config_question_templates?.options ?? null,
    config_key: row.agent_config_question_templates?.config_key ?? '',
    scope: row.agent_config_question_templates?.scope ?? 'user',
    priority: row.agent_config_question_templates?.priority ?? 'medium',
  }));
}

// ============================================================================
// Hooks: queries
// ============================================================================

export function usePendingConfigQuestions(orgId: string, userId?: string) {
  return useQuery({
    queryKey: QK.pendingQuestions(orgId, userId),
    queryFn: () => fetchPendingQuestions(orgId, userId),
    enabled: !!orgId,
    staleTime: 60 * 1000,
    refetchOnWindowFocus: true,
  });
}

export function useAllConfigQuestions(orgId: string, userId?: string) {
  return useQuery({
    queryKey: QK.allQuestions(orgId, userId),
    queryFn: () => fetchAllQuestions(orgId, userId),
    enabled: !!orgId,
    staleTime: 2 * 60 * 1000,
  });
}

// ============================================================================
// Hooks: mutations
// ============================================================================

export function useSubmitAnswer(orgId: string, userId?: string) {
  const qc = useQueryClient();

  return useMutation({
    mutationFn: async (payload: SubmitAnswerPayload) => {
      const { data, error } = await supabase.functions.invoke('answer-config-question', {
        body: {
          question_id: payload.question_id,
          answer_value: payload.answer_value,
          answered_via: payload.answered_via ?? 'in_app',
        },
      });
      if (error) throw error;
      return data;
    },
    // Optimistic: mark question as answered immediately
    onMutate: async (payload) => {
      await qc.cancelQueries({ queryKey: QK.pendingQuestions(orgId, userId) });
      const prev = qc.getQueryData<AgentConfigQuestion[]>(QK.pendingQuestions(orgId, userId));
      qc.setQueryData<AgentConfigQuestion[]>(QK.pendingQuestions(orgId, userId), (old) =>
        (old ?? []).filter((q) => q.id !== payload.question_id)
      );
      return { prev };
    },
    onError: (_err, _payload, ctx) => {
      if (ctx?.prev) {
        qc.setQueryData(QK.pendingQuestions(orgId, userId), ctx.prev);
      }
      toast.error('Failed to save answer. Please try again.');
    },
    onSuccess: () => {
      toast.success('Answer saved');
      qc.invalidateQueries({ queryKey: ['config-completeness'] });
      qc.invalidateQueries({ queryKey: QK.allQuestions(orgId, userId) });
    },
  });
}

export function useSkipQuestion(orgId: string, userId?: string) {
  const qc = useQueryClient();

  return useMutation({
    mutationFn: async (payload: SkipAnswerPayload) => {
      const { error } = await supabase
        .from('agent_config_questions')
        .update({ status: 'skipped', skipped_at: new Date().toISOString() })
        .eq('id', payload.question_id);
      if (error) throw error;
    },
    onMutate: async (payload) => {
      await qc.cancelQueries({ queryKey: QK.pendingQuestions(orgId, userId) });
      const prev = qc.getQueryData<AgentConfigQuestion[]>(QK.pendingQuestions(orgId, userId));
      qc.setQueryData<AgentConfigQuestion[]>(QK.pendingQuestions(orgId, userId), (old) =>
        (old ?? []).filter((q) => q.id !== payload.question_id)
      );
      return { prev };
    },
    onError: (_err, _payload, ctx) => {
      if (ctx?.prev) {
        qc.setQueryData(QK.pendingQuestions(orgId, userId), ctx.prev);
      }
      toast.error('Failed to skip question.');
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: QK.allQuestions(orgId, userId) });
    },
  });
}
