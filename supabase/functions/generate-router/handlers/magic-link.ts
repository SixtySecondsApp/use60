/**
 * Handler: generate-magic-link
 * Generates a magic link URL using Supabase Admin API without sending an email.
 */

import { createClient } from 'https://esm.sh/@supabase/supabase-js@2.43.4';

const SUPABASE_URL = Deno.env.get('SUPABASE_URL')!;
const SUPABASE_SERVICE_ROLE_KEY = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
};

interface GenerateMagicLinkRequest {
  email: string;
  redirectTo: string;
  data?: Record<string, any>;
}

export async function handleMagicLink(req: Request): Promise<Response> {
  // Handle CORS preflight
  if (req.method === 'OPTIONS') {
    return new Response('ok', { headers: corsHeaders });
  }

  try {
    // Validate JWT — not just header presence
    const supabaseAuth = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY, {
      auth: { autoRefreshToken: false, persistSession: false },
    });
    const authHeader = req.headers.get('Authorization');
    if (!authHeader) {
      return new Response(
        JSON.stringify({ success: false, error: 'Unauthorized: missing authorization header' }),
        { status: 401, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }
    const token = authHeader.replace('Bearer ', '');
    const { data: { user: caller }, error: authError } = await supabaseAuth.auth.getUser(token);
    if (authError || !caller) {
      return new Response(
        JSON.stringify({ success: false, error: 'Unauthorized: invalid token' }),
        { status: 401, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    const request: GenerateMagicLinkRequest = await req.json();

    if (!request.email || !request.redirectTo) {
      return new Response(
        JSON.stringify({ success: false, error: 'Missing email or redirectTo' }),
        { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    // Validate redirectTo is a valid URL (allows localhost for local dev)
    try {
      const redirectUrl = new URL(request.redirectTo);
      const isLocalhost = redirectUrl.hostname === 'localhost' ||
                         redirectUrl.hostname === '127.0.0.1' ||
                         redirectUrl.hostname.startsWith('192.168.') ||
                         redirectUrl.hostname.startsWith('10.') ||
                         redirectUrl.hostname.endsWith('.local');
      if (!redirectUrl.protocol.match(/^https?:$/) || (!isLocalhost && redirectUrl.protocol !== 'https:')) {
        return new Response(
          JSON.stringify({ success: false, error: 'Invalid redirectTo URL protocol' }),
          { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
        );
      }
    } catch (urlError) {
      return new Response(
        JSON.stringify({ success: false, error: 'Invalid redirectTo URL format' }),
        { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    // Create admin client
    const supabaseAdmin = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY, {
      auth: {
        autoRefreshToken: false,
        persistSession: false,
      },
    });

    // Generate magic link using admin API
    const { data: magicLinkData, error: magicLinkError } = await supabaseAdmin.auth.admin.generateLink({
      type: 'invite',
      email: request.email,
      options: {
        redirectTo: request.redirectTo,
      },
    });

    if (magicLinkError || !magicLinkData) {
      console.error('Failed to generate magic link:', magicLinkError);

      const errorMessage = magicLinkError?.message || '';
      const errorStatus = (magicLinkError as any)?.status;

      const isUserExists = errorMessage.toLowerCase().includes('already') ||
                          errorMessage.toLowerCase().includes('exists') ||
                          errorMessage.toLowerCase().includes('conflict') ||
                          errorMessage.toLowerCase().includes('duplicate') ||
                          errorStatus === 422 ||
                          errorStatus === 409;

      console.log('Error detection:', { errorMessage, errorStatus, isUserExists });

      return new Response(
        JSON.stringify({
          success: false,
          error: isUserExists
            ? 'This email is already registered. Please log in instead.'
            : errorMessage || 'Failed to generate magic link',
          userExists: isUserExists,
        }),
        { status: 200, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    return new Response(
      JSON.stringify({
        success: true,
        magicLink: magicLinkData.properties.action_link,
      }),
      {
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
        status: 200,
      }
    );
  } catch (error: any) {
    console.error('Error generating magic link:', error);
    return new Response(
      JSON.stringify({
        success: false,
        error: error.message || 'Unknown error',
      }),
      { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );
  }
}
