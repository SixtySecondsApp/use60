/**
 * Google Integration Test Suite
 *
 * Tests all user-facing Google integration functionality:
 * - OAuth/Connection status
 * - Token validation and refresh
 * - Gmail connectivity
 * - Calendar sync
 * - Tasks sync
 * - Drive/Docs access
 * - Edge function health
 */

import { supabase } from '@/lib/supabase/clientV2';
import type { IntegrationTest, TestResult, ConnectionStatus } from '../types';

/**
 * Get Google connection status for the current user
 * Note: Google integration is user-level, not org-level
 */
export async function getGoogleConnectionStatus(userId: string): Promise<ConnectionStatus> {
  try {
    const { data: integration, error } = await supabase
      .from('google_integrations')
      .select('*')
      .eq('user_id', userId)
      .eq('is_active', true)
      .maybeSingle();

    if (error) {
      return { isConnected: false, error: error.message };
    }

    if (!integration) {
      return { isConnected: false };
    }

    return {
      isConnected: true,
      connectedAt: integration.created_at,
      lastSyncAt: integration.updated_at,
      accountInfo: {
        email: integration.email,
        id: integration.id,
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
 * Get Google integration details including scopes
 */
export async function getGoogleIntegrationDetails(userId: string) {
  const { data, error } = await supabase
    .from('google_integrations')
    .select('id, email, scopes, expires_at, access_token, refresh_token, is_active, created_at, updated_at')
    .eq('user_id', userId)
    .eq('is_active', true)
    .maybeSingle();

  if (error) {
    console.error('[GoogleTests] Error fetching integration:', error);
    return null;
  }

  return data;
}

/**
 * Get calendar sync status for the user
 */
export async function getCalendarSyncStatus(userId: string) {
  const { data, error } = await supabase
    .from('calendar_sync_logs')
    .select('*')
    .eq('user_id', userId)
    .order('started_at', { ascending: false })
    .limit(1)
    .maybeSingle();

  if (error) {
    console.error('[GoogleTests] Error fetching calendar sync status:', error);
    return null;
  }

  return data;
}

/**
 * Get tasks sync status for the user
 */
export async function getTasksSyncStatus(userId: string) {
  const { data, error } = await supabase
    .from('google_tasks_sync_status')
    .select('*')
    .eq('user_id', userId)
    .maybeSingle();

  if (error) {
    console.error('[GoogleTests] Error fetching tasks sync status:', error);
    return null;
  }

  return data;
}

/**
 * Check if a scope is present in the integration
 */
function hasScope(scopes: string | null, scope: string): boolean {
  if (!scopes) return false;
  return scopes.includes(scope);
}

/**
 * Create all Google tests for a given user
 */
export function createGoogleTests(userId: string): IntegrationTest[] {
  return [
    // =========================================================================
    // Authentication & Connection Tests
    // =========================================================================
    {
      id: 'google-connection-status',
      name: 'Connection Status',
      description: 'Verify Google is connected to the user account',
      category: 'authentication',
      timeout: 10000,
      run: async (): Promise<TestResult> => {
        const status = await getGoogleConnectionStatus(userId);

        if (!status.isConnected) {
          return {
            testId: 'google-connection-status',
            testName: 'Connection Status',
            status: 'failed',
            message: status.error || 'Google is not connected to this account',
          };
        }

        return {
          testId: 'google-connection-status',
          testName: 'Connection Status',
          status: 'passed',
          message: `Connected as ${status.accountInfo?.email || 'Unknown'}`,
          responseData: {
            connectedAt: status.connectedAt,
            lastSyncAt: status.lastSyncAt,
            accountInfo: status.accountInfo,
          },
        };
      },
    },

    {
      id: 'google-token-validation',
      name: 'OAuth Token Validation',
      description: 'Verify the stored OAuth tokens are valid and not expired',
      category: 'authentication',
      timeout: 15000,
      run: async (): Promise<TestResult> => {
        try {
          const integration = await getGoogleIntegrationDetails(userId);

          if (!integration) {
            return {
              testId: 'google-token-validation',
              testName: 'OAuth Token Validation',
              status: 'failed',
              message: 'No active integration found',
            };
          }

          // Check if we have tokens
          if (!integration.access_token) {
            return {
              testId: 'google-token-validation',
              testName: 'OAuth Token Validation',
              status: 'failed',
              message: 'No access token stored',
            };
          }

          // Check token expiry
          if (integration.expires_at) {
            const expiresAt = new Date(integration.expires_at);
            const now = new Date();

            if (expiresAt <= now) {
              // Token is expired, check if we have refresh token
              if (!integration.refresh_token) {
                return {
                  testId: 'google-token-validation',
                  testName: 'OAuth Token Validation',
                  status: 'failed',
                  message: 'Access token expired and no refresh token available',
                };
              }

              return {
                testId: 'google-token-validation',
                testName: 'OAuth Token Validation',
                status: 'passed',
                message: 'Access token expired but refresh token available',
                responseData: {
                  tokenExpired: true,
                  hasRefreshToken: true,
                  expiresAt: integration.expires_at,
                },
              };
            }

            // Token is still valid
            const minutesUntilExpiry = Math.round((expiresAt.getTime() - now.getTime()) / 60000);

            return {
              testId: 'google-token-validation',
              testName: 'OAuth Token Validation',
              status: 'passed',
              message: `Token valid for ${minutesUntilExpiry} more minutes`,
              responseData: {
                tokenExpired: false,
                hasRefreshToken: !!integration.refresh_token,
                expiresAt: integration.expires_at,
                minutesUntilExpiry,
              },
            };
          }

          return {
            testId: 'google-token-validation',
            testName: 'OAuth Token Validation',
            status: 'passed',
            message: 'Token present (no expiry info)',
            responseData: {
              hasRefreshToken: !!integration.refresh_token,
            },
          };
        } catch (error) {
          return {
            testId: 'google-token-validation',
            testName: 'OAuth Token Validation',
            status: 'error',
            message: error instanceof Error ? error.message : 'Unknown error',
          };
        }
      },
    },

    {
      id: 'google-scopes-check',
      name: 'OAuth Scopes Validation',
      description: 'Verify all required OAuth scopes are granted',
      category: 'authentication',
      timeout: 10000,
      run: async (): Promise<TestResult> => {
        try {
          const integration = await getGoogleIntegrationDetails(userId);

          if (!integration) {
            return {
              testId: 'google-scopes-check',
              testName: 'OAuth Scopes Validation',
              status: 'failed',
              message: 'No active integration found',
            };
          }

          const scopes = integration.scopes || '';
          const requiredScopes = {
            gmail: 'gmail.readonly',
            calendar: 'calendar',
            tasks: 'tasks',
            drive: 'drive',
            docs: 'documents',
          };

          const grantedScopes: Record<string, boolean> = {};
          let allGranted = true;

          for (const [service, scope] of Object.entries(requiredScopes)) {
            grantedScopes[service] = hasScope(scopes, scope);
            // Only calendar is required, others are optional
            if (service === 'calendar' && !grantedScopes[service]) {
              allGranted = false;
            }
          }

          const grantedCount = Object.values(grantedScopes).filter(Boolean).length;

          return {
            testId: 'google-scopes-check',
            testName: 'OAuth Scopes Validation',
            status: allGranted ? 'passed' : 'failed',
            message: allGranted
              ? `${grantedCount}/${Object.keys(requiredScopes).length} services authorized`
              : 'Calendar scope is required but not granted',
            responseData: {
              grantedScopes,
              rawScopes: scopes,
            },
          };
        } catch (error) {
          return {
            testId: 'google-scopes-check',
            testName: 'OAuth Scopes Validation',
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
      id: 'google-api-connectivity',
      name: 'Google API Connectivity',
      description: 'Test connection to Google APIs using stored credentials',
      category: 'connectivity',
      timeout: 20000,
      run: async (): Promise<TestResult> => {
        try {
          const { data: sessionData, error: sessionError } = await supabase.auth.getSession();

          if (sessionError || !sessionData.session) {
            return {
              testId: 'google-api-connectivity',
              testName: 'Google API Connectivity',
              status: 'error',
              message: 'No active session',
            };
          }

          // Call the test-connection edge function
          const startTime = Date.now();
          const response = await supabase.functions.invoke('google-services-router', {
            headers: {
              Authorization: `Bearer ${sessionData.session.access_token}`,
            },
            body: { action: 'test_connection' },
          });

          const duration = Date.now() - startTime;

          if (response.error) {
            const errorMessage = response.error.message || 'Unknown error';

            if (errorMessage.includes('401') || errorMessage.includes('unauthorized')) {
              return {
                testId: 'google-api-connectivity',
                testName: 'Google API Connectivity',
                status: 'failed',
                message: 'Authentication failed - token may be invalid',
                errorDetails: { error: errorMessage, duration },
              };
            }

            if (errorMessage.includes('integration not found')) {
              return {
                testId: 'google-api-connectivity',
                testName: 'Google API Connectivity',
                status: 'failed',
                message: 'Google integration not found',
                errorDetails: { error: errorMessage, duration },
              };
            }

            return {
              testId: 'google-api-connectivity',
              testName: 'Google API Connectivity',
              status: 'failed',
              message: `API error: ${errorMessage}`,
              errorDetails: { error: response.error, duration },
            };
          }

          // Parse the test results
          const results = response.data?.results || {};
          const allPassed = Object.values(results).every((r: any) => r.success);

          return {
            testId: 'google-api-connectivity',
            testName: 'Google API Connectivity',
            status: allPassed ? 'passed' : 'failed',
            message: allPassed
              ? `All services connected (${duration}ms)`
              : `Some services failed (${duration}ms)`,
            responseData: { results, duration },
          };
        } catch (error) {
          return {
            testId: 'google-api-connectivity',
            testName: 'Google API Connectivity',
            status: 'error',
            message: error instanceof Error ? error.message : 'Unknown error',
          };
        }
      },
    },

    // =========================================================================
    // Gmail Tests
    // =========================================================================
    {
      id: 'google-gmail-labels',
      name: 'Gmail Labels Access',
      description: 'Verify Gmail labels can be retrieved',
      category: 'gmail',
      timeout: 15000,
      run: async (): Promise<TestResult> => {
        try {
          const integration = await getGoogleIntegrationDetails(userId);

          if (!integration || !hasScope(integration.scopes, 'gmail')) {
            return {
              testId: 'google-gmail-labels',
              testName: 'Gmail Labels Access',
              status: 'skipped',
              message: 'Gmail scope not granted',
            };
          }

          const { data: sessionData } = await supabase.auth.getSession();
          if (!sessionData.session) {
            return {
              testId: 'google-gmail-labels',
              testName: 'Gmail Labels Access',
              status: 'error',
              message: 'No active session',
            };
          }

          const response = await supabase.functions.invoke('google-services-router', {
            headers: {
              Authorization: `Bearer ${sessionData.session.access_token}`,
            },
            body: { action: 'gmail', handlerAction: 'labels' },
          });

          if (response.error) {
            return {
              testId: 'google-gmail-labels',
              testName: 'Gmail Labels Access',
              status: 'failed',
              message: response.error.message || 'Failed to fetch labels',
              errorDetails: { error: response.error },
            };
          }

          const labels = response.data?.labels || [];
          const hasInbox = labels.some((l: any) => l.name === 'INBOX');

          return {
            testId: 'google-gmail-labels',
            testName: 'Gmail Labels Access',
            status: 'passed',
            message: `${labels.length} labels found${hasInbox ? ', INBOX present' : ''}`,
            responseData: {
              labelCount: labels.length,
              hasInbox,
              sampleLabels: labels.slice(0, 5).map((l: any) => l.name),
            },
          };
        } catch (error) {
          return {
            testId: 'google-gmail-labels',
            testName: 'Gmail Labels Access',
            status: 'error',
            message: error instanceof Error ? error.message : 'Unknown error',
          };
        }
      },
    },

    {
      id: 'google-gmail-messages',
      name: 'Gmail Messages Access',
      description: 'Verify Gmail messages can be retrieved',
      category: 'gmail',
      timeout: 15000,
      run: async (): Promise<TestResult> => {
        try {
          const integration = await getGoogleIntegrationDetails(userId);

          if (!integration || !hasScope(integration.scopes, 'gmail')) {
            return {
              testId: 'google-gmail-messages',
              testName: 'Gmail Messages Access',
              status: 'skipped',
              message: 'Gmail scope not granted',
            };
          }

          const { data: sessionData } = await supabase.auth.getSession();
          if (!sessionData.session) {
            return {
              testId: 'google-gmail-messages',
              testName: 'Gmail Messages Access',
              status: 'error',
              message: 'No active session',
            };
          }

          const response = await supabase.functions.invoke('google-services-router', {
            headers: {
              Authorization: `Bearer ${sessionData.session.access_token}`,
            },
            body: { action: 'gmail', handlerAction: 'list', maxResults: 5 },
          });

          if (response.error) {
            return {
              testId: 'google-gmail-messages',
              testName: 'Gmail Messages Access',
              status: 'failed',
              message: response.error.message || 'Failed to fetch messages',
              errorDetails: { error: response.error },
            };
          }

          const messages = response.data?.messages || [];
          const totalEstimate = response.data?.resultSizeEstimate || 0;

          return {
            testId: 'google-gmail-messages',
            testName: 'Gmail Messages Access',
            status: 'passed',
            message: `${messages.length} messages retrieved, ~${totalEstimate} total`,
            responseData: {
              messageCount: messages.length,
              totalEstimate,
              hasMessages: messages.length > 0,
            },
          };
        } catch (error) {
          return {
            testId: 'google-gmail-messages',
            testName: 'Gmail Messages Access',
            status: 'error',
            message: error instanceof Error ? error.message : 'Unknown error',
          };
        }
      },
    },

    // =========================================================================
    // Calendar Tests
    // =========================================================================
    {
      id: 'google-calendar-list',
      name: 'Calendar List Access',
      description: 'Verify Google Calendars can be retrieved',
      category: 'calendar',
      timeout: 15000,
      run: async (): Promise<TestResult> => {
        try {
          const { data: sessionData } = await supabase.auth.getSession();
          if (!sessionData.session) {
            return {
              testId: 'google-calendar-list',
              testName: 'Calendar List Access',
              status: 'error',
              message: 'No active session',
            };
          }

          const response = await supabase.functions.invoke('google-calendar?action=list-calendars', {
            headers: {
              Authorization: `Bearer ${sessionData.session.access_token}`,
            },
            body: {},
          });

          if (response.error) {
            return {
              testId: 'google-calendar-list',
              testName: 'Calendar List Access',
              status: 'failed',
              message: response.error.message || 'Failed to fetch calendars',
              errorDetails: { error: response.error },
            };
          }

          const calendars = response.data?.calendars || [];
          const primaryCalendar = calendars.find((c: any) => c.primary);

          return {
            testId: 'google-calendar-list',
            testName: 'Calendar List Access',
            status: 'passed',
            message: `${calendars.length} calendars found${primaryCalendar ? ', primary set' : ''}`,
            responseData: {
              calendarCount: calendars.length,
              hasPrimary: !!primaryCalendar,
              primaryEmail: primaryCalendar?.id,
            },
          };
        } catch (error) {
          return {
            testId: 'google-calendar-list',
            testName: 'Calendar List Access',
            status: 'error',
            message: error instanceof Error ? error.message : 'Unknown error',
          };
        }
      },
    },

    {
      id: 'google-calendar-events',
      name: 'Calendar Events Access',
      description: 'Verify calendar events can be retrieved',
      category: 'calendar',
      timeout: 15000,
      run: async (): Promise<TestResult> => {
        try {
          const { data: sessionData } = await supabase.auth.getSession();
          if (!sessionData.session) {
            return {
              testId: 'google-calendar-events',
              testName: 'Calendar Events Access',
              status: 'error',
              message: 'No active session',
            };
          }

          const now = new Date();
          const nextWeek = new Date(now.getTime() + 7 * 24 * 60 * 60 * 1000);

          const response = await supabase.functions.invoke('google-calendar?action=list-events', {
            headers: {
              Authorization: `Bearer ${sessionData.session.access_token}`,
            },
            body: {
              timeMin: now.toISOString(),
              timeMax: nextWeek.toISOString(),
              maxResults: 10,
            },
          });

          if (response.error) {
            return {
              testId: 'google-calendar-events',
              testName: 'Calendar Events Access',
              status: 'failed',
              message: response.error.message || 'Failed to fetch events',
              errorDetails: { error: response.error },
            };
          }

          const events = response.data?.events || [];

          return {
            testId: 'google-calendar-events',
            testName: 'Calendar Events Access',
            status: 'passed',
            message: `${events.length} events in next 7 days`,
            responseData: {
              eventCount: events.length,
              hasEvents: events.length > 0,
            },
          };
        } catch (error) {
          return {
            testId: 'google-calendar-events',
            testName: 'Calendar Events Access',
            status: 'error',
            message: error instanceof Error ? error.message : 'Unknown error',
          };
        }
      },
    },

    {
      id: 'google-calendar-sync-state',
      name: 'Calendar Sync State',
      description: 'Check calendar sync health and last sync time',
      category: 'calendar',
      timeout: 10000,
      run: async (): Promise<TestResult> => {
        try {
          const syncStatus = await getCalendarSyncStatus(userId);

          // Check for local calendar events
          const { data: events, error: eventsError, count } = await supabase
            .from('calendar_events')
            .select('id, created_at', { count: 'exact', head: false })
            .eq('user_id', userId)
            .limit(1);

          if (eventsError) {
            return {
              testId: 'google-calendar-sync-state',
              testName: 'Calendar Sync State',
              status: 'error',
              message: `Database error: ${eventsError.message}`,
            };
          }

          const eventCount = count || 0;

          if (!syncStatus && eventCount === 0) {
            return {
              testId: 'google-calendar-sync-state',
              testName: 'Calendar Sync State',
              status: 'passed',
              message: 'No sync performed yet (new connection)',
            };
          }

          // Check last sync time
          if (syncStatus?.completed_at) {
            const lastSync = new Date(syncStatus.completed_at);
            const hoursSinceSync = Math.round((Date.now() - lastSync.getTime()) / (60 * 60 * 1000));

            if (syncStatus.sync_status === 'error') {
              return {
                testId: 'google-calendar-sync-state',
                testName: 'Calendar Sync State',
                status: 'failed',
                message: 'Last sync failed',
                errorDetails: {
                  syncStatus: syncStatus.sync_status,
                  error: syncStatus.error_message,
                },
              };
            }

            return {
              testId: 'google-calendar-sync-state',
              testName: 'Calendar Sync State',
              status: 'passed',
              message: `${eventCount} events synced, last sync ${hoursSinceSync}h ago`,
              responseData: {
                eventCount,
                lastSyncAt: syncStatus.completed_at,
                eventsCreated: syncStatus.events_created,
                eventsUpdated: syncStatus.events_updated,
              },
            };
          }

          return {
            testId: 'google-calendar-sync-state',
            testName: 'Calendar Sync State',
            status: 'passed',
            message: `${eventCount} events in database`,
            responseData: { eventCount },
          };
        } catch (error) {
          return {
            testId: 'google-calendar-sync-state',
            testName: 'Calendar Sync State',
            status: 'error',
            message: error instanceof Error ? error.message : 'Unknown error',
          };
        }
      },
    },

    // =========================================================================
    // Tasks Tests
    // =========================================================================
    {
      id: 'google-tasks-lists',
      name: 'Tasks Lists Access',
      description: 'Verify Google Tasks lists can be retrieved',
      category: 'tasks',
      timeout: 15000,
      run: async (): Promise<TestResult> => {
        try {
          const integration = await getGoogleIntegrationDetails(userId);

          if (!integration || !hasScope(integration.scopes, 'tasks')) {
            return {
              testId: 'google-tasks-lists',
              testName: 'Tasks Lists Access',
              status: 'skipped',
              message: 'Tasks scope not granted',
            };
          }

          const { data: sessionData } = await supabase.auth.getSession();
          if (!sessionData.session) {
            return {
              testId: 'google-tasks-lists',
              testName: 'Tasks Lists Access',
              status: 'error',
              message: 'No active session',
            };
          }

          const response = await supabase.functions.invoke('google-services-router', {
            headers: {
              Authorization: `Bearer ${sessionData.session.access_token}`,
            },
            body: { action: 'tasks', handlerAction: 'list-tasklists' },
          });

          if (response.error) {
            return {
              testId: 'google-tasks-lists',
              testName: 'Tasks Lists Access',
              status: 'failed',
              message: response.error.message || 'Failed to fetch task lists',
              errorDetails: { error: response.error },
            };
          }

          const lists = response.data?.items || [];

          return {
            testId: 'google-tasks-lists',
            testName: 'Tasks Lists Access',
            status: 'passed',
            message: `${lists.length} task lists found`,
            responseData: {
              listCount: lists.length,
              lists: lists.map((l: any) => l.title),
            },
          };
        } catch (error) {
          return {
            testId: 'google-tasks-lists',
            testName: 'Tasks Lists Access',
            status: 'error',
            message: error instanceof Error ? error.message : 'Unknown error',
          };
        }
      },
    },

    {
      id: 'google-tasks-sync-state',
      name: 'Tasks Sync State',
      description: 'Check tasks sync health and conflict status',
      category: 'tasks',
      timeout: 10000,
      run: async (): Promise<TestResult> => {
        try {
          const syncStatus = await getTasksSyncStatus(userId);

          if (!syncStatus) {
            return {
              testId: 'google-tasks-sync-state',
              testName: 'Tasks Sync State',
              status: 'passed',
              message: 'No sync performed yet',
            };
          }

          if (syncStatus.sync_state === 'error') {
            return {
              testId: 'google-tasks-sync-state',
              testName: 'Tasks Sync State',
              status: 'failed',
              message: syncStatus.error_message || 'Sync is in error state',
              errorDetails: {
                syncState: syncStatus.sync_state,
                errorMessage: syncStatus.error_message,
              },
            };
          }

          if (syncStatus.sync_state === 'conflict' && syncStatus.conflicts_count > 0) {
            return {
              testId: 'google-tasks-sync-state',
              testName: 'Tasks Sync State',
              status: 'failed',
              message: `${syncStatus.conflicts_count} unresolved conflicts`,
              errorDetails: {
                syncState: syncStatus.sync_state,
                conflictsCount: syncStatus.conflicts_count,
              },
            };
          }

          return {
            testId: 'google-tasks-sync-state',
            testName: 'Tasks Sync State',
            status: 'passed',
            message: `${syncStatus.tasks_synced_count || 0} tasks synced`,
            responseData: {
              syncState: syncStatus.sync_state,
              tasksSynced: syncStatus.tasks_synced_count,
              lastFullSync: syncStatus.last_full_sync_at,
              conflictsCount: syncStatus.conflicts_count,
            },
          };
        } catch (error) {
          return {
            testId: 'google-tasks-sync-state',
            testName: 'Tasks Sync State',
            status: 'error',
            message: error instanceof Error ? error.message : 'Unknown error',
          };
        }
      },
    },

    // =========================================================================
    // Drive/Docs Tests
    // =========================================================================
    {
      id: 'google-drive-access',
      name: 'Drive Access',
      description: 'Verify Google Drive can be accessed',
      category: 'drive',
      timeout: 15000,
      run: async (): Promise<TestResult> => {
        try {
          const integration = await getGoogleIntegrationDetails(userId);

          if (!integration || !hasScope(integration.scopes, 'drive')) {
            return {
              testId: 'google-drive-access',
              testName: 'Drive Access',
              status: 'skipped',
              message: 'Drive scope not granted',
            };
          }

          const { data: sessionData } = await supabase.auth.getSession();
          if (!sessionData.session) {
            return {
              testId: 'google-drive-access',
              testName: 'Drive Access',
              status: 'error',
              message: 'No active session',
            };
          }

          const response = await supabase.functions.invoke('google-services-router', {
            headers: {
              Authorization: `Bearer ${sessionData.session.access_token}`,
            },
            body: { action: 'drive', maxResults: 5 },
          });

          if (response.error) {
            return {
              testId: 'google-drive-access',
              testName: 'Drive Access',
              status: 'failed',
              message: response.error.message || 'Failed to access Drive',
              errorDetails: { error: response.error },
            };
          }

          const files = response.data?.files || [];

          return {
            testId: 'google-drive-access',
            testName: 'Drive Access',
            status: 'passed',
            message: `Drive accessible, ${files.length} files found`,
            responseData: {
              fileCount: files.length,
              hasFiles: files.length > 0,
            },
          };
        } catch (error) {
          return {
            testId: 'google-drive-access',
            testName: 'Drive Access',
            status: 'error',
            message: error instanceof Error ? error.message : 'Unknown error',
          };
        }
      },
    },

    // =========================================================================
    // Data Integrity Tests
    // =========================================================================
    {
      id: 'google-database-health',
      name: 'Database Health',
      description: 'Verify Google-related database tables are accessible',
      category: 'data',
      timeout: 10000,
      run: async (): Promise<TestResult> => {
        try {
          const tables = [
            { name: 'google_integrations', query: supabase.from('google_integrations').select('id').eq('user_id', userId).limit(1) },
            { name: 'calendar_events', query: supabase.from('calendar_events').select('id').eq('user_id', userId).limit(1) },
            { name: 'google_task_lists', query: supabase.from('google_task_lists').select('id').limit(1) },
          ];

          const results: Record<string, boolean> = {};
          let allAccessible = true;

          for (const table of tables) {
            const { error } = await table.query;
            results[table.name] = !error;
            if (error) {
              allAccessible = false;
            }
          }

          return {
            testId: 'google-database-health',
            testName: 'Database Health',
            status: allAccessible ? 'passed' : 'failed',
            message: allAccessible
              ? 'All Google tables accessible'
              : 'Some tables inaccessible',
            responseData: results,
          };
        } catch (error) {
          return {
            testId: 'google-database-health',
            testName: 'Database Health',
            status: 'error',
            message: error instanceof Error ? error.message : 'Unknown error',
          };
        }
      },
    },

    // =========================================================================
    // Edge Function Tests
    // =========================================================================
    {
      id: 'google-edge-function-health',
      name: 'Edge Functions Health',
      description: 'Verify Google edge functions are responding',
      category: 'infrastructure',
      timeout: 20000,
      run: async (): Promise<TestResult> => {
        try {
          const { data: sessionData, error: sessionError } = await supabase.auth.getSession();

          if (sessionError || !sessionData.session) {
            return {
              testId: 'google-edge-function-health',
              testName: 'Edge Functions Health',
              status: 'error',
              message: 'No active session',
            };
          }

          const functions = [
            { name: 'google-calendar', action: 'list-calendars' },
            { name: 'google-tasks', action: 'list-tasklists' },
          ];

          const results: Record<string, { responding: boolean; duration: number }> = {};
          let allResponding = true;

          for (const fn of functions) {
            const startTime = Date.now();
            try {
              const response = await supabase.functions.invoke(`${fn.name}?action=${fn.action}`, {
                headers: {
                  Authorization: `Bearer ${sessionData.session.access_token}`,
                },
                body: {},
              });

              const duration = Date.now() - startTime;

              // Even an error response means the function is running
              // We're checking if the edge function responds at all
              results[fn.name] = {
                responding: true,
                duration,
              };
            } catch (e) {
              results[fn.name] = {
                responding: false,
                duration: Date.now() - startTime,
              };
              allResponding = false;
            }
          }

          const avgDuration = Math.round(
            Object.values(results).reduce((sum, r) => sum + r.duration, 0) / functions.length
          );

          return {
            testId: 'google-edge-function-health',
            testName: 'Edge Functions Health',
            status: allResponding ? 'passed' : 'failed',
            message: allResponding
              ? `All functions responding (avg ${avgDuration}ms)`
              : 'Some functions not responding',
            responseData: results,
          };
        } catch (error) {
          return {
            testId: 'google-edge-function-health',
            testName: 'Edge Functions Health',
            status: 'error',
            message: error instanceof Error ? error.message : 'Edge functions unreachable',
          };
        }
      },
    },

    // =========================================================================
    // Summary Test
    // =========================================================================
    {
      id: 'google-services-summary',
      name: 'Services Summary',
      description: 'Overall status of all Google services',
      category: 'summary',
      timeout: 10000,
      run: async (): Promise<TestResult> => {
        try {
          const integration = await getGoogleIntegrationDetails(userId);

          if (!integration) {
            return {
              testId: 'google-services-summary',
              testName: 'Services Summary',
              status: 'failed',
              message: 'Google not connected',
            };
          }

          const scopes = integration.scopes || '';
          const services = {
            gmail: hasScope(scopes, 'gmail'),
            calendar: hasScope(scopes, 'calendar'),
            tasks: hasScope(scopes, 'tasks'),
            drive: hasScope(scopes, 'drive'),
            docs: hasScope(scopes, 'documents'),
          };

          const enabledCount = Object.values(services).filter(Boolean).length;
          const totalServices = Object.keys(services).length;

          return {
            testId: 'google-services-summary',
            testName: 'Services Summary',
            status: 'passed',
            message: `${enabledCount}/${totalServices} services enabled`,
            responseData: {
              email: integration.email,
              services,
              connectedSince: integration.created_at,
            },
          };
        } catch (error) {
          return {
            testId: 'google-services-summary',
            testName: 'Services Summary',
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
export const googleTestSuiteInfo = {
  integrationName: 'google',
  displayName: 'Google Workspace',
  description: 'Gmail, Calendar, Tasks, Drive integration',
  icon: 'Mail',
  categories: ['authentication', 'connectivity', 'gmail', 'calendar', 'tasks', 'drive', 'data', 'infrastructure', 'summary'],
};
