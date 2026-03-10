import { serve } from 'https://deno.land/std@0.168.0/http/server.ts';
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2.43.4';
import { getCorsHeaders, handleCorsPreflightRequest, jsonResponse, errorResponse } from '../_shared/corsHelper.ts';
import { authenticateRequest, getUserOrgId } from '../_shared/edgeAuth.ts';
import { getNylasIntegration, nylasRequest, mapNylasEventToCalendarEvent } from '../_shared/nylasClient.ts';

/**
 * Nylas Calendar Edge Function
 *
 * Provides calendar event read and sync operations via Nylas API v3.
 * Used to access Google Calendar through Nylas's pre-verified GCP app.
 *
 * Actions: list-events, get-event, sync
 */

serve(async (req) => {
  const preflightResponse = handleCorsPreflightRequest(req);
  if (preflightResponse) return preflightResponse;

  if (req.method !== 'POST') {
    return errorResponse('Method not allowed', req, 405);
  }

  try {
    const requestBody = await req.json();
    const action = requestBody.action;

    if (!action) {
      throw new Error('action is required');
    }

    const supabaseUrl = Deno.env.get('SUPABASE_URL') || '';
    const supabaseServiceKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') || '';

    const supabase = createClient(supabaseUrl, supabaseServiceKey, {
      auth: { persistSession: false, autoRefreshToken: false },
    });

    const { userId } = await authenticateRequest(req, supabase, supabaseServiceKey, requestBody.userId);

    // Get Nylas integration
    const nylasInt = await getNylasIntegration(supabase, userId);
    if (!nylasInt) {
      throw new Error('Nylas calendar not connected. Please connect your Google Calendar via Nylas first.');
    }

    let response;

    switch (action) {
      case 'list-events': {
        const params: Record<string, string> = {};
        if (requestBody.calendarId) params.calendar_id = requestBody.calendarId;
        if (requestBody.limit) params.limit = String(requestBody.limit);
        if (requestBody.pageToken) params.page_token = requestBody.pageToken;
        // Nylas expects Unix timestamps for start/end
        if (requestBody.timeMin) params.start = String(Math.floor(new Date(requestBody.timeMin).getTime() / 1000));
        if (requestBody.timeMax) params.end = String(Math.floor(new Date(requestBody.timeMax).getTime() / 1000));

        const res = await nylasRequest(nylasInt.grantId, '/events', { params });
        const data = await res.json();

        response = {
          events: data.data || [],
          nextPageToken: data.next_cursor || null,
          count: data.data?.length || 0,
        };
        break;
      }

      case 'get-event': {
        const eventId = requestBody.eventId;
        if (!eventId) throw new Error('eventId is required');

        const params: Record<string, string> = {};
        if (requestBody.calendarId) params.calendar_id = requestBody.calendarId;

        const res = await nylasRequest(nylasInt.grantId, `/events/${encodeURIComponent(eventId)}`, { params });
        const data = await res.json();

        response = data.data || {};
        break;
      }

      case 'sync': {
        // Sync Nylas calendar events into the local calendar_events table
        const orgId = await getUserOrgId(supabase, userId);

        // Get or create calendar record
        let calRecord: { id: string } | null = null;
        const { data: existingCal } = await supabase
          .from('calendar_calendars')
          .select('id')
          .eq('user_id', userId)
          .eq('external_id', 'primary')
          .maybeSingle();

        if (existingCal?.id) {
          calRecord = existingCal;
        } else {
          const calPayload: Record<string, unknown> = {
            user_id: userId,
            external_id: 'primary',
            name: 'Primary Calendar (Nylas)',
            sync_enabled: true,
          };
          if (orgId) calPayload.org_id = orgId;

          const { data: insertedCal, error: insertError } = await supabase
            .from('calendar_calendars')
            .insert(calPayload)
            .select('id')
            .single();

          if (insertError) throw new Error(`Failed to create calendar record: ${insertError.message}`);
          calRecord = insertedCal;
        }

        if (!calRecord?.id) throw new Error('Failed to create or find calendar record');

        // Fetch events from Nylas — 14 days back + 30 days forward
        const timeMin = Math.floor((Date.now() - 14 * 86400000) / 1000);
        const timeMax = Math.floor((Date.now() + 30 * 86400000) / 1000);

        const params: Record<string, string> = {
          start: String(timeMin),
          end: String(timeMax),
          limit: '200',
        };

        const res = await nylasRequest(nylasInt.grantId, '/events', { params });
        const data = await res.json();
        const events = data.data || [];

        const stats = { created: 0, updated: 0, skipped: 0 };

        for (const ev of events) {
          try {
            const payload = mapNylasEventToCalendarEvent(ev, userId, calRecord.id, orgId);

            const { error: upsertError } = await supabase
              .from('calendar_events')
              .upsert(payload, { onConflict: 'user_id,external_id' });

            if (upsertError) {
              console.warn(`[nylas-calendar] Upsert error for event ${ev.id}:`, upsertError.message);
              stats.skipped++;
            } else {
              stats.updated++;
            }
          } catch (eventError) {
            console.warn(`[nylas-calendar] Failed to process event ${ev.id}:`, eventError);
            stats.skipped++;
          }
        }

        // Update user_sync_status
        await supabase
          .from('user_sync_status')
          .upsert({
            user_id: userId,
            calendar_last_synced_at: new Date().toISOString(),
          }, { onConflict: 'user_id' });

        // Update calendar last_synced_at
        await supabase
          .from('calendar_calendars')
          .update({ last_synced_at: new Date().toISOString() })
          .eq('id', calRecord.id);

        response = {
          success: true,
          totalEvents: events.length,
          ...stats,
          provider: 'nylas',
        };

        console.log(`[nylas-calendar] Sync complete for user ${userId}:`, response);
        break;
      }

      default:
        throw new Error(`Unsupported action: ${action}. Supported: list-events, get-event, sync.`);
    }

    return jsonResponse(response, req);
  } catch (error) {
    const status = error.statusCode || 400;
    console.error('[nylas-calendar] Error:', error.message || error);
    return errorResponse(error.message || 'Internal server error', req, status);
  }
});
