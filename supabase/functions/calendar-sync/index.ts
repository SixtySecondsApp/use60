import { serve } from 'https://deno.land/std@0.168.0/http/server.ts';
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2.43.4';
import { captureException } from '../_shared/sentryEdge.ts';
import { extractMeetingUrl } from '../_shared/meetingUrlExtractor.ts';
// WS-027: Legacy refreshAccessToken removed — now uses centralized tokenManager
import { getValidToken } from '../_shared/tokenManager.ts';

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
  'Access-Control-Allow-Methods': 'POST, GET, OPTIONS',
};

async function refreshAccessToken(_refreshToken: string, _supabase: any, userId: string): Promise<string> {
  const supabaseUrl = Deno.env.get('SUPABASE_URL') || '';
  const supabaseServiceKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') || '';
  const { createClient: cc } = await import('https://esm.sh/@supabase/supabase-js@2.43.4');
  const supa = cc(supabaseUrl, supabaseServiceKey, { auth: { persistSession: false } });
  const { accessToken } = await getValidToken('google', userId, supa);
  return accessToken;
}

type SyncAction = 'sync-full' | 'sync-incremental' | 'sync-historical';

serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response('ok', { headers: corsHeaders });
  }

  if (req.method !== 'POST') {
    return new Response('Method not allowed', { status: 405, headers: corsHeaders });
  }

  try {
    const authHeader = req.headers.get('Authorization');
    if (!authHeader) throw new Error('No authorization header');

    const supabaseUrl = Deno.env.get('SUPABASE_URL') || '';
    const supabaseServiceKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') || '';
    const sb = createClient(supabaseUrl, supabaseServiceKey, { auth: { persistSession: false } });

    // Verify user
    const token = authHeader.replace('Bearer ', '');
    const { data: { user }, error: userError } = await sb.auth.getUser(token);
    if (userError || !user) throw new Error('Invalid authentication token');

    const body = await req.json().catch(() => ({}));
    const action: SyncAction = body.action || 'sync-incremental';
    const calendarId: string = body.calendarId || 'primary';
    const startDate: string | undefined = body.startDate;
    const endDate: string | undefined = body.endDate;

    // Get integration tokens
    const { data: integration, error: integrationError } = await sb
      .from('google_integrations')
      .select('id, access_token, refresh_token, expires_at')
      .eq('user_id', user.id)
      .eq('is_active', true)
      .single();

    if (integrationError || !integration) {
      throw new Error('Google integration not found. Please connect your Google account first.');
    }

    // Ensure access token is valid
    let accessToken: string = integration.access_token;
    const expiresAt = new Date(integration.expires_at);
    if (isNaN(expiresAt.getTime()) || expiresAt <= new Date()) {
      accessToken = await refreshAccessToken(integration.refresh_token, sb, user.id);
    }

    // Fetch org_id first (required for calendar_calendars and calendar_events upserts)
    // org_id is NOT NULL after backfill migration, so we must fetch it
    let orgId: string | null = null;
    try {
      const { data: orgMembership } = await sb
        .from('organization_memberships')
        .select('org_id')
        .eq('user_id', user.id)
        .limit(1)
        .maybeSingle();
      orgId = orgMembership?.org_id || null;
      
      // If no membership found, try to get default org
      if (!orgId) {
        const { data: defaultOrg } = await sb
          .from('organizations')
          .select('id')
          .eq('is_default', true)
          .limit(1)
          .maybeSingle();
        orgId = defaultOrg?.id || null;
      }
    } catch (error) {
      console.error('Failed to fetch org_id, this may cause constraint violations:', error);
      // Note: If org_id is NOT NULL, this will fail - but we'll let the database error surface
    }

    // Ensure calendar record exists
    const calendarPayload: any = {
      user_id: user.id,
      external_id: calendarId,
      sync_enabled: true,
    };
    if (orgId) {
      calendarPayload.org_id = orgId;
    }

    const { data: calRecord } = await sb
      .from('calendar_calendars')
      .upsert(calendarPayload, { onConflict: 'user_id,external_id' })
      .select('id, last_sync_token, historical_sync_completed')
      .single();

    const calendarRecordId = calRecord?.id || null;
    
    if (!calendarRecordId) {
      throw new Error('Calendar record not found');
    }

    // Create sync log (started)
    // Note: orgId is already fetched above and will be reused in the event processing loop
    const { data: logRow } = await sb
      .from('calendar_sync_logs')
      .insert({
        user_id: user.id,
        calendar_id: calendarRecordId,
        sync_type: action === 'sync-historical' ? 'historical' : (action === 'sync-full' ? 'full' : 'incremental'),
        sync_status: 'started',
        started_at: new Date().toISOString(),
      })
      .select('id')
      .single();

    const logId = logRow?.id;

    // Compute time range for historical or provided range
    let timeMin: string | undefined = startDate;
    let timeMax: string | undefined = endDate;
    if (action === 'sync-historical') {
      const now = new Date();
      const min = new Date(now);
      min.setDate(min.getDate() - 90);
      const max = new Date(now);
      max.setDate(max.getDate() + 180);
      timeMin = timeMin || min.toISOString();
      timeMax = timeMax || max.toISOString();
    }

    // Fetch events from Google Calendar
    const stats = { created: 0, updated: 0, deleted: 0 } as Record<string, number>;

    // Basic incremental approach: if we have a last_sync_token, try to use it
    let nextPageToken: string | undefined = undefined;
    let nextSyncToken: string | undefined = undefined;

    for (let page = 0; page < 50; page++) { // safety cap
      const params = new URLSearchParams();
      params.set('singleEvents', 'true');
      params.set('orderBy', 'startTime');
      if (nextPageToken) params.set('pageToken', nextPageToken);

      if (action === 'sync-incremental' && calRecord?.last_sync_token) {
        params.set('syncToken', calRecord.last_sync_token);
      } else {
        if (timeMin) params.set('timeMin', timeMin);
        if (timeMax) params.set('timeMax', timeMax);
      }

      const resp = await fetch(`https://www.googleapis.com/calendar/v3/calendars/${encodeURIComponent(calendarId)}/events?${params}`, {
        headers: { 'Authorization': `Bearer ${accessToken}` },
      });

      if (resp.status === 410) {
        // syncToken expired, fallback to full time-bound sync
        nextPageToken = undefined;
        timeMin = new Date(Date.now() - 90 * 86400000).toISOString();
        timeMax = new Date(Date.now() + 180 * 86400000).toISOString();
        continue;
      }

      if (!resp.ok) {
        const e = await resp.json().catch(() => ({}));
        throw new Error(`Google Calendar error: ${e?.error?.message || resp.statusText}`);
      }

      const data = await resp.json();
      const items = data.items || [];
      nextPageToken = data.nextPageToken;
      nextSyncToken = data.nextSyncToken || nextSyncToken;

      // Upsert events into calendar_events
      for (const ev of items) {
        try {
          // Skip cancelled events by marking as deleted
          const isCancelled = ev.status === 'cancelled';

          const payload: any = {
            user_id: user.id,
            calendar_id: calendarRecordId, // CRITICAL: Add the calendar reference!
            external_id: ev.id,
            title: ev.summary || '(No title)',
            description: ev.description || null,
            location: ev.location || null,
            start_time: ev.start?.dateTime || ev.start?.date || new Date().toISOString(),
            end_time: ev.end?.dateTime || ev.end?.date || ev.start?.dateTime || new Date().toISOString(),
            all_day: !ev.start?.dateTime,
            status: ev.status || 'confirmed',
            meeting_url: extractMeetingUrl(ev),
            attendees_count: Array.isArray(ev.attendees) ? ev.attendees.length : 0,
            color: ev.colorId || null,
            creator_email: ev.creator?.email || null,
            organizer_email: ev.organizer?.email || null,
            html_link: ev.htmlLink || null,
            etag: ev.etag || null,
            external_updated_at: ev.updated ? new Date(ev.updated).toISOString() : null,
            sync_status: isCancelled ? 'deleted' : 'synced',
            raw_data: ev,
          };

          // Include org_id in payload if available
          if (orgId) {
            payload.org_id = orgId;
          }

          // Try upsert with ON CONFLICT first (works if migration is applied)
          // Fallback to manual check/update/insert if ON CONFLICT fails
          let upserted: any = null;
          let upsertError: any = null;

          // Always try upsert first, even without org_id
          const result = await sb
            .from('calendar_events')
            .upsert(payload, { onConflict: 'user_id,external_id' })
            .select('id');
          upserted = result.data;
          upsertError = result.error;

          // If ON CONFLICT failed (likely migration not applied or constraint issue), use manual upsert
          if (upsertError && (upsertError.code === '42P10' || upsertError.message?.includes('ON CONFLICT'))) {
            // Fallback: Check if event exists, then update or insert
            const { data: existing, error: checkError } = await sb
              .from('calendar_events')
              .select('id')
              .eq('user_id', user.id)
              .eq('external_id', ev.id)
              .maybeSingle();

            if (checkError) {
              console.error('Error checking for existing event:', checkError);
              upsertError = checkError;
            } else if (existing) {
              // Update existing event
              const { data, error } = await sb
                .from('calendar_events')
                .update(payload)
                .eq('id', existing.id)
                .select('id');
              upserted = data;
              upsertError = error;
              if (error) {
                console.error('Error updating existing event:', error);
              }
            } else {
              // Insert new event
              const { data, error } = await sb
                .from('calendar_events')
                .insert(payload)
                .select('id');
              upserted = data;
              upsertError = error;
              if (error) {
                console.error('Error inserting new event:', error);
              }
            }
          }

          if (upsertError) {
            // Log detailed error for debugging
            console.error('Error upserting event:', {
              error: upsertError,
              code: upsertError?.code,
              message: upsertError?.message,
              details: upsertError?.details,
              hint: upsertError?.hint,
              external_id: ev.id,
              user_id: user.id,
              has_org_id: !!orgId
            });
            continue;
          }

          // Count stats roughly (created vs updated not perfectly known without inspect)
          stats.created += 1;
        } catch (err) {
          // Log individual item errors for debugging
        }
      }

      if (!nextPageToken) break;
    }

    // Update calendar record with last_sync_token and mark historical complete if needed
    const updates: any = { last_synced_at: new Date().toISOString() };
    if (nextSyncToken) updates.last_sync_token = nextSyncToken;
    if (action === 'sync-historical') updates.historical_sync_completed = true;
    await sb.from('calendar_calendars').update(updates).eq('user_id', user.id).eq('external_id', calendarId);

    // Finish sync log
    if (logId) {
      await sb
        .from('calendar_sync_logs')
        .update({
          sync_status: 'completed',
          completed_at: new Date().toISOString(),
          events_created: stats.created,
          events_updated: stats.updated,
          events_deleted: stats.deleted,
        })
        .eq('id', logId);
    }

    return new Response(
      JSON.stringify({ success: true, stats }),
      { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );
  } catch (error) {
    await captureException(error, {
      tags: {
        function: 'calendar-sync',
        integration: 'google',
      },
    });
    return new Response(
      JSON.stringify({ error: (error as Error).message || 'Sync error' }),
      { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );
  }
});
