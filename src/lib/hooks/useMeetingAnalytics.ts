/**
 * React Query hooks for Meeting Analytics
 *
 * Follows the pattern from useTeamAnalytics.ts — thin wrappers around the service layer
 * with React Query for caching, stale-while-revalidate, and error handling.
 */

import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import * as maService from '@/lib/services/meetingAnalyticsService';
import type { DashboardParams, TranscriptListParams, SearchParams } from '@/lib/services/meetingAnalyticsService';

const STALE_TIME = 2 * 60 * 1000; // 2 minutes

// =====================================================
// Dashboard
// =====================================================

export function useMaDashboard(params: DashboardParams = {}) {
  return useQuery({
    queryKey: ['meeting-analytics', 'dashboard', params],
    queryFn: () => maService.getDashboardMetrics(params),
    staleTime: STALE_TIME,
  });
}

export function useMaTrends(params: DashboardParams = {}) {
  return useQuery({
    queryKey: ['meeting-analytics', 'trends', params],
    queryFn: () => maService.getDashboardTrends(params),
    staleTime: STALE_TIME,
  });
}

export function useMaAlerts(params: DashboardParams = {}) {
  return useQuery({
    queryKey: ['meeting-analytics', 'alerts', params],
    queryFn: () => maService.getDashboardAlerts(params),
    staleTime: STALE_TIME,
  });
}

export function useMaTopPerformers(params: DashboardParams & { limit?: number } = {}) {
  return useQuery({
    queryKey: ['meeting-analytics', 'top-performers', params],
    queryFn: () => maService.getTopPerformers(params),
    staleTime: STALE_TIME,
  });
}

export function useMaPipelineHealth(params: DashboardParams & { limit?: number } = {}) {
  return useQuery({
    queryKey: ['meeting-analytics', 'pipeline-health', params],
    queryFn: () => maService.getPipelineHealth(params),
    staleTime: STALE_TIME,
  });
}

// =====================================================
// Transcripts
// =====================================================

export function useMaTranscripts(params: TranscriptListParams = {}) {
  return useQuery({
    queryKey: ['meeting-analytics', 'transcripts', params],
    queryFn: () => maService.getTranscripts(params),
    staleTime: STALE_TIME,
  });
}

export function useMaTranscript(id: string | undefined) {
  return useQuery({
    queryKey: ['meeting-analytics', 'transcript', id],
    queryFn: () => maService.getTranscript(id!),
    enabled: Boolean(id),
    staleTime: STALE_TIME,
  });
}

// =====================================================
// Insights (per-transcript)
// =====================================================

export function useMaInsights(id: string | undefined) {
  return useQuery({
    queryKey: ['meeting-analytics', 'insights', id],
    queryFn: () => maService.getInsights(id!),
    enabled: Boolean(id),
    staleTime: STALE_TIME,
  });
}

// =====================================================
// Search
// =====================================================

export function useMaSearch(params: SearchParams | null) {
  return useQuery({
    queryKey: ['meeting-analytics', 'search', params],
    queryFn: () => maService.search(params!),
    enabled: Boolean(params?.query),
    staleTime: STALE_TIME,
  });
}

// =====================================================
// Sales Performance
// =====================================================

export function useMaSalesPerformance(params: DashboardParams = {}) {
  return useQuery({
    queryKey: ['meeting-analytics', 'sales-performance', params],
    queryFn: () => maService.getSalesPerformance(params),
    staleTime: STALE_TIME,
  });
}

// =====================================================
// Mutations
// =====================================================

export function useMaDeleteTranscript() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (id: string) => maService.deleteTranscript(id),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['meeting-analytics'] });
    },
  });
}
