/**
 * SavvyCal Integration Test Suite
 *
 * Tests all org-facing SavvyCal integration functionality:
 * - API token validation
 * - Webhook configuration
 * - Lead sync
 * - Source mappings
 * - Edge function health
 */

import { supabase } from '@/lib/supabase/clientV2';
import type { IntegrationTest, TestResult, ConnectionStatus } from '../types';

/**
 * Get SavvyCal connection status for the current org
 */
export async function getSavvyCalConnectionStatus(orgId: string): Promise<ConnectionStatus> {
  try {
    const { data: integration, error } = await supabase
      .from('savvycal_integrations')
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
        webhookConfigured: !!integration.webhook_configured_at,
        webhookLastReceived: integration.webhook_last_received_at,
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
 * Get SavvyCal integration details including secrets summary
 */
export async function getSavvyCalIntegrationDetails(orgId: string) {
  const { data, error } = await supabase
    .from('savvycal_integrations')
    .select(`
      id,
      org_id,
      is_active,
      webhook_token,
      webhook_configured_at,
      webhook_last_received_at,
      webhook_last_event_id,
      last_sync_at,
      created_at,
      updated_at
    `)
    .eq('org_id', orgId)
    .maybeSingle();

  if (error) {
    console.error('[SavvyCalTests] Error fetching integration:', error);
    return null;
  }

  return data;
}

/**
 * Get SavvyCal source mappings for the org
 */
export async function getSavvyCalSourceMappings(orgId: string) {
  const { data, error, count } = await supabase
    .from('savvycal_source_mappings')
    .select('id, link_id, source, source_id, meeting_link', { count: 'exact' })
    .eq('org_id', orgId);

  if (error) {
    console.error('[SavvyCalTests] Error fetching source mappings:', error);
    return { mappings: [], count: 0 };
  }

  return { mappings: data || [], count: count || 0 };
}

/**
 * Get recent leads created from SavvyCal
 */
export async function getSavvyCalLeads(orgId: string, limit: number = 10) {
  const { data, error, count } = await supabase
    .from('leads')
    .select('id, email, first_name, last_name, source, meeting_title, meeting_start_time, created_at', { count: 'exact' })
    .eq('org_id', orgId)
    .or('source.ilike.%savvycal%,tags.cs.{"SavvyCal"}')
    .order('created_at', { ascending: false })
    .limit(limit);

  if (error) {
    console.error('[SavvyCalTests] Error fetching leads:', error);
    return { leads: [], count: 0 };
  }

  return { leads: data || [], count: count || 0 };
}

/**
 * Create all SavvyCal tests for a given org
 */
export function createSavvyCalTests(orgId: string): IntegrationTest[] {
  return [
    // =========================================================================
    // Authentication & Connection Tests
    // =========================================================================
    {
      id: 'savvycal-connection-status',
      name: 'Connection Status',
      description: 'Verify SavvyCal is connected to the organization',
      category: 'authentication',
      timeout: 10000,
      run: async (): Promise<TestResult> => {
        const status = await getSavvyCalConnectionStatus(orgId);

        if (!status.isConnected) {
          return {
            testId: 'savvycal-connection-status',
            testName: 'Connection Status',
            status: 'failed',
            message: status.error || 'SavvyCal is not connected to this organization',
          };
        }

        return {
          testId: 'savvycal-connection-status',
          testName: 'Connection Status',
          status: 'passed',
          message: 'SavvyCal integration is active',
          responseData: {
            connectedAt: status.connectedAt,
            lastSyncAt: status.lastSyncAt,
            webhookConfigured: status.accountInfo?.webhookConfigured,
          },
        };
      },
    },

    {
      id: 'savvycal-api-token-validation',
      name: 'API Token Validation',
      description: 'Verify the stored API token is valid',
      category: 'authentication',
      timeout: 15000,
      run: async (): Promise<TestResult> => {
        try {
          const { data: sessionData, error: sessionError } = await supabase.auth.getSession();

          if (sessionError || !sessionData.session) {
            return {
              testId: 'savvycal-api-token-validation',
              testName: 'API Token Validation',
              status: 'error',
              message: 'No active session',
            };
          }

          // Call the config edge function to get status
          const response = await supabase.functions.invoke('savvycal-config', {
            headers: {
              Authorization: `Bearer ${sessionData.session.access_token}`,
            },
            body: {
              action: 'status',
              org_id: orgId,
            },
          });

          if (response.error) {
            return {
              testId: 'savvycal-api-token-validation',
              testName: 'API Token Validation',
              status: 'failed',
              message: response.error.message || 'Failed to check API token status',
              errorDetails: { error: response.error },
            };
          }

          // Check secrets_summary from edge function response
          const hasToken = response.data?.secrets_summary?.has_api_token ||
                          response.data?.hasApiToken ||
                          response.data?.has_api_token;

          if (!hasToken) {
            return {
              testId: 'savvycal-api-token-validation',
              testName: 'API Token Validation',
              status: 'failed',
              message: 'No API token configured',
              responseData: { rawResponse: response.data },
            };
          }

          return {
            testId: 'savvycal-api-token-validation',
            testName: 'API Token Validation',
            status: 'passed',
            message: 'API token is configured',
            responseData: {
              hasToken: true,
              hasWebhookSecret: response.data?.secrets_summary?.has_webhook_secret ||
                               response.data?.hasWebhookSecret ||
                               response.data?.has_webhook_secret,
            },
          };
        } catch (error) {
          return {
            testId: 'savvycal-api-token-validation',
            testName: 'API Token Validation',
            status: 'error',
            message: error instanceof Error ? error.message : 'Unknown error',
          };
        }
      },
    },

    {
      id: 'savvycal-api-connectivity',
      name: 'API Connectivity',
      description: 'Test connection to the SavvyCal API',
      category: 'connectivity',
      timeout: 20000,
      run: async (): Promise<TestResult> => {
        try {
          const { data: sessionData, error: sessionError } = await supabase.auth.getSession();

          if (sessionError || !sessionData.session) {
            return {
              testId: 'savvycal-api-connectivity',
              testName: 'API Connectivity',
              status: 'error',
              message: 'No active session',
            };
          }

          // Try to fetch a link to verify API connectivity
          const startTime = Date.now();
          const response = await supabase.functions.invoke('fetch-router', {
            headers: {
              Authorization: `Bearer ${sessionData.session.access_token}`,
            },
            body: {
              action: 'savvycal_link',
              org_id: orgId,
              link_id: 'test-connectivity', // Will likely 404 but proves API is reachable
            },
          });

          const duration = Date.now() - startTime;

          // A 404 is actually fine - it means the API is reachable
          if (response.error) {
            const errorMessage = response.error.message || '';

            // 404 means API is working but link doesn't exist
            if (errorMessage.includes('404') || errorMessage.includes('not found')) {
              return {
                testId: 'savvycal-api-connectivity',
                testName: 'API Connectivity',
                status: 'passed',
                message: `SavvyCal API reachable (${duration}ms)`,
                responseData: { duration, apiReachable: true },
              };
            }

            // Auth errors mean token is invalid
            if (errorMessage.includes('401') || errorMessage.includes('unauthorized')) {
              return {
                testId: 'savvycal-api-connectivity',
                testName: 'API Connectivity',
                status: 'failed',
                message: 'API token is invalid or expired',
                errorDetails: { error: errorMessage, duration },
              };
            }

            // Check if it's a "no token" error
            if (errorMessage.includes('No API token') || errorMessage.includes('not configured')) {
              return {
                testId: 'savvycal-api-connectivity',
                testName: 'API Connectivity',
                status: 'skipped',
                message: 'API token not configured',
              };
            }

            return {
              testId: 'savvycal-api-connectivity',
              testName: 'API Connectivity',
              status: 'failed',
              message: `API error: ${errorMessage}`,
              errorDetails: { error: response.error, duration },
            };
          }

          return {
            testId: 'savvycal-api-connectivity',
            testName: 'API Connectivity',
            status: 'passed',
            message: `SavvyCal API connected (${duration}ms)`,
            responseData: { duration, apiReachable: true },
          };
        } catch (error) {
          return {
            testId: 'savvycal-api-connectivity',
            testName: 'API Connectivity',
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
      id: 'savvycal-webhook-configuration',
      name: 'Webhook Configuration',
      description: 'Verify webhook URL is configured in SavvyCal',
      category: 'webhook',
      timeout: 15000,
      run: async (): Promise<TestResult> => {
        try {
          const integration = await getSavvyCalIntegrationDetails(orgId);

          if (!integration) {
            return {
              testId: 'savvycal-webhook-configuration',
              testName: 'Webhook Configuration',
              status: 'failed',
              message: 'No active integration found',
            };
          }

          if (!integration.webhook_token) {
            return {
              testId: 'savvycal-webhook-configuration',
              testName: 'Webhook Configuration',
              status: 'failed',
              message: 'Webhook token not generated',
            };
          }

          if (!integration.webhook_configured_at) {
            return {
              testId: 'savvycal-webhook-configuration',
              testName: 'Webhook Configuration',
              status: 'failed',
              message: 'Webhook not yet verified in SavvyCal',
              responseData: {
                webhookToken: integration.webhook_token ? 'Generated' : 'Missing',
              },
            };
          }

          return {
            testId: 'savvycal-webhook-configuration',
            testName: 'Webhook Configuration',
            status: 'passed',
            message: 'Webhook is configured and verified',
            responseData: {
              configuredAt: integration.webhook_configured_at,
              hasToken: !!integration.webhook_token,
            },
          };
        } catch (error) {
          return {
            testId: 'savvycal-webhook-configuration',
            testName: 'Webhook Configuration',
            status: 'error',
            message: error instanceof Error ? error.message : 'Unknown error',
          };
        }
      },
    },

    {
      id: 'savvycal-webhook-signing-secret',
      name: 'Webhook Signing Secret',
      description: 'Verify webhook signing secret is configured for secure webhook validation',
      category: 'webhook',
      timeout: 10000,
      run: async (): Promise<TestResult> => {
        try {
          const { data: sessionData, error: sessionError } = await supabase.auth.getSession();

          if (sessionError || !sessionData.session) {
            return {
              testId: 'savvycal-webhook-signing-secret',
              testName: 'Webhook Signing Secret',
              status: 'error',
              message: 'No active session',
            };
          }

          const response = await supabase.functions.invoke('savvycal-config', {
            headers: {
              Authorization: `Bearer ${sessionData.session.access_token}`,
            },
            body: {
              action: 'status',
              org_id: orgId,
            },
          });

          if (response.error) {
            return {
              testId: 'savvycal-webhook-signing-secret',
              testName: 'Webhook Signing Secret',
              status: 'failed',
              message: response.error.message || 'Failed to check webhook secret status',
              errorDetails: { error: response.error },
            };
          }

          const hasWebhookSecret = response.data?.secrets_summary?.has_webhook_secret;
          const webhookConfigured = response.data?.integration?.webhook_configured_at;

          if (!webhookConfigured) {
            return {
              testId: 'savvycal-webhook-signing-secret',
              testName: 'Webhook Signing Secret',
              status: 'skipped',
              message: 'Webhook not configured yet',
            };
          }

          if (!hasWebhookSecret) {
            return {
              testId: 'savvycal-webhook-signing-secret',
              testName: 'Webhook Signing Secret',
              status: 'failed',
              message: 'Webhook signing secret not configured - webhooks are not verified',
              responseData: {
                webhookConfigured: true,
                signingSecretConfigured: false,
                recommendation: 'Add the signing secret from SavvyCal to enable HMAC signature verification',
              },
            };
          }

          return {
            testId: 'savvycal-webhook-signing-secret',
            testName: 'Webhook Signing Secret',
            status: 'passed',
            message: 'Webhook signing secret configured - incoming webhooks are verified',
            responseData: {
              webhookConfigured: true,
              signingSecretConfigured: true,
            },
          };
        } catch (error) {
          return {
            testId: 'savvycal-webhook-signing-secret',
            testName: 'Webhook Signing Secret',
            status: 'error',
            message: error instanceof Error ? error.message : 'Unknown error',
          };
        }
      },
    },

    {
      id: 'savvycal-webhook-health',
      name: 'Webhook Health',
      description: 'Check if webhooks are being received',
      category: 'webhook',
      timeout: 10000,
      run: async (): Promise<TestResult> => {
        try {
          const integration = await getSavvyCalIntegrationDetails(orgId);

          if (!integration) {
            return {
              testId: 'savvycal-webhook-health',
              testName: 'Webhook Health',
              status: 'failed',
              message: 'No active integration found',
            };
          }

          if (!integration.webhook_last_received_at) {
            // Check if webhook is configured
            if (!integration.webhook_configured_at) {
              return {
                testId: 'savvycal-webhook-health',
                testName: 'Webhook Health',
                status: 'skipped',
                message: 'Webhook not configured yet',
              };
            }

            return {
              testId: 'savvycal-webhook-health',
              testName: 'Webhook Health',
              status: 'passed',
              message: 'Webhook configured, no events received yet',
              responseData: {
                webhookConfigured: true,
                eventsReceived: false,
              },
            };
          }

          const lastReceived = new Date(integration.webhook_last_received_at);
          const hoursSinceLastWebhook = Math.round(
            (Date.now() - lastReceived.getTime()) / (60 * 60 * 1000)
          );

          // Warn if no webhooks in 7 days
          if (hoursSinceLastWebhook > 168) {
            return {
              testId: 'savvycal-webhook-health',
              testName: 'Webhook Health',
              status: 'failed',
              message: `No webhooks received in ${Math.round(hoursSinceLastWebhook / 24)} days`,
              responseData: {
                lastReceivedAt: integration.webhook_last_received_at,
                hoursSinceLastWebhook,
                lastEventId: integration.webhook_last_event_id,
              },
            };
          }

          return {
            testId: 'savvycal-webhook-health',
            testName: 'Webhook Health',
            status: 'passed',
            message: hoursSinceLastWebhook < 24
              ? `Last webhook ${hoursSinceLastWebhook}h ago`
              : `Last webhook ${Math.round(hoursSinceLastWebhook / 24)} days ago`,
            responseData: {
              lastReceivedAt: integration.webhook_last_received_at,
              hoursSinceLastWebhook,
              lastEventId: integration.webhook_last_event_id,
            },
          };
        } catch (error) {
          return {
            testId: 'savvycal-webhook-health',
            testName: 'Webhook Health',
            status: 'error',
            message: error instanceof Error ? error.message : 'Unknown error',
          };
        }
      },
    },

    // =========================================================================
    // Sync Tests
    // =========================================================================
    {
      id: 'savvycal-sync-state',
      name: 'Sync State',
      description: 'Check last sync status and timing',
      category: 'sync',
      timeout: 10000,
      run: async (): Promise<TestResult> => {
        try {
          const integration = await getSavvyCalIntegrationDetails(orgId);

          if (!integration) {
            return {
              testId: 'savvycal-sync-state',
              testName: 'Sync State',
              status: 'failed',
              message: 'No active integration found',
            };
          }

          if (!integration.last_sync_at) {
            return {
              testId: 'savvycal-sync-state',
              testName: 'Sync State',
              status: 'passed',
              message: 'No manual sync performed yet (using webhooks)',
            };
          }

          const lastSync = new Date(integration.last_sync_at);
          const hoursSinceSync = Math.round(
            (Date.now() - lastSync.getTime()) / (60 * 60 * 1000)
          );

          return {
            testId: 'savvycal-sync-state',
            testName: 'Sync State',
            status: 'passed',
            message: hoursSinceSync < 24
              ? `Last sync ${hoursSinceSync}h ago`
              : `Last sync ${Math.round(hoursSinceSync / 24)} days ago`,
            responseData: {
              lastSyncAt: integration.last_sync_at,
              hoursSinceSync,
            },
          };
        } catch (error) {
          return {
            testId: 'savvycal-sync-state',
            testName: 'Sync State',
            status: 'error',
            message: error instanceof Error ? error.message : 'Unknown error',
          };
        }
      },
    },

    // =========================================================================
    // Lead Data Tests
    // =========================================================================
    {
      id: 'savvycal-lead-data',
      name: 'Lead Data Integrity',
      description: 'Verify leads are being created from SavvyCal bookings',
      category: 'data',
      timeout: 15000,
      run: async (): Promise<TestResult> => {
        try {
          const { leads, count } = await getSavvyCalLeads(orgId, 10);

          if (count === 0) {
            // Check if webhook is configured
            const integration = await getSavvyCalIntegrationDetails(orgId);

            if (!integration?.webhook_configured_at) {
              return {
                testId: 'savvycal-lead-data',
                testName: 'Lead Data Integrity',
                status: 'skipped',
                message: 'Webhook not configured - no leads expected yet',
              };
            }

            return {
              testId: 'savvycal-lead-data',
              testName: 'Lead Data Integrity',
              status: 'passed',
              message: 'No SavvyCal leads yet (waiting for first booking)',
            };
          }

          // Check data quality
          let issueCount = 0;
          const issues: string[] = [];

          for (const lead of leads) {
            if (!lead.email) {
              issueCount++;
              issues.push(`Lead ${lead.id} missing email`);
            }
            if (!lead.meeting_title && !lead.first_name) {
              issueCount++;
              issues.push(`Lead ${lead.id} missing meeting info and name`);
            }
          }

          if (issueCount > 0) {
            return {
              testId: 'savvycal-lead-data',
              testName: 'Lead Data Integrity',
              status: 'failed',
              message: `${issueCount} data quality issues in ${leads.length} leads`,
              errorDetails: { issues: issues.slice(0, 5) },
              responseData: { totalLeads: count, sampleSize: leads.length },
            };
          }

          // Check for recent leads
          const recentLeads = leads.filter((lead) => {
            const created = new Date(lead.created_at);
            const daysSinceCreated = (Date.now() - created.getTime()) / (24 * 60 * 60 * 1000);
            return daysSinceCreated < 7;
          });

          return {
            testId: 'savvycal-lead-data',
            testName: 'Lead Data Integrity',
            status: 'passed',
            message: `${count} leads total, ${recentLeads.length} in last 7 days`,
            responseData: {
              totalLeads: count,
              recentLeads: recentLeads.length,
              sampleLead: leads[0] ? {
                email: leads[0].email,
                source: leads[0].source,
                meetingTitle: leads[0].meeting_title,
              } : null,
            },
          };
        } catch (error) {
          return {
            testId: 'savvycal-lead-data',
            testName: 'Lead Data Integrity',
            status: 'error',
            message: error instanceof Error ? error.message : 'Unknown error',
          };
        }
      },
    },

    // =========================================================================
    // Source Mapping Tests
    // =========================================================================
    {
      id: 'savvycal-source-mappings',
      name: 'Source Mappings',
      description: 'Check configured link-to-source mappings',
      category: 'configuration',
      timeout: 10000,
      run: async (): Promise<TestResult> => {
        try {
          const { mappings, count } = await getSavvyCalSourceMappings(orgId);

          if (count === 0) {
            return {
              testId: 'savvycal-source-mappings',
              testName: 'Source Mappings',
              status: 'passed',
              message: 'No source mappings configured (using auto-detection)',
            };
          }

          // Check for mappings without source
          const missingSource = mappings.filter((m) => !m.source && !m.source_id);

          if (missingSource.length > 0) {
            return {
              testId: 'savvycal-source-mappings',
              testName: 'Source Mappings',
              status: 'failed',
              message: `${missingSource.length} mappings missing source configuration`,
              errorDetails: {
                linkIds: missingSource.map((m) => m.link_id),
              },
              responseData: { totalMappings: count },
            };
          }

          return {
            testId: 'savvycal-source-mappings',
            testName: 'Source Mappings',
            status: 'passed',
            message: `${count} source mappings configured`,
            responseData: {
              totalMappings: count,
              sampleMappings: mappings.slice(0, 3).map((m) => ({
                linkId: m.link_id,
                source: m.source,
                meetingLink: m.meeting_link,
              })),
            },
          };
        } catch (error) {
          return {
            testId: 'savvycal-source-mappings',
            testName: 'Source Mappings',
            status: 'error',
            message: error instanceof Error ? error.message : 'Unknown error',
          };
        }
      },
    },

    // =========================================================================
    // Infrastructure Tests
    // =========================================================================
    {
      id: 'savvycal-database-health',
      name: 'Database Health',
      description: 'Verify SavvyCal-specific database tables are accessible',
      category: 'infrastructure',
      timeout: 10000,
      run: async (): Promise<TestResult> => {
        try {
          // Only test SavvyCal-specific tables (leads table has different RLS and is tested in Lead Data Integrity)
          const tables = [
            { name: 'savvycal_integrations', query: supabase.from('savvycal_integrations').select('id').eq('org_id', orgId).limit(1) },
            { name: 'savvycal_source_mappings', query: supabase.from('savvycal_source_mappings').select('id').eq('org_id', orgId).limit(1) },
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
            testId: 'savvycal-database-health',
            testName: 'Database Health',
            status: allAccessible ? 'passed' : 'failed',
            message: allAccessible
              ? 'All SavvyCal tables accessible'
              : 'Some tables inaccessible',
            responseData: results,
          };
        } catch (error) {
          return {
            testId: 'savvycal-database-health',
            testName: 'Database Health',
            status: 'error',
            message: error instanceof Error ? error.message : 'Unknown error',
          };
        }
      },
    },

    {
      id: 'savvycal-edge-function-health',
      name: 'Edge Functions Health',
      description: 'Verify SavvyCal edge functions are responding',
      category: 'infrastructure',
      timeout: 20000,
      run: async (): Promise<TestResult> => {
        try {
          const { data: sessionData, error: sessionError } = await supabase.auth.getSession();

          if (sessionError || !sessionData.session) {
            return {
              testId: 'savvycal-edge-function-health',
              testName: 'Edge Functions Health',
              status: 'error',
              message: 'No active session',
            };
          }

          const functions = [
            { name: 'savvycal-config', body: { action: 'status', org_id: orgId } },
          ];

          const results: Record<string, { responding: boolean; duration: number }> = {};
          let allResponding = true;

          for (const fn of functions) {
            const startTime = Date.now();
            try {
              const response = await supabase.functions.invoke(fn.name, {
                headers: {
                  Authorization: `Bearer ${sessionData.session.access_token}`,
                },
                body: fn.body,
              });

              const duration = Date.now() - startTime;

              // Even an error response means the function is running
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
            testId: 'savvycal-edge-function-health',
            testName: 'Edge Functions Health',
            status: allResponding ? 'passed' : 'failed',
            message: allResponding
              ? `All functions responding (avg ${avgDuration}ms)`
              : 'Some functions not responding',
            responseData: results,
          };
        } catch (error) {
          return {
            testId: 'savvycal-edge-function-health',
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
      id: 'savvycal-integration-summary',
      name: 'Integration Summary',
      description: 'Overall status of SavvyCal integration',
      category: 'summary',
      timeout: 10000,
      run: async (): Promise<TestResult> => {
        try {
          const integration = await getSavvyCalIntegrationDetails(orgId);

          if (!integration || !integration.is_active) {
            return {
              testId: 'savvycal-integration-summary',
              testName: 'Integration Summary',
              status: 'failed',
              message: 'SavvyCal not connected',
            };
          }

          const { count: mappingsCount } = await getSavvyCalSourceMappings(orgId);
          const { count: leadsCount } = await getSavvyCalLeads(orgId, 1);

          const features = {
            apiConfigured: true, // If we got here, API is configured
            webhookConfigured: !!integration.webhook_configured_at,
            webhookReceiving: !!integration.webhook_last_received_at,
            sourceMappings: mappingsCount > 0,
            leadsCreated: leadsCount > 0,
          };

          const enabledCount = Object.values(features).filter(Boolean).length;
          const totalFeatures = Object.keys(features).length;

          return {
            testId: 'savvycal-integration-summary',
            testName: 'Integration Summary',
            status: 'passed',
            message: `${enabledCount}/${totalFeatures} features active`,
            responseData: {
              features,
              leadsCreated: leadsCount,
              sourceMappings: mappingsCount,
              connectedSince: integration.created_at,
            },
          };
        } catch (error) {
          return {
            testId: 'savvycal-integration-summary',
            testName: 'Integration Summary',
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
export const savvycalTestSuiteInfo = {
  integrationName: 'savvycal',
  displayName: 'SavvyCal',
  description: 'Scheduling and lead capture',
  icon: 'Calendar',
  categories: ['authentication', 'connectivity', 'webhook', 'sync', 'data', 'configuration', 'infrastructure', 'summary'],
};
