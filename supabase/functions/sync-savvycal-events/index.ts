/**
 * sync-savvycal-events - Cron-compatible Edge Function
 *
 * Polls SavvyCal API and syncs any events not already in the database.
 * Designed to run every 15 minutes as a backup to the webhook.
 *
 * Usage:
 * - With org_id: POST /functions/v1/sync-savvycal-events with { org_id }
 * - Cron mode: POST /functions/v1/sync-savvycal-events with { cron_mode: true } - iterates all active orgs
 *
 * Query params / body:
 * - org_id: Specific org to sync (uses that org's API token)
 * - since_hours: How far back to check (default: 24 hours)
 * - dry_run: If true, just report what would be synced
 * - cron_mode: If true, sync all active org integrations
 */

import { serve } from "https://deno.land/std@0.190.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.43.4";
import { corsHeaders } from "../_shared/cors.ts";

// Helper for logging sync operations to integration_sync_logs table
async function logSyncOperation(
  supabase: ReturnType<typeof createClient>,
  args: {
    orgId?: string | null
    userId?: string | null
    operation: 'sync' | 'create' | 'update' | 'delete' | 'push' | 'pull' | 'webhook' | 'error'
    direction: 'inbound' | 'outbound'
    entityType: string
    entityId?: string | null
    entityName?: string | null
    status?: 'success' | 'failed' | 'skipped'
    errorMessage?: string | null
    metadata?: Record<string, unknown>
    batchId?: string | null
  }
): Promise<void> {
  try {
    await supabase.rpc('log_integration_sync', {
      p_org_id: args.orgId ?? null,
      p_user_id: args.userId ?? null,
      p_integration_name: 'savvycal',
      p_operation: args.operation,
      p_direction: args.direction,
      p_entity_type: args.entityType,
      p_entity_id: args.entityId ?? null,
      p_entity_name: args.entityName ?? null,
      p_status: args.status ?? 'success',
      p_error_message: args.errorMessage ?? null,
      p_metadata: args.metadata ?? {},
      p_batch_id: args.batchId ?? null,
    })
  } catch (e) {
    console.error('[sync-savvycal-events] Failed to log sync operation:', e)
  }
}

const SUPABASE_URL = Deno.env.get("SUPABASE_URL") ?? "";
const SUPABASE_SERVICE_ROLE_KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") ?? "";

interface SavvyCalEvent {
  id: string;
  state: string;
  summary: string;
  description: string | null;
  start_at: string;
  end_at: string;
  created_at: string;
  duration: number;
  url: string;
  location: string | null;
  organizer: {
    id: string;
    email: string;
    display_name: string;
    first_name: string | null;
    last_name: string | null;
    is_organizer: boolean;
    phone_number: string | null;
    time_zone: string | null;
  };
  scheduler?: {
    id: string;
    email: string;
    display_name: string;
    first_name: string | null;
    last_name: string | null;
    is_organizer: boolean;
    phone_number: string | null;
    time_zone: string | null;
  };
  attendees: Array<{
    id: string;
    email: string;
    display_name: string;
    first_name: string | null;
    last_name: string | null;
    is_organizer: boolean;
    phone_number: string | null;
    time_zone: string | null;
    fields?: Array<{ id: string; label: string; value: string | null }>;
  }>;
  link?: {
    id: string;
    slug: string;
    name: string | null;
  };
  scope?: {
    id: string;
    name: string;
    slug: string;
  };
  metadata?: Record<string, unknown>;
  conferencing?: {
    type: string | null;
    join_url: string | null;
  };
}

interface SavvyCalAPIResponse {
  entries: SavvyCalEvent[];
  metadata: {
    after: string | null;
    before: string | null;
    limit: number;
  };
}

interface OrgIntegration {
  id: string;
  org_id: string;
  webhook_token: string;
  api_token: string;
}

interface SyncResult {
  orgId: string;
  success: boolean;
  stats: {
    fetched: number;
    confirmed: number;
    existing: number;
    new: number;
    synced: number;
    failed: number;
  };
  error?: string;
}

