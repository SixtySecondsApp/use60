/**
 * useBatchQuery Hook
 *
 * React Query hook for batch requests to edge functions.
 * Consolidates multiple data queries into single requests,
 * reducing edge function invocations by 80%+.
 */

import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { supabase } from '../supabase/clientV2';
import { useSmartRefetchConfig } from './useSmartPolling';
import type { PollingTier } from './useSmartPolling';

// ============================================================================
// Types
// ============================================================================

// App Data Batch Types
export interface AppDataOperation {
  id: string;
  type: 'query' | 'mutation';
  resource:
    | 'deals'
    | 'activities'
    | 'tasks'
    | 'health-scores'
    | 'contacts'
    | 'meetings'
    | 'notifications';
  action: string;
  params?: Record<string, unknown>;
}

export interface AppDataBatchRequest {
  operations: AppDataOperation[];
  userId?: string;
  orgId?: string;
}

export interface BatchResult<T = unknown> {
  id: string;
  success: boolean;
  data?: T;
  error?: string;
  timing?: number;
}

export interface AppDataBatchResponse {
  results: Record<string, BatchResult>;
  totalTime: number;
  operationCount: number;
}

// Google Workspace Batch Types
export interface GoogleBatchOperation {
  id: string;
  service: 'calendar' | 'gmail' | 'drive' | 'tasks' | 'docs' | 'connection';
  action: string;
  params?: Record<string, unknown>;
}

export interface GoogleBatchRequest {
  operations: GoogleBatchOperation[];
  userId?: string;
}

// Meeting Analysis Batch Types
export type MeetingAnalysisType =
  | 'details'
  | 'action-items'
  | 'topics'
  | 'suggestions'
  | 'summary'
  | 'transcript-search'
  | 'related-deals'
  | 'related-contacts';

export interface MeetingBatchRequest {
  meetingId: string;
  analyses: MeetingAnalysisType[];
  params?: {
    searchQuery?: string;
  };
}

// Integration Health Batch Types
export type IntegrationType =
  | 'google'
  | 'fathom'
  | 'hubspot'
  | 'slack'
  | 'justcall'
  | 'savvycal';

export interface IntegrationStatus {
  connected: boolean;
  status: 'connected' | 'disconnected' | 'error' | 'expired' | 'not_configured';
  lastSync?: string;
  error?: string;
  details?: Record<string, unknown>;
}

export interface IntegrationHealthRequest {
  integrations: IntegrationType[];
  userId?: string;
}

export interface IntegrationHealthResponse {
  results: Record<IntegrationType, IntegrationStatus>;
  totalTime: number;
  checkedCount: number;
}

// ============================================================================
// Query Keys
// ============================================================================

export const batchQueryKeys = {
  all: ['batch'] as const,
  appData: (operationIds: string[]) =>
    [...batchQueryKeys.all, 'app-data', ...operationIds] as const,
  google: (operationIds: string[]) =>
    [...batchQueryKeys.all, 'google', ...operationIds] as const,
  meeting: (meetingId: string, analyses: string[]) =>
    [...batchQueryKeys.all, 'meeting', meetingId, ...analyses] as const,
  integrationHealth: (integrations: IntegrationType[]) =>
    [...batchQueryKeys.all, 'integration-health', ...integrations] as const,
};

// ============================================================================
// App Data Batch Hook
// ============================================================================

/**
 * Hook for batching app data queries (deals, activities, tasks, etc.)
 *
 * @example
 * ```tsx
 * const { data, isLoading } = useAppDataBatch([
 *   { id: 'deals', type: 'query', resource: 'deals', action: 'list', params: { stage: 'active' } },
 *   { id: 'activities', type: 'query', resource: 'activities', action: 'recent', params: { limit: 20 } },
 *   { id: 'tasks', type: 'query', resource: 'tasks', action: 'overdue' },
 * ]);
 *
 * // Access results
 * const deals = data?.results?.deals?.data;
 * const activities = data?.results?.activities?.data;
 * ```
 */
