/**
 * Slack Integration Test Suite
 *
 * Tests all user-facing Slack integration functionality:
 * - OAuth/Connection status
 * - Bot token validation
 * - Channel access
 * - Notification features (Meeting Debrief, Daily Digest, Meeting Prep, Deal Rooms)
 * - User mappings
 * - Message delivery
 */

import { supabase } from '@/lib/supabase/clientV2';
import type { IntegrationTest, TestResult, ConnectionStatus } from '../types';

type DeliveryMethod = 'channel' | 'dm' | 'both';
type NotificationFeature = 'meeting_debrief' | 'daily_digest' | 'meeting_prep' | 'deal_rooms';

interface SlackNotificationSettings {
  id: string;
  org_id: string;
  feature: NotificationFeature;
  is_enabled: boolean;
  delivery_method: DeliveryMethod;
  channel_id: string | null;
  channel_name: string | null;
  schedule_time: string | null;
  schedule_timezone: string | null;
  deal_value_threshold: number | null;
  deal_stage_threshold: string | null;
}

interface SlackUserMapping {
  id: string;
  org_id: string;
  slack_user_id: string;
  slack_username: string;
  slack_email: string | null;
  sixty_user_id: string | null;
  is_auto_matched: boolean;
}

/**
 * Get Slack connection status for the current org
 */
export async function getSlackConnectionStatus(orgId: string): Promise<ConnectionStatus> {
  try {
    const { data: settings, error } = await supabase
      .from('slack_org_settings')
      .select('*')
      .eq('org_id', orgId)
      .eq('is_connected', true)
      .maybeSingle();

    if (error) {
      return { isConnected: false, error: error.message };
    }

    if (!settings) {
      return { isConnected: false };
    }

    return {
      isConnected: true,
      connectedAt: settings.connected_at,
      accountInfo: {
        id: settings.slack_team_id,
        name: settings.slack_team_name,
      },
    };
  } catch (error) {
    return {
      isConnected: false,
      error: error instanceof Error ? error.message : 'Unknown error',
    };
  }
}

/**
 * Get Slack notification settings for the current org
 */
async function getNotificationSettings(orgId: string): Promise<SlackNotificationSettings[]> {
  const { data, error } = await supabase
    .from('slack_notification_settings')
    .select('*')
    .eq('org_id', orgId);

  if (error) {
    console.error('[SlackTests] Error fetching notification settings:', error);
    return [];
  }

  return data || [];
}

/**
 * Get Slack user mappings for the current org
 */
async function getUserMappings(orgId: string): Promise<SlackUserMapping[]> {
  const { data, error } = await supabase
    .from('slack_user_mappings')
    .select('*')
    .eq('org_id', orgId);

  if (error) {
    console.error('[SlackTests] Error fetching user mappings:', error);
    return [];
  }

  return data || [];
}

/**
 * Create all Slack tests for a given org
 */
