/**
 * useSlackSettings Hook
 *
 * Manages Slack integration settings for organizations.
 * Handles CRUD operations for notification settings, channel selection, and user mappings.
 */

import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { supabase } from '@/lib/supabase/clientV2';
import { useOrg } from '@/lib/contexts/OrgContext';

// Types
export interface SlackOrgSettings {
  id: string;
  org_id: string;
  slack_team_id: string | null;
  slack_team_name: string | null;
  is_connected: boolean;
  connected_at: string | null;
  connected_by: string | null;
}

export interface SlackNotificationSettings {
  id: string;
  org_id: string;
  feature: SlackFeature;
  is_enabled: boolean;
  /**
   * Delivery target for Slack notifications.
   *
   * - channel: post to the configured Slack channel
   * - dm: send a DM (per-user where applicable)
   * - both: send to channel + DM
   *
   * Note: some features only meaningfully support a subset, but we keep this
   * shared to avoid feature-specific columns.
   */
  delivery_method: 'channel' | 'dm' | 'both';
  channel_id: string | null;
  channel_name: string | null;
  schedule_time: string | null;
  schedule_timezone: string | null;
  deal_value_threshold: number | null;
  deal_stage_threshold: string | null;
  stakeholder_slack_ids: string[] | null;
  /**
   * When delivery_method includes DM (meeting debriefs), which recipients should receive the DM?
   * - owner: the meeting owner only
   * - stakeholders: configured stakeholder_slack_ids only
   * - both: owner + stakeholders
   */
  dm_audience?: 'owner' | 'stakeholders' | 'both' | null;
  // Deal room closure behavior (when deal is signed/won or lost)
  deal_room_archive_mode?: 'immediate' | 'delayed' | null;
  deal_room_archive_delay_hours?: number | null;
}

export interface SlackUserMapping {
  id: string;
  org_id: string;
  slack_user_id: string;
  slack_username: string | null;
  slack_email: string | null;
  sixty_user_id: string | null;
}

export interface SlackChannel {
  id: string;
  name: string;
  is_private: boolean;
  num_members: number;
  is_member: boolean;
}

export type SlackFeature = 'meeting_debrief' | 'daily_digest' | 'meeting_prep' | 'deal_rooms'
  | 'agent_alert_engineering' | 'agent_alert_legal' | 'agent_alert_security'
  | 'agent_alert_pricing' | 'agent_alert_product' | 'agent_alert_competitive'
  | 'agent_alert_deal_risk' | 'agent_alert_default';

// Query keys
const QUERY_KEYS = {
  orgSettings: (orgId: string) => ['slack', 'org-settings', orgId],
  notificationSettings: (orgId: string) => ['slack', 'notification-settings', orgId],
  userMappings: (orgId: string) => ['slack', 'user-mappings', orgId],
  channels: (orgId: string) => ['slack', 'channels', orgId],
};

/**
 * Hook to get Slack org connection status
 */
export function useSlackOrgSettings() {
  const { activeOrgId } = useOrg();
  const orgId = activeOrgId;

  return useQuery({
    queryKey: QUERY_KEYS.orgSettings(orgId || ''),
    queryFn: async () => {
      if (!orgId) return null;

      // IMPORTANT:
      // slack_org_settings contains bot_access_token. Regular org members should be able to
      // read connection status, but must never be able to read the token.
      // We use a SECURITY DEFINER RPC that returns a safe subset of columns.
      const { data, error } = await supabase.rpc('get_slack_org_settings_public', {
        p_org_id: orgId,
      });

      if (error) {
        // Backward-compat fallback: if the RPC hasn't been deployed yet, read only safe columns.
        // NOTE: This relies on RLS allowing the caller to select these fields.
        const { data: row, error: rowError } = await (supabase.from('slack_org_settings') as any)
          .select('id, org_id, slack_team_id, slack_team_name, is_connected, connected_at, connected_by')
          .eq('org_id', orgId)
          .maybeSingle();

        if (rowError) throw rowError;
        return (row || null) as SlackOrgSettings | null;
      }

      // supabase.rpc returns an array for table-returning functions
      const row = Array.isArray(data) ? data[0] : data;
      return (row || null) as SlackOrgSettings | null;
    },
    enabled: !!orgId,
  });
}

/**
 * Hook to get all notification settings for the org
 */
export function useSlackNotificationSettings() {
  const { activeOrgId } = useOrg();
  const orgId = activeOrgId;

  return useQuery({
    queryKey: QUERY_KEYS.notificationSettings(orgId || ''),
    queryFn: async () => {
      if (!orgId) return [];

      // Using type assertion since slack tables aren't in generated types yet
      const { data, error } = await (supabase
        .from('slack_notification_settings') as any)
        .select('*')
        .eq('org_id', orgId);

      if (error) throw error;

      return (data || []) as SlackNotificationSettings[];
    },
    enabled: !!orgId,
  });
}

/**
 * Hook to update notification settings for a feature
 */
export function useUpdateNotificationSettings() {
  const { activeOrgId } = useOrg();
  const orgId = activeOrgId;
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async ({
      feature,
      settings,
    }: {
      feature: SlackFeature;
      settings: Partial<Omit<SlackNotificationSettings, 'id' | 'org_id' | 'feature'>>;
    }) => {
      if (!orgId) throw new Error('No org selected');

      // Check if settings exist
      // Using type assertion since slack tables aren't in generated types yet
      const { data: existing, error: existingError } = await (supabase
        .from('slack_notification_settings') as any)
        .select('id')
        .eq('org_id', orgId)
        .eq('feature', feature)
        .maybeSingle();

      if (existingError) throw existingError;

      if (existing) {
        // Update existing
        const { error } = await (supabase
          .from('slack_notification_settings') as any)
          .update({
            ...settings,
            updated_at: new Date().toISOString(),
          })
          .eq('id', existing.id);

        if (error) throw error;
      } else {
        // Insert new
        const { error } = await (supabase
          .from('slack_notification_settings') as any)
          .insert({
            org_id: orgId,
            feature,
            ...settings,
          });

        if (error) throw error;
      }
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: QUERY_KEYS.notificationSettings(orgId || '') });
    },
  });
}

