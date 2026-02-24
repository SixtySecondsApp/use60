/**
 * Send Password Reset Email Edge Function
 * 
 * Generates a recovery link using Supabase Admin API and sends it via custom email template
 * This allows us to use our custom branded email templates instead of Supabase defaults
 */

import { serve } from 'https://deno.land/std@0.190.0/http/server.ts';
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';

const SUPABASE_URL = Deno.env.get('SUPABASE_URL')!;
const SUPABASE_SERVICE_ROLE_KEY = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;

// Determine CORS origin - allow localhost for development
const getAllowedOrigin = (req: Request) => {
  const origin = req.headers.get('origin');
  if (origin?.includes('localhost') || origin?.includes('127.0.0.1') || origin?.includes('192.168.')) {
    return origin || '*';
  }
  // For production, allow staging and production domains
  if (origin?.includes('staging.use60.com') || origin?.includes('app.use60.com') || origin?.includes('use60.com')) {
    return origin || '*';
  }
  return '*';
};

const corsHeaders = (req?: Request) => ({
  'Access-Control-Allow-Origin': req ? getAllowedOrigin(req) : '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
  'Access-Control-Max-Age': '86400',
});

interface SendPasswordResetRequest {
  email: string;
  redirectTo: string;
}

serve(async (req) => {
  // Handle CORS preflight
  if (req.method === 'OPTIONS') {
    return new Response('ok', { headers: corsHeaders(req) });
  }

  // Note: verify_jwt = false in config.toml, so Supabase won't verify the JWT
  // The function is only called from authenticated admin users on the frontend
  // We log headers for debugging but don't block based on them
  const authHeader = req.headers.get('Authorization');
  const apikeyHeader = req.headers.get('apikey');
  console.log('[send-password-reset-email] Auth headers received:', {
    hasAuth: !!authHeader,
    hasApiKey: !!apikeyHeader,
  });

  try {
    const request: SendPasswordResetRequest = await req.json();
    
    console.log('[send-password-reset-email] Request received for:', request.email);
    console.log('[send-password-reset-email] Request redirectTo:', request.redirectTo);

    if (!request.email || !request.redirectTo) {
      console.error('[send-password-reset-email] Missing required fields:', { email: !!request.email, redirectTo: !!request.redirectTo });
      return new Response(
        JSON.stringify({ success: false, error: 'Missing email or redirectTo' }),
        { status: 400, headers: { ...corsHeaders(req), 'Content-Type': 'application/json' } }
      );
    }

    const normalizedEmail = request.email.toLowerCase().trim();

    // Create admin client
    const supabaseAdmin = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY, {
      auth: {
        autoRefreshToken: false,
        persistSession: false,
      },
    });

    // Generate recovery link using admin API
    console.log('[send-password-reset-email] Generating recovery link with redirectTo:', request.redirectTo);
    
    // Supabase requires the site_url and redirect_url to match a configured redirect URL in Auth settings
    // To ensure the redirect works to our custom path, we pass the full reset password URL
    const { data: recoveryData, error: recoveryError } = await supabaseAdmin.auth.admin.generateLink({
      type: 'recovery',
      email: request.email.toLowerCase().trim(),
      options: {
        // Use the full reset password URL as the redirect target
        // This ensures users land on the reset password page, not the base domain
        redirectTo: request.redirectTo,
      },
    });

    console.log('[send-password-reset-email] Recovery link generated:', {
      hasData: !!recoveryData,
      hasError: !!recoveryError,
      actionLink: recoveryData?.properties?.action_link,
      errorMessage: recoveryError?.message,
    });
    
    // Extract and log the redirect_to parameter from the recovery link
    if (recoveryData?.properties?.action_link) {
      try {
        const url = new URL(recoveryData.properties.action_link);
        const redirectParam = url.searchParams.get('redirect_to');
        console.log('[send-password-reset-email] Redirect parameter in link:', redirectParam);
      } catch (e) {
        console.log('[send-password-reset-email] Could not parse recovery link:', e);
      }
    }

    if (recoveryError || !recoveryData) {
      console.error('Failed to generate recovery link:', recoveryError);
      return new Response(
        JSON.stringify({
          success: false,
          error: recoveryError?.message || 'Failed to generate recovery link',
        }),
        { status: 500, headers: { ...corsHeaders(req), 'Content-Type': 'application/json' } }
      );
    }

    // Resolve the user first name for the email template.
    // Uses paginated listUsers (capped at 1000 rows) instead of unbounded listUsers().
    // Wrapped in try/catch so a lookup failure never blocks the password reset.
    let firstName: string;
    try {
      const { data: userData, error: userError } = await supabaseAdmin.auth.admin.listUsers({
        page: 1,
        perPage: 1000,
      });

      if (userError) {
        // Non-fatal: log and fall back to email prefix
        console.warn(
          '[send-password-reset-email] listUsers error (non-fatal, using email prefix):',
          userError.message
        );
        firstName = normalizedEmail.split('@')[0] || 'User';
      } else {
        const matchedUser = userData?.users?.find(
          (u) => u.email?.toLowerCase() === normalizedEmail
        );
        const rawName = matchedUser?.user_metadata?.first_name;
        // Use rawName only when non-empty string; otherwise fall back to email prefix
        firstName =
          typeof rawName === 'string' && rawName.trim()
            ? rawName.trim()
            : normalizedEmail.split('@')[0] || 'User';

        console.log(
          '[send-password-reset-email] Resolved firstName:', firstName,
          '| userFound:', !!matchedUser
        );
      }
    } catch (userLookupErr) {
      // Non-fatal: an unexpected throw during lookup must not abort the reset
      console.warn(
        '[send-password-reset-email] User lookup threw unexpectedly (non-fatal):',
        userLookupErr
      );
      firstName = normalizedEmail.split('@')[0] || 'User';
    }

    // Call encharge-send-email to deliver the password reset email
    const enchargeFunctionUrl = SUPABASE_URL + '/functions/v1/encharge-send-email';

    let emailResponse: Response;
    try {
      emailResponse = await fetch(enchargeFunctionUrl, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': 'Bearer ' + SUPABASE_SERVICE_ROLE_KEY,
          'apikey': SUPABASE_SERVICE_ROLE_KEY,
        },
        body: JSON.stringify({
          template_type: 'password_reset',
          to_email: normalizedEmail,
          to_name: firstName,
          variables: {
            first_name: firstName,
            reset_link: recoveryData.properties.action_link,
          },
        }),
      });
    } catch (fetchErr) {
      // Network-level failure reaching encharge-send-email (DNS, timeout, etc.)
      console.error(
        '[send-password-reset-email] Network error calling encharge-send-email:',
        fetchErr
      );
      return new Response(
        JSON.stringify({
          success: false,
          error: 'Email service unreachable: ' + (fetchErr instanceof Error ? fetchErr.message : String(fetchErr)),
        }),
        { status: 502, headers: { ...corsHeaders(req), 'Content-Type': 'application/json' } }
      );
    }

    if (!emailResponse.ok) {
      let errorData: any = { error: `HTTP ${emailResponse.status}` };
      try {
        const errorText = await emailResponse.text();
        if (errorText) {
          try {
            errorData = JSON.parse(errorText);
          } catch {
            errorData = { error: errorText };
          }
        }
      } catch (e) {
        // Keep default errorData
      }
      
      console.error('[send-password-reset-email] encharge-send-email returned non-OK:', {
        status: emailResponse.status,
        error: errorData
      });
      
      return new Response(
        JSON.stringify({
          success: false,
          error: 'Email service error (' + emailResponse.status + '): ' + (errorData.error || errorData.message || JSON.stringify(errorData)),
        }),
        {
          // 502 = upstream service failure; not a client error
          status: 502,
          headers: { ...corsHeaders(req), 'Content-Type': 'application/json' },
        }
      );
    }

    let emailResult;
    try {
      emailResult = await emailResponse.json();
    } catch (e) {
      console.error('[send-password-reset-email] Failed to parse email response:', e);
      return new Response(
        JSON.stringify({
          success: false,
          error: 'Invalid JSON response from email service',
        }),
        {
          status: 502,
          headers: { ...corsHeaders(req), 'Content-Type': 'application/json' },
        }
      );
    }

    if (!emailResult || !emailResult.success) {
      console.error('[send-password-reset-email] Email sending reported failure:', emailResult);
      return new Response(
        JSON.stringify({
          success: false,
          error: emailResult?.error || 'Email service reported a sending failure',
        }),
        {
          status: 502,
          headers: { ...corsHeaders(req), 'Content-Type': 'application/json' },
        }
      );
    }

    return new Response(
      JSON.stringify({
        success: true,
        message: 'Password reset email sent successfully',
        email_sent: true,
        message_id: emailResult.message_id,
      }),
      {
        headers: { ...corsHeaders(req), 'Content-Type': 'application/json' },
      }
    );

  } catch (error: any) {
    console.error('[send-password-reset-email] Error:', error);
    return new Response(
      JSON.stringify({
        success: false,
        error: error.message || 'Unknown error',
      }),
      {
        status: 500,
        headers: { ...corsHeaders(req), 'Content-Type': 'application/json' },
      }
    );
  }
});
