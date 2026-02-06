/**
 * Integration Health Batch Edge Function
 *
 * Consolidates all integration health checks into a single request.
 * Used by admin dashboard to display integration status for all services.
 *
 * Supported integrations:
 * - google: Gmail, Calendar, Drive connectivity
 * - fathom: Meeting recording service
 * - hubspot: CRM sync (if configured)
 * - slack: Notifications integration
 * - justcall: Phone integration (if configured)
 * - savvycal: Scheduling integration (if configured)
 */

import { serve } from 'https://deno.land/std@0.168.0/http/server.ts';
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers':
    'authorization, x-client-info, apikey, content-type',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
};

// ============================================================================
// Types
// ============================================================================

type IntegrationType =
  | 'google'
  | 'fathom'
  | 'hubspot'
  | 'slack'
  | 'justcall'
  | 'savvycal';

interface IntegrationStatus {
  connected: boolean;
  status: 'connected' | 'disconnected' | 'error' | 'expired' | 'not_configured';
  lastSync?: string;
  error?: string;
  details?: Record<string, unknown>;
}

interface BatchRequest {
  integrations: IntegrationType[];
  userId?: string; // Optional - defaults to authenticated user
}

interface BatchResponse {
  results: Record<IntegrationType, IntegrationStatus>;
  totalTime: number;
  checkedCount: number;
}

// ============================================================================
// Integration Health Checkers
// ============================================================================

type HealthChecker = (
  supabase: ReturnType<typeof createClient>,
  userId: string
) => Promise<IntegrationStatus>;

// Google Integration Health Check
const checkGoogleHealth: HealthChecker = async (supabase, userId) => {
  try {
    const { data: integration, error } = await supabase
      .from('google_integrations')
      .select('id, email, expires_at, is_active, scopes, updated_at')
      .eq('user_id', userId)
      .eq('is_active', true)
      .maybeSingle();

    if (error) throw error;

    if (!integration) {
      return {
        connected: false,
        status: 'not_configured',
      };
    }

    // Check if token is expired
    const expiresAt = new Date(integration.expires_at);
    const now = new Date();
    const isExpired = expiresAt <= now;

    if (isExpired) {
      return {
        connected: true,
        status: 'expired',
        details: {
          email: integration.email,
          expiredAt: integration.expires_at,
        },
      };
    }

    // Get sync status for more details
    const { data: syncStatus } = await supabase
      .from('email_sync_status')
      .select('last_sync_at, sync_enabled, consecutive_errors, last_error')
      .eq('integration_id', integration.id)
      .maybeSingle();

    return {
      connected: true,
      status: 'connected',
      lastSync: syncStatus?.last_sync_at || integration.updated_at,
      details: {
        email: integration.email,
        scopes: integration.scopes,
        syncEnabled: syncStatus?.sync_enabled ?? true,
        consecutiveErrors: syncStatus?.consecutive_errors || 0,
        lastError: syncStatus?.last_error || null,
      },
    };
  } catch (err) {
    return {
      connected: false,
      status: 'error',
      error: err instanceof Error ? err.message : 'Unknown error',
    };
  }
};