export function useAppDataBatch(
  operations: AppDataOperation[],
  options?: {
    enabled?: boolean;
    tier?: PollingTier;
    staleTime?: number;
  }
) {
  const tier = options?.tier ?? 'standard';
  const refetchConfig = useSmartRefetchConfig(300_000, tier); // 5 min base

  return useQuery({
    queryKey: batchQueryKeys.appData(operations.map((o) => o.id)),
    queryFn: async (): Promise<AppDataBatchResponse> => {
      const { data, error } = await supabase.functions.invoke('app-data-batch', {
        body: { operations },
      });

      if (error) throw error;
      return data;
    },
    enabled: operations.length > 0 && (options?.enabled !== false),
    staleTime: options?.staleTime ?? 5 * 60 * 1000, // 5 minutes
    ...refetchConfig,
  });
}

// ============================================================================
// Google Workspace Batch Hook
// ============================================================================

/**
 * Hook for batching Google Workspace API calls
 *
 * @example
 * ```tsx
 * const { data } = useGoogleWorkspaceBatch([
 *   { id: 'calendars', service: 'calendar', action: 'list-calendars' },
 *   { id: 'labels', service: 'gmail', action: 'list-labels' },
 *   { id: 'connection', service: 'connection', action: 'test' },
 * ]);
 * ```
 */
export function useGoogleWorkspaceBatch(
  operations: GoogleBatchOperation[],
  options?: {
    enabled?: boolean;
    staleTime?: number;
  }
) {
  // Google data is background tier - not critical for sales agents
  const refetchConfig = useSmartRefetchConfig(600_000, 'background'); // 10 min base

  return useQuery({
    queryKey: batchQueryKeys.google(operations.map((o) => o.id)),
    queryFn: async () => {
      const { data, error } = await supabase.functions.invoke(
        'google-services-router',
        {
          body: { action: 'workspace_batch', operations },
        }
      );

      if (error) throw error;
      return data;
    },
    enabled: operations.length > 0 && (options?.enabled !== false),
    staleTime: options?.staleTime ?? 10 * 60 * 1000, // 10 minutes
    ...refetchConfig,
  });
}

// ============================================================================
// Meeting Analysis Batch Hook
// ============================================================================

/**
 * Hook for batching meeting analysis queries
 *
 * @example
 * ```tsx
 * const { data } = useMeetingAnalysisBatch('meeting-123', [
 *   'details',
 *   'action-items',
 *   'suggestions',
 *   'summary',
 * ]);
 *
 * const details = data?.results?.details?.data;
 * const actionItems = data?.results?.['action-items']?.data;
 * ```
 */
export function useMeetingAnalysisBatch(
  meetingId: string | null,
  analyses: MeetingAnalysisType[],
  options?: {
    enabled?: boolean;
    searchQuery?: string;
    staleTime?: number;
  }
) {
  // Meeting data is important tier - sales agents reviewing meetings
  const refetchConfig = useSmartRefetchConfig(300_000, 'important');

  return useQuery({
    queryKey: batchQueryKeys.meeting(meetingId || '', analyses),
    queryFn: async () => {
      if (!meetingId) throw new Error('meetingId required');

      const { data, error } = await supabase.functions.invoke(
        'meeting-router',
        {
          body: {
            action: 'analysis_batch',
            meetingId,
            analyses,
            params: options?.searchQuery
              ? { searchQuery: options.searchQuery }
              : undefined,
          },
        }
      );

      if (error) throw error;
      return data;
    },
    enabled: !!meetingId && analyses.length > 0 && (options?.enabled !== false),
    staleTime: options?.staleTime ?? 5 * 60 * 1000, // 5 minutes
    ...refetchConfig,
  });
}

// ============================================================================
// Integration Health Batch Hook
// ============================================================================

/**
 * Hook for batching integration health checks
 *
 * @example
 * ```tsx
 * const { data } = useIntegrationHealthBatch([
 *   'google',
 *   'fathom',
 *   'slack',
 * ]);
 *
 * const googleStatus = data?.results?.google;
 * const fathomStatus = data?.results?.fathom;
 * ```
 */
