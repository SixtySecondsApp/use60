import { useQuery } from '@tanstack/react-query';

export function useAutonomyDashboardRows() {
  return useQuery({
    queryKey: ['autonomy-dashboard-rows'],
    queryFn: async () => [] as any[],
    enabled: false,
  });
}

export function useWindowedApprovalRates(windowDays: number) {
  return useQuery({
    queryKey: ['windowed-approval-rates', windowDays],
    queryFn: async () => ({} as Record<string, any>),
    enabled: false,
  });
}