async function fetchSavvyCalEvents(apiToken: string, sinceDate: Date): Promise<SavvyCalEvent[]> {
  const allEvents: SavvyCalEvent[] = [];
  let cursor: string | null = null;
  let page = 0;
  const maxPages = 10; // Safety limit

  const sinceISO = sinceDate.toISOString();

  while (page < maxPages) {
    const params = new URLSearchParams({
      limit: "50",
      "start_at[gte]": sinceISO,
    });

    if (cursor) {
      params.set("after", cursor);
    }

    const url = `https://api.savvycal.com/v1/events?${params}`;
    console.log(`[SavvyCal] Fetching page ${page + 1}: ${url}`);

    const response = await fetch(url, {
      headers: {
        Authorization: `Bearer ${apiToken}`,
        Accept: "application/json",
      },
    });

    if (!response.ok) {
      const text = await response.text();
      throw new Error(`SavvyCal API error: ${response.status} - ${text}`);
    }

    const data: SavvyCalAPIResponse = await response.json();
    allEvents.push(...data.entries);

    console.log(`[SavvyCal] Page ${page + 1}: ${data.entries.length} events`);

    if (data.metadata.after) {
      cursor = data.metadata.after;
      page++;
    } else {
      break;
    }
  }

  return allEvents;
}

async function getExistingEventIds(
  supabase: ReturnType<typeof createClient>,
  eventIds: string[],
  orgId: string | null
): Promise<Set<string>> {
  if (eventIds.length === 0) return new Set();

  let query = supabase
    .from("leads")
    .select("external_id")
    .in("external_id", eventIds);

  if (orgId) {
    query = query.eq("org_id", orgId);
  }

  const { data, error } = await query;

  if (error) {
    console.error("[DB] Error checking existing events:", error);
    return new Set();
  }

  return new Set(data?.map((row) => row.external_id) || []);
}

function eventToWebhookPayload(event: SavvyCalEvent) {
  return {
    event: "event.confirmed",
    payload: {
      id: event.id,
      state: event.state,
      summary: event.summary,
      description: event.description,
      start_at: event.start_at,
      end_at: event.end_at,
      created_at: event.created_at,
      duration: event.duration,
      location: event.location,
      url: event.url,
      organizer: event.organizer,
      scheduler: event.scheduler,
      attendees: event.attendees,
      link: event.link,
      scope: event.scope,
      metadata: event.metadata,
      conferencing: event.conferencing,
    },
  };
}

