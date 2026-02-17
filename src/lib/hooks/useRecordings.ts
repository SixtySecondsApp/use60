/**
 * Recording Hooks
 *
 * React hooks for MeetingBaaS recording functionality.
 * Provides data fetching, mutations, and real-time updates for recordings.
 */

import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { useCallback, useEffect, useMemo, useState } from 'react';
import { toast } from 'sonner';
import { recordingService } from '@/lib/services/recordingService';
import { supabase } from '@/lib/supabase/clientV2';
import { useAuth } from '@/lib/contexts/AuthContext';
import { useActiveOrgId } from '@/lib/stores/orgStore';
import type {
  Recording,
  RecordingRule,
  RecordingRuleInsert,
  RecordingStatus,
  RecordingUsage,
  RecordingSettings,
  ListRecordingsResponse,
  RecordingSearchResponse,
} from '@/lib/types/meetingBaaS';

// =============================================================================
// Query Keys
// =============================================================================

export const recordingKeys = {
  all: ['recordings'] as const,
  lists: () => [...recordingKeys.all, 'list'] as const,
  list: (orgId: string, filters?: RecordingListFilters) =>
    [...recordingKeys.lists(), orgId, filters] as const,
  details: () => [...recordingKeys.all, 'detail'] as const,
  detail: (id: string) => [...recordingKeys.details(), id] as const,
  search: (orgId: string, query: string) =>
    [...recordingKeys.all, 'search', orgId, query] as const,
  rules: (orgId: string) => [...recordingKeys.all, 'rules', orgId] as const,
  usage: (orgId: string) => [...recordingKeys.all, 'usage', orgId] as const,
  settings: (orgId: string) => [...recordingKeys.all, 'settings', orgId] as const,
};

// =============================================================================
// Types
// =============================================================================

export interface RecordingListFilters {
  status?: RecordingStatus;
  limit?: number;
  offset?: number;
  startDate?: string;
  endDate?: string;
}

export interface UseRecordingsReturn {
  recordings: Recording[];
  total: number;
  isLoading: boolean;
  isError: boolean;
  error: Error | null;
  refetch: () => void;
  hasMore: boolean;
  loadMore: () => void;
}

export interface UseRecordingReturn {
  recording: Recording | null;
  isLoading: boolean;
  isError: boolean;
  error: Error | null;
  refetch: () => void;
}

export interface UseRecordingActionsReturn {
  startRecording: (params: {
    meetingUrl: string;
    meetingTitle?: string;
    calendarEventId?: string;
  }) => Promise<Recording | null>;
  stopRecording: (recordingId: string) => Promise<boolean>;
  deleteRecording: (recordingId: string) => Promise<boolean>;
  resolveHITL: (
    recordingId: string,
    resolution: {
      type: 'speaker_confirmation' | 'deal_selection';
      data: Record<string, unknown>;
    }
  ) => Promise<boolean>;
  isStarting: boolean;
  isStopping: boolean;
  isDeleting: boolean;
  isResolving: boolean;
}

// =============================================================================
// useRecordings - List recordings with pagination
// =============================================================================

export function useRecordings(filters: RecordingListFilters = {}): UseRecordingsReturn {
  const activeOrgId = useActiveOrgId();
  const orgId = activeOrgId;
  const [offset, setOffset] = useState(0);
  const limit = filters.limit || 20;

  const { data, isLoading, isError, error, refetch } = useQuery<ListRecordingsResponse>({
    queryKey: recordingKeys.list(orgId || '', { ...filters, offset }),
    queryFn: async () => {
      if (!orgId) throw new Error('No organization selected');
      return recordingService.listRecordings(orgId, {
        ...filters,
        limit,
        offset,
      });
    },
    enabled: !!orgId,
    staleTime: 30000, // 30 seconds
  });

  const loadMore = useCallback(() => {
    if (data && offset + limit < data.total) {
      setOffset((prev) => prev + limit);
    }
  }, [data, offset, limit]);

  const hasMore = data ? offset + limit < data.total : false;

  return {
    recordings: data?.recordings || [],
    total: data?.total || 0,
    isLoading,
    isError,
    error: error as Error | null,
    refetch,
    hasMore,
    loadMore,
  };
}

