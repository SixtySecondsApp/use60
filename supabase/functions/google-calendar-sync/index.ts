/// <reference path="../deno.d.ts" />

/**
 * Google Calendar Sync Edge Function
 * 
 * Incremental sync of Google Calendar events with user_sync_status tracking.
 * Called from api-copilot when calendar queries need fresh data.
 * 
 * SECURITY:
 * - POST only
 * - User JWT authentication OR service-role with userId in body
 * - No anonymous access
 * - Org membership required for org-tagged operations
 */

import { serve } from 'https://deno.land/std@0.168.0/http/server.ts';
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';
import { getCorsHeaders, handleCorsPreflightRequest, errorResponse, jsonResponse } from '../_shared/corsHelper.ts';
import { authenticateRequest, getUserOrgId } from '../_shared/edgeAuth.ts';
import { getGoogleIntegration } from '../_shared/googleOAuth.ts';
import { captureException } from '../_shared/sentryEdge.ts';
import { extractMeetingUrl } from '../_shared/meetingUrlExtractor.ts';
import { triggerPreMeetingIfSoon } from '../_shared/orchestrator/triggerPreMeeting.ts';

// Helper for logging sync operations to integration_sync_logs table
async function logSyncOperation(
  supabase: any,
  args: {
    orgId: string | null
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
      p_org_id: args.orgId,
      p_user_id: args.userId ?? null,
      p_integration_name: 'google_calendar',
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
    console.error('[google-calendar-sync] Failed to log sync operation:', e)
  }
}

interface SyncRequest {
  action: 'incremental-sync';
  syncToken?: string;
  startDate?: string;
  endDate?: string;
  userId?: string; // Required for service-role calls
}

