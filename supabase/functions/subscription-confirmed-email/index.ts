/**
 * Subscription Confirmed Email Edge Function
 *
 * Sends confirmation when user successfully subscribes to a plan
 * Delegates to encharge-send-email dispatcher with standardized variables
 *
 * Story: EMAIL-012
 * Template Type: subscription_confirmed
 * Variables Schema: recipient_name, plan_name, price, renewal_date, action_url
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

interface SubscriptionConfirmedEmailRequest {
  user_id: string;
  plan_name: string;
  price?: string;
  renewal_date?: string;
  billing_url?: string;
}

/**
 * Verify custom edge function secret
 */
function verifySecret(req: Request): boolean {
  const secret = Deno.env.get('EDGE_FUNCTION_SECRET');
  if (!secret) {
    console.warn('[subscription-confirmed-email] No EDGE_FUNCTION_SECRET configured');
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
    console.error('[subscription-confirmed-email] Authentication failed');
    return new Response(
      JSON.stringify({ success: false, error: 'Unauthorized' }),
      { status: 401, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );
  }

  try {
    const {
      user_id,
      plan_name,
      price,
      renewal_date,
      billing_url,
    }: SubscriptionConfirmedEmailRequest = await req.json();

    if (!user_id || !plan_name) {
      return new Response(
        JSON.stringify({ error: 'Missing required fields: user_id, plan_name' }),
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
      console.error('[subscription-confirmed-email] Profile not found:', profileError);
      return new Response(
        JSON.stringify({ error: 'User profile not found', emailSent: false }),
        { status: 404, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    const recipientName = profile.first_name || 'there';
    const defaultBillingUrl = billing_url || 'https://app.use60.com/account/billing';

    // Prepare standardized variables per EMAIL_VARIABLES_SCHEMA.md
    const emailVariables = {
      recipient_name: recipientName,
      plan_name: plan_name,
      price: price,
      renewal_date: renewal_date,
      action_url: defaultBillingUrl,
      support_email: 'support@use60.com',
    };

    console.log('[subscription-confirmed-email] Delegating to encharge-send-email dispatcher');

    // Call encharge-send-email dispatcher
    const dispatcherResponse = await fetch(`${SUPABASE_URL}/functions/v1/encharge-send-email`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${SUPABASE_SERVICE_ROLE_KEY}`,
        'apikey': SUPABASE_SERVICE_ROLE_KEY,
      },
      body: JSON.stringify({
        template_type: 'subscription_confirmed',
        to_email: profile.email,
        to_name: recipientName,
        user_id,
        variables: emailVariables,
      }),
    });

    if (!dispatcherResponse.ok) {
      const errorText = await dispatcherResponse.text();
      console.error('[subscription-confirmed-email] Dispatcher error:', errorText);
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
    console.log('[subscription-confirmed-email] Email sent successfully - Message ID:', dispatcherResult.message_id);

    return new Response(
      JSON.stringify({
        success: true,
        to: profile.email,
        message_id: dispatcherResult.message_id,
        template_type: 'subscription_confirmed',
      }),
      { status: 200, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );

  } catch (error) {
    console.error('[subscription-confirmed-email] Error:', error);
    return new Response(
      JSON.stringify({
        success: false,
        error: error instanceof Error ? error.message : 'Unknown error'
      }),
      { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );
  }
});
