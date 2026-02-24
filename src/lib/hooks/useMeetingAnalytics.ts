/**
 * React Query hooks for Meeting Analytics
 *
 * Follows the pattern from useTeamAnalytics.ts — thin wrappers around the service layer
 * with React Query for caching, stale-while-revalidate, and error handling.
 */

import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import * as maService from '@/lib/services/meetingAnalyticsService';
import type {
  DashboardParams,
  TranscriptListParams,
  SearchParams,
  GenerateReportParams,
  MultiSearchParams,
} from '@/lib/services/meetingAnalyticsService';
import type { MaNotificationSettingInput, MaAskRequest } from '@/lib/types/meetingAnalytics';

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
// Reports
// =====================================================

export function useMaReportHistory(params: { limit?: number; startDate?: string; endDate?: string } = {}) {
  return useQuery({
    queryKey: ['meeting-analytics', 'report-history', params],
    queryFn: () => maService.getReportHistory(params),
    staleTime: STALE_TIME,
  });
}

export function useMaGenerateReport() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (params: GenerateReportParams) => maService.generateReport(params),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['meeting-analytics', 'report-history'] });
    },
  });
}

export function useMaSendReport() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (params: { type: 'daily' | 'weekly'; settingId?: string }) => maService.sendReport(params),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['meeting-analytics', 'report-history'] });
    },
  });
}

// =====================================================
// Notification Settings
// =====================================================

export function useMaNotificationSettings() {
  return useQuery({
    queryKey: ['meeting-analytics', 'notification-settings'],
    queryFn: () => maService.getNotificationSettings(),
    staleTime: STALE_TIME,
  });
}

export function useMaCreateNotificationSetting() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (data: MaNotificationSettingInput) => maService.createNotificationSetting(data),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['meeting-analytics', 'notification-settings'] });
    },
  });
}

export function useMaUpdateNotificationSetting() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: ({ id, data }: { id: string; data: Partial<MaNotificationSettingInput> }) =>
      maService.updateNotificationSetting(id, data),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['meeting-analytics', 'notification-settings'] });
    },
  });
}

export function useMaDeleteNotificationSetting() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (id: string) => maService.deleteNotificationSetting(id),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['meeting-analytics', 'notification-settings'] });
    },
  });
}

export function useMaTestSlackWebhook() {
  return useMutation({
    mutationFn: (webhookUrl: string) => maService.testSlackWebhook(webhookUrl),
  });
}

// =====================================================
// Analytics
// =====================================================

export function useMaTalkTime(params: DashboardParams & { limit?: number } = {}) {
  return useQuery({
    queryKey: ['meeting-analytics', 'analytics', 'talk-time', params],
    queryFn: () => maService.getTalkTimeAnalytics(params),
    staleTime: STALE_TIME,
  });
}

export function useMaConversion(params: DashboardParams & { limit?: number } = {}) {
  return useQuery({
    queryKey: ['meeting-analytics', 'analytics', 'conversion', params],
    queryFn: () => maService.getConversionAnalytics(params),
    staleTime: STALE_TIME,
  });
}

export function useMaSentimentTrends(params: DashboardParams & { days?: number } = {}) {
  return useQuery({
    queryKey: ['meeting-analytics', 'analytics', 'sentiment-trends', params],
    queryFn: () => maService.getSentimentTrends(params),
    staleTime: STALE_TIME,
  });
}

// =====================================================
// Ask Anything (RAG Q&A)
// =====================================================

export function useMaAsk() {
  return useMutation({
    mutationFn: (params: MaAskRequest) => maService.askMeeting(params),
  });
}

// =====================================================
// Multi-transcript Search
// =====================================================

export function useMaSearchMulti(params: MultiSearchParams | null) {
  return useQuery({
    queryKey: ['meeting-analytics', 'search-multi', params],
    queryFn: () => maService.searchMulti(params!),
    enabled: Boolean(params?.query && params?.transcriptIds?.length),
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
