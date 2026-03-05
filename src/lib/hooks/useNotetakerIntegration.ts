/**
 * useNotetakerIntegration Hook
 *
 * Manages the 60 Notetaker integration state.
 * - Org-level: Whether the feature is enabled/purchased for the organization
 * - Per-user: Whether the user has enabled it for their meetings
 *
 * Requires Google Calendar to be connected for the notetaker to work.
 */

import { useState, useEffect, useCallback } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { supabase } from '@/lib/supabase/clientV2';
import { useAuth } from '@/lib/contexts/AuthContext';
import { useActiveOrgId } from '@/lib/stores/orgStore';
import { useGoogleIntegration } from '@/lib/stores/integrationStore';
import { toast } from 'sonner';

// =============================================================================
// Types
// =============================================================================

export interface NotetakerUserSettings {
  id: string;
  user_id: string;
  org_id: string;
  is_enabled: boolean;
  auto_record_external: boolean;
  auto_record_internal: boolean;
  notify_before_join: boolean;
  notify_minutes_before: number;
  selected_calendar_id: string; // Google Calendar ID to watch - defaults to 'primary'
  created_at: string;
  updated_at: string;
}

export interface NotetakerOrgSettings {
  notetaker_enabled: boolean;
  notetaker_bot_name: string | null;
  notetaker_bot_image_url: string | null;
}

// =============================================================================
// Query Keys
// =============================================================================

const notetakerKeys = {
  all: ['notetaker'] as const,
  userSettings: (userId: string, orgId: string) =>
    [...notetakerKeys.all, 'user-settings', userId, orgId] as const,
  orgSettings: (orgId: string) =>
    [...notetakerKeys.all, 'org-settings', orgId] as const,
};

// =============================================================================
// Hook
// =============================================================================

