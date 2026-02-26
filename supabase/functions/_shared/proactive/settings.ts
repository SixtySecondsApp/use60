/**
 * Proactive Notification Settings
 * 
 * Reads org-level Slack settings and feature configurations.
 */

import { SupabaseClient } from 'https://esm.sh/@supabase/supabase-js@2.43.4';
import type { ProactiveNotificationType } from './types.ts';

export interface SlackOrgSettings {
  orgId: string;
  botAccessToken: string;
  slackTeamId: string;
  isConnected: boolean;
}

export interface NotificationFeatureSettings {
  isEnabled: boolean;
  deliveryMethod?: 'dm' | 'channel';
  targetChannelId?: string;
  schedule?: string;
  thresholds?: Record<string, any>;
}

/**
 * Get Slack org settings
 */
export async function getSlackOrgSettings(
  supabase: SupabaseClient,
  orgId: string
): Promise<SlackOrgSettings | null> {
  const { data, error } = await supabase
    .from('slack_org_settings')
    .select('org_id, bot_access_token, slack_team_id, is_connected')
    .eq('org_id', orgId)
    .eq('is_connected', true)
    .maybeSingle();

  if (error || !data) {
    return null;
  }

  return {
    orgId: data.org_id,
    botAccessToken: data.bot_access_token,
    slackTeamId: data.slack_team_id,
    isConnected: data.is_connected,
  };
}

/**
 * Get notification feature settings
 */
export async function getNotificationFeatureSettings(
  supabase: SupabaseClient,
  orgId: string,
  feature: ProactiveNotificationType
): Promise<NotificationFeatureSettings | null> {
  const { data, error } = await supabase
    .from('slack_notification_settings')
    .select('*')
    .eq('org_id', orgId)
    .eq('feature', feature)
    .maybeSingle();

  if (error || !data) {
    return null;
  }

  return {
    isEnabled: data.is_enabled || false,
    deliveryMethod: data.delivery_method as 'dm' | 'channel' | undefined,
    targetChannelId: data.target_channel_id || undefined,
    schedule: data.schedule || undefined,
    thresholds: data.thresholds || {},
  };
}

/**
 * Get all enabled notification features for an org
 */
export async function getEnabledNotificationFeatures(
  supabase: SupabaseClient,
  orgId: string
): Promise<ProactiveNotificationType[]> {
  const { data, error } = await supabase
    .from('slack_notification_settings')
    .select('feature')
    .eq('org_id', orgId)
    .eq('is_enabled', true);

  if (error || !data) {
    return [];
  }

  return data.map(row => row.feature as ProactiveNotificationType);
}