// Fathom Integration Health Check (Enhanced with sync status)
const checkFathomHealth: HealthChecker = async (supabase, userId) => {
  try {
    const { data: integration, error } = await supabase
      .from('fathom_integrations')
      .select('id, fathom_user_email, token_expires_at, is_active, updated_at')
      .eq('user_id', userId)
      .eq('is_active', true)
      .maybeSingle();

    if (error) throw error;

    if (!integration) {
      return {
        connected: false,
        status: 'not_configured',
      };
    }

    // Check if token is expired
    const expiresAt = new Date(integration.token_expires_at);
    const now = new Date();
    const isExpired = expiresAt <= now;

    if (isExpired) {
      return {
        connected: true,
        status: 'expired',
        details: {
          email: integration.fathom_user_email,
          expiredAt: integration.token_expires_at,
        },
      };
    }

    // Get sync state for detailed health info
    const { data: syncState } = await supabase
      .from('fathom_sync_state')
      .select('last_sync_completed_at, last_sync_error, error_count, sync_status')
      .eq('user_id', userId)
      .maybeSingle();

    // Get recent meeting count (last 90 days)
    const since90d = new Date(Date.now() - 90 * 24 * 60 * 60 * 1000).toISOString();
    const { count: recentMeetingCount } = await supabase
      .from('meetings')
      .select('id', { count: 'exact', head: true })
      .eq('owner_user_id', userId)
      .not('fathom_recording_id', 'is', null)
      .gte('meeting_start', since90d);

    // Get total meeting count
    const { count: totalMeetingCount } = await supabase
      .from('meetings')
      .select('id', { count: 'exact', head: true })
      .eq('owner_user_id', userId)
      .not('fathom_recording_id', 'is', null);

    // Get recent cron job logs for this user
    const { data: recentCronLogs } = await supabase
      .from('cron_job_logs')
      .select('status, message, created_at')
      .eq('user_id', userId)
      .in('job_name', ['fathom_hourly_sync', 'fathom_cron_sync_v2'])
      .order('created_at', { ascending: false })
      .limit(5);

    // Calculate sync health metrics
    const lastSyncAt = syncState?.last_sync_completed_at;
    const hoursSinceSync = lastSyncAt
      ? (Date.now() - new Date(lastSyncAt).getTime()) / (1000 * 60 * 60)
      : null;

    // Determine sync health status
    let syncHealth: 'healthy' | 'stale' | 'failing' | 'unknown' = 'unknown';
    if (hoursSinceSync !== null) {
      if (hoursSinceSync < 2 && (syncState?.error_count ?? 0) === 0) {
        syncHealth = 'healthy';
      } else if (hoursSinceSync < 24 && (syncState?.error_count ?? 0) < 3) {
        syncHealth = 'healthy';
      } else if ((syncState?.error_count ?? 0) >= 3) {
        syncHealth = 'failing';
      } else if (hoursSinceSync >= 24) {
        syncHealth = 'stale';
      }
    }

    // Count recent cron successes vs failures
    const cronSuccessCount = recentCronLogs?.filter(l => l.status === 'success').length ?? 0;
    const cronFailureCount = recentCronLogs?.filter(l => l.status === 'error').length ?? 0;

    return {
      connected: true,
      status: 'connected',
      lastSync: lastSyncAt || integration.updated_at,
      details: {
        email: integration.fathom_user_email,
        meetingsLast90Days: recentMeetingCount || 0,
        totalMeetings: totalMeetingCount || 0,
        syncHealth,
        hoursSinceLastSync: hoursSinceSync ? Math.round(hoursSinceSync * 10) / 10 : null,
        errorCount: syncState?.error_count ?? 0,
        lastError: syncState?.last_sync_error || null,
        syncStatus: syncState?.sync_status || 'idle',
        cronJobHealth: {
          recentSuccesses: cronSuccessCount,
          recentFailures: cronFailureCount,
          lastCronRuns: recentCronLogs?.map(l => ({
            status: l.status,
            message: l.message,
            at: l.created_at,
          })) || [],
        },
      },
    };
  } catch (err) {
    return {
      connected: false,
      status: 'error',
      error: err instanceof Error ? err.message : 'Unknown error',
    };
  }
};

