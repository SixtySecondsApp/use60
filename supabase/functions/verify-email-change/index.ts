import { serve } from 'https://deno.land/std@0.168.0/http/server.ts';
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2.43.4';

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, content-type',
};

interface RequestBody {
  token: string;
}

serve(async (req) => {
  // Handle CORS preflight
  if (req.method === 'OPTIONS') {
    return new Response('ok', { headers: corsHeaders });
  }

  try {
    const supabaseAdmin = createClient(
      Deno.env.get('SUPABASE_URL')!,
      Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!
    );

    const supabase = createClient(
      Deno.env.get('SUPABASE_URL')!,
      Deno.env.get('SUPABASE_ANON_KEY')!,
      {
        global: {
          headers: { Authorization: req.headers.get('Authorization')! },
        },
      }
    );

    // Get authenticated user for logging
    const {
      data: { user },
      error: authError,
    } = await supabase.auth.getUser();

    if (authError || !user) {
      return new Response(
        JSON.stringify({ error: 'Unauthorized' }),
        {
          status: 401,
          headers: { ...corsHeaders, 'Content-Type': 'application/json' },
        }
      );
    }

    // Parse request body
    const body: RequestBody = await req.json();
    const { token } = body;

    if (!token) {
      return new Response(
        JSON.stringify({ error: 'Token is required' }),
        {
          status: 400,
          headers: { ...corsHeaders, 'Content-Type': 'application/json' },
        }
      );
    }

    // Find the token
    const { data: tokenRecord, error: tokenError } = await supabaseAdmin
      .from('email_change_tokens')
      .select('*')
      .eq('token', token)
      .maybeSingle();

    if (tokenError) {
      console.error('Token lookup error:', tokenError);
      return new Response(
        JSON.stringify({ error: 'Failed to validate token' }),
        {
          status: 500,
          headers: { ...corsHeaders, 'Content-Type': 'application/json' },
        }
      );
    }

    if (!tokenRecord) {
      return new Response(
        JSON.stringify({ error: 'Invalid or expired token' }),
        {
          status: 400,
          headers: { ...corsHeaders, 'Content-Type': 'application/json' },
        }
      );
    }

    // Check if token has expired
    if (new Date(tokenRecord.expires_at) < new Date()) {
      return new Response(
        JSON.stringify({ error: 'Verification link has expired' }),
        {
          status: 400,
          headers: { ...corsHeaders, 'Content-Type': 'application/json' },
        }
      );
    }

    // Check if token has already been used
    if (tokenRecord.used_at) {
      return new Response(
        JSON.stringify({ error: 'Verification link has already been used' }),
        {
          status: 400,
          headers: { ...corsHeaders, 'Content-Type': 'application/json' },
        }
      );
    }

    // Verify user matches
    if (tokenRecord.user_id !== user.id) {
      return new Response(
        JSON.stringify({ error: 'Token does not belong to this user' }),
        {
          status: 403,
          headers: { ...corsHeaders, 'Content-Type': 'application/json' },
        }
      );
    }

    // Update auth.users email using admin client
    const { error: authUpdateError } = await supabaseAdmin.auth.admin.updateUserById(
      user.id,
      {
        email: tokenRecord.new_email,
        email_confirm: true,
      }
    );

    if (authUpdateError) {
      console.error('Auth email update error:', authUpdateError);
      return new Response(
        JSON.stringify({ error: 'Failed to update email in authentication system' }),
        {
          status: 500,
          headers: { ...corsHeaders, 'Content-Type': 'application/json' },
        }
      );
    }

    // Update profiles table
    const { error: profileUpdateError } = await supabaseAdmin
      .from('profiles')
      .update({
        email: tokenRecord.new_email,
        pending_email: null,
        updated_at: new Date().toISOString(),
      })
      .eq('id', user.id);

    if (profileUpdateError) {
      console.error('Profile update error:', profileUpdateError);
      return new Response(
        JSON.stringify({ error: 'Failed to update profile' }),
        {
          status: 500,
          headers: { ...corsHeaders, 'Content-Type': 'application/json' },
        }
      );
    }

    // Mark token as used
    const { error: tokenUpdateError } = await supabaseAdmin
      .from('email_change_tokens')
      .update({
        used_at: new Date().toISOString(),
      })
      .eq('id', tokenRecord.id);

    if (tokenUpdateError) {
      console.error('Token update error:', tokenUpdateError);
      // Don't fail the request, email change was successful
    }

    // Log audit trail
    const { error: auditError } = await supabaseAdmin
      .from('audit_logs')
      .insert({
        user_id: user.id,
        action: 'email_changed',
        details: {
          old_email: user.email,
          new_email: tokenRecord.new_email,
          ip_address: req.headers.get('x-forwarded-for') || 'unknown',
        },
        created_at: new Date().toISOString(),
      })
      .select('id')
      .maybeSingle();

    if (auditError) {
      console.error('Audit log error:', auditError);
      // Don't fail the request, audit logging is secondary
    }

    return new Response(
      JSON.stringify({
        success: true,
        newEmail: tokenRecord.new_email,
        message: 'Email successfully changed. You can now log in with your new email.',
      }),
      {
        status: 200,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      }
    );
  } catch (error) {
    console.error('Error:', error);
    return new Response(
      JSON.stringify({
        error: error instanceof Error ? error.message : 'Internal server error',
      }),
      {
        status: 500,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      }
    );
  }
});