async function syncOrgEvents(
  supabase: ReturnType<typeof createClient>,
  integration: OrgIntegration,
  sinceDate: Date,
  dryRun: boolean
): Promise<SyncResult> {
  const orgId = integration.org_id;

  try {
    // Fetch events from SavvyCal using org's API token
    const events = await fetchSavvyCalEvents(integration.api_token, sinceDate);
    console.log(`[Sync] Org ${orgId}: Fetched ${events.length} events`);

    // Filter to only confirmed events
    const confirmedEvents = events.filter((e) => e.state === "confirmed");
    console.log(`[Sync] Org ${orgId}: ${confirmedEvents.length} confirmed events`);

    if (confirmedEvents.length === 0) {
      return {
        orgId,
        success: true,
        stats: { fetched: events.length, confirmed: 0, existing: 0, new: 0, synced: 0, failed: 0 },
      };
    }

    // Check which events already exist for this org
    const eventIds = confirmedEvents.map((e) => e.id);
    const existingIds = await getExistingEventIds(supabase, eventIds, orgId);
    console.log(`[Sync] Org ${orgId}: ${existingIds.size} events already in database`);

    // Filter to new events only
    const newEvents = confirmedEvents.filter((e) => !existingIds.has(e.id));
    console.log(`[Sync] Org ${orgId}: ${newEvents.length} new events to sync`);

    if (newEvents.length === 0 || dryRun) {
      return {
        orgId,
        success: true,
        stats: {
          fetched: events.length,
          confirmed: confirmedEvents.length,
          existing: existingIds.size,
          new: newEvents.length,
          synced: 0,
          failed: 0,
        },
      };
    }

    // Sync new events by calling the webhook handler with the org token
    const webhookUrl = `${SUPABASE_URL}/functions/v1/savvycal-leads-webhook?token=${encodeURIComponent(integration.webhook_token)}`;
    const results: Array<{ id: string; success: boolean; error?: string }> = [];

    for (const event of newEvents) {
      const payload = eventToWebhookPayload(event);

      try {
        const response = await fetch(webhookUrl, {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
            Authorization: `Bearer ${SUPABASE_SERVICE_ROLE_KEY}`,
          },
          body: JSON.stringify(payload),
        });

        const text = await response.text();

        if (response.ok) {
          results.push({ id: event.id, success: true });
          console.log(`[Sync] Org ${orgId}: ✅ Synced event ${event.id}`);

          // Log successful event sync
          const schedulerName = event.scheduler
            ? `${event.scheduler.first_name || ''} ${event.scheduler.last_name || ''}`.trim() || event.scheduler.email
            : event.attendees?.[0]?.email || 'Unknown';
          const eventDate = new Date(event.start_at).toLocaleDateString();
          await logSyncOperation(supabase, {
            orgId,
            operation: 'sync',
            direction: 'inbound',
            entityType: 'meeting',
            entityId: event.id,
            entityName: `${event.summary || 'Meeting'} with ${schedulerName} (${eventDate})`,
            metadata: {
              duration_minutes: event.duration,
              scheduler_email: event.scheduler?.email,
              link_slug: event.link?.slug,
            },
          });
        } else {
          results.push({ id: event.id, success: false, error: text });
          console.error(`[Sync] Org ${orgId}: ❌ Failed to sync event ${event.id}: ${text}`);
        }
      } catch (error) {
        const errorMsg = error instanceof Error ? error.message : "Unknown error";
        results.push({ id: event.id, success: false, error: errorMsg });
        console.error(`[Sync] Org ${orgId}: ❌ Error syncing event ${event.id}: ${errorMsg}`);
      }

      // Small delay between requests
      await new Promise((resolve) => setTimeout(resolve, 200));
    }

    const syncedCount = results.filter((r) => r.success).length;
    const failedCount = results.filter((r) => !r.success).length;

    // Update last_sync_at
    await supabase
      .from("savvycal_integrations")
      .update({ last_sync_at: new Date().toISOString() })
      .eq("id", integration.id);

    return {
      orgId,
      success: true,
      stats: {
        fetched: events.length,
        confirmed: confirmedEvents.length,
        existing: existingIds.size,
        new: newEvents.length,
        synced: syncedCount,
        failed: failedCount,
      },
    };
  } catch (error) {
    console.error(`[Sync] Org ${orgId} error:`, error);
    return {
      orgId,
      success: false,
      stats: { fetched: 0, confirmed: 0, existing: 0, new: 0, synced: 0, failed: 0 },
      error: error instanceof Error ? error.message : "Unknown error",
    };
  }
}

