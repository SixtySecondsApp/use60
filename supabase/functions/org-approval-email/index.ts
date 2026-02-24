/**
 * Organization Approval Email Edge Function
 *
 * Sends notification when an organization setup or join request is approved
 * Delegates to encharge-send-email dispatcher with standardized variables
 *
 * Story: EMAIL-009
 * Template Type: org_approval
 * Variables Schema: recipient_name, organization_name, approval_type, action_url
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

interface OrgApprovalEmailRequest {
  user_id: string;
  organization_id: string;
  organization_name: string;
  approval_type: 'setup_complete' | 'join_request_approved' | string;
  approval_details?: string;
  action_url?: string;
}

/**
 * Verify custom edge function secret
 */
function verifySecret(req: Request): boolean {
  const secret = Deno.env.get('EDGE_FUNCTION_SECRET');
  if (!secret) {
    console.warn('[org-approval-email] No EDGE_FUNCTION_SECRET configured');
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
    console.error('[org-approval-email] Authentication failed');
    return new Response(
      JSON.stringify({ success: false, error: 'Unauthorized' }),
      { status: 401, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );
  }

  try {
    const {
      user_id,
      organization_id,
      organization_name,
      approval_type = 'setup_complete',
      approval_details,
      action_url,
    }: OrgApprovalEmailRequest = await req.json();

    if (!user_id || !organization_id || !organization_name) {
      return new Response(
        JSON.stringify({ error: 'Missing required fields: user_id, organization_id, organization_name' }),
        { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    const supabase = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY);

    // Get user profile
    const { data: profile, error: profileError } = await supabase
      .from('profiles')
      .select('email, first_name')
      .eq('id', user_id)
      .maybeSingle();

    if (profileError || !profile) {
      console.error('[org-approval-email] Profile not found:', profileError);
      return new Response(
        JSON.stringify({ error: 'User profile not found', emailSent: false }),
        { status: 404, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    const recipientName = profile.first_name || 'there';
    const defaultActionUrl = action_url || `https://app.use60.com/organization/${organization_id}`;

    // Prepare standardized variables per EMAIL_VARIABLES_SCHEMA.md
    const emailVariables = {
      recipient_name: recipientName,
      organization_name: organization_name,
      approval_type: approval_type,
      approval_details: approval_details,
      action_url: defaultActionUrl,
      support_email: 'support@use60.com',
    };

    console.log('[org-approval-email] Delegating to encharge-send-email dispatcher');

    // Call encharge-send-email dispatcher
    const dispatcherResponse = await fetch(`${SUPABASE_URL}/functions/v1/encharge-send-email`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${SUPABASE_SERVICE_ROLE_KEY}`,
        'apikey': SUPABASE_SERVICE_ROLE_KEY,
      },
      body: JSON.stringify({
        template_type: 'org_approval',
        to_email: profile.email,
        to_name: recipientName,
        user_id,
        variables: emailVariables,
      }),
    });

    if (!dispatcherResponse.ok) {
      const errorText = await dispatcherResponse.text();
      console.error('[org-approval-email] Dispatcher error:', errorText);
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
    console.log('[org-approval-email] Email sent successfully - Message ID:', dispatcherResult.message_id);

    return new Response(
      JSON.stringify({
        success: true,
        to: profile.email,
        message_id: dispatcherResult.message_id,
        template_type: 'org_approval',
      }),
      { status: 200, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );

  } catch (error) {
    console.error('[org-approval-email] Error:', error);
    return new Response(
      JSON.stringify({
        success: false,
        error: error instanceof Error ? error.message : 'Unknown error'
      }),
      { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );
  }
});
