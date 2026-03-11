import { createClient } from 'https://esm.sh/@supabase/supabase-js@2.43.4';
import { getCorsHeaders } from '../../_shared/corsHelper.ts';

declare const Deno: {
  env: {
    get(key: string): string | undefined;
  };
};

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
};

interface CreateProfileRequest {
  userId: string;
  email: string;
  firstName: string;
  lastName: string;
}

export async function handleProfile(req: Request): Promise<Response> {
  try {
    const SUPABASE_URL = Deno.env.get('SUPABASE_URL')!;
    const SUPABASE_SERVICE_ROLE_KEY = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;

    const request: CreateProfileRequest = await req.json();

    if (!request.userId || !request.email || !request.firstName || !request.lastName) {
      return new Response(
        JSON.stringify({ success: false, error: 'Missing required fields: userId, email, firstName, lastName' }),
        { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    // Validate email format
    const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
    if (!emailRegex.test(request.email)) {
      return new Response(
        JSON.stringify({ success: false, error: 'Invalid email format' }),
        { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    // Create admin client with service role to bypass RLS
    const supabaseAdmin = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY, {
      auth: {
        autoRefreshToken: false,
        persistSession: false,
        detectSessionInUrl: false,
      },
      db: {
        schema: 'public',
      },
    });

    // Create or update profile using service role key
    const { data, error } = await supabaseAdmin
      .from('profiles')
      .upsert({
        id: request.userId,
        email: request.email,
        first_name: request.firstName.trim(),
        last_name: request.lastName.trim(),
        profile_status: 'active',
      }, {
        onConflict: 'id', // Upsert on id column
      });

    if (error) {
      console.error('[create-profile] Profile creation error:', error);
      return new Response(
        JSON.stringify({
          success: false,
          error: error.message || 'Failed to create profile',
        }),
        { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    console.log('[create-profile] Profile created successfully for user:', request.userId);

    return new Response(
      JSON.stringify({
        success: true,
        data: data,
      }),
      { status: 200, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );
  } catch (error: any) {
    console.error('[create-profile] Unexpected error:', error);
    return new Response(
      JSON.stringify({
        success: false,
        error: error.message || 'An unexpected error occurred',
      }),
      { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );
  }
}