// HubSpot Integration Health Check
const checkHubspotHealth: HealthChecker = async (supabase, userId) => {
  try {
    // First get user's org
    const { data: profile } = await supabase
      .from('profiles')
      .select('organization_id')
      .eq('id', userId)
      .single();

    if (!profile?.organization_id) {
      return {
        connected: false,
        status: 'not_configured',
      };
    }

    const { data: integration, error } = await supabase
      .from('hubspot_integrations')
      .select('id, hub_id, expires_at, is_active, updated_at')
      .eq('organization_id', profile.organization_id)
      .eq('is_active', true)
      .maybeSingle();

    if (error) throw error;

    if (!integration) {
      return {
        connected: false,
        status: 'not_configured',
      };
    }

    // Check if token is expired
    const expiresAt = new Date(integration.expires_at);
    const now = new Date();
    const isExpired = expiresAt <= now;

    if (isExpired) {
      return {
        connected: true,
        status: 'expired',
        details: {
          hubId: integration.hub_id,
          expiredAt: integration.expires_at,
        },
      };
    }

    return {
      connected: true,
      status: 'connected',
      lastSync: integration.updated_at,
      details: {
        hubId: integration.hub_id,
      },
    };
  } catch (err) {
    return {
      connected: false,
      status: 'error',
      error: err instanceof Error ? err.message : 'Unknown error',
    };
  }
};

// Slack Integration Health Check
const checkSlackHealth: HealthChecker = async (supabase, userId) => {
  try {
    // Get user's org
    const { data: profile } = await supabase
      .from('profiles')
      .select('organization_id')
      .eq('id', userId)
      .single();

    if (!profile?.organization_id) {
      return {
        connected: false,
        status: 'not_configured',
      };
    }

    const { data: integration, error } = await supabase
      .from('slack_integrations')
      .select('id, team_name, channel_id, is_active, updated_at')
      .eq('organization_id', profile.organization_id)
      .eq('is_active', true)
      .maybeSingle();

    if (error) throw error;

    if (!integration) {
      return {
        connected: false,
        status: 'not_configured',
      };
    }

    // Get recent notification count
    const { count: notificationCount } = await supabase
      .from('slack_notifications_log')
      .select('id', { count: 'exact', head: true })
      .eq('integration_id', integration.id)
      .gte(
        'created_at',
        new Date(Date.now() - 7 * 24 * 60 * 60 * 1000).toISOString()
      );

    return {
      connected: true,
      status: 'connected',
      lastSync: integration.updated_at,
      details: {
        teamName: integration.team_name,
        channelId: integration.channel_id,
        notificationsLast7Days: notificationCount || 0,
      },
    };
  } catch (err) {
    return {
      connected: false,
      status: 'error',
      error: err instanceof Error ? err.message : 'Unknown error',
    };
  }
};

// JustCall Integration Health Check
const checkJustcallHealth: HealthChecker = async (supabase, userId) => {
  try {
    const { data: integration, error } = await supabase
      .from('justcall_integrations')
      .select('id, is_active, updated_at')
      .eq('user_id', userId)
      .eq('is_active', true)
      .maybeSingle();

    if (error) throw error;

    if (!integration) {
      return {
        connected: false,
        status: 'not_configured',
      };
    }

    return {
      connected: true,
      status: 'connected',
      lastSync: integration.updated_at,
    };
  } catch (err) {
    // JustCall might not be set up - that's fine
    if (
      err instanceof Error &&
      (err.message.includes('does not exist') ||
        err.message.includes('relation'))
    ) {
      return {
        connected: false,
        status: 'not_configured',
      };
    }

    return {
      connected: false,
      status: 'error',
      error: err instanceof Error ? err.message : 'Unknown error',
    };
  }
};

