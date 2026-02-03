/**
 * Send Organization Invitation Email Edge Function
 *
 * Sends invitation emails to join an organization using encharge-send-email dispatcher
 * Uses database-driven email templates with standardized variables
 *
 * Story: EMAIL-005
 * Template Type: organization_invitation
 * Variables Schema: recipient_name, organization_name, inviter_name, action_url, expiry_time
 *
 * Authentication: Uses custom secret from EDGE_FUNCTION_SECRET environment variable
 */

import { serve } from 'https://deno.land/std@0.190.0/http/server.ts';
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';

const SUPABASE_URL = Deno.env.get('SUPABASE_URL') || '';
const SUPABASE_SERVICE_ROLE_KEY = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') || '';

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type, x-edge-function-secret, x-custom-auth',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
  'Access-Control-Allow-Credentials': 'true',
};

/**
 * Verify custom edge function secret
 */
function verifySecret(req: Request): boolean {
  const secret = Deno.env.get('EDGE_FUNCTION_SECRET');
  if (!secret) {
    console.warn('[send-organization-invitation] No EDGE_FUNCTION_SECRET configured');
    return false;
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

  // If running locally (no secret), allow requests for development
  if (!Deno.env.get('EDGE_FUNCTION_SECRET')) {
    console.log('[send-organization-invitation] Running in development mode (no secret)');
    return true;
  }

  return false;
}

interface SendInvitationRequest {
  to_email: string;
  to_name?: string;
  organization_name: string;
  inviter_name: string;
  invitation_url: string;
  expiry_time?: string;
}

serve(async (req) => {
  console.log(`[send-organization-invitation] ${req.method} request received`);

  // Handle CORS preflight
  if (req.method === 'OPTIONS') {
    console.log('[send-organization-invitation] Responding to OPTIONS request');
    return new Response('ok', {
      status: 200,
      headers: corsHeaders,
    });
  }

  // Only allow POST requests
  if (req.method !== 'POST') {
    console.log(`[send-organization-invitation] Invalid method: ${req.method}`);
    return new Response(JSON.stringify({ error: 'Method not allowed' }), {
      status: 405,
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });
  }

  // Verify custom authentication
  if (!verifySecret(req)) {
    console.error('[send-organization-invitation] Authentication failed: invalid secret or missing authorization');
    return new Response(JSON.stringify({ error: 'Unauthorized: invalid credentials' }), {
      status: 401,
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });
  }

  try {
    console.log('[send-organization-invitation] Parsing request body');
    const {
      to_email,
      to_name,
      organization_name,
      inviter_name,
      invitation_url,
      expiry_time = '7 days',
    }: SendInvitationRequest = await req.json();

    console.log(`[send-organization-invitation] Sending to: ${to_email}`);

    // Validate inputs
    if (!to_email || !organization_name || !inviter_name || !invitation_url) {
      return new Response(
        JSON.stringify({
          success: false,
          error: 'Missing required parameters: to_email, organization_name, inviter_name, invitation_url',
        }),
        {
          status: 400,
          headers: { ...corsHeaders, 'Content-Type': 'application/json' },
        }
      );
    }

    const recipientName = to_name || to_email.split('@')[0];

    // Prepare standardized variables per EMAIL_VARIABLES_SCHEMA.md
    const emailVariables = {
      recipient_name: recipientName,
      organization_name: organization_name,
      inviter_name: inviter_name,
      action_url: invitation_url,
      expiry_time: expiry_time,
      support_email: 'support@use60.com',
    };

    console.log('[send-organization-invitation] Delegating to encharge-send-email dispatcher');

    // Call encharge-send-email dispatcher with template type
    const dispatcherResponse = await fetch(`${SUPABASE_URL}/functions/v1/encharge-send-email`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${SUPABASE_SERVICE_ROLE_KEY}`,
        'apikey': SUPABASE_SERVICE_ROLE_KEY,
      },
      body: JSON.stringify({
        template_type: 'organization_invitation',
        to_email: to_email,
        to_name: recipientName,
        variables: emailVariables,
      }),
    });

    if (!dispatcherResponse.ok) {
      const errorText = await dispatcherResponse.text();
      console.error('[send-organization-invitation] Dispatcher error:', errorText);
      return new Response(
        JSON.stringify({
          success: false,
          error: 'Failed to send invitation email',
          details: errorText,
        }),
        {
          status: dispatcherResponse.status,
          headers: { ...corsHeaders, 'Content-Type': 'application/json' },
        }
      );
    }

    const dispatcherResult = await dispatcherResponse.json();
    console.log(`[send-organization-invitation] Email sent successfully - Message ID: ${dispatcherResult.message_id}`);

    return new Response(
      JSON.stringify({
        success: true,
        message_id: dispatcherResult.message_id,
        template_type: 'organization_invitation',
      }),
      {
        status: 200,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      }
    );
  } catch (error) {
    console.error('[send-organization-invitation] Error:', error);
    return new Response(
      JSON.stringify({
        success: false,
        error: error instanceof Error ? error.message : 'Unknown error',
      }),
      {
        status: 500,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      }
    );
  }
});
