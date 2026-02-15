/**
 * useAgentAbilityPreferences Hook
 *
 * Manages user sequence preferences for orchestrator-backed abilities.
 * Provides enabled state and toggle functionality backed by DB.
 */

import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { supabase } from '@/lib/supabase/clientV2';
import { useAuth } from '@/lib/contexts/AuthContext';
import { useActiveOrgId } from '@/lib/stores/orgStore';
import { toast } from 'sonner';

interface SequencePreference {
  sequence_type: string;
  is_enabled: boolean;
  delivery_channel: string | null;
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

  // Mutation to toggle a sequence preference
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

      const { data, error } = await supabase.rpc(
        'update_user_sequence_preference',
        {
          p_user_id: user.id,
          p_org_id: activeOrgId,
          p_sequence_type: sequenceType,
          p_is_enabled: isEnabled,
          p_delivery_channel: null, // For now, keep delivery_channel as null (inherit org default)
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
   * Toggle a sequence preference.
   */
  const toggleEnabled = async (sequenceType: string, enabled: boolean) => {
    await toggleMutation.mutateAsync({ sequenceType, isEnabled: enabled });
  };

  return {
    preferences,
    isLoading,
    isEnabled,
    toggleEnabled,
    isToggling: toggleMutation.isPending,
  };
}