serve(async (req) => {
  // Handle CORS
  if (req.method === "OPTIONS") {
    return new Response("ok", { headers: corsHeaders });
  }

  try {
    // Verify cron secret (required for scheduled/automated calls)
    const cronSecret = Deno.env.get('CRON_SECRET');
    const providedSecret = req.headers.get('x-cron-secret');

    if (cronSecret && providedSecret !== cronSecret) {
      return new Response(
        JSON.stringify({ error: 'Unauthorized: valid CRON_SECRET required' }),
        { status: 401, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    if (!SUPABASE_URL || !SUPABASE_SERVICE_ROLE_KEY) {
      throw new Error("Supabase credentials not configured");
    }

    // Parse parameters from body or query params
    const url = new URL(req.url);
    let body: Record<string, unknown> = {};
    if (req.method === "POST") {
      try {
        body = await req.json();
      } catch {
        // No body, that's fine
      }
    }

    const orgId = (body.org_id as string) || url.searchParams.get("org_id");
    const sinceHours = parseInt((body.since_hours as string) || url.searchParams.get("since_hours") || "24", 10);
    const dryRun = (body.dry_run as boolean) || url.searchParams.get("dry_run") === "true";
    const cronMode = (body.cron_mode as boolean) || url.searchParams.get("cron_mode") === "true";

    const sinceDate = new Date();
    sinceDate.setHours(sinceDate.getHours() - sinceHours);

    console.log(`[Sync] Starting sync for events since ${sinceDate.toISOString()}`);
    console.log(`[Sync] Dry run: ${dryRun}, Cron mode: ${cronMode}, Org ID: ${orgId || "all"}`);

    const supabase = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY);

    // Get org integrations to sync
    let integrationsQuery = supabase
      .from("savvycal_integrations")
      .select("id, org_id, webhook_token")
      .eq("is_active", true);

    if (orgId && !cronMode) {
      integrationsQuery = integrationsQuery.eq("org_id", orgId);
    }

    const { data: integrations, error: intError } = await integrationsQuery;

    if (intError) {
      throw new Error(`Failed to fetch integrations: ${intError.message}`);
    }

    if (!integrations || integrations.length === 0) {
      return new Response(
        JSON.stringify({
          success: true,
          message: orgId ? "No SavvyCal integration found for this org" : "No active SavvyCal integrations found",
          stats: { orgs: 0 },
        }),
        { headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    // Get API tokens for each integration
    const integrationIds = integrations.map((i) => i.id);
    const { data: secrets, error: secretsError } = await supabase
      .from("savvycal_integration_secrets")
      .select("integration_id, api_token")
      .in("integration_id", integrationIds)
      .not("api_token", "is", null);

    if (secretsError) {
      throw new Error(`Failed to fetch secrets: ${secretsError.message}`);
    }

    // Build map of integration_id -> api_token
    const tokenMap = new Map<string, string>();
    for (const secret of secrets || []) {
      if (secret.api_token) {
        tokenMap.set(secret.integration_id, secret.api_token);
      }
    }

    // Filter to integrations with API tokens
    const orgsToSync: OrgIntegration[] = integrations
      .filter((i) => tokenMap.has(i.id))
      .map((i) => ({
        id: i.id,
        org_id: i.org_id,
        webhook_token: i.webhook_token,
        api_token: tokenMap.get(i.id)!,
      }));

    if (orgsToSync.length === 0) {
      return new Response(
        JSON.stringify({
          success: true,
          message: "No integrations with API tokens found",
          stats: { orgs: 0 },
        }),
        { headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    console.log(`[Sync] Syncing ${orgsToSync.length} org(s)`);

    // Sync each org
    const results: SyncResult[] = [];
    for (const integration of orgsToSync) {
      const result = await syncOrgEvents(supabase, integration, sinceDate, dryRun);
      results.push(result);
    }

    // Aggregate stats
    const totalStats = {
      orgs: results.length,
      orgsSuccessful: results.filter((r) => r.success).length,
      orgsFailed: results.filter((r) => !r.success).length,
      totalFetched: results.reduce((sum, r) => sum + r.stats.fetched, 0),
      totalConfirmed: results.reduce((sum, r) => sum + r.stats.confirmed, 0),
      totalNew: results.reduce((sum, r) => sum + r.stats.new, 0),
      totalSynced: results.reduce((sum, r) => sum + r.stats.synced, 0),
      totalFailed: results.reduce((sum, r) => sum + r.stats.failed, 0),
    };

    return new Response(
      JSON.stringify({
        success: results.every((r) => r.success),
        message: `Synced ${totalStats.totalSynced} events across ${totalStats.orgsSuccessful} org(s)`,
        dry_run: dryRun,
        stats: totalStats,
        results,
      }),
      { headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  } catch (error) {
    console.error("[Sync] Error:", error);
    return new Response(
      JSON.stringify({
        success: false,
        error: error instanceof Error ? error.message : "Unknown error",
      }),
      { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  }
});
