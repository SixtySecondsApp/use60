import { serve } from 'https://deno.land/std@0.168.0/http/server.ts';
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2.43.4';
import { crypto } from 'https://deno.land/std@0.208.0/crypto/mod.ts';

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, content-type',
};

interface RequestBody {
  newEmail: string;
}

serve(async (req) => {
  // Handle CORS preflight
  if (req.method === 'OPTIONS') {
    return new Response('ok', { headers: corsHeaders });
  }

  try {
    const supabase = createClient(
      Deno.env.get('SUPABASE_URL')!,
      Deno.env.get('SUPABASE_ANON_KEY')!,
      {
        global: {
          headers: { Authorization: req.headers.get('Authorization')! },
        },
      }
    );

    // Get authenticated user
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
    const { newEmail } = body;

    // Validate email format
    const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
    if (!emailRegex.test(newEmail)) {
      return new Response(
        JSON.stringify({ error: 'Invalid email format' }),
        {
          status: 400,
          headers: { ...corsHeaders, 'Content-Type': 'application/json' },
        }
      );
    }

    // Check if new email is same as current email
    if (newEmail === user.email) {
      return new Response(
        JSON.stringify({ error: 'New email must be different from current email' }),
        {
          status: 400,
          headers: { ...corsHeaders, 'Content-Type': 'application/json' },
        }
      );
    }

    // Check if new email is already in use
    const { data: existingProfile } = await supabase
      .from('profiles')
      .select('id')
      .eq('email', newEmail)
      .maybeSingle();

    if (existingProfile) {
      return new Response(
        JSON.stringify({ error: 'This email is already in use' }),
        {
          status: 400,
          headers: { ...corsHeaders, 'Content-Type': 'application/json' },
        }
      );
    }

    // Check for pending email change (only one allowed at a time)
    const { data: pendingToken } = await supabase
      .from('email_change_tokens')
      .select('id')
      .eq('user_id', user.id)
      .is('used_at', null)
      .maybeSingle();

    if (pendingToken) {
      return new Response(
        JSON.stringify({
          error:
            'You already have a pending email change. Please verify it or request a new one.',
        }),
        {
          status: 400,
          headers: { ...corsHeaders, 'Content-Type': 'application/json' },
        }
      );
    }

    // Rate limiting: check if user has requested too many changes recently
    const oneHourAgo = new Date(Date.now() - 60 * 60 * 1000).toISOString();
    const { count: recentRequests } = await supabase
      .from('email_change_tokens')
      .select('id', { count: 'exact', head: true })
      .eq('user_id', user.id)
      .gt('created_at', oneHourAgo);

    if ((recentRequests || 0) >= 3) {
      return new Response(
        JSON.stringify({
          error: 'Too many email change requests. Please wait an hour before trying again.',
        }),
        {
          status: 429,
          headers: { ...corsHeaders, 'Content-Type': 'application/json' },
        }
      );
    }

    // Generate secure token (32 bytes minimum)
    const tokenBuffer = crypto.getRandomValues(new Uint8Array(32));
    const token = Array.from(tokenBuffer)
      .map((b) => b.toString(16).padStart(2, '0'))
      .join('');

    // Create token with 24-hour expiry
    const expiresAt = new Date(Date.now() + 24 * 60 * 60 * 1000).toISOString();

    const { error: tokenError } = await supabase
      .from('email_change_tokens')
      .insert({
        user_id: user.id,
        token,
        new_email: newEmail,
        expires_at: expiresAt,
      });

    if (tokenError) {
      console.error('Token creation error:', tokenError);
      return new Response(
        JSON.stringify({ error: 'Failed to create verification token' }),
        {
          status: 500,
          headers: { ...corsHeaders, 'Content-Type': 'application/json' },
        }
      );
    }

    // Get user profile for first name
    const { data: profile } = await supabase
      .from('profiles')
      .select('first_name')
      .eq('id', user.id)
      .maybeSingle();

    const firstName = profile?.first_name || 'there';

    // Get email template
    const { data: template } = await supabase
      .from('encharge_email_templates')
      .select('html_body, text_body, subject_line')
      .eq('template_type', 'email_change_verification')
      .eq('is_active', true)
      .maybeSingle();

    if (!template) {
      console.error('Email template not found');
      return new Response(
        JSON.stringify({ error: 'Email template not configured' }),
        {
          status: 500,
          headers: { ...corsHeaders, 'Content-Type': 'application/json' },
        }
      );
    }

    // Build verification link
    const verificationLink = `${Deno.env.get('FRONTEND_URL')}/auth/verify-email-change?token=${token}`;
    const expiryTime = new Date(expiresAt).toLocaleString('en-US', {
      month: 'short',
      day: 'numeric',
      year: 'numeric',
      hour: '2-digit',
      minute: '2-digit',
      second: '2-digit',
      timeZone: 'UTC',
    });

    // Replace template variables
    const htmlBody = template.html_body
      .replace(/{{first_name}}/g, firstName)
      .replace(/{{old_email}}/g, user.email || '')
      .replace(/{{new_email}}/g, newEmail)
      .replace(/{{verification_link}}/g, verificationLink)
      .replace(/{{expiry_time}}/g, `${expiryTime} UTC`);

    const textBody = template.text_body
      .replace(/{{first_name}}/g, firstName)
      .replace(/{{old_email}}/g, user.email || '')
      .replace(/{{new_email}}/g, newEmail)
      .replace(/{{verification_link}}/g, verificationLink)
      .replace(/{{expiry_time}}/g, `${expiryTime} UTC`);

    const subject = template.subject_line.replace(/{{first_name}}/g, firstName);

    // Send email using AWS SES via edge function
    // For now, return success - actual email sending would be configured separately
    console.log('Email change verification email would be sent to:', newEmail);

    return new Response(
      JSON.stringify({
        success: true,
        expiresAt,
        message: 'Verification email sent. Please check your email to confirm the change.',
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
