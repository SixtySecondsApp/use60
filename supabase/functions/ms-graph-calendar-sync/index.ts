/// <reference path="../deno.d.ts" />

/**
 * Microsoft Graph Calendar Sync Edge Function
 *
 * Incremental sync of Microsoft Calendar events using delta queries.
 * Supports both user-triggered sync (JWT auth) and cron/service-role sync.
 *
 * SECURITY:
 * - POST only
 * - User JWT authentication OR service-role with userId in body OR cron secret
 * - No anonymous access
 */

import { serve } from 'https://deno.land/std@0.168.0/http/server.ts';
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2.43.4';
import { getCorsHeaders, handleCorsPreflightRequest, errorResponse, jsonResponse } from '../_shared/corsHelper.ts';
import { authenticateRequest, getUserOrgId, verifyCronSecret } from '../_shared/edgeAuth.ts';
import { getMicrosoftIntegration, MicrosoftTokenRevokedError } from '../_shared/microsoftOAuth.ts';

const GRAPH_BASE = 'https://graph.microsoft.com/v1.0';
const MAX_SYNC_TIME_MS = 120_000; // 120s hard limit
const MAX_EVENTS_PER_SYNC = 500;
const PAGE_SIZE = 250;

// MS Graph showAs → calendar_events status mapping
function mapShowAsToStatus(showAs: string | undefined): string {
  switch (showAs) {
    case 'free':
      return 'free';
    case 'tentative':
      return 'tentative';
    case 'busy':
    case 'workingElsewhere':
      return 'busy';
    case 'oof':
      return 'outOfOffice';
    default:
      return 'confirmed';
  }
}

async function logSyncOperation(
  supabase: any,
  args: {
    orgId: string | null;
    userId?: string | null;
    operation: 'sync' | 'create' | 'update' | 'delete' | 'push' | 'pull' | 'webhook' | 'error';
    direction: 'inbound' | 'outbound';
    entityType: string;
    entityId?: string | null;
    entityName?: string | null;
    status?: 'success' | 'failed' | 'skipped';
    errorMessage?: string | null;
    metadata?: Record<string, unknown>;
    batchId?: string | null;
  }
): Promise<void> {
  try {
    await supabase.rpc('log_integration_sync', {
      p_org_id: args.orgId,
      p_user_id: args.userId ?? null,
      p_integration_name: 'microsoft_calendar',
      p_operation: args.operation,
      p_direction: args.direction,
      p_entity_type: args.entityType,
      p_entity_id: args.entityId ?? null,
      p_entity_name: args.entityName ?? null,
      p_status: args.status ?? 'success',
      p_error_message: args.errorMessage ?? null,
      p_metadata: args.metadata ?? {},
      p_batch_id: args.batchId ?? null,
    });
  } catch (e) {
    console.error('[ms-graph-calendar-sync] Failed to log sync operation:', e);
  }
}

/**
 * Sync a single user's Microsoft Calendar events
 */