export function useIntegrationHealthBatch(
  integrations: IntegrationType[],
  options?: {
    enabled?: boolean;
    userId?: string;
    staleTime?: number;
  }
) {
  // Integration health is background tier - admin data
  const refetchConfig = useSmartRefetchConfig(600_000, 'background'); // 10 min base

  return useQuery({
    queryKey: batchQueryKeys.integrationHealth(integrations),
    queryFn: async (): Promise<IntegrationHealthResponse> => {
      const { data, error } = await supabase.functions.invoke(
        'integration-health-batch',
        {
          body: {
            integrations,
            userId: options?.userId,
          },
        }
      );

      if (error) throw error;
      return data;
    },
    enabled: integrations.length > 0 && (options?.enabled !== false),
    staleTime: options?.staleTime ?? 10 * 60 * 1000, // 10 minutes
    ...refetchConfig,
  });
}

// ============================================================================
// Convenience Hooks for Common Patterns
// ============================================================================

/**
 * Hook for dashboard data - all essential data in one call
 */
export function useDashboardBatch(options?: { enabled?: boolean }) {
  const operations: AppDataOperation[] = [
    { id: 'deals-active', type: 'query', resource: 'deals', action: 'list', params: { stage: 'active' } },
    { id: 'deals-stats', type: 'query', resource: 'deals', action: 'stats' },
    { id: 'activities-recent', type: 'query', resource: 'activities', action: 'recent', params: { limit: 10 } },
    { id: 'activities-upcoming', type: 'query', resource: 'activities', action: 'upcoming', params: { limit: 5 } },
    { id: 'tasks-overdue', type: 'query', resource: 'tasks', action: 'overdue' },
    { id: 'tasks-today', type: 'query', resource: 'tasks', action: 'today' },
    { id: 'health-summary', type: 'query', resource: 'health-scores', action: 'summary' },
    { id: 'health-at-risk', type: 'query', resource: 'health-scores', action: 'at-risk', params: { threshold: 50 } },
    { id: 'notifications', type: 'query', resource: 'notifications', action: 'unread', params: { limit: 10 } },
    { id: 'meetings-upcoming', type: 'query', resource: 'meetings', action: 'upcoming', params: { limit: 5 } },
  ];

  return useAppDataBatch(operations, { ...options, tier: 'important' });
}

/**
 * Hook for meeting detail page - all meeting data in one call
 */
export function useMeetingDetailBatch(
  meetingId: string | null,
  options?: { enabled?: boolean }
) {
  return useMeetingAnalysisBatch(
    meetingId,
    [
      'details',
      'action-items',
      'topics',
      'suggestions',
      'summary',
      'related-deals',
      'related-contacts',
    ],
    options
  );
}

/**
 * Hook for admin integrations page - all integration health in one call
 */
export function useAdminIntegrationsBatch(options?: { enabled?: boolean }) {
  return useIntegrationHealthBatch(
    ['google', 'fathom', 'hubspot', 'slack', 'justcall', 'savvycal'],
    options
  );
}

/**
 * Hook for Google connection test - all services in one call
 */
export function useGoogleConnectionTest(options?: { enabled?: boolean }) {
  const operations: GoogleBatchOperation[] = [
    { id: 'connection', service: 'connection', action: 'test' },
  ];

  return useGoogleWorkspaceBatch(operations, options);
}

// ============================================================================
// Mutation for Invalidation
// ============================================================================

/**
 * Hook to invalidate batch query caches
 */
export function useInvalidateBatchQueries() {
  const queryClient = useQueryClient();

  return {
    invalidateAppData: () =>
      queryClient.invalidateQueries({ queryKey: [...batchQueryKeys.all, 'app-data'] }),
    invalidateGoogle: () =>
      queryClient.invalidateQueries({ queryKey: [...batchQueryKeys.all, 'google'] }),
    invalidateMeeting: (meetingId: string) =>
      queryClient.invalidateQueries({
        queryKey: [...batchQueryKeys.all, 'meeting', meetingId],
      }),
    invalidateIntegrationHealth: () =>
      queryClient.invalidateQueries({
        queryKey: [...batchQueryKeys.all, 'integration-health'],
      }),
    invalidateAll: () =>
      queryClient.invalidateQueries({ queryKey: batchQueryKeys.all }),
  };
}