// =============================================================================
// useRecording - Single recording details
// =============================================================================

export function useRecording(recordingId: string | null): UseRecordingReturn {
  const { data, isLoading, isError, error, refetch } = useQuery<Recording | null>({
    queryKey: recordingKeys.detail(recordingId || ''),
    queryFn: async () => {
      if (!recordingId) return null;
      return recordingService.getRecording(recordingId);
    },
    enabled: !!recordingId,
    staleTime: 30000,
  });

  return {
    recording: data || null,
    isLoading,
    isError,
    error: error as Error | null,
    refetch,
  };
}

// =============================================================================
// useRecordingSearch - Search recordings by transcript
// =============================================================================

export function useRecordingSearch(query: string) {
  const activeOrgId = useActiveOrgId();
  const orgId = activeOrgId;

  const { data, isLoading, isError, error, refetch } = useQuery<RecordingSearchResponse>({
    queryKey: recordingKeys.search(orgId || '', query),
    queryFn: async () => {
      if (!orgId) throw new Error('No organization selected');
      if (!query.trim()) return { results: [], total: 0, query: '' };
      return recordingService.searchRecordings(orgId, { query });
    },
    enabled: !!orgId && query.trim().length > 2,
    staleTime: 60000, // 1 minute
  });

  return {
    results: data?.results || [],
    total: data?.total || 0,
    isLoading,
    isError,
    error: error as Error | null,
    refetch,
  };
}

// =============================================================================
// useRecordingActions - Mutations for recording operations
// =============================================================================

export function useRecordingActions(): UseRecordingActionsReturn {
  const { user } = useAuth();
  const activeOrgId = useActiveOrgId();
  const queryClient = useQueryClient();
  const orgId = activeOrgId;
  const userId = user?.id;

  // Start recording mutation
  const startMutation = useMutation({
    mutationFn: async (params: {
      meetingUrl: string;
      meetingTitle?: string;
      calendarEventId?: string;
    }) => {
      if (!orgId || !userId) throw new Error('Not authenticated');
      return recordingService.startRecording(orgId, userId, params);
    },
    onSuccess: (result) => {
      if (result.success && result.recording) {
        toast.success('Recording started', {
          description: 'Bot is joining the meeting...',
        });
        queryClient.invalidateQueries({ queryKey: recordingKeys.lists() });
      } else {
        toast.error('Failed to start recording', {
          description: result.error || 'Unknown error',
        });
      }
    },
    onError: (error) => {
      toast.error('Failed to start recording', {
        description: error instanceof Error ? error.message : 'Unknown error',
      });
    },
  });

  // Stop recording mutation
  const stopMutation = useMutation({
    mutationFn: async (recordingId: string) => {
      return recordingService.stopRecording(recordingId);
    },
    onSuccess: (result, recordingId) => {
      if (result.success) {
        toast.success('Recording stopped', {
          description: 'Processing will begin shortly.',
        });
        queryClient.invalidateQueries({ queryKey: recordingKeys.detail(recordingId) });
        queryClient.invalidateQueries({ queryKey: recordingKeys.lists() });
      } else {
        toast.error('Failed to stop recording', {
          description: result.error || 'Unknown error',
        });
      }
    },
    onError: (error) => {
      toast.error('Failed to stop recording', {
        description: error instanceof Error ? error.message : 'Unknown error',
      });
    },
  });

  // Delete recording mutation
  const deleteMutation = useMutation({
    mutationFn: async (recordingId: string) => {
      return recordingService.deleteRecording(recordingId);
    },
    onSuccess: (result) => {
      if (result.success) {
        toast.success('Recording deleted');
        queryClient.invalidateQueries({ queryKey: recordingKeys.lists() });
      } else {
        toast.error('Failed to delete recording', {
          description: result.error || 'Unknown error',
        });
      }
    },
    onError: (error) => {
      toast.error('Failed to delete recording', {
        description: error instanceof Error ? error.message : 'Unknown error',
      });
    },
  });

  // Resolve HITL mutation
  const resolveMutation = useMutation({
    mutationFn: async ({
      recordingId,
      resolution,
    }: {
      recordingId: string;
      resolution: {
        type: 'speaker_confirmation' | 'deal_selection';
        data: Record<string, unknown>;
      };
    }) => {
      if (!userId) throw new Error('Not authenticated');
      return recordingService.resolveHITL(recordingId, userId, resolution);
    },
    onSuccess: (result, { recordingId }) => {
      if (result.success) {
        toast.success('Resolution saved', {
          description: 'Recording will continue processing.',
        });
        queryClient.invalidateQueries({ queryKey: recordingKeys.detail(recordingId) });
        queryClient.invalidateQueries({ queryKey: recordingKeys.lists() });
      } else {
        toast.error('Failed to save resolution', {
          description: result.error || 'Unknown error',
        });
      }
    },
    onError: (error) => {
      toast.error('Failed to save resolution', {
        description: error instanceof Error ? error.message : 'Unknown error',
      });
    },
  });

  return {
    startRecording: async (params) => {
      const result = await startMutation.mutateAsync(params);
      return result.success ? result.recording || null : null;
    },
    stopRecording: async (recordingId) => {
      const result = await stopMutation.mutateAsync(recordingId);
      return result.success;
    },
    deleteRecording: async (recordingId) => {
      const result = await deleteMutation.mutateAsync(recordingId);
      return result.success;
    },
    resolveHITL: async (recordingId, resolution) => {
      const result = await resolveMutation.mutateAsync({ recordingId, resolution });
      return result.success;
    },
    isStarting: startMutation.isPending,
    isStopping: stopMutation.isPending,
    isDeleting: deleteMutation.isPending,
    isResolving: resolveMutation.isPending,
  };
}

