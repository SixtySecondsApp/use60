/**
 * Send User Removal Email Edge Function
 *
 * Sends notification email when a user is removed from an organization
 * Calls the encharge-send-email function with member_removed template
 *
 * Story: ORGREM-004
 */

import { serve } from 'https://deno.land/std@0.190.0/http/server.ts';
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';

const SUPABASE_URL = Deno.env.get('SUPABASE_URL')!;
const SUPABASE_SERVICE_ROLE_KEY = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type, x-edge-function-secret',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
};

/**
 * Verify custom edge function secret
 */
function verifySecret(req: Request): boolean {
  const secret = Deno.env.get('EDGE_FUNCTION_SECRET');
  if (!secret) {
    console.warn('[send-removal-email] No EDGE_FUNCTION_SECRET configured');
    return true;  // Dev mode
  }

  // Check Authorization header for Bearer token (avoids CORS preflight issues)
  const authHeader = req.headers.get('authorization');
  if (authHeader?.startsWith('Bearer ')) {
    const token = authHeader.slice(7); // Remove "Bearer " prefix
    if (token === secret) {
      return true;
    }
  }

  // Fallback: Check for custom header if Authorization not used
  const headerSecret = req.headers.get('x-edge-function-secret');
  if (headerSecret && headerSecret === secret) {
    return true;
  }

  // Check API key header for service role (additional fallback)
  const apiKeyHeader = req.headers.get('apikey');
  if (apiKeyHeader === SUPABASE_SERVICE_ROLE_KEY) {
    return true;
  }

  return false;
}

interface RemovalEmailRequest {
  user_id: string;
  org_id: string;
  org_name: string;
  admin_email?: string;
  rejoin_url?: string;
}

serve(async (req) => {
  // Handle CORS preflight
  if (req.method === 'OPTIONS') {
    return new Response('ok', { headers: corsHeaders });
  }

  // Verify authentication
  if (!verifySecret(req)) {
    console.error('[send-removal-email] Authentication failed: invalid secret');
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
    const { user_id, org_id, org_name, admin_email, rejoin_url }: RemovalEmailRequest = await req.json();

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
      .single();

    if (profileError || !profile) {
      console.error('[send-removal-email] Profile not found:', profileError);
      return new Response(
        JSON.stringify({ error: 'User profile not found', emailSent: false }),
        { status: 404, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    // Prepare email variables (standardized names)
    const emailVariables = {
      recipient_name: profile.first_name || 'there',
      organization_name: org_name,
      admin_email: admin_email || 'support@use60.com',
      action_url: rejoin_url || `${SUPABASE_URL.replace('https://', 'https://app.')}/onboarding/removed-user`,
      support_email: 'support@use60.com',
    };

    console.log('[send-removal-email] Sending email to:', profile.email);

    // Call encharge-send-email function
    const emailResponse = await fetch(`${SUPABASE_URL}/functions/v1/encharge-send-email`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${SUPABASE_SERVICE_ROLE_KEY}`,
        'apikey': SUPABASE_SERVICE_ROLE_KEY,
      },
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
      console.error('[send-removal-email] Email sending failed:', errorText);

      // Don't throw - log error but return success (non-blocking)
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
    console.log('[send-removal-email] Email sent successfully');

    return new Response(
      JSON.stringify({
        emailSent: true,
        to: profile.email,
        result: emailResult
      }),
      { status: 200, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );

  } catch (error) {
    console.error('[send-removal-email] Error:', error);

    // Non-blocking error response
    return new Response(
      JSON.stringify({
        emailSent: false,
        error: error.message
      }),
      { status: 200, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );
  }
});