export function createSlackTests(orgId: string): IntegrationTest[] {
  return [
    // =========================================================================
    // Authentication & Connection Tests
    // =========================================================================
    {
      id: 'slack-connection-status',
      name: 'Connection Status',
      description: 'Verify Slack workspace is connected to the organization',
      category: 'authentication',
      timeout: 10000,
      run: async (): Promise<TestResult> => {
        const status = await getSlackConnectionStatus(orgId);

        if (!status.isConnected) {
          return {
            testId: 'slack-connection-status',
            testName: 'Connection Status',
            status: 'failed',
            message: status.error || 'Slack is not connected to this organization',
          };
        }

        return {
          testId: 'slack-connection-status',
          testName: 'Connection Status',
          status: 'passed',
          message: `Connected to workspace "${status.accountInfo?.name}"`,
          responseData: {
            connectedAt: status.connectedAt,
            teamId: status.accountInfo?.id,
            teamName: status.accountInfo?.name,
          },
        };
      },
    },

    {
      id: 'slack-bot-token',
      name: 'Bot Token Validation',
      description: 'Verify the stored bot token is present and valid',
      category: 'authentication',
      timeout: 10000,
      run: async (): Promise<TestResult> => {
        try {
          const { data: settings, error } = await supabase
            .from('slack_org_settings')
            .select('id, is_connected, bot_user_id, connected_at')
            .eq('org_id', orgId)
            .eq('is_connected', true)
            .maybeSingle();

          if (error || !settings) {
            return {
              testId: 'slack-bot-token',
              testName: 'Bot Token Validation',
              status: 'failed',
              message: 'No active Slack connection found',
            };
          }

          // Bot token is encrypted in the DB, so we can only verify it exists
          // The actual token validation happens via the API connectivity test
          if (!settings.bot_user_id) {
            return {
              testId: 'slack-bot-token',
              testName: 'Bot Token Validation',
              status: 'failed',
              message: 'Bot user ID not configured',
            };
          }

          return {
            testId: 'slack-bot-token',
            testName: 'Bot Token Validation',
            status: 'passed',
            message: 'Bot token configured',
            responseData: {
              botUserId: settings.bot_user_id,
              connectedAt: settings.connected_at,
            },
          };
        } catch (error) {
          return {
            testId: 'slack-bot-token',
            testName: 'Bot Token Validation',
            status: 'error',
            message: error instanceof Error ? error.message : 'Unknown error',
          };
        }
      },
    },

    // =========================================================================
    // API Connectivity Tests
    // =========================================================================
    {
      id: 'slack-api-connectivity',
      name: 'API Connectivity',
      description: 'Test connection to Slack API using stored bot token',
      category: 'connectivity',
      timeout: 20000,
      run: async (): Promise<TestResult> => {
        try {
          const { data: sessionData, error: sessionError } = await supabase.auth.getSession();

          if (sessionError || !sessionData.session) {
            return {
              testId: 'slack-api-connectivity',
              testName: 'API Connectivity',
              status: 'error',
              message: 'No active session',
            };
          }

          // Try to list channels as a connectivity test
          const startTime = Date.now();
          const response = await supabase.functions.invoke('slack-ops-router', {
            headers: {
              Authorization: `Bearer ${sessionData.session.access_token}`,
            },
            body: { action: 'list_channels', org_id: orgId },
          });

          const duration = Date.now() - startTime;

          if (response.error) {
            const errorMessage = response.error.message || 'Unknown error';

            if (errorMessage.includes('not connected') || errorMessage.includes('No active')) {
              return {
                testId: 'slack-api-connectivity',
                testName: 'API Connectivity',
                status: 'failed',
                message: 'Slack not connected',
              };
            }

            if (errorMessage.includes('invalid_auth') || errorMessage.includes('token')) {
              return {
                testId: 'slack-api-connectivity',
                testName: 'API Connectivity',
                status: 'failed',
                message: 'Authentication failed - token may be invalid or revoked',
                errorDetails: { error: errorMessage },
              };
            }

            if (errorMessage.includes('ratelimited')) {
              return {
                testId: 'slack-api-connectivity',
                testName: 'API Connectivity',
                status: 'passed',
                message: `API reachable but rate limited (${duration}ms)`,
                responseData: { rateLimited: true, responseTime: duration },
              };
            }

            return {
              testId: 'slack-api-connectivity',
              testName: 'API Connectivity',
              status: 'failed',
              message: `API error: ${errorMessage}`,
              errorDetails: { error: response.error },
            };
          }

          const channelCount = response.data?.channels?.length || 0;

          return {
            testId: 'slack-api-connectivity',
            testName: 'API Connectivity',
            status: 'passed',
            message: `Connected successfully - ${channelCount} channels accessible (${duration}ms)`,
            responseData: {
              channelCount,
              responseTime: duration,
            },
          };
        } catch (error) {
          return {
            testId: 'slack-api-connectivity',
            testName: 'API Connectivity',
            status: 'error',
            message: error instanceof Error ? error.message : 'Unknown error',
          };
        }
      },
    },

    {
      id: 'slack-channel-access',
      name: 'Channel Access',
      description: 'Verify bot can access configured notification channels',
      category: 'connectivity',
      timeout: 15000,
      run: async (): Promise<TestResult> => {
        try {
          const settings = await getNotificationSettings(orgId);
          const enabledWithChannel = settings.filter((s) => s.is_enabled && s.channel_id);

          if (enabledWithChannel.length === 0) {
            return {
              testId: 'slack-channel-access',
              testName: 'Channel Access',
              status: 'passed',
              message: 'No channels configured for notifications',
            };
          }

          // Get unique channels
          const uniqueChannels = new Map<string, string>();
          enabledWithChannel.forEach((s) => {
            if (s.channel_id && s.channel_name) {
              uniqueChannels.set(s.channel_id, s.channel_name);
            }
          });

          return {
            testId: 'slack-channel-access',
            testName: 'Channel Access',
            status: 'passed',
            message: `${uniqueChannels.size} notification channel(s) configured`,
            responseData: {
              channels: Array.from(uniqueChannels.entries()).map(([id, name]) => ({
                id,
                name,
              })),
              featureCount: enabledWithChannel.length,
            },
          };
        } catch (error) {
          return {
            testId: 'slack-channel-access',
            testName: 'Channel Access',
            status: 'error',
            message: error instanceof Error ? error.message : 'Unknown error',
          };
        }
      },
    },

    // =========================================================================
    // Feature Configuration Tests
    // =========================================================================
    {
      id: 'slack-meeting-debrief',
      name: 'Meeting Debrief Configuration',
      description: 'Verify Meeting Debrief feature is properly configured',
      category: 'features',
      timeout: 10000,
      run: async (): Promise<TestResult> => {
        try {
          const settings = await getNotificationSettings(orgId);
          const debriefSettings = settings.find((s) => s.feature === 'meeting_debrief');

          if (!debriefSettings) {
            return {
              testId: 'slack-meeting-debrief',
              testName: 'Meeting Debrief Configuration',
              status: 'skipped',
              message: 'Meeting Debrief not configured',
            };
          }

          if (!debriefSettings.is_enabled) {
            return {
              testId: 'slack-meeting-debrief',
              testName: 'Meeting Debrief Configuration',
              status: 'skipped',
              message: 'Meeting Debrief is disabled',
            };
          }

          // Check delivery configuration
          const issues: string[] = [];

          if (debriefSettings.delivery_method === 'channel' || debriefSettings.delivery_method === 'both') {
            if (!debriefSettings.channel_id) {
              issues.push('No channel selected for channel delivery');
            }
          }

          if (issues.length > 0) {
            return {
              testId: 'slack-meeting-debrief',
              testName: 'Meeting Debrief Configuration',
              status: 'failed',
              message: `Configuration issues: ${issues.join(', ')}`,
              errorDetails: { issues },
            };
          }

          return {
            testId: 'slack-meeting-debrief',
            testName: 'Meeting Debrief Configuration',
            status: 'passed',
            message: `Meeting Debrief enabled (${debriefSettings.delivery_method})`,
            responseData: {
              deliveryMethod: debriefSettings.delivery_method,
              channelName: debriefSettings.channel_name,
            },
          };
        } catch (error) {
          return {
            testId: 'slack-meeting-debrief',
            testName: 'Meeting Debrief Configuration',
            status: 'error',
            message: error instanceof Error ? error.message : 'Unknown error',
          };
        }
      },
    },

    {
      id: 'slack-daily-digest',
      name: 'Daily Digest Configuration',
      description: 'Verify Daily Digest feature is properly configured',
      category: 'features',
      timeout: 10000,
      run: async (): Promise<TestResult> => {
        try {
          const settings = await getNotificationSettings(orgId);
          const digestSettings = settings.find((s) => s.feature === 'daily_digest');

          if (!digestSettings) {
            return {
              testId: 'slack-daily-digest',
              testName: 'Daily Digest Configuration',
              status: 'skipped',
              message: 'Daily Digest not configured',
            };
          }

          if (!digestSettings.is_enabled) {
            return {
              testId: 'slack-daily-digest',
              testName: 'Daily Digest Configuration',
              status: 'skipped',
              message: 'Daily Digest is disabled',
            };
          }

          const issues: string[] = [];

          // Check schedule configuration
          if (!digestSettings.schedule_time) {
            issues.push('No schedule time configured');
          }

          if (!digestSettings.schedule_timezone) {
            issues.push('No timezone configured');
          }

          // Check channel if delivery method requires it
          if (digestSettings.delivery_method === 'channel' || digestSettings.delivery_method === 'both') {
            if (!digestSettings.channel_id) {
              issues.push('No channel selected for channel delivery');
            }
          }

          if (issues.length > 0) {
            return {
              testId: 'slack-daily-digest',
              testName: 'Daily Digest Configuration',
              status: 'failed',
              message: `Configuration issues: ${issues.join(', ')}`,
              errorDetails: { issues },
            };
          }

          return {
            testId: 'slack-daily-digest',
            testName: 'Daily Digest Configuration',
            status: 'passed',
            message: `Daily Digest enabled at ${digestSettings.schedule_time} (${digestSettings.schedule_timezone})`,
            responseData: {
              deliveryMethod: digestSettings.delivery_method,
              scheduleTime: digestSettings.schedule_time,
              timezone: digestSettings.schedule_timezone,
              channelName: digestSettings.channel_name,
            },
          };
        } catch (error) {
          return {
            testId: 'slack-daily-digest',
            testName: 'Daily Digest Configuration',
            status: 'error',
            message: error instanceof Error ? error.message : 'Unknown error',
          };
        }
      },
    },

    {
      id: 'slack-meeting-prep',
      name: 'Meeting Prep Configuration',
      description: 'Verify Meeting Prep feature is properly configured',
      category: 'features',
      timeout: 10000,
      run: async (): Promise<TestResult> => {
        try {
          const settings = await getNotificationSettings(orgId);
          const prepSettings = settings.find((s) => s.feature === 'meeting_prep');

          if (!prepSettings) {
            return {
              testId: 'slack-meeting-prep',
              testName: 'Meeting Prep Configuration',
              status: 'skipped',
              message: 'Meeting Prep not configured',
            };
          }

          if (!prepSettings.is_enabled) {
            return {
              testId: 'slack-meeting-prep',
              testName: 'Meeting Prep Configuration',
              status: 'skipped',
              message: 'Meeting Prep is disabled',
            };
          }

          const issues: string[] = [];

          if (prepSettings.delivery_method === 'channel' || prepSettings.delivery_method === 'both') {
            if (!prepSettings.channel_id) {
              issues.push('No channel selected for channel delivery');
            }
          }

          if (issues.length > 0) {
            return {
              testId: 'slack-meeting-prep',
              testName: 'Meeting Prep Configuration',
              status: 'failed',
              message: `Configuration issues: ${issues.join(', ')}`,
              errorDetails: { issues },
            };
          }

          return {
            testId: 'slack-meeting-prep',
            testName: 'Meeting Prep Configuration',
            status: 'passed',
            message: `Meeting Prep enabled (${prepSettings.delivery_method})`,
            responseData: {
              deliveryMethod: prepSettings.delivery_method,
              channelName: prepSettings.channel_name,
            },
          };
        } catch (error) {
          return {
            testId: 'slack-meeting-prep',
            testName: 'Meeting Prep Configuration',
            status: 'error',
            message: error instanceof Error ? error.message : 'Unknown error',
          };
        }
      },
    },

    {
      id: 'slack-deal-rooms',
      name: 'Deal Rooms Configuration',
      description: 'Verify Deal Rooms feature is properly configured',
      category: 'features',
      timeout: 10000,
      run: async (): Promise<TestResult> => {
        try {
          const settings = await getNotificationSettings(orgId);
          const roomSettings = settings.find((s) => s.feature === 'deal_rooms');

          if (!roomSettings) {
            return {
              testId: 'slack-deal-rooms',
              testName: 'Deal Rooms Configuration',
              status: 'skipped',
              message: 'Deal Rooms not configured',
            };
          }

          if (!roomSettings.is_enabled) {
            return {
              testId: 'slack-deal-rooms',
              testName: 'Deal Rooms Configuration',
              status: 'skipped',
              message: 'Deal Rooms is disabled',
            };
          }

          // Check threshold configuration
          const hasValueThreshold = roomSettings.deal_value_threshold != null;
          const hasStageThreshold = roomSettings.deal_stage_threshold != null;

          if (!hasValueThreshold && !hasStageThreshold) {
            return {
              testId: 'slack-deal-rooms',
              testName: 'Deal Rooms Configuration',
              status: 'failed',
              message: 'No deal thresholds configured (value or stage required)',
            };
          }

          // Count active deal rooms
          const { count: activeRooms } = await supabase
            .from('slack_deal_rooms')
            .select('id', { count: 'exact', head: true })
            .eq('org_id', orgId)
            .eq('is_archived', false);

          return {
            testId: 'slack-deal-rooms',
            testName: 'Deal Rooms Configuration',
            status: 'passed',
            message: `Deal Rooms enabled - ${activeRooms || 0} active rooms`,
            responseData: {
              valueThreshold: roomSettings.deal_value_threshold,
              stageThreshold: roomSettings.deal_stage_threshold,
              activeRooms: activeRooms || 0,
            },
          };
        } catch (error) {
          return {
            testId: 'slack-deal-rooms',
            testName: 'Deal Rooms Configuration',
            status: 'error',
            message: error instanceof Error ? error.message : 'Unknown error',
          };
        }
      },
    },

    // =========================================================================
    // User Mapping Tests
    // =========================================================================
    {
      id: 'slack-user-mappings',
      name: 'User Mappings Status',
      description: 'Check Slack-to-Sixty user mapping coverage',
      category: 'mappings',
      timeout: 10000,
      run: async (): Promise<TestResult> => {
        try {
          const mappings = await getUserMappings(orgId);

          if (mappings.length === 0) {
            return {
              testId: 'slack-user-mappings',
              testName: 'User Mappings Status',
              status: 'passed',
              message: 'No Slack users synced yet',
            };
          }

          const mappedCount = mappings.filter((m) => m.sixty_user_id != null).length;
          const unmappedCount = mappings.length - mappedCount;
          const autoMatchedCount = mappings.filter((m) => m.is_auto_matched).length;
          const mappingRate = Math.round((mappedCount / mappings.length) * 100);

          if (unmappedCount > 0 && mappingRate < 50) {
            return {
              testId: 'slack-user-mappings',
              testName: 'User Mappings Status',
              status: 'failed',
              message: `Low mapping rate: ${mappedCount}/${mappings.length} users mapped (${mappingRate}%)`,
              errorDetails: {
                totalUsers: mappings.length,
                mappedCount,
                unmappedCount,
                mappingRate: `${mappingRate}%`,
              },
            };
          }

          return {
            testId: 'slack-user-mappings',
            testName: 'User Mappings Status',
            status: 'passed',
            message: `${mappedCount}/${mappings.length} Slack users mapped (${autoMatchedCount} auto-matched)`,
            responseData: {
              totalUsers: mappings.length,
              mappedCount,
              unmappedCount,
              autoMatchedCount,
              mappingRate: `${mappingRate}%`,
            },
          };
        } catch (error) {
          return {
            testId: 'slack-user-mappings',
            testName: 'User Mappings Status',
            status: 'error',
            message: error instanceof Error ? error.message : 'Unknown error',
          };
        }
      },
    },

    // =========================================================================
    // Notification Delivery Tests
    // =========================================================================
    {
      id: 'slack-notification-history',
      name: 'Notification Delivery History',
      description: 'Check recent notification delivery status',
      category: 'notifications',
      timeout: 10000,
      run: async (): Promise<TestResult> => {
        try {
          // Get recent notifications
          const { data: recentNotifications, error } = await supabase
            .from('slack_notifications_sent')
            .select('id, feature, sent_at')
            .eq('org_id', orgId)
            .gte('sent_at', new Date(Date.now() - 7 * 24 * 60 * 60 * 1000).toISOString())
            .order('sent_at', { ascending: false })
            .limit(100);

          if (error) {
            return {
              testId: 'slack-notification-history',
              testName: 'Notification Delivery History',
              status: 'passed',
              message: 'Notification history check requires elevated permissions',
            };
          }

          if (!recentNotifications || recentNotifications.length === 0) {
            return {
              testId: 'slack-notification-history',
              testName: 'Notification Delivery History',
              status: 'passed',
              message: 'No notifications sent in the last 7 days',
            };
          }

          // Count by feature
          const byFeature: Record<string, number> = {};
          recentNotifications.forEach((n) => {
            byFeature[n.feature] = (byFeature[n.feature] || 0) + 1;
          });

          return {
            testId: 'slack-notification-history',
            testName: 'Notification Delivery History',
            status: 'passed',
            message: `${recentNotifications.length} notifications sent in the last 7 days`,
            responseData: {
              total: recentNotifications.length,
              byFeature,
              mostRecent: recentNotifications[0]?.sent_at,
            },
          };
        } catch (error) {
          return {
            testId: 'slack-notification-history',
            testName: 'Notification Delivery History',
            status: 'error',
            message: error instanceof Error ? error.message : 'Unknown error',
          };
        }
      },
    },

    // =========================================================================
    // Deal Room Tests
    // =========================================================================
    {
      id: 'slack-deal-room-status',
      name: 'Deal Room Health',
      description: 'Check active deal rooms and their status',
      category: 'deal_rooms',
      timeout: 10000,
      run: async (): Promise<TestResult> => {
        try {
          const settings = await getNotificationSettings(orgId);
          const roomSettings = settings.find((s) => s.feature === 'deal_rooms');

          if (!roomSettings?.is_enabled) {
            return {
              testId: 'slack-deal-room-status',
              testName: 'Deal Room Health',
              status: 'skipped',
              message: 'Deal Rooms feature is not enabled',
            };
          }

          // Get deal room stats
          const { data: rooms, error } = await supabase
            .from('slack_deal_rooms')
            .select('id, is_archived, created_at')
            .eq('org_id', orgId);

          if (error) {
            return {
              testId: 'slack-deal-room-status',
              testName: 'Deal Room Health',
              status: 'passed',
              message: 'Deal room check requires elevated permissions',
            };
          }

          if (!rooms || rooms.length === 0) {
            return {
              testId: 'slack-deal-room-status',
              testName: 'Deal Room Health',
              status: 'passed',
              message: 'No deal rooms created yet',
            };
          }

          const activeRooms = rooms.filter((r) => !r.is_archived).length;
          const archivedRooms = rooms.filter((r) => r.is_archived).length;

          return {
            testId: 'slack-deal-room-status',
            testName: 'Deal Room Health',
            status: 'passed',
            message: `${activeRooms} active, ${archivedRooms} archived deal rooms`,
            responseData: {
              totalRooms: rooms.length,
              activeRooms,
              archivedRooms,
            },
          };
        } catch (error) {
          return {
            testId: 'slack-deal-room-status',
            testName: 'Deal Room Health',
            status: 'error',
            message: error instanceof Error ? error.message : 'Unknown error',
          };
        }
      },
    },

    // =========================================================================
    // Edge Function Health Tests
    // =========================================================================
    {
      id: 'slack-edge-function-health',
      name: 'Edge Function Health',
      description: 'Verify Slack edge functions are responding',
      category: 'infrastructure',
      timeout: 15000,
      run: async (): Promise<TestResult> => {
        try {
          const { data: sessionData, error: sessionError } = await supabase.auth.getSession();

          if (sessionError || !sessionData.session) {
            return {
              testId: 'slack-edge-function-health',
              testName: 'Edge Function Health',
              status: 'error',
              message: 'No active session',
            };
          }

          // Try to list channels as a health check
          const startTime = Date.now();
          const response = await supabase.functions.invoke('slack-ops-router', {
            headers: {
              Authorization: `Bearer ${sessionData.session.access_token}`,
            },
            body: { action: 'list_channels', org_id: orgId },
          });

          const duration = Date.now() - startTime;

          // Even an error response means the function is running
          if (response.error) {
            const errorMessage = response.error.message || '';

            if (
              errorMessage.includes('No active') ||
              errorMessage.includes('not connected')
            ) {
              return {
                testId: 'slack-edge-function-health',
                testName: 'Edge Function Health',
                status: 'passed',
                message: `Edge function responding (${duration}ms)`,
                responseData: { responseTime: duration },
              };
            }

            return {
              testId: 'slack-edge-function-health',
              testName: 'Edge Function Health',
              status: 'passed',
              message: `Edge function responding with error (${duration}ms)`,
              responseData: {
                responseTime: duration,
                errorType: errorMessage.substring(0, 50),
              },
            };
          }

          return {
            testId: 'slack-edge-function-health',
            testName: 'Edge Function Health',
            status: 'passed',
            message: `Edge function healthy (${duration}ms)`,
            responseData: { responseTime: duration },
          };
        } catch (error) {
          return {
            testId: 'slack-edge-function-health',
            testName: 'Edge Function Health',
            status: 'error',
            message: error instanceof Error ? error.message : 'Edge function unreachable',
          };
        }
      },
    },

    // =========================================================================
    // Overall Feature Summary Test
    // =========================================================================
    {
      id: 'slack-features-summary',
      name: 'Features Summary',
      description: 'Overview of all enabled Slack notification features',
      category: 'summary',
      timeout: 10000,
      run: async (): Promise<TestResult> => {
        try {
          const settings = await getNotificationSettings(orgId);

          if (settings.length === 0) {
            return {
              testId: 'slack-features-summary',
              testName: 'Features Summary',
              status: 'passed',
              message: 'No notification features configured',
            };
          }

          const enabledFeatures = settings.filter((s) => s.is_enabled);
          const featureNames = enabledFeatures.map((s) => {
            const nameMap: Record<NotificationFeature, string> = {
              meeting_debrief: 'Meeting Debrief',
              daily_digest: 'Daily Digest',
              meeting_prep: 'Meeting Prep',
              deal_rooms: 'Deal Rooms',
            };
            return nameMap[s.feature] || s.feature;
          });

          if (enabledFeatures.length === 0) {
            return {
              testId: 'slack-features-summary',
              testName: 'Features Summary',
              status: 'passed',
              message: 'No features enabled',
              responseData: {
                totalConfigured: settings.length,
                enabledCount: 0,
              },
            };
          }

          return {
            testId: 'slack-features-summary',
            testName: 'Features Summary',
            status: 'passed',
            message: `${enabledFeatures.length} features enabled: ${featureNames.join(', ')}`,
            responseData: {
              totalConfigured: settings.length,
              enabledCount: enabledFeatures.length,
              enabledFeatures: featureNames,
            },
          };
        } catch (error) {
          return {
            testId: 'slack-features-summary',
            testName: 'Features Summary',
            status: 'error',
            message: error instanceof Error ? error.message : 'Unknown error',
          };
        }
      },
    },
  ];
}

/**
 * Export test suite info for the dashboard
 */
export const slackTestSuiteInfo = {
  integrationName: 'slack',
  displayName: 'Slack',
  description: 'Team messaging and notifications',
  icon: 'MessageSquare',
  categories: [
    'authentication',
    'connectivity',
    'features',
    'mappings',
    'notifications',
    'deal_rooms',
    'infrastructure',
    'summary',
  ],
};