// =============================================================================
// useRecordingRules - Recording rules management
// =============================================================================

export function useRecordingRules() {
  const activeOrgId = useActiveOrgId();
  const queryClient = useQueryClient();
  const orgId = activeOrgId;

  const { data, isLoading, isError, error, refetch } = useQuery<RecordingRule[]>({
    queryKey: recordingKeys.rules(orgId || ''),
    queryFn: async () => {
      if (!orgId) throw new Error('No organization selected');
      return recordingService.getRecordingRules(orgId);
    },
    enabled: !!orgId,
    staleTime: 60000,
  });

  // Create rule mutation
  const createMutation = useMutation({
    mutationFn: async (rule: RecordingRuleInsert) => {
      return recordingService.createRecordingRule(rule);
    },
    onSuccess: (result) => {
      if (result) {
        toast.success('Rule created');
        queryClient.invalidateQueries({ queryKey: recordingKeys.rules(orgId || '') });
      } else {
        toast.error('Failed to create rule');
      }
    },
    onError: (error) => {
      toast.error('Failed to create rule', {
        description: error instanceof Error ? error.message : 'Unknown error',
      });
    },
  });

  // Update rule mutation
  const updateMutation = useMutation({
    mutationFn: async ({
      ruleId,
      updates,
    }: {
      ruleId: string;
      updates: Partial<RecordingRule>;
    }) => {
      return recordingService.updateRecordingRule(ruleId, updates);
    },
    onSuccess: (result) => {
      if (result) {
        toast.success('Rule updated');
        queryClient.invalidateQueries({ queryKey: recordingKeys.rules(orgId || '') });
      } else {
        toast.error('Failed to update rule');
      }
    },
    onError: (error) => {
      toast.error('Failed to update rule', {
        description: error instanceof Error ? error.message : 'Unknown error',
      });
    },
  });

  // Delete rule mutation
  const deleteMutation = useMutation({
    mutationFn: async (ruleId: string) => {
      return recordingService.deleteRecordingRule(ruleId);
    },
    onSuccess: (success) => {
      if (success) {
        toast.success('Rule deleted');
        queryClient.invalidateQueries({ queryKey: recordingKeys.rules(orgId || '') });
      } else {
        toast.error('Failed to delete rule');
      }
    },
    onError: (error) => {
      toast.error('Failed to delete rule', {
        description: error instanceof Error ? error.message : 'Unknown error',
      });
    },
  });

  return {
    rules: data || [],
    isLoading,
    isError,
    error: error as Error | null,
    refetch,
    createRule: createMutation.mutateAsync,
    updateRule: (ruleId: string, updates: Partial<RecordingRule>) =>
      updateMutation.mutateAsync({ ruleId, updates }),
    deleteRule: deleteMutation.mutateAsync,
    isCreating: createMutation.isPending,
    isUpdating: updateMutation.isPending,
    isDeleting: deleteMutation.isPending,
  };
}

