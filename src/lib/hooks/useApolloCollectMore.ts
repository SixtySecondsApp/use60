import { useMutation, useQueryClient } from '@tanstack/react-query';
import { supabase } from '@/lib/supabase/clientV2';
import type { ApolloSearchParams } from '@/lib/services/apolloSearchService';

interface CollectMoreParams {
  tableId: string;
  searchParams: ApolloSearchParams;
  desiredCount: number;
  autoEnrich?: {
    email?: boolean;
    phone?: boolean;
    reveal_personal_emails?: boolean;
    reveal_phone_number?: boolean;
  };
}

export interface CollectMoreResult {
  rows_added: number;
  total_searched: number;
  duplicates_skipped: number;
  new_row_count: number;
  message?: string;
}

export function useApolloCollectMore() {
  const queryClient = useQueryClient();

  return useMutation<CollectMoreResult, Error, CollectMoreParams>({
    mutationFn: async (params) => {
      const { data, error } = await supabase.functions.invoke('apollo-collect-more', {
        body: {
          table_id: params.tableId,
          search_params: params.searchParams,
          desired_count: params.desiredCount,
          auto_enrich: params.autoEnrich,
        },
      });

      if (error) throw new Error(error.message);
      if (data?.error) throw new Error(data.error);
      return data as CollectMoreResult;
    },
    onSuccess: (_result, params) => {
      queryClient.invalidateQueries({ queryKey: ['ops-table', params.tableId] });
      queryClient.invalidateQueries({ queryKey: ['ops-table-data', params.tableId] });
      queryClient.invalidateQueries({ queryKey: ['ops-tables'] });
    },
  });
}
