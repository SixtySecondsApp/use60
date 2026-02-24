/**
 * Send User Removal Email Edge Function
 *
 * Sends notification email when a user is removed from an organization
 * Delegates to encharge-send-email dispatcher with standardized variables
 *
 * Story: EMAIL-006
 * Template Type: member_removed
 * Variables Schema: recipient_name, organization_name, admin_name, action_url, support_email
 */

import { serve } from 'https://deno.land/std@0.190.0/http/server.ts';
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';
import { verifySecret } from '../_shared/edgeAuth.ts';
import { getCorsHeaders, handleCorsPreflightRequest } from '../_shared/corsHelper.ts';

const SUPABASE_URL = Deno.env.get('SUPABASE_URL')!;
const SUPABASE_SERVICE_ROLE_KEY = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;

interface RemovalEmailRequest {
  user_id: string;
  org_id: string;
  org_name: string;
  admin_name?: string;
  admin_email?: string;
  rejoin_url?: string;
}

serve(async (req) => {
  // Handle CORS preflight
  const preflightResponse = handleCorsPreflightRequest(req);
  if (preflightResponse) return preflightResponse;

  const corsHeaders = getCorsHeaders(req);

  // Verify authentication - accept edge function secret OR valid user JWT
  const auth = verifySecret(req);
  let isAuthed = auth.authenticated;

  if (!isAuthed) {
    // Fallback: check if the caller has a valid user JWT (browser call from admin)
    const authHeader = req.headers.get('Authorization');
    if (authHeader?.startsWith('Bearer ')) {
      const token = authHeader.slice(7).trim();
      const supabaseAuth = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY);
      const { data: { user }, error } = await supabaseAuth.auth.getUser(token);
      if (!error && user) {
        // Verify caller is an admin
        const { data: profile } = await supabaseAuth
          .from('profiles')
          .select('is_admin')
          .eq('id', user.id)
          .single();
        if (profile?.is_admin) {
          isAuthed = true;
          console.log('[send-removal-email] Authenticated via user JWT (admin):', user.id);
        }
      }
    }
  }

  if (!isAuthed) {
    console.error('[send-removal-email] Authentication failed');
    return new Response(
      JSON.stringify({ success: false, error: 'Unauthorized: invalid credentials' }),
      {
        status: 401,
        headers: {
          'Content-Type': 'application/json',
          ...corsHeaders,
        },
      }
    );
  }

  try {
    // Parse request body
    const { user_id, org_id, org_name, admin_name, admin_email, rejoin_url }: RemovalEmailRequest = await req.json();

    if (!user_id || !org_id || !org_name) {
      return new Response(
        JSON.stringify({ error: 'Missing required fields: user_id, org_id, org_name' }),
        { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    // Create Supabase client with service role
    const supabase = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY);

    // Get user profile
    const { data: profile, error: profileError } = await supabase
      .from('profiles')
      .select('email, first_name, last_name')
      .eq('id', user_id)
      .maybeSingle();

    if (profileError || !profile) {
      console.error('[send-removal-email] Profile not found:', profileError);
      return new Response(
        JSON.stringify({ error: 'User profile not found', emailSent: false }),
        { status: 404, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    // Build action URL - default to support contact if not provided
    const actionUrl = rejoin_url || 'mailto:support@use60.com';

    // Prepare email variables per EMAIL_VARIABLES_SCHEMA.md
    const emailVariables = {
      recipient_name: profile.first_name || 'there',
      organization_name: org_name,
      admin_name: admin_name || 'An administrator',
      admin_email: admin_email,
      action_url: actionUrl,
      support_email: 'support@use60.com',
    };

    console.log('[send-removal-email] Delegating to encharge-send-email dispatcher');

    // Call encharge-send-email dispatcher with EDGE_FUNCTION_SECRET
    const edgeFunctionSecret = Deno.env.get('EDGE_FUNCTION_SECRET');

    const dispatcherHeaders: Record<string, string> = {
      'Content-Type': 'application/json',
    };

    if (edgeFunctionSecret) {
      dispatcherHeaders['x-edge-function-secret'] = edgeFunctionSecret;
    } else if (SUPABASE_SERVICE_ROLE_KEY) {
      dispatcherHeaders['Authorization'] = `Bearer ${SUPABASE_SERVICE_ROLE_KEY}`;
      dispatcherHeaders['apikey'] = SUPABASE_SERVICE_ROLE_KEY;
    }

    const emailResponse = await fetch(`${SUPABASE_URL}/functions/v1/encharge-send-email`, {
      method: 'POST',
      headers: dispatcherHeaders,
      body: JSON.stringify({
        template_type: 'member_removed',
        to_email: profile.email,
        to_name: profile.first_name || profile.email,
        user_id,
        variables: emailVariables,
      }),
    });

    if (!emailResponse.ok) {
      const errorText = await emailResponse.text();
      console.error('[send-removal-email] Dispatcher error:', errorText);

      // Non-blocking - email is best-effort
      return new Response(
        JSON.stringify({
          emailSent: false,
          error: 'Email sending failed',
          details: errorText
        }),
        { status: 200, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    const emailResult = await emailResponse.json();
    console.log('[send-removal-email] Email sent successfully - Message ID:', emailResult.message_id);

    return new Response(
      JSON.stringify({
        emailSent: true,
        to: profile.email,
        message_id: emailResult.message_id,
        template_type: 'member_removed',
      }),
      { status: 200, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );

  } catch (error) {
    console.error('[send-removal-email] Error:', error);

    // Non-blocking error response
    return new Response(
      JSON.stringify({
        emailSent: false,
        error: error instanceof Error ? error.message : 'Unknown error'
      }),
      { status: 200, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );
  }
});