// SavvyCal Integration Health Check
const checkSavvycalHealth: HealthChecker = async (supabase, userId) => {
  try {
    const { data: integration, error } = await supabase
      .from('savvycal_integrations')
      .select('id, email, is_active, updated_at')
      .eq('user_id', userId)
      .eq('is_active', true)
      .maybeSingle();

    if (error) throw error;

    if (!integration) {
      return {
        connected: false,
        status: 'not_configured',
      };
    }

    // Get recent events synced
    const { count: eventCount } = await supabase
      .from('savvycal_events')
      .select('id', { count: 'exact', head: true })
      .eq('user_id', userId)
      .gte(
        'created_at',
        new Date(Date.now() - 30 * 24 * 60 * 60 * 1000).toISOString()
      );

    return {
      connected: true,
      status: 'connected',
      lastSync: integration.updated_at,
      details: {
        email: integration.email,
        eventsLast30Days: eventCount || 0,
      },
    };
  } catch (err) {
    // SavvyCal might not be set up - that's fine
    if (
      err instanceof Error &&
      (err.message.includes('does not exist') ||
        err.message.includes('relation'))
    ) {
      return {
        connected: false,
        status: 'not_configured',
      };
    }

    return {
      connected: false,
      status: 'error',
      error: err instanceof Error ? err.message : 'Unknown error',
    };
  }
};

const healthCheckers: Record<IntegrationType, HealthChecker> = {
  google: checkGoogleHealth,
  fathom: checkFathomHealth,
  hubspot: checkHubspotHealth,
  slack: checkSlackHealth,
  justcall: checkJustcallHealth,
  savvycal: checkSavvycalHealth,
};

// ============================================================================
// Main Handler
// ============================================================================

serve(async (req) => {
  // Handle CORS preflight
  if (req.method === 'OPTIONS') {
    return new Response('ok', { headers: corsHeaders });
  }

  if (req.method !== 'POST') {
    return new Response(
      JSON.stringify({ error: 'Method not allowed. Use POST.' }),
      {
        status: 405,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      }
    );
  }

  const startTime = Date.now();

  try {
    // Get authorization
    const authHeader = req.headers.get('Authorization');
    if (!authHeader) {
      throw new Error('Authorization required');
    }

    // Parse request
    const body: BatchRequest = await req.json();
    const { integrations, userId: requestUserId } = body;

    if (
      !integrations ||
      !Array.isArray(integrations) ||
      integrations.length === 0
    ) {
      throw new Error('integrations array is required and must not be empty');
    }

    // Create Supabase client
    const supabaseUrl = Deno.env.get('SUPABASE_URL')!;
    const supabaseAnonKey = Deno.env.get('SUPABASE_ANON_KEY')!;

    const supabase = createClient(supabaseUrl, supabaseAnonKey, {
      global: { headers: { Authorization: authHeader } },
    });

    // Get authenticated user
    const {
      data: { user },
      error: authError,
    } = await supabase.auth.getUser();
    if (authError || !user) {
      throw new Error('Unauthorized');
    }

    const userId = requestUserId || user.id;

    // Check if user is admin if checking for a different user
    if (requestUserId && requestUserId !== user.id) {
      const { data: profile } = await supabase
        .from('profiles')
        .select('role')
        .eq('id', user.id)
        .single();

      if (profile?.role !== 'admin' && profile?.role !== 'super_admin') {
        throw new Error('Admin access required to check other users');
      }
    }

    // Run all health checks in parallel
    const results: Record<string, IntegrationStatus> = {};

    await Promise.all(
      integrations.map(async (integration) => {
        const checker = healthCheckers[integration];
        if (!checker) {
          results[integration] = {
            connected: false,
            status: 'error',
            error: `Unknown integration: ${integration}`,
          };
          return;
        }

        results[integration] = await checker(supabase, userId);
      })
    );

    const response: BatchResponse = {
      results: results as Record<IntegrationType, IntegrationStatus>,
      totalTime: Date.now() - startTime,
      checkedCount: integrations.length,
    };

    return new Response(JSON.stringify(response), {
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      status: 200,
    });
  } catch (err) {
    console.error('[integration-health-batch] Error:', err);

    return new Response(
      JSON.stringify({
        error: err instanceof Error ? err.message : 'Unknown error',
        totalTime: Date.now() - startTime,
      }),
      {
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
        status:
          err instanceof Error && err.message.includes('Unauthorized') ? 401 : 400,
      }
    );
  }
});
