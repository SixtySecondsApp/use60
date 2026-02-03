/**
 * Waitlist Welcome Email Edge Function
 *
 * Sends welcome email after user is granted access from waitlist
 * Uses database templates with standardized variable names
 *
 * Story: EMAIL-008
 * Template Type: waitlist_welcome
 * Variables Schema: recipient_name, company_name, action_url, getting_started_url
 */

import { serve } from 'https://deno.land/std@0.168.0/http/server.ts';
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';

const SUPABASE_URL = Deno.env.get('SUPABASE_URL')!;
const SUPABASE_SERVICE_ROLE_KEY = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;

interface WelcomeEmailRequest {
  email: string;
  full_name: string;
  company_name?: string;
  action_url?: string;
}

/**
 * Verify custom edge function secret
 */
function verifySecret(req: Request): boolean {
  const secret = Deno.env.get('EDGE_FUNCTION_SECRET');
  if (!secret) {
    console.warn('[waitlist-welcome-email] No EDGE_FUNCTION_SECRET configured');
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

  return false;
}

serve(async (req) => {
  // Handle CORS preflight
  if (req.method === 'OPTIONS') {
    return new Response('ok', {
      status: 200,
      headers: {
        'Access-Control-Allow-Origin': '*',
        'Access-Control-Allow-Methods': 'POST, OPTIONS',
        'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type, x-edge-function-secret',
        'Access-Control-Max-Age': '86400',
      },
    });
  }

  // Verify authentication
  if (!verifySecret(req)) {
    console.error('[waitlist-welcome-email] Authentication failed: invalid secret');
    return new Response(
      JSON.stringify({ success: false, error: 'Unauthorized: invalid credentials' }),
      {
        status: 401,
        headers: {
          'Content-Type': 'application/json',
          'Access-Control-Allow-Origin': '*',
        },
      }
    );
  }

  try {
    // Parse request body
    let requestData: WelcomeEmailRequest;
    try {
      requestData = await req.json();
    } catch (parseError) {
      return new Response(
        JSON.stringify({
          success: false,
          error: 'Invalid JSON in request body',
          email_sent: false
        }),
        {
          status: 400,
          headers: {
            'Content-Type': 'application/json',
            'Access-Control-Allow-Origin': '*',
          },
        }
      );
    }

    const { email, full_name, company_name, action_url } = requestData;

    // Validate inputs
    if (!email || !full_name) {
      return new Response(
        JSON.stringify({
          success: false,
          error: 'Missing required parameters: email and full_name',
          email_sent: false,
        }),
        {
          status: 400,
          headers: {
            'Content-Type': 'application/json',
            'Access-Control-Allow-Origin': '*',
          },
        }
      );
    }

    const firstName = full_name.split(' ')[0];
    const supabase = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY);

    console.log('[waitlist-welcome-email] Delegating to encharge-send-email dispatcher');

    // Prepare standardized variables per EMAIL_VARIABLES_SCHEMA.md
    const emailVariables = {
      recipient_name: firstName,
      company_name: company_name || 'Sixty',
      user_email: email,
      action_url: action_url || 'https://app.use60.com',
      getting_started_url: 'https://use60.com/getting-started',
    };

    // Call encharge-send-email dispatcher
    const dispatcherResponse = await fetch(`${SUPABASE_URL}/functions/v1/encharge-send-email`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${SUPABASE_SERVICE_ROLE_KEY}`,
        'apikey': SUPABASE_SERVICE_ROLE_KEY,
      },
      body: JSON.stringify({
        template_type: 'waitlist_welcome',
        to_email: email,
        to_name: firstName,
        variables: emailVariables,
      }),
    });

    if (!dispatcherResponse.ok) {
      const errorText = await dispatcherResponse.text();
      console.error('[waitlist-welcome-email] Dispatcher error:', errorText);
      return new Response(
        JSON.stringify({
          success: false,
          error: 'Failed to send email',
          email_sent: false,
          details: errorText,
        }),
        {
          status: dispatcherResponse.status,
          headers: {
            'Content-Type': 'application/json',
            'Access-Control-Allow-Origin': '*',
          },
        }
      );
    }

    const dispatcherResult = await dispatcherResponse.json();
    console.log('[waitlist-welcome-email] Email sent successfully - Message ID:', dispatcherResult.message_id);

    return new Response(
      JSON.stringify({
        success: true,
        message: 'Welcome email sent successfully',
        email_sent: true,
        message_id: dispatcherResult.message_id,
        template_type: 'waitlist_welcome',
      }),
      {
        status: 200,
        headers: {
          'Content-Type': 'application/json',
          'Access-Control-Allow-Origin': '*',
        },
      }
    );

  } catch (error) {
    console.error('[waitlist-welcome-email] Error:', {
      error: error instanceof Error ? error.message : String(error),
      stack: error instanceof Error ? error.stack : undefined,
    });
    return new Response(
      JSON.stringify({
        success: false,
        error: error instanceof Error ? error.message : 'Unknown error',
        email_sent: false,
      }),
      {
        status: 500,
        headers: {
          'Content-Type': 'application/json',
          'Access-Control-Allow-Origin': '*',
        },
      }
    );
  }
});