serve(async (req) => {
  // Handle CORS preflight
  const preflightResponse = handleCorsPreflightRequest(req);
  if (preflightResponse) {
    return preflightResponse;
  }

  if (req.method !== 'POST') {
    return errorResponse('Method not allowed', req, 405);
  }

  try {
    const supabaseUrl = Deno.env.get('SUPABASE_URL') || '';
    const supabaseServiceKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') || '';

    if (!supabaseUrl || !supabaseServiceKey) {
      throw new Error('Server configuration error');
    }

    // Parse body first to get userId for service-role calls
    const body: SyncRequest = await req.json();

    // Create service role client for database operations
    const supabase = createClient(supabaseUrl, supabaseServiceKey, {
      auth: {
        persistSession: false,
        autoRefreshToken: false,
      },
    });

    // Authenticate request - supports both user JWT and service role/cron
    let userId: string;
    let mode: string;

    // If userId is provided in body, trust it (cron/service-role call)
    // This matches auto-join-scheduler pattern for cron jobs
    if (body.userId) {
      userId = body.userId;
      mode = 'cron';
      console.log(`[CALENDAR-SYNC] Cron/service call with userId: ${userId}`);
    } else {
      // User JWT authentication
      const authResult = await authenticateRequest(
        req,
        supabase,
        supabaseServiceKey,
        undefined
      );
      userId = authResult.userId;
      mode = authResult.mode;
      console.log(`[CALENDAR-SYNC] Authenticated as ${mode}, userId: ${userId}`);
    }

    const { syncToken, startDate, endDate } = body;

    // Get or create user sync status
    let { data: syncStatus } = await supabase
      .from('user_sync_status')
      .select('calendar_sync_token, calendar_last_synced_at')
      .eq('user_id', userId)
      .single();

    if (!syncStatus) {
      // Create initial sync status record
      const { data: newStatus } = await supabase
        .from('user_sync_status')
        .insert({
          user_id: userId,
          calendar_last_synced_at: null,
          calendar_sync_token: null,
        })
        .select()
        .single();
      syncStatus = newStatus;
    }

    // Get Google OAuth tokens
    const { accessToken } = await getGoogleIntegration(supabase, userId);

    // Determine sync parameters
    const calendarId = 'primary'; // Default to primary calendar
    let currentSyncToken = syncToken || syncStatus?.calendar_sync_token || undefined;
    let timeMin =
      startDate ||
      (currentSyncToken ? undefined : new Date(Date.now() - 90 * 86400000).toISOString());
    let timeMax =
      endDate ||
      (currentSyncToken ? undefined : new Date(Date.now() + 180 * 86400000).toISOString());

    // Get user's organization ID - NO DEFAULT FALLBACK
    // Users without org membership will have null org_id
    const orgId = await getUserOrgId(supabase, userId);

    console.log('[CALENDAR-SYNC] org_id status:', {
      found: !!orgId,
      value: orgId,
      note: orgId ? 'User has org membership' : 'User has no org membership - events will not be tagged to org'
    });

    // Fetch calendar metadata to get timezone and name
    let detectedTimezone: string | null = null;
    let calendarName: string = 'Primary Calendar';
    try {
      const calendarMetaResponse = await fetch(
        `https://www.googleapis.com/calendar/v3/calendars/${encodeURIComponent(calendarId)}`,
        {
          headers: { Authorization: `Bearer ${accessToken}` },
        }
      );

      if (calendarMetaResponse.ok) {
        const calendarMeta = await calendarMetaResponse.json();
        detectedTimezone = calendarMeta.timeZone || null;
        calendarName = calendarMeta.summary || calendarMeta.id || 'Primary Calendar';
        console.log('[CALENDAR-SYNC] Detected calendar metadata:', {
          name: calendarName,
          timezone: detectedTimezone
        });
      }
    } catch (error) {
      console.error('[CALENDAR-SYNC] Failed to fetch calendar metadata:', error);
      // Continue without metadata - will use defaults
    }

    // Ensure calendar record exists and update timezone if detected
    const calendarPayload: any = {
      user_id: userId,
      external_id: calendarId,
      name: calendarName,
      sync_enabled: true,
    };
    if (detectedTimezone) {
      calendarPayload.timezone = detectedTimezone;
    }
    // Only set org_id if user has one - no fallback to default org
    if (orgId) {
      calendarPayload.org_id = orgId;
    }

    // Try to find existing calendar first
    let calRecord: any = null;
    let queryBuilder = supabase
      .from('calendar_calendars')
      .select('id, timezone, org_id')
      .eq('user_id', userId)
      .eq('external_id', calendarId);
    
    // Don't filter by org_id - find user's calendar regardless of org
    const { data: existingCal } = await queryBuilder.maybeSingle();

    if (existingCal?.id) {
      // Update existing calendar
      const updatePayload: any = {
        name: calendarName,
        sync_enabled: true,
      };
      if (detectedTimezone) {
        updatePayload.timezone = detectedTimezone;
      }
      // Only update org_id if user now has one and calendar doesn't
      if (orgId && !existingCal.org_id) {
        updatePayload.org_id = orgId;
      }

      const { data: updatedCal, error: updateError } = await supabase
        .from('calendar_calendars')
        .update(updatePayload)
        .eq('id', existingCal.id)
        .select('id, timezone')
        .single();

      if (updateError || !updatedCal?.id) {
        console.error('[CALENDAR-SYNC] Update error:', updateError);
        throw new Error(`Failed to update calendar record: ${updateError?.message || 'Unknown error'}`);
      }
      calRecord = updatedCal;
    } else {
      // Insert new calendar
      const { data: insertedCal, error: insertError } = await supabase
        .from('calendar_calendars')
        .insert(calendarPayload)
        .select('id, timezone')
        .single();

      if (insertError || !insertedCal?.id) {
        console.error('[CALENDAR-SYNC] Insert error:', insertError);
        throw new Error(`Failed to create calendar record: ${insertError?.message || 'Unknown error'}. Payload: ${JSON.stringify(calendarPayload)}`);
      }
      calRecord = insertedCal;
    }

    if (!calRecord?.id) {
      throw new Error('Failed to create or find calendar record');
    }

    const calendarRecordId = calRecord.id;

    // Update user timezone preference if we detected a timezone
    if (detectedTimezone) {
      try {
        await supabase
          .from('user_settings')
          .upsert(
            {
              user_id: userId,
              preferences: { timezone: detectedTimezone },
            },
            { onConflict: 'user_id' }
          )
          .select();
        console.log('[CALENDAR-SYNC] Updated user timezone preference:', detectedTimezone);
      } catch (error) {
        console.error('[CALENDAR-SYNC] Failed to update user timezone preference:', error);
        // Non-critical - continue with sync
      }
    }

    const stats = { created: 0, updated: 0, deleted: 0, skipped: 0 };
    let nextPageToken: string | undefined = undefined;
    let nextSyncToken: string | undefined = undefined;
    const now = new Date().toISOString();

    // Fetch events from Google Calendar API
    for (let page = 0; page < 50; page++) {
      // Safety cap to prevent infinite loops
      const params = new URLSearchParams();
      params.set('singleEvents', 'true');
      params.set('orderBy', 'startTime');
      params.set('maxResults', '2500'); // Google's max per page

      if (nextPageToken) {
        params.set('pageToken', nextPageToken);
      }

      if (currentSyncToken) {
        params.set('syncToken', currentSyncToken);
      } else {
        if (timeMin) params.set('timeMin', timeMin);
        if (timeMax) params.set('timeMax', timeMax);
      }

      const apiUrl = `https://www.googleapis.com/calendar/v3/calendars/${encodeURIComponent(calendarId)}/events?${params}`;
      const resp = await fetch(apiUrl, {
        headers: { Authorization: `Bearer ${accessToken}` },
      });

      if (resp.status === 410) {
        console.warn('[CALENDAR-SYNC] Sync token expired (410). Falling back to time-based sync.');
        nextPageToken = undefined;
        currentSyncToken = undefined;
        timeMin = new Date(Date.now() - 90 * 86400000).toISOString();
        timeMax = new Date(Date.now() + 180 * 86400000).toISOString();
        continue;
      }

      if (!resp.ok) {
        const errorData = await resp.json().catch(() => ({}));
        console.error('[CALENDAR-SYNC] Google API error response', {
          status: resp.status,
          statusText: resp.statusText,
          error: errorData?.error || errorData,
          params: Object.fromEntries(params),
        });

        const errorMessage = errorData?.error?.message || resp.statusText;
        const looksLikeSyncTokenError =
          !!currentSyncToken &&
          typeof errorMessage === 'string' &&
          errorMessage.toLowerCase().includes('sync token');

        if (resp.status === 400 && looksLikeSyncTokenError) {
          console.warn('[CALENDAR-SYNC] Invalid sync token detected (400). Resetting token.');
          currentSyncToken = undefined;
          nextPageToken = undefined;
          timeMin = new Date(Date.now() - 90 * 86400000).toISOString();
          timeMax = new Date(Date.now() + 180 * 86400000).toISOString();
          continue;
        }

        throw new Error(`Google Calendar API error: ${errorMessage}`);
      }

      const data = await resp.json();
      const items = data.items || [];
      nextPageToken = data.nextPageToken;
      nextSyncToken = data.nextSyncToken || nextSyncToken;

      // Process events
      for (const ev of items) {
        try {
          const isCancelled = ev.status === 'cancelled';

          const payload: any = {
            user_id: userId,
            calendar_id: calendarRecordId,
            external_id: ev.id,
            title: ev.summary || '(No title)',
            description: ev.description || null,
            location: ev.location || null,
            start_time: ev.start?.dateTime || ev.start?.date || now,
            end_time: ev.end?.dateTime || ev.end?.date || ev.start?.dateTime || now,
            all_day: !ev.start?.dateTime,
            status: ev.status || 'confirmed',
            meeting_url: extractMeetingUrl(ev),
            attendees_count: Array.isArray(ev.attendees) ? ev.attendees.length : 0,
            attendees: ev.attendees || null,
            color: ev.colorId || null,
            creator_email: ev.creator?.email || null,
            organizer_email: ev.organizer?.email || null,
            html_link: ev.htmlLink || null,
            hangout_link: ev.hangoutLink || null,
            etag: ev.etag || null,
            external_updated_at: ev.updated ? new Date(ev.updated).toISOString() : null,
            sync_status: isCancelled ? 'deleted' : 'synced',
            synced_at: now,
            raw_data: ev,
          };

          // Only include org_id if user has one - no default fallback
          if (orgId) {
            payload.org_id = orgId;
          }

          // Try upsert with ON CONFLICT
          let upsertedEvent: any = null;
          let upsertError: any = null;

          const result = await supabase
            .from('calendar_events')
            .upsert(payload, { onConflict: 'user_id,external_id' })
            .select('id')
            .single();
          upsertedEvent = result.data;
          upsertError = result.error;

          // If ON CONFLICT failed, use manual upsert
          if (upsertError && (upsertError.code === '42P10' || upsertError.message?.includes('ON CONFLICT'))) {
            const { data: existing } = await supabase
              .from('calendar_events')
              .select('id')
              .eq('user_id', userId)
              .eq('external_id', ev.id)
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
            console.error('[CALENDAR-SYNC] Failed to upsert event:', {
              errorCode: upsertError?.code,
              errorMessage: upsertError?.message,
              eventId: ev.id,
              eventTitle: ev.summary,
            });
            stats.skipped++;
            continue;
          }

          const eventDbId = upsertedEvent.id;

          // Track stats
          if (isCancelled) {
            stats.deleted++;
          } else {
            stats.created++;
          }

          // Log successful event sync
          const eventTitle = ev.summary || '(No title)'
          const eventStart = ev.start?.dateTime || ev.start?.date
          const formattedDate = eventStart ? new Date(eventStart).toLocaleDateString() : ''
          await logSyncOperation(supabase, {
            orgId,
            userId,
            operation: isCancelled ? 'delete' : 'sync',
            direction: 'inbound',
            entityType: 'event',
            entityId: eventDbId,
            entityName: `${eventTitle}${formattedDate ? ` (${formattedDate})` : ''}`,
            metadata: {
              google_event_id: ev.id,
              all_day: !ev.start?.dateTime,
              attendees_count: Array.isArray(ev.attendees) ? ev.attendees.length : 0,
            },
          })

          // Fire pre-meeting brief if this event is starting soon
          if (!isCancelled && payload.attendees_count > 1) {
            triggerPreMeetingIfSoon({
              start_time: payload.start_time,
              user_id: userId,
              org_id: orgId,
              meeting_id: eventDbId,
              title: payload.title,
              attendees: payload.attendees,
              attendees_count: payload.attendees_count,
              meeting_url: payload.meeting_url,
            });
          }

          // Upsert attendees to calendar_attendees table (with proper error handling)
          if (Array.isArray(ev.attendees) && ev.attendees.length > 0) {
            for (const attendee of ev.attendees) {
              try {
                await supabase
                  .from('calendar_attendees')
                  .upsert(
                    {
                      event_id: eventDbId,
                      email: attendee.email,
                      name: attendee.displayName || null,
                      is_organizer: attendee.organizer === true,
                      is_required: attendee.optional !== true,
                      response_status: attendee.responseStatus || 'needsAction',
                      responded_at: attendee.responseStatus !== 'needsAction' ? now : null,
                    },
                    { onConflict: 'event_id,email' }
                  );
              } catch (attendeeError) {
                // Silently fail attendee upserts - event is more important
                console.warn('Failed to upsert attendee:', attendeeError);
              }
            }
          }
        } catch (err) {
          console.error('Error processing event:', err);
          stats.skipped++;
        }
      }

      if (!nextPageToken) break;
    }

    // Update user_sync_status with new sync token and timestamp
    const updatePayload: any = {
      calendar_last_synced_at: now,
      updated_at: now,
    };
    if (nextSyncToken) {
      updatePayload.calendar_sync_token = nextSyncToken;
    }

    await supabase
      .from('user_sync_status')
      .update(updatePayload)
      .eq('user_id', userId);

    // Also update calendar_calendars for backward compatibility
    await supabase
      .from('calendar_calendars')
      .update({
        last_synced_at: now,
        last_sync_token: nextSyncToken || undefined,
      })
      .eq('id', calendarRecordId);

    return jsonResponse({
      success: true,
      stats,
      syncToken: nextSyncToken,
      syncedAt: now,
    }, req);

  } catch (error: any) {
    console.error('[CALENDAR-SYNC] Error:', error);
    await captureException(error, {
      tags: {
        function: 'google-calendar-sync',
        integration: 'google',
      },
    });
    return errorResponse(error.message || 'Calendar sync failed', req, 500);
  }
});
