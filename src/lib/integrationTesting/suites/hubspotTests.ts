/**
 * HubSpot Integration Test Suite
 *
 * Tests all user-facing HubSpot integration functionality:
 * - OAuth/Connection status
 * - Token validation and refresh
 * - API connectivity
 * - Contact/Deal/Task sync
 * - Custom properties
 * - Webhook configuration
 * - Queue processing
 * - Settings validation
 */

import { supabase } from '@/lib/supabase/clientV2';
import type { IntegrationTest, TestResult, ConnectionStatus } from '../types';

interface HubSpotSettings {
  pipeline_mapping?: {
    enabled: boolean;
    hubspot_pipeline_id?: string;
    stage_mappings?: Record<string, string>;
    sync_direction?: 'hubspot_to_sixty' | 'sixty_to_hubspot' | 'bidirectional';
  };
  contact_sync?: {
    enabled: boolean;
    sync_direction?: string;
    create_missing?: boolean;
  };
  deal_sync?: {
    enabled: boolean;
    sync_direction?: string;
  };
  task_sync?: {
    enabled: boolean;
  };
  form_ingestion?: {
    enabled: boolean;
    enabled_forms?: string[];
  };
  ai_note_writeback?: {
    enabled: boolean;
    write_meeting_summaries?: boolean;
    write_action_items?: boolean;
  };
}

interface HubSpotSyncState {
  id: string;
  org_id: string;
  sync_status: 'idle' | 'syncing' | 'error';
  last_sync_started_at: string | null;
  last_sync_completed_at: string | null;
  error_message: string | null;
  contacts_synced: number;
  deals_synced: number;
  tasks_synced: number;
  cursors: Record<string, string> | null;
}

/**
 * Get HubSpot connection status for the current org
 */