// =============================================================================
// useRecordingUsage - Usage and quota information
// =============================================================================

export function useRecordingUsage() {
  const activeOrgId = useActiveOrgId();
  const orgId = activeOrgId;

  const { data: usage, isLoading: isLoadingUsage } = useQuery<RecordingUsage | null>({
    queryKey: recordingKeys.usage(orgId || ''),
    queryFn: async () => {
      if (!orgId) return null;
      return recordingService.getUsage(orgId);
    },
    enabled: !!orgId,
    staleTime: 60000,
  });

  const { data: quota, isLoading: isLoadingQuota } = useQuery({
    queryKey: [...recordingKeys.usage(orgId || ''), 'quota'],
    queryFn: async () => {
      if (!orgId) return { allowed: true, remaining: 20, limit: 20 };
      return recordingService.checkQuota(orgId);
    },
    enabled: !!orgId,
    staleTime: 60000,
  });

  return {
    usage,
    quota: quota || { allowed: true, remaining: 20, limit: 20 },
    isLoading: isLoadingUsage || isLoadingQuota,
    canRecord: quota?.allowed ?? true,
    remainingRecordings: quota?.remaining ?? 20,
    recordingsLimit: quota?.limit ?? 20,
    usagePercent: usage
      ? Math.round((usage.recordings_count / usage.recordings_limit) * 100)
      : 0,
  };
}

// =============================================================================
// useRecordingSettings - Organization recording settings
// =============================================================================

export function useRecordingSettings() {
  const activeOrgId = useActiveOrgId();
  const queryClient = useQueryClient();
  const orgId = activeOrgId;

  const { data, isLoading, isError, error, refetch } = useQuery<RecordingSettings | null>({
    queryKey: recordingKeys.settings(orgId || ''),
    queryFn: async () => {
      if (!orgId) return null;
      return recordingService.getRecordingSettings(orgId);
    },
    enabled: !!orgId,
    staleTime: 60000,
  });

  // Update settings mutation
  const updateMutation = useMutation({
    mutationFn: async (settings: Partial<RecordingSettings>) => {
      if (!orgId) throw new Error('No organization selected');
      return recordingService.updateRecordingSettings(orgId, settings);
    },
    onSuccess: (result) => {
      if (result) {
        toast.success('Settings updated');
        queryClient.invalidateQueries({ queryKey: recordingKeys.settings(orgId || '') });
      } else {
        toast.error('Failed to update settings');
      }
    },
    onError: (error) => {
      toast.error('Failed to update settings', {
        description: error instanceof Error ? error.message : 'Unknown error',
      });
    },
  });

  return {
    settings: data,
    isLoading,
    isError,
    error: error as Error | null,
    refetch,
    updateSettings: updateMutation.mutateAsync,
    isUpdating: updateMutation.isPending,
  };
}

// =============================================================================
// useRecordingRealtime - Real-time recording status updates
// =============================================================================

