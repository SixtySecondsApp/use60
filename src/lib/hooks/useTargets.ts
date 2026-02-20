import { useQuery } from '@tanstack/react-query';
import { supabase } from '@/lib/supabase/clientV2';
import logger from '@/lib/utils/logger';

export interface Target {
  id: string;
  user_id: string;
  revenue_target: number;
  outbound_target: number;
  meetings_target: number;
  proposal_target: number;
  start_date: string;
  end_date: string;
}

export function useTargets(userId: string | undefined) {
  return useQuery({
    queryKey: ['targets', userId],
    queryFn: async () => {
      const today = new Date().toISOString().split('T')[0]; // YYYY-MM-DD
      const { data, error } = await supabase
        .from('targets')
        .select('id, user_id, revenue_target, outbound_target, meetings_target, proposal_target, start_date, end_date')
        .eq('user_id', userId!)
        .lte('start_date', today)
        .gte('end_date', today)
        .order('created_at', { ascending: false })
        .maybeSingle();
      if (error) throw error;
      return data;
    },
    enabled: !!userId,
    staleTime: 5 * 60 * 1000,
    gcTime: 10 * 60 * 1000,
  });
}

export function useCreateTarget() {
  // TODO: Implement target creation mutation
  return {
    mutate: async () => {
      logger.log('Target creation not yet implemented');
    },
    isLoading: false,
    error: null
  };
}

export function useUpdateTarget() {
  // TODO: Implement target update mutation
  return {
    mutate: async () => {
      logger.log('Target update not yet implemented');
    },
    isLoading: false,
    error: null
  };
}

export function useDeleteTarget() {
  // TODO: Implement target deletion mutation
  return {
    mutate: async () => {
      logger.log('Target deletion not yet implemented');
    },
    isLoading: false,
    error: null
  };
}