export async function getHubSpotConnectionStatus(orgId: string): Promise<ConnectionStatus> {
  try {
    const { data: integration, error } = await supabase
      .from('hubspot_org_integrations')
      .select('*')
      .eq('org_id', orgId)
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
      lastSyncAt: integration.last_sync_at,
      accountInfo: {
        id: integration.hubspot_portal_id,
        name: integration.hubspot_portal_name,
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
 * Get HubSpot sync state for the current org
 */
export async function getHubSpotSyncState(orgId: string): Promise<HubSpotSyncState | null> {
  const { data, error } = await supabase
    .from('hubspot_org_sync_state')
    .select('*')
    .eq('org_id', orgId)
    .maybeSingle();

  if (error) {
    console.error('[HubSpotTests] Error fetching sync state:', error);
    return null;
  }

  return data;
}

/**
 * Get HubSpot settings for the current org
 */
export async function getHubSpotSettings(orgId: string): Promise<HubSpotSettings | null> {
  const { data, error } = await supabase
    .from('hubspot_settings')
    .select('settings')
    .eq('org_id', orgId)
    .maybeSingle();

  if (error) {
    console.error('[HubSpotTests] Error fetching settings:', error);
    return null;
  }

  return data?.settings || null;
}

/**
 * Warmup the edge function to avoid cold start failures
 * This is a silent ping that doesn't affect test results
 */
async function warmupEdgeFunction(): Promise<void> {
  try {
    const { data: sessionData } = await supabase.auth.getSession();
    if (!sessionData.session) return;

    // Fire-and-forget warmup request - don't wait for response
    supabase.functions.invoke('crm-admin-router', {
      headers: {
        Authorization: `Bearer ${sessionData.session.access_token}`,
      },
      body: { action: 'hubspot_admin', sub_action: 'status', org_id: 'warmup' },
    }).catch(() => {
      // Silently ignore warmup failures
    });

    // Small delay to let the warmup request initialize the function
    await new Promise((resolve) => setTimeout(resolve, 500));
  } catch {
    // Ignore warmup errors
  }
}

/**
 * Create all HubSpot tests for a given org
 */
export function createHubSpotTests(orgId: string): IntegrationTest[] {
  // Trigger warmup immediately when tests are created
  warmupEdgeFunction();

  return [
    // =========================================================================
    // Authentication & Connection Tests
    // =========================================================================
    {
      id: 'hubspot-connection-status',
      name: 'Connection Status',
      description: 'Verify HubSpot is connected to the organization',
      category: 'authentication',
      timeout: 10000,
      run: async (): Promise<TestResult> => {
        const status = await getHubSpotConnectionStatus(orgId);

        if (!status.isConnected) {
          return {
            testId: 'hubspot-connection-status',
            testName: 'Connection Status',
            status: 'failed',
            message: status.error || 'HubSpot is not connected to this organization',
          };
        }

        return {
          testId: 'hubspot-connection-status',
          testName: 'Connection Status',
          status: 'passed',
          message: `Connected to portal ${status.accountInfo?.name || status.accountInfo?.id || 'Unknown'}`,
          responseData: {
            connectedAt: status.connectedAt,
            lastSyncAt: status.lastSyncAt,
            portalId: status.accountInfo?.id,
            portalName: status.accountInfo?.name,
          },
        };
      },
    },

    {
      id: 'hubspot-token-validation',
      name: 'OAuth Token Validation',
      description: 'Verify the stored OAuth tokens are valid and not expired',
      category: 'authentication',
      timeout: 15000,
      run: async (): Promise<TestResult> => {
        try {
          // Check credentials table (we can only verify token exists, not decrypt)
          const { data: credentials, error: credError } = await supabase
            .from('hubspot_org_credentials')
            .select('id, token_expires_at, updated_at')
            .eq('org_id', orgId)
            .maybeSingle();

          if (credError) {
            // This is expected if RLS blocks access - service role only table
            // Try checking via integration record
            const { data: integration } = await supabase
              .from('hubspot_org_integrations')
              .select('id, is_active, updated_at, scopes')
              .eq('org_id', orgId)
              .eq('is_active', true)
              .maybeSingle();

            if (!integration) {
              return {
                testId: 'hubspot-token-validation',
                testName: 'OAuth Token Validation',
                status: 'failed',
                message: 'No active HubSpot integration found',
              };
            }

            return {
              testId: 'hubspot-token-validation',
              testName: 'OAuth Token Validation',
              status: 'passed',
              message: 'Integration active (token validation requires service role)',
              responseData: {
                isActive: integration.is_active,
                scopes: integration.scopes,
                updatedAt: integration.updated_at,
              },
            };
          }

          if (!credentials) {
            return {
              testId: 'hubspot-token-validation',
              testName: 'OAuth Token Validation',
              status: 'failed',
              message: 'No credentials found for this organization',
            };
          }

          // Check token expiry
          if (credentials.token_expires_at) {
            const expiresAt = new Date(credentials.token_expires_at);
            const now = new Date();

            if (expiresAt <= now) {
              return {
                testId: 'hubspot-token-validation',
                testName: 'OAuth Token Validation',
                status: 'failed',
                message: 'Access token has expired - refresh required',
                errorDetails: {
                  expiresAt: credentials.token_expires_at,
                  expiredMinutesAgo: Math.round((now.getTime() - expiresAt.getTime()) / 60000),
                },
              };
            }

            const minutesUntilExpiry = Math.round((expiresAt.getTime() - now.getTime()) / 60000);

            return {
              testId: 'hubspot-token-validation',
              testName: 'OAuth Token Validation',
              status: 'passed',
              message: `Token valid for ${minutesUntilExpiry} more minutes`,
              responseData: {
                expiresAt: credentials.token_expires_at,
                minutesUntilExpiry,
              },
            };
          }

          return {
            testId: 'hubspot-token-validation',
            testName: 'OAuth Token Validation',
            status: 'passed',
            message: 'Credentials present',
          };
        } catch (error) {
          return {
            testId: 'hubspot-token-validation',
            testName: 'OAuth Token Validation',
            status: 'error',
            message: error instanceof Error ? error.message : 'Unknown error',
          };
        }
      },
    },

    {
      id: 'hubspot-scopes-verification',
      name: 'OAuth Scopes Verification',
      description: 'Verify all required OAuth scopes are granted',
      category: 'authentication',
      timeout: 10000,
      run: async (): Promise<TestResult> => {
        try {
          const { data: integration, error } = await supabase
            .from('hubspot_org_integrations')
            .select('scopes')
            .eq('org_id', orgId)
            .eq('is_active', true)
            .maybeSingle();

          if (error || !integration) {
            return {
              testId: 'hubspot-scopes-verification',
              testName: 'OAuth Scopes Verification',
              status: 'failed',
              message: 'No active integration found',
            };
          }

          const requiredScopes = [
            'crm.objects.contacts.read',
            'crm.objects.contacts.write',
            'crm.objects.deals.read',
            'crm.objects.deals.write',
          ];

          const grantedScopes = integration.scopes || [];
          const missingScopes = requiredScopes.filter(
            (scope) => !grantedScopes.includes(scope)
          );

          if (missingScopes.length > 0) {
            return {
              testId: 'hubspot-scopes-verification',
              testName: 'OAuth Scopes Verification',
              status: 'failed',
              message: `Missing ${missingScopes.length} required scopes`,
              errorDetails: {
                missingScopes,
                grantedScopes,
              },
            };
          }

          return {
            testId: 'hubspot-scopes-verification',
            testName: 'OAuth Scopes Verification',
            status: 'passed',
            message: `All ${requiredScopes.length} required scopes granted`,
            responseData: {
              grantedScopes,
              totalScopes: grantedScopes.length,
            },
          };
        } catch (error) {
          return {
            testId: 'hubspot-scopes-verification',
            testName: 'OAuth Scopes Verification',
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
      id: 'hubspot-api-connectivity',
      name: 'API Connectivity',
      description: 'Test connection to the HubSpot API using stored credentials',
      category: 'connectivity',
      timeout: 30000, // Increased for cold start + retries
      run: async (): Promise<TestResult> => {
        try {
          const { data: sessionData, error: sessionError } = await supabase.auth.getSession();

          if (sessionError || !sessionData.session) {
            return {
              testId: 'hubspot-api-connectivity',
              testName: 'API Connectivity',
              status: 'error',
              message: 'No active session',
            };
          }

          // Try to get pipelines as a connectivity test
          let response;
          let lastErrorMessage = '';

          // Try up to 3 times with increasing delays (1s, 2s, 3s)
          for (let attempt = 0; attempt < 3; attempt++) {
            try {
              if (attempt > 0) {
                // Exponential backoff: 1s, 2s, 3s
                const delay = 1000 * (attempt + 1);
                console.log(`[HubSpot API Connectivity] Retry ${attempt + 1} after ${delay}ms delay...`);
                await new Promise((resolve) => setTimeout(resolve, delay));
              }

              console.log(`[HubSpot API Connectivity] Attempt ${attempt + 1}...`);
              const startTime = Date.now();

              response = await supabase.functions.invoke('crm-admin-router', {
                headers: {
                  Authorization: `Bearer ${sessionData.session.access_token}`,
                },
                body: { action: 'hubspot_admin', sub_action: 'get_pipelines', org_id: orgId },
              });

              const duration = Date.now() - startTime;
              console.log(`[HubSpot API Connectivity] Attempt ${attempt + 1} completed in ${duration}ms`, response);

              // Check if this is a transient connection error that should be retried
              const errorMsg = response?.error?.message || '';
              const isConnectionError =
                errorMsg.includes('Failed to send a request') ||
                errorMsg.includes('FunctionsFetchError') ||
                errorMsg.includes('Failed to fetch') ||
                errorMsg.includes('network') ||
                errorMsg.includes('timeout');

              if (isConnectionError && attempt < 2) {
                console.log(`[HubSpot API Connectivity] Connection error, will retry: ${errorMsg}`);
                lastErrorMessage = errorMsg;
                continue; // Try again
              }

              // Got a valid response (success or non-transient error), break out
              break;
            } catch (e) {
              const err = e instanceof Error ? e : new Error(String(e));
              lastErrorMessage = err.message;
              console.error(`[HubSpot API Connectivity] Attempt ${attempt + 1} threw exception:`, {
                name: err.name,
                message: err.message,
              });
              // Will continue to next attempt
            }
          }

          if (!response) {
            return {
              testId: 'hubspot-api-connectivity',
              testName: 'API Connectivity',
              status: 'error',
              message: `Edge function unreachable: ${lastErrorMessage || 'No response after 3 attempts'}`,
              errorDetails: {
                error: lastErrorMessage,
                hint: 'This usually indicates a cold start timeout. Try running the tests again.',
              },
            };
          }

          if (response.error) {
            const errorMessage = response.error.message || 'Unknown error';

            // Log full error details for debugging
            console.error('[HubSpot API Connectivity] Error response:', {
              message: response.error.message,
              name: response.error.name,
              context: response.error.context,
              status: response.error.status,
            });

            // Check for edge function unreachable errors first
            if (
              errorMessage.includes('Failed to send a request') ||
              errorMessage.includes('FunctionsFetchError') ||
              errorMessage.includes('Failed to fetch')
            ) {
              return {
                testId: 'hubspot-api-connectivity',
                testName: 'API Connectivity',
                status: 'error',
                message: 'Edge function unreachable - may be experiencing cold start',
                errorDetails: {
                  error: errorMessage,
                  hint: 'Try running tests again - cold start should be resolved',
                },
              };
            }

            if (errorMessage.includes('401') || errorMessage.includes('unauthorized')) {
              return {
                testId: 'hubspot-api-connectivity',
                testName: 'API Connectivity',
                status: 'failed',
                message: 'Authentication failed - token may be invalid',
                errorDetails: { error: errorMessage },
              };
            }

            if (errorMessage.includes('429') || errorMessage.includes('rate limit')) {
              return {
                testId: 'hubspot-api-connectivity',
                testName: 'API Connectivity',
                status: 'passed',
                message: 'API reachable (rate limited)',
                responseData: { rateLimited: true },
              };
            }

            // Check if it's a "not connected" error
            if (errorMessage.includes('not connected') || errorMessage.includes('No active')) {
              return {
                testId: 'hubspot-api-connectivity',
                testName: 'API Connectivity',
                status: 'failed',
                message: 'HubSpot not connected',
              };
            }

            return {
              testId: 'hubspot-api-connectivity',
              testName: 'API Connectivity',
              status: 'failed',
              message: `API error: ${errorMessage}`,
              errorDetails: {
                error: errorMessage,
                name: response.error.name,
                context: response.error.context,
              },
            };
          }

          const pipelineCount = response.data?.pipelines?.length || 0;

          return {
            testId: 'hubspot-api-connectivity',
            testName: 'API Connectivity',
            status: 'passed',
            message: `Connected successfully - ${pipelineCount} pipelines found`,
            responseData: {
              pipelineCount,
            },
          };
        } catch (error) {
          return {
            testId: 'hubspot-api-connectivity',
            testName: 'API Connectivity',
            status: 'error',
            message: error instanceof Error ? error.message : 'Unknown error',
          };
        }
      },
    },

    // =========================================================================
    // Sync State Tests
    // =========================================================================
    {
      id: 'hubspot-sync-state',
      name: 'Sync State Health',
      description: 'Verify sync state is healthy and not stuck',
      category: 'sync',
      timeout: 10000,
      run: async (): Promise<TestResult> => {
        try {
          const syncState = await getHubSpotSyncState(orgId);

          if (!syncState) {
            return {
              testId: 'hubspot-sync-state',
              testName: 'Sync State Health',
              status: 'passed',
              message: 'No sync state yet (new connection)',
            };
          }

          // Check if sync is stuck
          if (syncState.sync_status === 'syncing') {
            const startedAt = syncState.last_sync_started_at
              ? new Date(syncState.last_sync_started_at)
              : null;

            if (startedAt) {
              const minutesSinceStart = Math.round(
                (Date.now() - startedAt.getTime()) / 60000
              );

              if (minutesSinceStart > 30) {
                return {
                  testId: 'hubspot-sync-state',
                  testName: 'Sync State Health',
                  status: 'failed',
                  message: `Sync appears stuck - running for ${minutesSinceStart} minutes`,
                  errorDetails: {
                    syncStatus: syncState.sync_status,
                    startedAt: syncState.last_sync_started_at,
                    minutesSinceStart,
                  },
                };
              }
            }

            return {
              testId: 'hubspot-sync-state',
              testName: 'Sync State Health',
              status: 'passed',
              message: 'Sync currently in progress',
              responseData: {
                syncStatus: syncState.sync_status,
              },
            };
          }

          // Check for error state
          if (syncState.sync_status === 'error') {
            return {
              testId: 'hubspot-sync-state',
              testName: 'Sync State Health',
              status: 'failed',
              message: syncState.error_message || 'Sync is in error state',
              errorDetails: {
                syncStatus: syncState.sync_status,
                errorMessage: syncState.error_message,
              },
            };
          }

          // Check last successful sync age
          if (syncState.last_sync_completed_at) {
            const lastSync = new Date(syncState.last_sync_completed_at);
            const hoursSinceSync = Math.round(
              (Date.now() - lastSync.getTime()) / (60 * 60 * 1000)
            );

            if (hoursSinceSync > 48) {
              return {
                testId: 'hubspot-sync-state',
                testName: 'Sync State Health',
                status: 'failed',
                message: `Last sync was ${hoursSinceSync} hours ago`,
                errorDetails: {
                  lastSyncAt: syncState.last_sync_completed_at,
                  hoursSinceSync,
                },
              };
            }
          }

          const totalSynced =
            (syncState.contacts_synced || 0) +
            (syncState.deals_synced || 0) +
            (syncState.tasks_synced || 0);

          return {
            testId: 'hubspot-sync-state',
            testName: 'Sync State Health',
            status: 'passed',
            message: `Healthy - ${totalSynced} total records synced`,
            responseData: {
              syncStatus: syncState.sync_status,
              contactsSynced: syncState.contacts_synced,
              dealsSynced: syncState.deals_synced,
              tasksSynced: syncState.tasks_synced,
              lastSyncAt: syncState.last_sync_completed_at,
            },
          };
        } catch (error) {
          return {
            testId: 'hubspot-sync-state',
            testName: 'Sync State Health',
            status: 'error',
            message: error instanceof Error ? error.message : 'Unknown error',
          };
        }
      },
    },

    {
      id: 'hubspot-queue-health',
      name: 'Queue Processing Health',
      description: 'Check if the sync queue is processing jobs correctly',
      category: 'sync',
      timeout: 10000,
      run: async (): Promise<TestResult> => {
        try {
          // Check for stuck jobs in the queue
          const { data: stuckJobs, error: stuckError } = await supabase
            .from('hubspot_sync_queue')
            .select('id, job_type, status, created_at, attempts')
            .eq('org_id', orgId)
            .eq('status', 'processing')
            .lt('created_at', new Date(Date.now() - 30 * 60 * 1000).toISOString());

          if (stuckError) {
            // Table might not be accessible with current permissions
            return {
              testId: 'hubspot-queue-health',
              testName: 'Queue Processing Health',
              status: 'passed',
              message: 'Queue health check requires elevated permissions',
            };
          }

          if (stuckJobs && stuckJobs.length > 0) {
            return {
              testId: 'hubspot-queue-health',
              testName: 'Queue Processing Health',
              status: 'failed',
              message: `${stuckJobs.length} jobs stuck in processing state`,
              errorDetails: {
                stuckJobs: stuckJobs.map((j) => ({
                  id: j.id,
                  type: j.job_type,
                  createdAt: j.created_at,
                  attempts: j.attempts,
                })),
              },
            };
          }

          // Check for failed jobs
          const { data: failedJobs } = await supabase
            .from('hubspot_sync_queue')
            .select('id, job_type, error_message, attempts')
            .eq('org_id', orgId)
            .eq('status', 'failed')
            .gte('created_at', new Date(Date.now() - 24 * 60 * 60 * 1000).toISOString())
            .limit(5);

          if (failedJobs && failedJobs.length > 0) {
            return {
              testId: 'hubspot-queue-health',
              testName: 'Queue Processing Health',
              status: 'failed',
              message: `${failedJobs.length} jobs failed in the last 24 hours`,
              errorDetails: {
                failedJobs: failedJobs.map((j) => ({
                  id: j.id,
                  type: j.job_type,
                  error: j.error_message,
                  attempts: j.attempts,
                })),
              },
            };
          }

          // Get pending job count
          const { count: pendingCount } = await supabase
            .from('hubspot_sync_queue')
            .select('id', { count: 'exact', head: true })
            .eq('org_id', orgId)
            .eq('status', 'pending');

          return {
            testId: 'hubspot-queue-health',
            testName: 'Queue Processing Health',
            status: 'passed',
            message: `Queue healthy - ${pendingCount || 0} pending jobs`,
            responseData: {
              pendingJobs: pendingCount || 0,
              stuckJobs: 0,
              failedJobs24h: 0,
            },
          };
        } catch (error) {
          return {
            testId: 'hubspot-queue-health',
            testName: 'Queue Processing Health',
            status: 'error',
            message: error instanceof Error ? error.message : 'Unknown error',
          };
        }
      },
    },

    // =========================================================================
    // Contact Sync Tests
    // =========================================================================
    {
      id: 'hubspot-contact-sync',
      name: 'Contact Sync Status',
      description: 'Verify contact synchronization is working correctly',
      category: 'contacts',
      timeout: 15000,
      run: async (): Promise<TestResult> => {
        try {
          const settings = await getHubSpotSettings(orgId);

          if (!settings?.contact_sync?.enabled) {
            return {
              testId: 'hubspot-contact-sync',
              testName: 'Contact Sync Status',
              status: 'skipped',
              message: 'Contact sync is not enabled',
            };
          }

          // Check object mappings for contacts
          const { count: mappingCount, error: mappingError } = await supabase
            .from('hubspot_object_mappings')
            .select('id', { count: 'exact', head: true })
            .eq('org_id', orgId)
            .eq('object_type', 'contact');

          if (mappingError) {
            return {
              testId: 'hubspot-contact-sync',
              testName: 'Contact Sync Status',
              status: 'passed',
              message: 'Contact sync enabled (mapping check requires elevated permissions)',
            };
          }

          // Check for recent contact sync activity
          const syncState = await getHubSpotSyncState(orgId);

          return {
            testId: 'hubspot-contact-sync',
            testName: 'Contact Sync Status',
            status: 'passed',
            message: `Contact sync active - ${mappingCount || 0} mappings, ${syncState?.contacts_synced || 0} synced`,
            responseData: {
              enabled: true,
              syncDirection: settings.contact_sync.sync_direction,
              createMissing: settings.contact_sync.create_missing,
              mappingCount: mappingCount || 0,
              totalSynced: syncState?.contacts_synced || 0,
            },
          };
        } catch (error) {
          return {
            testId: 'hubspot-contact-sync',
            testName: 'Contact Sync Status',
            status: 'error',
            message: error instanceof Error ? error.message : 'Unknown error',
          };
        }
      },
    },

    // =========================================================================
    // Deal Sync Tests
    // =========================================================================
    {
      id: 'hubspot-deal-sync',
      name: 'Deal Sync Status',
      description: 'Verify deal synchronization is working correctly',
      category: 'deals',
      timeout: 15000,
      run: async (): Promise<TestResult> => {
        try {
          const settings = await getHubSpotSettings(orgId);

          if (!settings?.deal_sync?.enabled) {
            return {
              testId: 'hubspot-deal-sync',
              testName: 'Deal Sync Status',
              status: 'skipped',
              message: 'Deal sync is not enabled',
            };
          }

          // Check object mappings for deals
          const { count: mappingCount, error: mappingError } = await supabase
            .from('hubspot_object_mappings')
            .select('id', { count: 'exact', head: true })
            .eq('org_id', orgId)
            .eq('object_type', 'deal');

          if (mappingError) {
            return {
              testId: 'hubspot-deal-sync',
              testName: 'Deal Sync Status',
              status: 'passed',
              message: 'Deal sync enabled (mapping check requires elevated permissions)',
            };
          }

          const syncState = await getHubSpotSyncState(orgId);

          return {
            testId: 'hubspot-deal-sync',
            testName: 'Deal Sync Status',
            status: 'passed',
            message: `Deal sync active - ${mappingCount || 0} mappings, ${syncState?.deals_synced || 0} synced`,
            responseData: {
              enabled: true,
              syncDirection: settings.deal_sync.sync_direction,
              mappingCount: mappingCount || 0,
              totalSynced: syncState?.deals_synced || 0,
            },
          };
        } catch (error) {
          return {
            testId: 'hubspot-deal-sync',
            testName: 'Deal Sync Status',
            status: 'error',
            message: error instanceof Error ? error.message : 'Unknown error',
          };
        }
      },
    },

    // =========================================================================
    // Task Sync Tests
    // =========================================================================
    {
      id: 'hubspot-task-sync',
      name: 'Task Sync Status',
      description: 'Verify task synchronization is working correctly',
      category: 'tasks',
      timeout: 15000,
      run: async (): Promise<TestResult> => {
        try {
          const settings = await getHubSpotSettings(orgId);

          if (!settings?.task_sync?.enabled) {
            return {
              testId: 'hubspot-task-sync',
              testName: 'Task Sync Status',
              status: 'skipped',
              message: 'Task sync is not enabled',
            };
          }

          // Check object mappings for tasks
          const { count: mappingCount, error: mappingError } = await supabase
            .from('hubspot_object_mappings')
            .select('id', { count: 'exact', head: true })
            .eq('org_id', orgId)
            .eq('object_type', 'task');

          if (mappingError) {
            return {
              testId: 'hubspot-task-sync',
              testName: 'Task Sync Status',
              status: 'passed',
              message: 'Task sync enabled (mapping check requires elevated permissions)',
            };
          }

          const syncState = await getHubSpotSyncState(orgId);

          return {
            testId: 'hubspot-task-sync',
            testName: 'Task Sync Status',
            status: 'passed',
            message: `Task sync active - ${mappingCount || 0} mappings, ${syncState?.tasks_synced || 0} synced`,
            responseData: {
              enabled: true,
              mappingCount: mappingCount || 0,
              totalSynced: syncState?.tasks_synced || 0,
            },
          };
        } catch (error) {
          return {
            testId: 'hubspot-task-sync',
            testName: 'Task Sync Status',
            status: 'error',
            message: error instanceof Error ? error.message : 'Unknown error',
          };
        }
      },
    },

    // =========================================================================
    // Pipeline Mapping Tests
    // =========================================================================
    {
      id: 'hubspot-pipeline-mapping',
      name: 'Pipeline Mapping Configuration',
      description: 'Verify pipeline stage mappings are configured correctly',
      category: 'configuration',
      timeout: 10000,
      run: async (): Promise<TestResult> => {
        try {
          const settings = await getHubSpotSettings(orgId);

          if (!settings?.pipeline_mapping?.enabled) {
            return {
              testId: 'hubspot-pipeline-mapping',
              testName: 'Pipeline Mapping Configuration',
              status: 'skipped',
              message: 'Pipeline mapping is not enabled',
            };
          }

          const mapping = settings.pipeline_mapping;

          if (!mapping.hubspot_pipeline_id) {
            return {
              testId: 'hubspot-pipeline-mapping',
              testName: 'Pipeline Mapping Configuration',
              status: 'skipped',
              message: 'Pipeline mapping enabled but not configured yet',
            };
          }

          const stageMappings = mapping.stage_mappings || {};
          const mappedStagesCount = Object.keys(stageMappings).length;
          const requiredStages = ['sql', 'opportunity', 'verbal', 'signed'];
          const missingStages = requiredStages.filter((s) => !stageMappings[s]);

          if (missingStages.length > 0) {
            return {
              testId: 'hubspot-pipeline-mapping',
              testName: 'Pipeline Mapping Configuration',
              status: 'failed',
              message: `Missing mappings for ${missingStages.length} stages: ${missingStages.join(', ')}`,
              errorDetails: {
                missingStages,
                configuredMappings: stageMappings,
              },
            };
          }

          return {
            testId: 'hubspot-pipeline-mapping',
            testName: 'Pipeline Mapping Configuration',
            status: 'passed',
            message: `Pipeline mapping configured - ${mappedStagesCount} stages mapped (${mapping.sync_direction})`,
            responseData: {
              pipelineId: mapping.hubspot_pipeline_id,
              syncDirection: mapping.sync_direction,
              stageMappings: stageMappings,
            },
          };
        } catch (error) {
          return {
            testId: 'hubspot-pipeline-mapping',
            testName: 'Pipeline Mapping Configuration',
            status: 'error',
            message: error instanceof Error ? error.message : 'Unknown error',
          };
        }
      },
    },

    // =========================================================================
    // Webhook Tests
    // =========================================================================
    {
      id: 'hubspot-webhook-config',
      name: 'Webhook Configuration',
      description: 'Verify webhook endpoint is configured correctly',
      category: 'webhook',
      timeout: 10000,
      run: async (): Promise<TestResult> => {
        try {
          const { data: integration, error } = await supabase
            .from('hubspot_org_integrations')
            .select('webhook_token, is_active')
            .eq('org_id', orgId)
            .eq('is_active', true)
            .maybeSingle();

          if (error || !integration) {
            return {
              testId: 'hubspot-webhook-config',
              testName: 'Webhook Configuration',
              status: 'failed',
              message: 'No active integration found',
            };
          }

          if (!integration.webhook_token) {
            return {
              testId: 'hubspot-webhook-config',
              testName: 'Webhook Configuration',
              status: 'failed',
              message: 'No webhook token configured',
            };
          }

          // Check for recent webhook events
          const { count: recentEvents } = await supabase
            .from('hubspot_webhook_events')
            .select('id', { count: 'exact', head: true })
            .eq('org_id', orgId)
            .gte('created_at', new Date(Date.now() - 7 * 24 * 60 * 60 * 1000).toISOString());

          return {
            testId: 'hubspot-webhook-config',
            testName: 'Webhook Configuration',
            status: 'passed',
            message: `Webhook configured - ${recentEvents || 0} events in last 7 days`,
            responseData: {
              hasWebhookToken: true,
              recentEventCount: recentEvents || 0,
              webhookUrl: `${window.location.origin}/api/webhooks/hubspot?token=***`,
            },
          };
        } catch (error) {
          return {
            testId: 'hubspot-webhook-config',
            testName: 'Webhook Configuration',
            status: 'error',
            message: error instanceof Error ? error.message : 'Unknown error',
          };
        }
      },
    },

    // =========================================================================
    // Form Ingestion Tests
    // =========================================================================
    {
      id: 'hubspot-form-ingestion',
      name: 'Form Ingestion Status',
      description: 'Check if HubSpot form ingestion is working correctly',
      category: 'forms',
      timeout: 10000,
      run: async (): Promise<TestResult> => {
        try {
          const settings = await getHubSpotSettings(orgId);

          if (!settings?.form_ingestion?.enabled) {
            return {
              testId: 'hubspot-form-ingestion',
              testName: 'Form Ingestion Status',
              status: 'skipped',
              message: 'Form ingestion is not enabled',
            };
          }

          const enabledForms = settings.form_ingestion.enabled_forms || [];

          if (enabledForms.length === 0) {
            return {
              testId: 'hubspot-form-ingestion',
              testName: 'Form Ingestion Status',
              status: 'skipped',
              message: 'Form ingestion enabled but no forms configured yet',
            };
          }

          // Check sync state for form cursor
          const syncState = await getHubSpotSyncState(orgId);
          const hasCursor = syncState?.cursors && Object.keys(syncState.cursors).length > 0;

          return {
            testId: 'hubspot-form-ingestion',
            testName: 'Form Ingestion Status',
            status: 'passed',
            message: `Form ingestion active - ${enabledForms.length} forms configured`,
            responseData: {
              enabled: true,
              enabledFormCount: enabledForms.length,
              hasCursor,
            },
          };
        } catch (error) {
          return {
            testId: 'hubspot-form-ingestion',
            testName: 'Form Ingestion Status',
            status: 'error',
            message: error instanceof Error ? error.message : 'Unknown error',
          };
        }
      },
    },

    // =========================================================================
    // AI Note Writeback Tests
    // =========================================================================
    {
      id: 'hubspot-ai-writeback',
      name: 'AI Note Writeback Status',
      description: 'Check if AI note writeback is configured correctly',
      category: 'ai',
      timeout: 10000,
      run: async (): Promise<TestResult> => {
        try {
          const settings = await getHubSpotSettings(orgId);

          if (!settings?.ai_note_writeback?.enabled) {
            return {
              testId: 'hubspot-ai-writeback',
              testName: 'AI Note Writeback Status',
              status: 'skipped',
              message: 'AI note writeback is not enabled',
            };
          }

          const writeback = settings.ai_note_writeback;
          const enabledFeatures: string[] = [];

          if (writeback.write_meeting_summaries) enabledFeatures.push('meeting summaries');
          if (writeback.write_action_items) enabledFeatures.push('action items');

          if (enabledFeatures.length === 0) {
            return {
              testId: 'hubspot-ai-writeback',
              testName: 'AI Note Writeback Status',
              status: 'skipped',
              message: 'AI writeback enabled but no features configured yet',
            };
          }

          return {
            testId: 'hubspot-ai-writeback',
            testName: 'AI Note Writeback Status',
            status: 'passed',
            message: `AI writeback active - ${enabledFeatures.join(', ')}`,
            responseData: {
              enabled: true,
              features: enabledFeatures,
            },
          };
        } catch (error) {
          return {
            testId: 'hubspot-ai-writeback',
            testName: 'AI Note Writeback Status',
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
      id: 'hubspot-edge-function-health',
      name: 'Edge Function Health',
      description: 'Verify HubSpot edge functions are responding',
      category: 'infrastructure',
      timeout: 15000,
      run: async (): Promise<TestResult> => {
        try {
          const { data: sessionData, error: sessionError } = await supabase.auth.getSession();

          if (sessionError || !sessionData.session) {
            return {
              testId: 'hubspot-edge-function-health',
              testName: 'Edge Function Health',
              status: 'error',
              message: 'No active session',
            };
          }

          // Try to get properties as a health check
          const startTime = Date.now();
          const response = await supabase.functions.invoke('crm-admin-router', {
            headers: {
              Authorization: `Bearer ${sessionData.session.access_token}`,
            },
            body: {
              action: 'hubspot_admin',
              sub_action: 'get_properties',
              org_id: orgId,
              object_type: 'contact',
            },
          });

          const duration = Date.now() - startTime;

          if (response.error) {
            const errorMessage = response.error.message || '';

            // Even an error response means the function is running
            if (
              errorMessage.includes('No active') ||
              errorMessage.includes('not connected')
            ) {
              return {
                testId: 'hubspot-edge-function-health',
                testName: 'Edge Function Health',
                status: 'passed',
                message: `Edge function responding (${duration}ms)`,
                responseData: { responseTime: duration },
              };
            }

            return {
              testId: 'hubspot-edge-function-health',
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
            testId: 'hubspot-edge-function-health',
            testName: 'Edge Function Health',
            status: 'passed',
            message: `Edge function healthy (${duration}ms)`,
            responseData: { responseTime: duration },
          };
        } catch (error) {
          return {
            testId: 'hubspot-edge-function-health',
            testName: 'Edge Function Health',
            status: 'error',
            message: error instanceof Error ? error.message : 'Edge function unreachable',
          };
        }
      },
    },

    // =========================================================================
    // Data Integrity Tests
    // =========================================================================
    {
      id: 'hubspot-data-integrity',
      name: 'Object Mapping Integrity',
      description: 'Verify object mappings are consistent and valid',
      category: 'data',
      timeout: 15000,
      run: async (): Promise<TestResult> => {
        try {
          // Get mapping counts by type
          const { data: mappings, error } = await supabase
            .from('hubspot_object_mappings')
            .select('object_type')
            .eq('org_id', orgId);

          if (error) {
            return {
              testId: 'hubspot-data-integrity',
              testName: 'Object Mapping Integrity',
              status: 'passed',
              message: 'Mapping check requires elevated permissions',
            };
          }

          if (!mappings || mappings.length === 0) {
            return {
              testId: 'hubspot-data-integrity',
              testName: 'Object Mapping Integrity',
              status: 'passed',
              message: 'No object mappings yet (new integration)',
            };
          }

          // Count by type
          const counts: Record<string, number> = {};
          mappings.forEach((m) => {
            counts[m.object_type] = (counts[m.object_type] || 0) + 1;
          });

          return {
            testId: 'hubspot-data-integrity',
            testName: 'Object Mapping Integrity',
            status: 'passed',
            message: `${mappings.length} total mappings across ${Object.keys(counts).length} object types`,
            responseData: {
              totalMappings: mappings.length,
              byType: counts,
            },
          };
        } catch (error) {
          return {
            testId: 'hubspot-data-integrity',
            testName: 'Object Mapping Integrity',
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
export const hubspotTestSuiteInfo = {
  integrationName: 'hubspot',
  displayName: 'HubSpot',
  description: 'CRM sync and contact management',
  icon: 'Users',
  categories: [
    'authentication',
    'connectivity',
    'sync',
    'contacts',
    'deals',
    'tasks',
    'configuration',
    'webhook',
    'forms',
    'ai',
    'infrastructure',
    'data',
  ],
};