async function syncUserCalendar(
  supabase: any,
  userId: string,
  accessToken: string,
  syncStartTime: number
): Promise<{ stats: Record<string, number>; newDeltaLink: string | null }> {
  const stats = { created: 0, updated: 0, deleted: 0, skipped: 0 };
  const now = new Date().toISOString();

  // Get org ID for this user
  const orgId = await getUserOrgId(supabase, userId);

  // Check for existing delta link
  const { data: syncStatus } = await supabase
    .from('user_sync_status')
    .select('ms_calendar_delta_link, ms_calendar_last_synced_at')
    .eq('user_id', userId)
    .maybeSingle();

  let deltaLink = syncStatus?.ms_calendar_delta_link || null;
  let newDeltaLink: string | null = null;

  // Build the initial URL
  let requestUrl: string;
  if (deltaLink) {
    // Use existing delta link for incremental sync
    requestUrl = deltaLink;
    console.log(`[ms-graph-calendar-sync] Incremental sync for user ${userId} using delta link`);
  } else {
    // Full sync for last 30 days + 30 days forward
    const startDateTime = new Date(Date.now() - 30 * 86400000).toISOString();
    const endDateTime = new Date(Date.now() + 30 * 86400000).toISOString();
    const params = new URLSearchParams({
      startDateTime,
      endDateTime,
      $top: String(PAGE_SIZE),
      $select: 'id,subject,start,end,attendees,onlineMeeting,location,bodyPreview,organizer,isAllDay,showAs,iCalUId,webLink,lastModifiedDateTime,isCancelled',
    });
    requestUrl = `${GRAPH_BASE}/me/calendarView/delta?${params}`;
    console.log(`[ms-graph-calendar-sync] Full sync for user ${userId}: ${startDateTime} to ${endDateTime}`);
  }

  // Ensure calendar record exists
  let { data: calRecord } = await supabase
    .from('calendar_calendars')
    .select('id')
    .eq('user_id', userId)
    .eq('external_id', 'ms-primary')
    .maybeSingle();

  if (!calRecord) {
    const calPayload: Record<string, unknown> = {
      user_id: userId,
      external_id: 'ms-primary',
      name: 'Microsoft Calendar',
      sync_enabled: true,
      provider: 'microsoft',
    };
    if (orgId) calPayload.org_id = orgId;

    const { data: newCal, error: calErr } = await supabase
      .from('calendar_calendars')
      .insert(calPayload)
      .select('id')
      .single();

    if (calErr) {
      console.error('[ms-graph-calendar-sync] Failed to create calendar record:', calErr.message);
      throw new Error(`Failed to create calendar record: ${calErr.message}`);
    }
    calRecord = newCal;
  }

  const calendarRecordId = calRecord.id;
  let totalEventsProcessed = 0;

  // Paginate through delta results
  for (let page = 0; page < 50; page++) {
    // Time-based circuit breaker
    if (Date.now() - syncStartTime > MAX_SYNC_TIME_MS) {
      console.warn(`[ms-graph-calendar-sync] Approaching timeout at page ${page}. Stats:`, stats);
      break;
    }

    const resp = await fetch(requestUrl, {
      headers: { Authorization: `Bearer ${accessToken}` },
    });

    if (!resp.ok) {
      const err = await resp.json().catch(() => ({}));
      const errMsg = err?.error?.message || resp.statusText;

      // Delta token expired — reset to full sync
      if (resp.status === 410 || (resp.status === 400 && errMsg.toLowerCase().includes('sync'))) {
        console.warn(`[ms-graph-calendar-sync] Delta token expired (${resp.status}). Resetting to full sync.`);
        deltaLink = null;
        const startDateTime = new Date(Date.now() - 30 * 86400000).toISOString();
        const endDateTime = new Date(Date.now() + 30 * 86400000).toISOString();
        const params = new URLSearchParams({
          startDateTime,
          endDateTime,
          $top: String(PAGE_SIZE),
          $select: 'id,subject,start,end,attendees,onlineMeeting,location,bodyPreview,organizer,isAllDay,showAs,iCalUId,webLink,lastModifiedDateTime,isCancelled',
        });
        requestUrl = `${GRAPH_BASE}/me/calendarView/delta?${params}`;
        continue;
      }

      throw new Error(`Graph API error: ${errMsg}`);
    }

    const data = await resp.json();
    const items = data.value || [];

    // Process events
    for (const ev of items) {
      try {
        // Use iCalUId as the stable external ID (survives across instances)
        const externalId = ev.iCalUId || ev.id;
        const isCancelled = ev['@removed'] !== undefined || ev.isCancelled === true;

        // Extract meeting URL from onlineMeeting
        const meetingUrl = ev.onlineMeeting?.joinUrl || null;

        const payload: Record<string, unknown> = {
          user_id: userId,
          calendar_id: calendarRecordId,
          external_id: externalId,
          title: ev.subject || '(No title)',
          description: ev.bodyPreview || null,
          location: ev.location?.displayName || null,
          start_time: ev.start?.dateTime ? `${ev.start.dateTime}Z` : now,
          end_time: ev.end?.dateTime ? `${ev.end.dateTime}Z` : now,
          all_day: ev.isAllDay || false,
          status: isCancelled ? 'cancelled' : mapShowAsToStatus(ev.showAs),
          meeting_url: meetingUrl,
          organizer_email: ev.organizer?.emailAddress?.address || null,
          html_link: ev.webLink || null,
          attendees_count: Array.isArray(ev.attendees) ? ev.attendees.length : 0,
          attendees: ev.attendees
            ? ev.attendees.map((a: any) => ({
                email: a.emailAddress?.address,
                name: a.emailAddress?.name,
                responseStatus: a.status?.response || 'none',
              }))
            : null,
          external_updated_at: ev.lastModifiedDateTime || null,
          sync_status: isCancelled ? 'deleted' : 'synced',
          synced_at: now,
          raw_data: ev,
        };

        if (orgId) payload.org_id = orgId;

        // Upsert event
        let upsertedEvent: any = null;
        let upsertError: any = null;

        const result = await supabase
          .from('calendar_events')
          .upsert(payload, { onConflict: 'user_id,external_id' })
          .select('id')
          .single();
        upsertedEvent = result.data;
        upsertError = result.error;

        // Fallback: manual upsert if ON CONFLICT fails
        if (upsertError && (upsertError.code === '42P10' || upsertError.message?.includes('ON CONFLICT'))) {
          const { data: existing } = await supabase
            .from('calendar_events')
            .select('id')
            .eq('user_id', userId)
            .eq('external_id', externalId)
            .maybeSingle();

          if (existing) {
            const { data, error } = await supabase
              .from('calendar_events')
              .update(payload)
              .eq('id', existing.id)
              .select('id')
              .single();
            upsertedEvent = data;
            upsertError = error;
          } else {
            const { data, error } = await supabase
              .from('calendar_events')
              .insert(payload)
              .select('id')
              .single();
            upsertedEvent = data;
            upsertError = error;
          }
        }

        if (upsertError || !upsertedEvent) {
          console.error('[ms-graph-calendar-sync] Failed to upsert event:', {
            errorCode: upsertError?.code,
            errorMessage: upsertError?.message,
            eventId: ev.id,
            eventSubject: ev.subject,
          });
          stats.skipped++;
          continue;
        }

        const eventDbId = upsertedEvent.id;

        if (isCancelled) {
          stats.deleted++;
        } else {
          stats.created++;
        }

        // Batch upsert attendees
        if (Array.isArray(ev.attendees) && ev.attendees.length > 0) {
          try {
            const attendeeRows = ev.attendees
              .filter((a: any) => a.emailAddress?.address)
              .map((a: any) => ({
                event_id: eventDbId,
                email: a.emailAddress.address,
                name: a.emailAddress.name || null,
                is_organizer: a.emailAddress.address === ev.organizer?.emailAddress?.address,
                is_required: a.type === 'required',
                response_status: a.status?.response || 'none',
                responded_at: a.status?.response && a.status.response !== 'none' ? now : null,
              }));

            if (attendeeRows.length > 0) {
              await supabase
                .from('calendar_attendees')
                .upsert(attendeeRows, { onConflict: 'event_id,email' });
            }
          } catch (attendeeError) {
            console.warn('[ms-graph-calendar-sync] Failed to upsert attendees:', attendeeError);
          }
        }
      } catch (err) {
        console.error('[ms-graph-calendar-sync] Error processing event:', err);
        stats.skipped++;
      }

      totalEventsProcessed++;
    }

    // Check for next page or delta link
    if (data['@odata.nextLink']) {
      requestUrl = data['@odata.nextLink'];
    } else if (data['@odata.deltaLink']) {
      newDeltaLink = data['@odata.deltaLink'];
      break;
    } else {
      break;
    }

    // Hard cap on events
    if (!deltaLink && totalEventsProcessed >= MAX_EVENTS_PER_SYNC) {
      console.log(`[ms-graph-calendar-sync] Reached event cap (${totalEventsProcessed}/${MAX_EVENTS_PER_SYNC}). Next sync will be incremental.`);
      break;
    }
  }

  // Save delta link and sync timestamp
  const updatePayload: Record<string, unknown> = {
    ms_calendar_last_synced_at: now,
    updated_at: now,
  };
  if (newDeltaLink) {
    updatePayload.ms_calendar_delta_link = newDeltaLink;
  }

  // Upsert user_sync_status
  if (syncStatus) {
    await supabase
      .from('user_sync_status')
      .update(updatePayload)
      .eq('user_id', userId);
  } else {
    await supabase
      .from('user_sync_status')
      .insert({ user_id: userId, ...updatePayload });
  }

  // Update calendar_calendars timestamp
  await supabase
    .from('calendar_calendars')
    .update({ last_synced_at: now })
    .eq('id', calendarRecordId);

  console.log(`[ms-graph-calendar-sync] User ${userId}: ${totalEventsProcessed} events processed`, stats);

  // Log summary
  const totalEvents = stats.created + stats.updated + stats.deleted + stats.skipped;
  if (totalEvents > 0) {
    await logSyncOperation(supabase, {
      orgId,
      userId,
      operation: 'sync',
      direction: 'inbound',
      entityType: 'calendar_batch',
      entityName: `MS Calendar sync: ${stats.created} created, ${stats.deleted} deleted, ${stats.skipped} skipped`,
      metadata: { ...stats, total_events: totalEvents, has_delta_link: !!newDeltaLink },
    });
  }

  return { stats, newDeltaLink };
}

