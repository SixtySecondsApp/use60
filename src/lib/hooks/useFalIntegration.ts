/**
 * useFalIntegration Hook
 *
 * Manages fal.ai integration status for the active organisation.
 * Supports BYOK (bring-your-own-key) and platform-key modes.
 */

import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { supabase } from '@/lib/supabase/clientV2';
import { useAuth } from '@/lib/contexts/AuthContext';
import { useActiveOrgId } from '@/lib/stores/orgStore';
import { toast } from 'sonner';

// =============================================================================
// Types
// =============================================================================

export interface FalVideoModel {
  id: string;
  display_name: string;
  provider: string;
  mode: 'text-to-video' | 'image-to-video' | 'both';
  cost_per_second: number;
  credit_cost_per_second: number;
  max_duration_seconds: number;
  supported_aspect_ratios: string[];
  supports_audio: boolean;
  is_active: boolean;
  sort_order: number;
}

export interface FalIntegrationStatus {
  // Connection state
  isConfigured: boolean;
  mode: 'byok' | 'platform' | 'none';
  isLoading: boolean;

  // Actions
  connectApiKey: (apiKey: string) => Promise<boolean>;
  disconnectApiKey: () => Promise<void>;
  testConnection: (apiKey: string) => Promise<boolean>;

  // Models
  models: FalVideoModel[];
  modelsLoading: boolean;
  refreshModels: () => void;
}

// =============================================================================
// Query Keys
// =============================================================================

const falKeys = {
  all: ['fal-integration'] as const,
  status: (orgId: string) => [...falKeys.all, 'status', orgId] as const,
  models: () => [...falKeys.all, 'models'] as const,
};

// =============================================================================
// Hook
// =============================================================================

export function useFalIntegration(): FalIntegrationStatus {
  const { user, isAuthenticated } = useAuth();
  const activeOrgId = useActiveOrgId();
  const queryClient = useQueryClient();

  // ---------------------------------------------------------------------------
  // Status query
  // ---------------------------------------------------------------------------

  const {
    data: statusData,
    isLoading: statusLoading,
  } = useQuery({
    queryKey: falKeys.status(activeOrgId || ''),
    queryFn: async () => {
      if (!activeOrgId) return { configured: false, mode: 'none' as const };

      const { data, error } = await supabase.functions.invoke('fal-router', {
        body: { action: 'get_status' },
      });

      if (error) {
        console.error('[useFalIntegration] status error:', error);
        return { configured: false, mode: 'none' as const };
      }

      return {
        configured: data?.configured ?? false,
        mode: (data?.mode ?? 'none') as 'byok' | 'platform' | 'none',
      };
    },
    enabled: !!activeOrgId && isAuthenticated && !!user,
    staleTime: 60_000,
  });

  // ---------------------------------------------------------------------------
  // Models query
  // ---------------------------------------------------------------------------

  const {
    data: modelsData,
    isLoading: modelsLoading,
    refetch: refetchModels,
  } = useQuery({
    queryKey: falKeys.models(),
    queryFn: async () => {
      const { data, error } = await supabase.functions.invoke('fal-router', {
        body: { action: 'list_models' },
      });

      if (error) {
        console.error('[useFalIntegration] list_models error:', error);
        return [] as FalVideoModel[];
      }

      return (data?.models ?? []) as FalVideoModel[];
    },
    staleTime: 5 * 60_000,
  });

  // ---------------------------------------------------------------------------
  // Connect mutation
  // ---------------------------------------------------------------------------

  const connectMutation = useMutation({
    mutationFn: async (apiKey: string): Promise<boolean> => {
      if (!activeOrgId) throw new Error('No active organization');
      if (!isAuthenticated) throw new Error('Please sign in');

      const { data, error } = await supabase.functions.invoke('fal-router', {
        body: { action: 'save_credentials', api_key: apiKey },
      });

      if (error) throw new Error(error.message || 'Failed to save fal.ai API key');
      if (data?.error) throw new Error(data.error);

      return true;
    },
    onSuccess: () => {
      toast.success('fal.ai connected');
      queryClient.invalidateQueries({ queryKey: falKeys.status(activeOrgId || '') });
    },
    onError: (error) => {
      toast.error('Failed to connect fal.ai', {
        description: error instanceof Error ? error.message : 'Unknown error',
      });
    },
  });

  // ---------------------------------------------------------------------------
  // Disconnect mutation
  // ---------------------------------------------------------------------------

  const disconnectMutation = useMutation({
    mutationFn: async (): Promise<void> => {
      if (!activeOrgId) throw new Error('No active organization');

      const { data, error } = await supabase.functions.invoke('fal-router', {
        body: { action: 'delete_credentials' },
      });

      if (error) throw new Error(error.message || 'Failed to remove fal.ai credentials');
      if (data?.error) throw new Error(data.error);
    },
    onSuccess: () => {
      toast.success('Switched to platform key');
      queryClient.invalidateQueries({ queryKey: falKeys.status(activeOrgId || '') });
    },
    onError: (error) => {
      toast.error('Failed to disconnect fal.ai', {
        description: error instanceof Error ? error.message : 'Unknown error',
      });
    },
  });

  // ---------------------------------------------------------------------------
  // Test connection (imperative — not a mutation, returns a boolean)
  // ---------------------------------------------------------------------------

  const testConnection = async (apiKey: string): Promise<boolean> => {
    try {
      const { data, error } = await supabase.functions.invoke('fal-router', {
        body: { action: 'test_credentials', api_key: apiKey },
      });

      if (error) return false;
      return data?.success ?? false;
    } catch {
      return false;
    }
  };

  // ---------------------------------------------------------------------------
  // Derived values
  // ---------------------------------------------------------------------------

  const isConfigured = statusData?.configured ?? false;
  const mode = statusData?.mode ?? 'none';
  const isLoading = statusLoading;
  const models = modelsData ?? [];

  // ---------------------------------------------------------------------------
  // Stable action wrappers
  // ---------------------------------------------------------------------------

  const connectApiKey = async (apiKey: string): Promise<boolean> => {
    return connectMutation.mutateAsync(apiKey);
  };

  const disconnectApiKey = async (): Promise<void> => {
    return disconnectMutation.mutateAsync();
  };

  const refreshModels = () => {
    void refetchModels();
  };

  return {
    isConfigured,
    mode,
    isLoading,
    connectApiKey,
    disconnectApiKey,
    testConnection,
    models,
    modelsLoading,
    refreshModels,
  };
}