/**
 * Hook to join the Slack bot to a public channel
 */
export function useJoinSlackChannel() {
  const { activeOrgId } = useOrg();
  const orgId = activeOrgId;
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async ({ channelId }: { channelId: string }) => {
      if (!orgId) throw new Error('No org selected');

      const { data, error } = await supabase.functions.invoke('slack-join-channel', {
        body: { orgId, channelId },
      });

      if (error) throw error;
      if (!data?.success) throw new Error(data?.error || 'Failed to join channel');

      return data as { success: true; channel: { id: string; name: string } };
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: QUERY_KEYS.channels(orgId || '') });
    },
  });
}

/**
 * Hook to get Slack channels
 */
export function useSlackChannels() {
  const { activeOrgId } = useOrg();
  const orgId = activeOrgId;

  return useQuery({
    queryKey: QUERY_KEYS.channels(orgId || ''),
    queryFn: async () => {
      if (!orgId) return [];

      const { data, error } = await supabase.functions.invoke('slack-list-channels', {
        body: { orgId },
      });

      if (error) throw error;
      if (!data.success) throw new Error(data.error);

      return (data.channels || []) as SlackChannel[];
    },
    enabled: !!orgId,
    staleTime: 5 * 60 * 1000, // Cache for 5 minutes
  });
}

/**
 * Hook to get user mappings
 */
export function useSlackUserMappings(options?: { enabled?: boolean }) {
  const { activeOrgId } = useOrg();
  const orgId = activeOrgId;

  return useQuery({
    queryKey: QUERY_KEYS.userMappings(orgId || ''),
    queryFn: async () => {
      if (!orgId) return [];

      // Using type assertion since slack tables aren't in generated types yet
      const { data, error } = await (supabase
        .from('slack_user_mappings') as any)
        .select('*')
        .eq('org_id', orgId);

      if (error) throw error;

      return (data || []) as SlackUserMapping[];
    },
    enabled: options?.enabled ?? !!orgId,
  });
}

/**
 * Hook to update user mapping
 */
export function useUpdateUserMapping() {
  const { activeOrgId } = useOrg();
  const orgId = activeOrgId;
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async ({
      slackUserId,
      sixtyUserId,
    }: {
      slackUserId: string;
      sixtyUserId: string | null;
    }) => {
      if (!orgId) throw new Error('No org selected');

      // Using type assertion since slack tables aren't in generated types yet
      const { error } = await (supabase
        .from('slack_user_mappings') as any)
        .update({
          sixty_user_id: sixtyUserId,
        })
        .eq('org_id', orgId)
        .eq('slack_user_id', slackUserId);

      if (error) throw error;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: QUERY_KEYS.userMappings(orgId || '') });
    },
  });
}

/**
 * Hook to send a test notification
 */
export function useSendTestNotification() {
  return useMutation({
    mutationFn: async ({
      feature,
      orgId,
      channelId,
      dmAudience,
      stakeholderSlackIds,
    }: {
      feature: SlackFeature;
      orgId: string;
      channelId?: string;
      dmAudience?: 'owner' | 'stakeholders' | 'both';
      stakeholderSlackIds?: string[];
    }) => {
      // External release: keep "test" safe + low-friction.
      // Some feature endpoints require real entity IDs (meetingId/dealId). For settings UX,
      // a simple bot-post verification is sufficient.
      const functionName = feature === 'daily_digest' ? 'slack-daily-digest' : 'slack-test-message';

      const { data, error } = await supabase.functions.invoke(functionName, {
        // For daily digests, ensure a "safe" test mode (e.g. avoid DMing the whole org).
        body: feature === 'daily_digest'
          ? { orgId, isTest: true, channelId, dmAudience, stakeholderSlackIds }
          : { orgId, channelId, dmAudience, stakeholderSlackIds },
      });

      if (error) throw error;

      // Check if the Slack API call actually succeeded
      if (!data?.success) {
        throw new Error(data?.error || 'Failed to send Slack notification');
      }

      return data;
    },
  });
}

/**
 * Hook to disconnect Slack
 */
export function useDisconnectSlack() {
  const { activeOrgId } = useOrg();
  const orgId = activeOrgId;
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async () => {
      if (!orgId) throw new Error('No org selected');

      // Using type assertion since slack tables aren't in generated types yet
      const { error } = await (supabase
        .from('slack_org_settings') as any)
        .update({
          is_connected: false,
          bot_access_token: null,
        })
        .eq('org_id', orgId);

      if (error) throw error;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: QUERY_KEYS.orgSettings(orgId || '') });
      queryClient.invalidateQueries({ queryKey: QUERY_KEYS.notificationSettings(orgId || '') });
    },
  });
}

/**
 * Hook to allow a user to map ONLY themselves to a Slack user in this org.
 * This is used by the Slack Settings page "Personal Slack" section.
 */
export function useSlackSelfMap() {
  const { activeOrgId } = useOrg();
  const orgId = activeOrgId;

  return useMutation({
    mutationFn: async ({ slackUserId }: { slackUserId?: string }) => {
      if (!orgId) throw new Error('No org selected');

      const { data, error } = await supabase.functions.invoke('slack-self-map', {
        body: { orgId, slackUserId: slackUserId || undefined },
      });

      if (error) throw error;
      if (!data?.success) throw new Error(data?.error || 'Failed to link Slack user');
      return data;
    },
  });
}
