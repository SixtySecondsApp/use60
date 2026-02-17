/**
 * useAlertPreferences Hook
 * Story: PIPE-021 - User-configurable alert thresholds in settings
 *
 * Manages user preferences for deal health alerts stored in user_settings table
 */

import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { supabase } from '@/lib/supabase/clientV2';
import { useAuth } from '@clerk/clerk-react';
import { toast } from 'sonner';

// =============================================================================
// Types
// =============================================================================

export type AlertType =
  | 'health_drop'
  | 'ghost_risk'
  | 'no_activity'
  | 'stage_stall'
  | 'sentiment_decline'
  | 'close_date_risk';

export type AlertChannel = 'in_app' | 'slack_and_in_app' | 'none';

export type AlertSeverity = 'info' | 'warning' | 'critical';

export interface AlertTypePreference {
  enabled: boolean;
  channel: AlertChannel;
}

export interface AlertPreferences {
  // Per-alert-type preferences
  health_drop?: AlertTypePreference;
  ghost_risk?: AlertTypePreference;
  no_activity?: AlertTypePreference;
  stage_stall?: AlertTypePreference;
  sentiment_decline?: AlertTypePreference;
  close_date_risk?: AlertTypePreference;

  // Global severity threshold
  severity_threshold: AlertSeverity;
}

// Default preferences
const DEFAULT_PREFERENCES: AlertPreferences = {
  health_drop: { enabled: true, channel: 'slack_and_in_app' },
  ghost_risk: { enabled: true, channel: 'slack_and_in_app' },
  no_activity: { enabled: true, channel: 'in_app' },
  stage_stall: { enabled: true, channel: 'in_app' },
  sentiment_decline: { enabled: true, channel: 'in_app' },
  close_date_risk: { enabled: true, channel: 'slack_and_in_app' },
  severity_threshold: 'warning',
};

// =============================================================================
// Query Key
// =============================================================================

const QUERY_KEY = 'alert-preferences';

// =============================================================================
// Hook
// =============================================================================

export function useAlertPreferences() {
  const { userId } = useAuth();
  const queryClient = useQueryClient();

  // Fetch current preferences from user_settings
  const { data: preferences = DEFAULT_PREFERENCES, isLoading } = useQuery({
    queryKey: [QUERY_KEY, userId],
    queryFn: async () => {
      if (!userId) return DEFAULT_PREFERENCES;

      const { data, error } = await supabase
        .from('user_settings')
        .select('preferences')
        .eq('user_id', userId)
        .maybeSingle();

      if (error) throw error;

      // Extract alert preferences from preferences JSONB column
      const prefs = data?.preferences as any;
      const alertPrefs = prefs?.deal_health_alerts || {};

      // Merge with defaults
      return {
        health_drop: alertPrefs.health_drop || DEFAULT_PREFERENCES.health_drop,
        ghost_risk: alertPrefs.ghost_risk || DEFAULT_PREFERENCES.ghost_risk,
        no_activity: alertPrefs.no_activity || DEFAULT_PREFERENCES.no_activity,
        stage_stall: alertPrefs.stage_stall || DEFAULT_PREFERENCES.stage_stall,
        sentiment_decline: alertPrefs.sentiment_decline || DEFAULT_PREFERENCES.sentiment_decline,
        close_date_risk: alertPrefs.close_date_risk || DEFAULT_PREFERENCES.close_date_risk,
        severity_threshold: alertPrefs.severity_threshold || DEFAULT_PREFERENCES.severity_threshold,
      } as AlertPreferences;
    },
    enabled: !!userId,
  });

  // Update preferences mutation
  const updatePreferences = useMutation({
    mutationFn: async (newPreferences: Partial<AlertPreferences>) => {
      if (!userId) throw new Error('User not authenticated');

      // Get current user_settings
      const { data: currentSettings } = await supabase
        .from('user_settings')
        .select('preferences')
        .eq('user_id', userId)
        .maybeSingle();

      const currentPrefs = (currentSettings?.preferences as any) || {};

      // Merge new preferences with existing
      const updatedPrefs = {
        ...currentPrefs,
        deal_health_alerts: {
          ...(currentPrefs.deal_health_alerts || {}),
          ...newPreferences,
        },
      };

      // Upsert to user_settings
      const { error } = await supabase
        .from('user_settings')
        .upsert(
          {
            user_id: userId,
            preferences: updatedPrefs,
            updated_at: new Date().toISOString(),
          },
          {
            onConflict: 'user_id',
          }
        );

      if (error) throw error;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: [QUERY_KEY, userId] });
      toast.success('Alert preferences saved');
    },
    onError: (error: Error) => {
      toast.error(`Failed to save preferences: ${error.message}`);
    },
  });

  // Helper: Update a single alert type preference
  const updateAlertType = (alertType: AlertType, preference: AlertTypePreference) => {
    updatePreferences.mutate({ [alertType]: preference });
  };

  // Helper: Update global severity threshold
  const updateSeverityThreshold = (severity: AlertSeverity) => {
    updatePreferences.mutate({ severity_threshold: severity });
  };

  return {
    preferences,
    isLoading,
    updatePreferences: updatePreferences.mutate,
    updateAlertType,
    updateSeverityThreshold,
    isUpdating: updatePreferences.isPending,
  };
}
