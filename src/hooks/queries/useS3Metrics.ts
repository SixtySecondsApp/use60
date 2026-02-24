// React Query hook for S3 cost metrics
import { useQuery } from '@tanstack/react-query';
import { supabase } from '@/lib/supabase';

interface S3MetricsParams {
  startDate?: string;
  endDate?: string;
  orgId?: string;
}

interface DailyBreakdown {
  date: string;
  storage_gb: number;
  upload_gb: number;
  download_gb: number;
  cost_usd: number;
}

interface S3MetricsResponse {
  start_date: string;
  end_date: string;
  org_id: string;
  current_month_cost: number;
  next_month_projection: number;
  latest_storage_gb: number;
  daily_breakdown: DailyBreakdown[];
  total_records: number;
}

export function useS3Metrics(params: S3MetricsParams = {}) {
  return useQuery({
    queryKey: ['s3-metrics', params],
    queryFn: async () => {
      const searchParams = new URLSearchParams();
      if (params.startDate) searchParams.set('start_date', params.startDate);
      if (params.endDate) searchParams.set('end_date', params.endDate);
      if (params.orgId) searchParams.set('org_id', params.orgId);

      const { data, error } = await supabase.functions.invoke('admin-s3-metrics', {
        method: 'GET',
        headers: {
          'Content-Type': 'application/json',
        },
        body: Object.fromEntries(searchParams),
      });

      if (error) throw error;
      return data as S3MetricsResponse;
    },
    staleTime: 5 * 60 * 1000, // 5 minutes
    refetchOnMount: false,
    refetchOnWindowFocus: false,
  });
}
