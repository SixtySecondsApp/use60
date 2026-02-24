import { serve } from 'https://deno.land/std@0.168.0/http/server.ts';
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';
import { getCorsHeaders, handleCorsPreflightRequest } from '../_shared/corsHelper.ts';

/**
 * Google Calendar Push Notification Webhook
 *
 * Receives notifications from Google Calendar API when calendar events change.
 * Triggers incremental sync to update local calendar_events table.
 *
 * Google sends notifications to this endpoint when:
 * - New events are created
 * - Existing events are updated
 * - Events are deleted
 *
 * Authentication: X-Goog-Channel-Token header is validated against the token
 * stored in google_calendar_channels when the watch channel was registered.
 *
 * @see https://developers.google.com/calendar/api/guides/push
 */

const SUPABASE_URL = Deno.env.get('SUPABASE_URL')!;
const SUPABASE_SERVICE_ROLE_KEY = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;

serve(async (req) => {
  // Handle CORS preflight
  const preflightResponse = handleCorsPreflightRequest(req);
  if (preflightResponse) return preflightResponse;

  const corsHeaders = getCorsHeaders(req);

  try {
    const supabase = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY);

    // Log ALL headers for debugging
    const allHeaders: Record<string, string> = {};
    req.headers.forEach((value, key) => {
      allHeaders[key] = value;
    });
    console.log('All webhook headers:', allHeaders);

    // Parse Google push notification headers (use lowercase to match actual headers)
    const channelToken = req.headers.get('x-goog-channel-token');
    const channelId = req.headers.get('x-goog-channel-id');
    const resourceState = req.headers.get('x-goog-resource-state');
    const resourceId = req.headers.get('x-goog-resource-id');
    const messageNumber = req.headers.get('x-goog-message-number');

    console.log('Google Calendar webhook received:', {
      resourceState,
      channelId,
      resourceId,
      messageNumber,
    });

    // Step 1: Validate required Google channel headers are present
    if (!channelToken || !channelId) {
      console.warn('Missing X-Goog-Channel-Token or X-Goog-Channel-ID — rejecting request');
      return new Response('Unauthorized', {
        status: 401,
        headers: corsHeaders,
      });
    }

    // Step 2: Validate token against DB — proves the request is genuinely from Google
    // for a channel we registered. maybeSingle() returns null (not an error) if not found.
    const { data: channel, error: channelError } = await supabase
      .from('google_calendar_channels')
      .select('user_id, org_id, calendar_id, last_message_number, channel_token')
      .eq('channel_id', channelId)
      .eq('is_active', true)
      .maybeSingle();

    if (channelError) {
      console.error('Error looking up channel:', channelError);
      return new Response('Unauthorized', {
        status: 401,
        headers: corsHeaders,
      });
    }

    if (!channel) {
      console.warn('No active channel found for channelId:', channelId);
      return new Response('Unauthorized', {
        status: 401,
        headers: corsHeaders,
      });
    }

    // Compare the token Google sent with the one we stored.
    // channel_token may be null for channels created before this column was added;
    // skip token check for those to avoid breaking existing subscriptions.
    if (channel.channel_token !== null && channel.channel_token !== channelToken) {
      console.warn('X-Goog-Channel-Token mismatch for channelId:', channelId);
      return new Response('Unauthorized', {
        status: 401,
        headers: corsHeaders,
      });
    }

    // Step 3: Handle sync ping (initial channel verification from Google) — no processing needed
    if (resourceState === 'sync') {
      console.log('Sync notification received — webhook verified');
      return new Response(
        JSON.stringify({ success: true, message: 'Webhook verified' }),
        {
          status: 200,
          headers: { ...corsHeaders, 'Content-Type': 'application/json' },
        }
      );
    }

    // Step 4: Deduplication — only process newer message numbers
    const currentMessageNumber = messageNumber ? parseInt(messageNumber, 10) : 0;
    const lastMessageNumber = channel.last_message_number || 0;

    if (currentMessageNumber <= lastMessageNumber) {
      console.log('Skipping duplicate/old notification:', {
        currentMessageNumber,
        lastMessageNumber,
        channelId,
      });
      return new Response(
        JSON.stringify({
          success: true,
          message: 'Duplicate notification skipped',
          messageNumber: currentMessageNumber,
        }),
        {
          status: 200,
          headers: { ...corsHeaders, 'Content-Type': 'application/json' },
        }
      );
    }

    console.log('Processing webhook for user:', channel.user_id, 'org:', channel.org_id, 'message:', currentMessageNumber);

    // Step 5: Trigger incremental sync for this calendar
    const { data: syncResult, error: syncError } = await supabase.functions.invoke(
      'google-calendar-sync',
      {
        body: {
          action: 'incremental-sync',
          userId: channel.user_id,
          orgId: channel.org_id,
          calendarId: channel.calendar_id || 'primary',
        },
      }
    );

    if (syncError) {
      console.error('Sync error:', syncError);
      // Still return 200 to Google so they don't retry
      return new Response(
        JSON.stringify({ success: true, warning: 'Sync failed but acknowledged' }),
        {
          status: 200,
          headers: { ...corsHeaders, 'Content-Type': 'application/json' },
        }
      );
    }

    console.log('Sync completed:', syncResult);

    // Step 6: Update last notification time and message number
    await supabase
      .from('google_calendar_channels')
      .update({
        last_notification_at: new Date().toISOString(),
        notification_count: supabase.raw('notification_count + 1'),
        last_message_number: currentMessageNumber,
      })
      .eq('channel_id', channelId);

    return new Response(
      JSON.stringify({
        success: true,
        message: 'Webhook processed successfully',
        eventsProcessed: syncResult?.eventsProcessed || 0,
      }),
      {
        status: 200,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      }
    );
  } catch (error) {
    console.error('Webhook processing error:', error);

    // Always return 200 to Google to prevent retries
    return new Response(
      JSON.stringify({
        success: true,
        warning: 'Error occurred but acknowledged',
        error: error.message,
      }),
      {
        status: 200,
        headers: { ...getCorsHeaders(req), 'Content-Type': 'application/json' },
      }
    );
  }
});
