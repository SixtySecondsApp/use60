import { serve } from 'https://deno.land/std@0.168.0/http/server.ts';
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';
import { sendEmail } from '../_shared/ses.ts';

const SUPABASE_URL = Deno.env.get('SUPABASE_URL')!;
const SUPABASE_SERVICE_ROLE_KEY = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;

interface WelcomeEmailRequest {
  email: string;
  full_name: string;
  company_name: string;
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

    const { email, full_name, company_name } = requestData;

    // Validate inputs
    if (!email || !full_name) {
      throw new Error('Missing required parameters: email and full_name');
    }

    // Send email via AWS SES
    const firstName = full_name.split(' ')[0];

    console.log('[waitlist-welcome-email] Sending email via AWS SES:', {
      toEmail: email,
      hasSupabaseUrl: !!SUPABASE_URL,
      hasServiceRoleKey: !!SUPABASE_SERVICE_ROLE_KEY,
    });

    // Get template from database
    const supabase = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY);

    const { data: template, error: templateError } = await supabase
      .from('encharge_email_templates')
      .select('*')
      .eq('template_type', 'waitlist_welcome')
      .eq('is_active', true)
      .maybeSingle();

    if (templateError || !template) {
      console.error('[waitlist-welcome-email] Template not found:', templateError);
      return new Response(
        JSON.stringify({
          success: false,
          error: 'Email template not found',
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

    // Replace template variables (standardized names)
    let htmlBody = template.html_body || '';

    const variables = {
      recipient_name: firstName,
      user_email: email,
      organization_name: company_name || '',
    };

    for (const [key, value] of Object.entries(variables)) {
      const regex = new RegExp(`{{${key}}}`, 'g');
      htmlBody = htmlBody.replace(regex, String(value || ''));
    }

    // Send via SES using shared function
    const emailResult = await sendEmail({
      to: email,
      subject: template.subject_line || 'Welcome to use60!',
      html: htmlBody,
      from: 'noreply@use60.com',
      fromName: 'use60',
    });

    if (!emailResult.success) {
      console.error('[waitlist-welcome-email] SES email sending failed:', emailResult);
      return new Response(
        JSON.stringify({
          success: false,
          error: emailResult.error || 'Failed to send email',
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

    // Log email send to database (non-blocking)
    try {
      await supabase.from('email_logs').insert({
        email_type: 'waitlist_welcome',
        to_email: email,
        user_id: null,
        status: 'sent',
        metadata: {
          template_id: template.id,
          template_name: template.template_name,
          message_id: emailResult.messageId,
        },
        sent_via: 'aws_ses',
      });
    } catch (logError) {
      console.warn('[waitlist-welcome-email] Failed to log email:', logError);
      // Non-blocking - continue even if logging fails
    }

    return new Response(
      JSON.stringify({
        success: true,
        message: 'Welcome email sent successfully',
        email_sent: true,
        message_id: emailResult.messageId,
      }),
      {
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
        status: 400,
        headers: {
          'Content-Type': 'application/json',
          'Access-Control-Allow-Origin': '*',
        },
      }
    );
  }
});