export function useRecordingRealtime(recordingId: string | null) {
  const queryClient = useQueryClient();
  const [status, setStatus] = useState<RecordingStatus | null>(null);

  useEffect(() => {
    if (!recordingId) return;

    // Subscribe to recording status changes
    const channel = supabase
      .channel(`recording_status_${recordingId}`)
      .on(
        'postgres_changes',
        {
          event: 'UPDATE',
          schema: 'public',
          table: 'recordings',
          filter: `id=eq.${recordingId}`,
        },
        (payload) => {
          const newStatus = payload.new.status as RecordingStatus;
          setStatus(newStatus);

          // Invalidate queries to refetch data
          queryClient.invalidateQueries({ queryKey: recordingKeys.detail(recordingId) });
          queryClient.invalidateQueries({ queryKey: recordingKeys.lists() });

          // Show toast for status changes
          switch (newStatus) {
            case 'bot_joining':
              toast.info('Bot is joining the meeting...');
              break;
            case 'recording':
              toast.success('Recording started');
              break;
            case 'processing':
              toast.info('Recording ended, processing...');
              break;
            case 'ready':
              toast.success('Recording ready!', {
                description: 'View transcript and insights.',
              });
              break;
            case 'failed':
              toast.error('Recording failed', {
                description: payload.new.error_message || 'An error occurred',
              });
              break;
          }
        }
      )
      .subscribe();

    return () => {
      channel.unsubscribe();
    };
  }, [recordingId, queryClient]);

  return { status };
}

// =============================================================================
// useActiveRecordings - Get currently active recordings
// =============================================================================

export function useActiveRecordings() {
  const activeOrgId = useActiveOrgId();
  const orgId = activeOrgId;

  const { data, isLoading, refetch } = useQuery<Recording[]>({
    queryKey: [...recordingKeys.lists(), 'active', orgId],
    queryFn: async () => {
      if (!orgId) return [];
      const result = await recordingService.listRecordings(orgId, {
        status: 'recording',
        limit: 50,
      });
      // Also get bot_joining status recordings
      const joiningResult = await recordingService.listRecordings(orgId, {
        status: 'bot_joining',
        limit: 50,
      });
      return [...result.recordings, ...joiningResult.recordings];
    },
    enabled: !!orgId,
    refetchInterval: 30000, // Refresh every 30 seconds
  });

  return {
    activeRecordings: data || [],
    isLoading,
    refetch,
    hasActiveRecordings: (data?.length || 0) > 0,
  };
}

// =============================================================================
// useRecordingsRequiringAttention - HITL recordings
// =============================================================================

export function useRecordingsRequiringAttention() {
  const activeOrgId = useActiveOrgId();
  const orgId = activeOrgId;

  const { data, isLoading, refetch } = useQuery<Recording[]>({
    queryKey: [...recordingKeys.lists(), 'hitl', orgId],
    queryFn: async () => {
      if (!orgId) return [];

      const { data, error } = await supabase
        .from('recordings')
        .select('*')
        .eq('org_id', orgId)
        .eq('hitl_required', true)
        .is('hitl_resolved_at', null)
        .order('created_at', { ascending: false })
        .limit(20);

      if (error) {
        console.error('[useRecordingsRequiringAttention] Error:', error);
        return [];
      }

      return data as Recording[];
    },
    enabled: !!orgId,
    staleTime: 30000,
  });

  return {
    recordings: data || [],
    count: data?.length || 0,
    isLoading,
    refetch,
  };
}

// =============================================================================
// useBatchVideoUrls - Batch fetch signed video/thumbnail URLs
// =============================================================================

export function useBatchVideoUrls(recordings: Recording[]) {
  // Only fetch URLs for ready recordings that have video in S3
  const readyIds = useMemo(
    () =>
      recordings
        .filter((r) => r.status === 'ready' && r.recording_s3_key)
        .map((r) => r.id),
    [recordings]
  );

  // Stable query key based on sorted IDs
  const queryKey = useMemo(
    () => [...recordingKeys.all, 'batch-urls', ...readyIds.slice().sort()],
    [readyIds]
  );

  return useQuery<Record<string, { video_url: string; thumbnail_url?: string }>>({
    queryKey,
    queryFn: () => recordingService.getBatchSignedUrls(readyIds),
    enabled: readyIds.length > 0,
    staleTime: 5 * 60 * 1000, // 5 minutes
    gcTime: 10 * 60 * 1000, // 10 minutes
  });
}
