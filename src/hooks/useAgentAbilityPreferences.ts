/**
 * useAgentAbilityPreferences Hook
 *
 * Manages user sequence preferences for orchestrator-backed abilities.
 * Provides enabled state, toggle functionality, and delivery channel
 * preferences backed by DB.
 */

import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { supabase } from '@/lib/supabase/clientV2';
import { useAuth } from '@/lib/contexts/AuthContext';
import { useActiveOrgId } from '@/lib/stores/orgStore';
import { toast } from 'sonner';

/**
 * Delivery channels stored in DB as JSONB.
 * Keys use underscores to match DB convention (in_app, not in-app).
 */
export interface DeliveryChannelsDB {
  slack: boolean;
  email: boolean;
  in_app: boolean;
}

interface SequencePreference {
  sequence_type: string;
  is_enabled: boolean;
  delivery_channel: string | null;
  delivery_channels: DeliveryChannelsDB | null;
  last_run_at: string | null;
  run_count: number;
}

export function useAgentAbilityPreferences() {
  const { user } = useAuth();
  const activeOrgId = useActiveOrgId();
  const queryClient = useQueryClient();

  // Fetch all sequence preferences for the user in the active org
  const { data: preferences = [], isLoading } = useQuery({
    queryKey: ['agent-ability-preferences', user?.id, activeOrgId],
    queryFn: async () => {
      if (!user?.id || !activeOrgId) return [];

      const { data, error } = await supabase.rpc(
        'get_user_sequence_preferences_for_org',
        {
          p_user_id: user.id,
          p_org_id: activeOrgId,
        }
      );

      if (error) {
        console.error('[useAgentAbilityPreferences] Error fetching preferences:', error);
        throw error;
      }

      return (data || []) as SequencePreference[];
    },
    enabled: !!user?.id && !!activeOrgId,
    staleTime: 30_000, // Cache for 30 seconds
  });

  // Mutation to toggle a sequence preference (enabled/disabled)
  const toggleMutation = useMutation({
    mutationFn: async ({
      sequenceType,
      isEnabled,
    }: {
      sequenceType: string;
      isEnabled: boolean;
    }) => {
      if (!user?.id || !activeOrgId) {
        throw new Error('User or org not available');
      }

      // Preserve existing delivery_channels when toggling enabled state
      const existingPref = preferences.find((p) => p.sequence_type === sequenceType);

      const { data, error } = await supabase.rpc(
        'update_user_sequence_preference',
        {
          p_user_id: user.id,
          p_org_id: activeOrgId,
          p_sequence_type: sequenceType,
          p_is_enabled: isEnabled,
          p_delivery_channel: null,
          p_delivery_channels: existingPref?.delivery_channels ?? null,
        }
      );

      if (error) {
        console.error('[useAgentAbilityPreferences] Error updating preference:', error);
        throw error;
      }

      return data;
    },
    onSuccess: (_, variables) => {
      // Invalidate preferences query to refetch
      queryClient.invalidateQueries({
        queryKey: ['agent-ability-preferences', user?.id, activeOrgId],
      });

      toast.success(
        variables.isEnabled
          ? 'Ability enabled'
          : 'Ability paused'
      );
    },
    onError: (error: any) => {
      console.error('[useAgentAbilityPreferences] Toggle failed:', error);
      toast.error('Failed to update ability preference');
    },
  });

  // Mutation to update delivery channels for a sequence
  const channelsMutation = useMutation({
    mutationFn: async ({
      sequenceType,
      deliveryChannels,
    }: {
      sequenceType: string;
      deliveryChannels: DeliveryChannelsDB;
    }) => {
      if (!user?.id || !activeOrgId) {
        throw new Error('User or org not available');
      }

      // Preserve existing is_enabled when updating channels
      const existingPref = preferences.find((p) => p.sequence_type === sequenceType);
      const currentEnabled = existingPref?.is_enabled ?? true;

      const { data, error } = await supabase.rpc(
        'update_user_sequence_preference',
        {
          p_user_id: user.id,
          p_org_id: activeOrgId,
          p_sequence_type: sequenceType,
          p_is_enabled: currentEnabled,
          p_delivery_channel: null,
          p_delivery_channels: deliveryChannels,
        }
      );

      if (error) {
        console.error('[useAgentAbilityPreferences] Error updating delivery channels:', error);
        throw error;
      }

      return data;
    },
    onMutate: async ({ sequenceType, deliveryChannels }) => {
      // Optimistic update: update the cache immediately
      await queryClient.cancelQueries({
        queryKey: ['agent-ability-preferences', user?.id, activeOrgId],
      });

      const previousPrefs = queryClient.getQueryData<SequencePreference[]>(
        ['agent-ability-preferences', user?.id, activeOrgId]
      );

      queryClient.setQueryData<SequencePreference[]>(
        ['agent-ability-preferences', user?.id, activeOrgId],
        (old = []) => {
          const existing = old.find((p) => p.sequence_type === sequenceType);
          if (existing) {
            return old.map((p) =>
              p.sequence_type === sequenceType
                ? { ...p, delivery_channels: deliveryChannels }
                : p
            );
          }
          return [
            ...old,
            {
              sequence_type: sequenceType,
              is_enabled: true,
              delivery_channel: null,
              delivery_channels: deliveryChannels,
            },
          ];
        }
      );

      return { previousPrefs };
    },
    onError: (error: any, _, context) => {
      // Rollback on error
      if (context?.previousPrefs) {
        queryClient.setQueryData(
          ['agent-ability-preferences', user?.id, activeOrgId],
          context.previousPrefs
        );
      }
      console.error('[useAgentAbilityPreferences] Channel update failed:', error);
      toast.error('Failed to update delivery channels');
    },
    onSettled: () => {
      // Refetch to ensure consistency
      queryClient.invalidateQueries({
        queryKey: ['agent-ability-preferences', user?.id, activeOrgId],
      });
    },
  });

  /**
   * Check if a sequence type is enabled.
   * Returns true by default if no preference exists (opt-out pattern).
   */
  const isEnabled = (sequenceType: string): boolean => {
    const pref = preferences.find((p) => p.sequence_type === sequenceType);
    // If no preference exists, default to enabled (opt-out pattern)
    return pref?.is_enabled ?? true;
  };

  /**
   * Get delivery channels for a sequence type.
   * Returns null if no preference exists (caller should use ability defaults).
   */
  const getDeliveryChannels = (sequenceType: string): DeliveryChannelsDB | null => {
    const pref = preferences.find((p) => p.sequence_type === sequenceType);
    return pref?.delivery_channels ?? null;
  };

  /**
   * Toggle a sequence preference.
   */
  const toggleEnabled = async (sequenceType: string, enabled: boolean) => {
    await toggleMutation.mutateAsync({ sequenceType, isEnabled: enabled });
  };

  /**
   * Update delivery channels for a sequence type.
   */
  const updateDeliveryChannels = async (
    sequenceType: string,
    deliveryChannels: DeliveryChannelsDB
  ) => {
    await channelsMutation.mutateAsync({ sequenceType, deliveryChannels });
  };

  /**
   * Get the last_run_at timestamp for a sequence type.
   */
  const getLastRunAt = (sequenceType: string): string | null => {
    const pref = preferences.find((p) => p.sequence_type === sequenceType);
    return pref?.last_run_at ?? null;
  };

  /**
   * Get the run_count for a sequence type.
   */
  const getRunCount = (sequenceType: string): number => {
    const pref = preferences.find((p) => p.sequence_type === sequenceType);
    return pref?.run_count ?? 0;
  };

  return {
    preferences,
    isLoading,
    isEnabled,
    toggleEnabled,
    isToggling: toggleMutation.isPending,
    getDeliveryChannels,
    updateDeliveryChannels,
    isUpdatingChannels: channelsMutation.isPending,
    getLastRunAt,
    getRunCount,
  };
}
