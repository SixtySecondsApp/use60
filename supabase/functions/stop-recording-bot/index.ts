/**
 * Stop Recording Bot Edge Function
 *
 * Stops a MeetingBaaS bot that is currently recording a meeting.
 * Removes the bot from the meeting and triggers the processing pipeline.
 *
 * Endpoint: POST /functions/v1/stop-recording-bot
 */

import { serve } from 'https://deno.land/std@0.168.0/http/server.ts';
import { createClient, SupabaseClient } from 'https://esm.sh/@supabase/supabase-js@2';
import { legacyCorsHeaders as corsHeaders, handleCorsPreflightRequest } from '../_shared/corsHelper.ts';
import {
  createMeetingBaaSClient,
  ERROR_CODES,
} from '../_shared/meetingbaas.ts';

// =============================================================================
// Types
// =============================================================================

interface StopBotRequest {
  recording_id: string;
}

interface StopBotResponse {
  success: boolean;
  recording_id?: string;
  error?: string;
  error_code?: string;
}

// =============================================================================
// Main Handler
// =============================================================================

serve(async (req) => {
  // Handle CORS preflight
  const preflightResponse = handleCorsPreflightRequest(req);
  if (preflightResponse) {
    return preflightResponse;
  }

  if (req.method !== 'POST') {
    return new Response(JSON.stringify({ error: 'Method not allowed' }), {
      status: 405,
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });
  }

  try {
    // Get auth header
    const authHeader = req.headers.get('Authorization');
    if (!authHeader) {
      return new Response(JSON.stringify({ error: 'Missing authorization header' }), {
        status: 401,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    // Create Supabase client with user auth
    const supabase: SupabaseClient = createClient(
      Deno.env.get('SUPABASE_URL')!,
      Deno.env.get('SUPABASE_ANON_KEY')!,
      {
        global: {
          headers: { Authorization: authHeader },
        },
      }
    );

    // Verify user is authenticated
    const {
      data: { user },
      error: userError,
    } = await supabase.auth.getUser();

    if (userError || !user) {
      return new Response(JSON.stringify({ error: 'Unauthorized' }), {
        status: 401,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    // Parse request body
    const body: StopBotRequest = await req.json();

    if (!body.recording_id) {
      return new Response(
        JSON.stringify({
          success: false,
          error: 'Recording ID is required',
        }),
        {
          status: 400,
          headers: { ...corsHeaders, 'Content-Type': 'application/json' },
        }
      );
    }

    // Fetch the recording to get bot_id and validate status
    const { data: recording, error: recordingError } = await supabase
      .from('recordings')
      .select('id, bot_id, status, org_id, user_id')
      .eq('id', body.recording_id)
      .maybeSingle();

    if (recordingError || !recording) {
      console.error('[StopBot] Recording not found:', body.recording_id, recordingError);
      return new Response(
        JSON.stringify({
          success: false,
          error: 'Recording not found',
        }),
        {
          status: 404,
          headers: { ...corsHeaders, 'Content-Type': 'application/json' },
        }
      );
    }

    // Validate user owns the recording or is in the same org
    if (recording.user_id !== user.id) {
      // Check if user is in the same org
      const { data: membership } = await supabase
        .from('organization_memberships')
        .select('org_id')
        .eq('user_id', user.id)
        .eq('org_id', recording.org_id)
        .maybeSingle();

      if (!membership) {
        return new Response(
          JSON.stringify({
            success: false,
            error: 'Unauthorized to stop this recording',
          }),
          {
            status: 403,
            headers: { ...corsHeaders, 'Content-Type': 'application/json' },
          }
        );
      }
    }

    // Validate recording is in a stoppable state
    const stoppableStatuses = ['bot_joining', 'recording'];
    if (!stoppableStatuses.includes(recording.status)) {
      console.log('[StopBot] Recording not in stoppable state:', recording.status);
      return new Response(
        JSON.stringify({
          success: false,
          error: `Cannot stop recording in '${recording.status}' status`,
          error_code: 'INVALID_STATE',
        }),
        {
          status: 400,
          headers: { ...corsHeaders, 'Content-Type': 'application/json' },
        }
      );
    }

    // Validate we have a bot_id
    if (!recording.bot_id) {
      console.error('[StopBot] No bot_id found for recording:', body.recording_id);
      return new Response(
        JSON.stringify({
          success: false,
          error: 'No bot associated with this recording',
        }),
        {
          status: 400,
          headers: { ...corsHeaders, 'Content-Type': 'application/json' },
        }
      );
    }

    // Call MeetingBaaS API to remove the bot
    const meetingBaaSClient = createMeetingBaaSClient();
    const { data: removeResponse, error: removeError } = await meetingBaaSClient.removeBot(recording.bot_id);

    if (removeError) {
      console.error('[StopBot] MeetingBaaS removeBot error:', removeError);
      // Even if the API call fails, we should update the status
      // The bot might have already left or been kicked
      // The webhook handler will handle the actual completion
    } else {
      console.log('[StopBot] Bot remove request sent successfully:', removeResponse);
    }

    // Update recording status to 'processing'
    const now = new Date().toISOString();
    const { error: updateError } = await supabase
      .from('recordings')
      .update({
        status: 'processing',
        meeting_end_time: now,
      })
      .eq('id', body.recording_id);

    if (updateError) {
      console.error('[StopBot] Failed to update recording status:', updateError);
    }

    // Update bot_deployments status to 'leaving'
    const { error: deploymentError } = await supabase
      .from('bot_deployments')
      .update({
        status: 'leaving',
        leave_time: now,
      })
      .eq('recording_id', body.recording_id);

    if (deploymentError) {
      console.error('[StopBot] Failed to update bot deployment status:', deploymentError);
    }

    // Also update the unified meetings table if exists
    await supabase
      .from('meetings')
      .update({
        processing_status: 'processing',
      })
      .eq('recording_id', body.recording_id)
      .eq('source_type', '60_notetaker');

    console.log('[StopBot] Recording stopped successfully:', {
      recordingId: body.recording_id,
      botId: recording.bot_id,
    });

    return new Response(
      JSON.stringify({
        success: true,
        recording_id: body.recording_id,
      } as StopBotResponse),
      {
        status: 200,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      }
    );
  } catch (error) {
    console.error('[StopBot] Error:', error);
    return new Response(
      JSON.stringify({
        success: false,
        error: 'Internal server error',
        message: error instanceof Error ? error.message : 'Unknown error',
      }),
      {
        status: 500,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      }
    );
  }
});
