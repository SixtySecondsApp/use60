/**
 * Permission to Close Email Edge Function
 *
 * Sends request for admin permission to close/archive an item (deal, task, etc)
 * Delegates to encharge-send-email dispatcher with standardized variables
 *
 * Story: EMAIL-014
 * Template Type: permission_to_close
 * Variables Schema: recipient_name, item_type, item_name, requester_name, action_url
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

interface PermissionToCloseEmailRequest {
  admin_user_id: string;
  requester_user_id: string;
  item_type: 'deal' | 'task' | 'project' | string;
  item_name: string;
  item_id?: string;
  requester_name?: string;
  reason?: string;
}

/**
 * Verify custom edge function secret
 */
function verifySecret(req: Request): boolean {
  const secret = Deno.env.get('EDGE_FUNCTION_SECRET');
  if (!secret) {
    console.warn('[permission-to-close-email] No EDGE_FUNCTION_SECRET configured');
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
    console.error('[permission-to-close-email] Authentication failed');
    return new Response(
      JSON.stringify({ success: false, error: 'Unauthorized' }),
      { status: 401, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );
  }

  try {
    const {
      admin_user_id,
      requester_user_id,
      item_type,
      item_name,
      item_id,
      requester_name,
      reason,
    }: PermissionToCloseEmailRequest = await req.json();

    if (!admin_user_id || !requester_user_id || !item_type || !item_name) {
      return new Response(
        JSON.stringify({ error: 'Missing required fields: admin_user_id, requester_user_id, item_type, item_name' }),
        { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    const supabase = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY);

    // Get admin profile
    const { data: adminProfile, error: adminError } = await supabase
      .from('profiles')
      .select('email, first_name')
      .eq('id', admin_user_id)
      .maybeSingle();

    if (adminError || !adminProfile) {
      console.error('[permission-to-close-email] Admin profile not found:', adminError);
      return new Response(
        JSON.stringify({ error: 'Admin profile not found', emailSent: false }),
        { status: 404, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    // Get requester name if not provided
    let resolvedRequesterName = requester_name;
    if (!resolvedRequesterName) {
      const { data: requesterProfile } = await supabase
        .from('profiles')
        .select('first_name')
        .eq('id', requester_user_id)
        .maybeSingle();
      resolvedRequesterName = requesterProfile?.first_name || 'A team member';
    }

    const adminName = adminProfile.first_name || 'Admin';
    const defaultReviewUrl = item_id
      ? `https://app.use60.com/${item_type}/${item_id}/close-request`
      : `https://app.use60.com/dashboard`;

    // Prepare standardized variables per EMAIL_VARIABLES_SCHEMA.md
    const emailVariables = {
      recipient_name: adminName,
      item_type: item_type,
      item_name: item_name,
      requester_name: resolvedRequesterName,
      reason: reason,
      action_url: defaultReviewUrl,
      support_email: 'support@use60.com',
    };

    console.log('[permission-to-close-email] Delegating to encharge-send-email dispatcher');

    // Call encharge-send-email dispatcher
    const dispatcherResponse = await fetch(`${SUPABASE_URL}/functions/v1/encharge-send-email`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${SUPABASE_SERVICE_ROLE_KEY}`,
        'apikey': SUPABASE_SERVICE_ROLE_KEY,
      },
      body: JSON.stringify({
        template_type: 'permission_to_close',
        to_email: adminProfile.email,
        to_name: adminName,
        user_id: admin_user_id,
        variables: emailVariables,
      }),
    });

    if (!dispatcherResponse.ok) {
      const errorText = await dispatcherResponse.text();
      console.error('[permission-to-close-email] Dispatcher error:', errorText);
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
    console.log('[permission-to-close-email] Email sent successfully - Message ID:', dispatcherResult.message_id);

    return new Response(
      JSON.stringify({
        success: true,
        to: adminProfile.email,
        message_id: dispatcherResult.message_id,
        template_type: 'permission_to_close',
      }),
      { status: 200, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );

  } catch (error) {
    console.error('[permission-to-close-email] Error:', error);
    return new Response(
      JSON.stringify({
        success: false,
        error: error instanceof Error ? error.message : 'Unknown error'
      }),
      { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );
  }
});
