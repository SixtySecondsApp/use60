/**
 * First Meeting Synced Email Edge Function
 *
 * Sends notification when user's first meeting is synced from calendar
 * Delegates to encharge-send-email dispatcher with standardized variables
 *
 * Story: EMAIL-011
 * Template Type: first_meeting_synced
 * Variables Schema: recipient_name, meeting_title, meeting_date, action_url
 */

import { serve } from 'https://deno.land/std@0.190.0/http/server.ts';
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';

const SUPABASE_URL = Deno.env.get('SUPABASE_URL') || '';
const SUPABASE_SERVICE_ROLE_KEY = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') || '';

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type, x-edge-function-secret',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
};

interface FirstMeetingSyncedEmailRequest {
  user_id: string;
  meeting_title: string;
  meeting_date?: string;
  meeting_id?: string;
  action_url?: string;
}

/**
 * Verify custom edge function secret
 */
function verifySecret(req: Request): boolean {
  const secret = Deno.env.get('EDGE_FUNCTION_SECRET');
  if (!secret) {
    console.warn('[first-meeting-synced-email] No EDGE_FUNCTION_SECRET configured');
    return true; // Dev mode
  }

  const authHeader = req.headers.get('authorization');
  if (authHeader?.startsWith('Bearer ')) {
    const token = authHeader.slice(7);
    if (token === secret) return true;
  }

  const headerSecret = req.headers.get('x-edge-function-secret');
  if (headerSecret && headerSecret === secret) return true;

  return false;
}

serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response('ok', { headers: corsHeaders });
  }

  // Verify authentication
  if (!verifySecret(req)) {
    console.error('[first-meeting-synced-email] Authentication failed');
    return new Response(
      JSON.stringify({ success: false, error: 'Unauthorized' }),
      { status: 401, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );
  }

  try {
    const {
      user_id,
      meeting_title,
      meeting_date,
      meeting_id,
      action_url,
    }: FirstMeetingSyncedEmailRequest = await req.json();

    if (!user_id || !meeting_title) {
      return new Response(
        JSON.stringify({ error: 'Missing required fields: user_id, meeting_title' }),
        { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    const supabase = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY);

    // Get user profile
    const { data: profile, error: profileError } = await supabase
      .from('profiles')
      .select('email, first_name, id as org_id')
      .eq('id', user_id)
      .maybeSingle();

    if (profileError || !profile) {
      console.error('[first-meeting-synced-email] Profile not found:', profileError);
      return new Response(
        JSON.stringify({ error: 'User profile not found', emailSent: false }),
        { status: 404, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    const recipientName = profile.first_name || 'there';
    const defaultActionUrl = action_url || `https://app.use60.com/meetings/${meeting_id}`;

    // Prepare standardized variables per EMAIL_VARIABLES_SCHEMA.md
    const emailVariables = {
      recipient_name: recipientName,
      meeting_title: meeting_title,
      meeting_date: meeting_date,
      action_url: defaultActionUrl,
      support_email: 'support@use60.com',
    };

    console.log('[first-meeting-synced-email] Delegating to encharge-send-email dispatcher');

    // Call encharge-send-email dispatcher
    const dispatcherResponse = await fetch(`${SUPABASE_URL}/functions/v1/encharge-send-email`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${SUPABASE_SERVICE_ROLE_KEY}`,
        'apikey': SUPABASE_SERVICE_ROLE_KEY,
      },
      body: JSON.stringify({
        template_type: 'first_meeting_synced',
        to_email: profile.email,
        to_name: recipientName,
        user_id,
        variables: emailVariables,
      }),
    });

    if (!dispatcherResponse.ok) {
      const errorText = await dispatcherResponse.text();
      console.error('[first-meeting-synced-email] Dispatcher error:', errorText);
      return new Response(
        JSON.stringify({
          success: false,
          error: 'Failed to send email',
          details: errorText,
        }),
        { status: dispatcherResponse.status, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    const dispatcherResult = await dispatcherResponse.json();
    console.log('[first-meeting-synced-email] Email sent successfully - Message ID:', dispatcherResult.message_id);

    return new Response(
      JSON.stringify({
        success: true,
        to: profile.email,
        message_id: dispatcherResult.message_id,
        template_type: 'first_meeting_synced',
      }),
      { status: 200, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );

  } catch (error) {
    console.error('[first-meeting-synced-email] Error:', error);
    return new Response(
      JSON.stringify({
        success: false,
        error: error instanceof Error ? error.message : 'Unknown error'
      }),
      { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );
  }
});