serve(async (req) => {
  const preflightResponse = handleCorsPreflightRequest(req);
  if (preflightResponse) return preflightResponse;

  if (req.method !== 'POST') {
    return errorResponse('Method not allowed', req, 405);
  }

  try {
    const supabaseUrl = Deno.env.get('SUPABASE_URL') || '';
    const supabaseServiceKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') || '';
    const cronSecret = Deno.env.get('CRON_SECRET');

    if (!supabaseUrl || !supabaseServiceKey) {
      throw new Error('Server configuration error');
    }

    const supabase = createClient(supabaseUrl, supabaseServiceKey, {
      auth: { persistSession: false, autoRefreshToken: false },
    });

    const body = await req.json().catch(() => ({}));
    const syncStartTime = Date.now();

    // Check if this is a cron-triggered batch sync
    const isCron = verifyCronSecret(req, cronSecret);

    if (isCron) {
      console.log('[ms-graph-calendar-sync] Cron-triggered batch sync');

      // Query all active Microsoft integrations with calendar sync enabled
      const { data: integrations, error: intErr } = await supabase
        .from('microsoft_integrations')
        .select('user_id, access_token, refresh_token, expires_at, is_active, service_preferences')
        .eq('is_active', true);

      if (intErr) {
        throw new Error(`Failed to query integrations: ${intErr.message}`);
      }

      // Filter for calendar-enabled integrations
      const calendarUsers = (integrations || []).filter(
        (i: any) => i.service_preferences?.calendar === true
      );

      console.log(`[ms-graph-calendar-sync] Found ${calendarUsers.length} users with calendar sync enabled`);

      const results: Array<{ userId: string; stats: Record<string, number>; error?: string }> = [];

      for (const integration of calendarUsers) {
        // Time check for overall function timeout
        if (Date.now() - syncStartTime > MAX_SYNC_TIME_MS) {
          console.warn('[ms-graph-calendar-sync] Approaching timeout during batch sync. Stopping.');
          break;
        }

        try {
          const msResult = await getMicrosoftIntegration(supabase, integration.user_id);
          if (!msResult) {
            results.push({ userId: integration.user_id, stats: {}, error: 'No active integration' });
            continue;
          }

          const { stats } = await syncUserCalendar(
            supabase,
            integration.user_id,
            msResult.accessToken,
            syncStartTime
          );
          results.push({ userId: integration.user_id, stats });
        } catch (err: any) {
          console.error(`[ms-graph-calendar-sync] Failed for user ${integration.user_id}:`, err.message);
          results.push({ userId: integration.user_id, stats: {}, error: err.message });
        }
      }

      return jsonResponse({ success: true, results, syncedUsers: results.length }, req);
    }

    // Single-user sync (JWT or service-role auth)
    const { userId, mode } = await authenticateRequest(
      req,
      supabase,
      supabaseServiceKey,
      body.userId
    );

    console.log(`[ms-graph-calendar-sync] Authenticated as ${mode}, userId: ${userId}`);

    let msResult;
    try {
      msResult = await getMicrosoftIntegration(supabase, userId);
    } catch (err) {
      if (err instanceof MicrosoftTokenRevokedError) {
        return errorResponse(
          'Microsoft access has been revoked. Please reconnect your Microsoft account in Settings > Integrations.',
          req,
          403
        );
      }
      throw err;
    }

    if (!msResult) {
      throw new Error('Microsoft integration not found. Please connect your Microsoft account first.');
    }

    const { stats, newDeltaLink } = await syncUserCalendar(
      supabase,
      userId,
      msResult.accessToken,
      syncStartTime
    );

    return jsonResponse({
      success: true,
      stats,
      hasDeltaLink: !!newDeltaLink,
      syncedAt: new Date().toISOString(),
    }, req);
  } catch (error: any) {
    console.error('[ms-graph-calendar-sync] Error:', error);
    return errorResponse(error.message || 'Calendar sync failed', req, 500);
  }
});
