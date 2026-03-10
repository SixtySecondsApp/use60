import { useQuery } from '@tanstack/react-query';

export type QuestionCategory =
  | 'revenue_pipeline'
  | 'daily_rhythm'
  | 'agent_behaviour'
  | 'methodology'
  | 'signals';

export interface ConfigQuestion {
  id: string;
  category: QuestionCategory;
  question: string;
  answer?: string;
  [key: string]: unknown;
}

export function usePendingConfigQuestions(_orgId: string, _userId?: string) {
  return useQuery<ConfigQuestion[]>({
    queryKey: ['config-questions', 'pending', _orgId, _userId],
    queryFn: async () => [],
    staleTime: Infinity,
  });
}
