import { useQuery } from '@tanstack/react-query';

export interface ConfigQuestion {
  id: string;
  category: string;
  question: string;
  answer?: string;
  [key: string]: unknown;
}

export function usePendingConfigQuestions(_orgId: string, _userId?: string) {
  return useQuery<ConfigQuestion[]>({
    queryKey: ['config-questions', 'pending', _orgId, _userId],
    queryFn: async () => [],
    enabled: false,
  });
}