export function useNotetakerIntegration() {
  const { user } = useAuth();
  const activeOrgId = useActiveOrgId();
  const queryClient = useQueryClient();
  const {
    isConnected: googleConnected,
    status: googleStatus,
    email: googleEmail,
    isLoading: googleLoading,
    lastSync: googleLastSync,
    checkConnection: checkGoogleConnection,
  } = useGoogleIntegration();

  const userId = user?.id;
  const orgId = activeOrgId;

  /**
   * Fix: Notetaker Settings can be opened without ever visiting /integrations.
   * The Google integration Zustand store defaults to disconnected until a check runs.
   * Trigger a lightweight connection check on mount so we don't show a false "connect Google" state.
   */
  useEffect(() => {
    if (!userId) return;
    // Only check once on mount - don't re-check on state changes to avoid loops
    void checkGoogleConnection();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [userId]); // Only run when userId becomes available

  // Fetch org-level settings (from organizations.recording_settings JSONB column)
  const {
    data: orgSettings,
    isLoading: orgSettingsLoading,
    error: orgSettingsError,
  } = useQuery<NotetakerOrgSettings | null>({
    queryKey: notetakerKeys.orgSettings(orgId || ''),
    queryFn: async () => {
      if (!orgId) return null;

      const { data, error } = await supabase
        .from('organizations')
        .select('recording_settings')
        .eq('id', orgId)
        .maybeSingle();

      if (error) {
        console.error('[useNotetakerIntegration] Error fetching org settings:', error);
        return null;
      }

      if (!data?.recording_settings) {
        return null;
      }

      // Extract settings from JSONB column
      const settings = data.recording_settings as {
        recordings_enabled?: boolean;
        bot_name?: string;
        bot_image_url?: string | null;
      };

      return {
        notetaker_enabled: settings.recordings_enabled ?? false,
        notetaker_bot_name: settings.bot_name ?? '60 Notetaker',
        notetaker_bot_image_url: settings.bot_image_url ?? null,
      };
    },
    enabled: !!orgId,
    staleTime: 60000,
  });

  // Fetch per-user settings
  const {
    data: userSettings,
    isLoading: userSettingsLoading,
    error: userSettingsError,
    refetch: refetchUserSettings,
  } = useQuery<NotetakerUserSettings | null>({
    queryKey: notetakerKeys.userSettings(userId || '', orgId || ''),
    queryFn: async () => {
      if (!userId || !orgId) return null;

      const { data, error } = await supabase
        .from('notetaker_user_settings')
        .select('*')
        .eq('user_id', userId)
        .eq('org_id', orgId)
        .maybeSingle();

      if (error) {
        // Table might not exist yet - that's okay
        if (error.code === '42P01') {
          console.log('[useNotetakerIntegration] notetaker_user_settings table does not exist yet');
          return null;
        }
        console.error('[useNotetakerIntegration] Error fetching user settings:', error);
        return null;
      }

      return data as NotetakerUserSettings | null;
    },
    enabled: !!userId && !!orgId,
    staleTime: 60000,
  });

  // Enable notetaker for the user
  const enableMutation = useMutation({
    mutationFn: async () => {
      if (!userId || !orgId) throw new Error('Not authenticated');

      // Check if org has notetaker enabled
      if (!orgSettings?.notetaker_enabled) {
        throw new Error('60 Notetaker is not enabled for your organization');
      }

      // Check if Google Calendar is connected
      if (!googleConnected) {
        throw new Error('Please connect Google Calendar first');
      }

      // Upsert user settings
      const { data, error } = await supabase
        .from('notetaker_user_settings')
        .upsert({
          user_id: userId,
          org_id: orgId,
          is_enabled: true,
          auto_record_external: true,
          auto_record_internal: false,
          notify_before_join: true,
          notify_minutes_before: 5,
          selected_calendar_id: 'primary',
          updated_at: new Date().toISOString(),
        }, {
          onConflict: 'user_id,org_id',
        })
        .select()
        .single();

      if (error) throw error;
      return data;
    },
    onSuccess: () => {
      toast.success('60 Notetaker enabled', {
        description: 'Your meetings will be automatically recorded.',
      });
      queryClient.invalidateQueries({ queryKey: notetakerKeys.userSettings(userId || '', orgId || '') });
    },
    onError: (error) => {
      toast.error('Failed to enable 60 Notetaker', {
        description: error instanceof Error ? error.message : 'Unknown error',
      });
    },
  });

  // Disable notetaker for the user
  const disableMutation = useMutation({
    mutationFn: async () => {
      if (!userId || !orgId) throw new Error('Not authenticated');

      const { error } = await supabase
        .from('notetaker_user_settings')
        .update({
          is_enabled: false,
          updated_at: new Date().toISOString(),
        })
        .eq('user_id', userId)
        .eq('org_id', orgId);

      if (error) throw error;
    },
    onSuccess: () => {
      toast.success('60 Notetaker disabled', {
        description: 'Automatic recording has been turned off.',
      });
      queryClient.invalidateQueries({ queryKey: notetakerKeys.userSettings(userId || '', orgId || '') });
    },
    onError: (error) => {
      toast.error('Failed to disable 60 Notetaker', {
        description: error instanceof Error ? error.message : 'Unknown error',
      });
    },
  });

  // Update user settings — upsert so it works even if no row exists yet
  const updateSettingsMutation = useMutation({
    mutationFn: async (updates: Partial<NotetakerUserSettings>) => {
      if (!userId || !orgId) throw new Error('Not authenticated');

      const { data, error } = await supabase
        .from('notetaker_user_settings')
        .upsert({
          user_id: userId,
          org_id: orgId,
          ...updates,
          updated_at: new Date().toISOString(),
        }, {
          onConflict: 'user_id,org_id',
        })
        .select()
        .single();

      if (error) throw error;
      return data;
    },
    onSuccess: () => {
      toast.success('Settings updated');
      queryClient.invalidateQueries({ queryKey: notetakerKeys.userSettings(userId || '', orgId || '') });
    },
    onError: (error) => {
      toast.error('Failed to update settings', {
        description: error instanceof Error ? error.message : 'Unknown error',
      });
    },
  });

  // Enable notetaker for the organization (admin only)
  const enableOrgMutation = useMutation({
    mutationFn: async () => {
      if (!orgId) throw new Error('No organization selected');

      // Get current recording_settings
      const { data: org, error: fetchError } = await supabase
        .from('organizations')
        .select('recording_settings')
        .eq('id', orgId)
        .single();

      if (fetchError) throw fetchError;

      // Merge with existing settings
      const currentSettings = (org?.recording_settings as Record<string, unknown>) || {};
      const updatedSettings = {
        ...currentSettings,
        recordings_enabled: true,
      };

      // Update the organization
      const { error: updateError } = await supabase
        .from('organizations')
        .update({ recording_settings: updatedSettings })
        .eq('id', orgId);

      if (updateError) throw updateError;
    },
    onSuccess: () => {
      toast.success('60 Notetaker enabled for organization', {
        description: 'Team members can now enable it for their meetings.',
      });
      queryClient.invalidateQueries({ queryKey: notetakerKeys.orgSettings(orgId || '') });
    },
    onError: (error) => {
      toast.error('Failed to enable 60 Notetaker', {
        description: error instanceof Error ? error.message : 'Unknown error',
      });
    },
  });

  // Disable notetaker for the organization (admin only)
  const disableOrgMutation = useMutation({
    mutationFn: async () => {
      if (!orgId) throw new Error('No organization selected');

      // Get current recording_settings
      const { data: org, error: fetchError } = await supabase
        .from('organizations')
        .select('recording_settings')
        .eq('id', orgId)
        .single();

      if (fetchError) throw fetchError;

      // Merge with existing settings
      const currentSettings = (org?.recording_settings as Record<string, unknown>) || {};
      const updatedSettings = {
        ...currentSettings,
        recordings_enabled: false,
      };

      // Update the organization
      const { error: updateError } = await supabase
        .from('organizations')
        .update({ recording_settings: updatedSettings })
        .eq('id', orgId);

      if (updateError) throw updateError;
    },
    onSuccess: () => {
      toast.success('60 Notetaker disabled for organization');
      queryClient.invalidateQueries({ queryKey: notetakerKeys.orgSettings(orgId || '') });
    },
    onError: (error) => {
      toast.error('Failed to disable 60 Notetaker', {
        description: error instanceof Error ? error.message : 'Unknown error',
      });
    },
  });

  // Computed states
  const isLoading = orgSettingsLoading || userSettingsLoading || googleLoading || googleStatus === 'refreshing';
  const isOrgEnabled = orgSettings?.notetaker_enabled ?? false;
  const isUserEnabled = userSettings?.is_enabled ?? false;
  const isConnected = isOrgEnabled && isUserEnabled && googleConnected;
  const needsCalendar = isOrgEnabled && !googleConnected && !googleLoading && googleStatus !== 'refreshing';
  const needsUserSetup = isOrgEnabled && googleConnected && !isUserEnabled;

  // Determine overall status
  const getStatus = (): 'active' | 'inactive' | 'needs_setup' | 'unavailable' => {
    if (!isOrgEnabled) return 'unavailable';
    if (!googleConnected) return 'needs_setup';
    if (!isUserEnabled) return 'inactive';
    return 'active';
  };

  return {
    // State
    isLoading,
    isConnected,
    isOrgEnabled,
    isUserEnabled,
    needsCalendar,
    needsUserSetup,
    status: getStatus(),

    // Settings
    orgSettings,
    userSettings,

    // Calendar dependency
    googleConnected,
    googleEmail,
    googleStatus,
    googleLoading,

    // User-level actions
    enable: enableMutation.mutateAsync,
    disable: disableMutation.mutateAsync,
    updateSettings: updateSettingsMutation.mutateAsync,
    refetch: refetchUserSettings,

    // Org-level actions (admin only)
    enableOrg: enableOrgMutation.mutateAsync,
    disableOrg: disableOrgMutation.mutateAsync,

    // Loading states
    isEnabling: enableMutation.isPending,
    isDisabling: disableMutation.isPending,
    isUpdating: updateSettingsMutation.isPending,
    isEnablingOrg: enableOrgMutation.isPending,
    isDisablingOrg: disableOrgMutation.isPending,
  };
}
