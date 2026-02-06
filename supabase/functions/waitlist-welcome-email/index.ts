import { serve } from 'https://deno.land/std@0.168.0/http/server.ts';
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';
import { crypto } from 'https://deno.land/std@0.190.0/crypto/mod.ts';

const SUPABASE_URL = Deno.env.get('SUPABASE_URL')!;
const SUPABASE_SERVICE_ROLE_KEY = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;
const AWS_REGION = Deno.env.get('AWS_REGION') || 'eu-west-2';
const AWS_ACCESS_KEY_ID = Deno.env.get('AWS_ACCESS_KEY_ID');
const AWS_SECRET_ACCESS_KEY = Deno.env.get('AWS_SECRET_ACCESS_KEY');

interface WelcomeEmailRequest {
  email: string;
  full_name: string;
  company_name: string;
}

/**
 * Base64 encode string (UTF-8 safe)
 */
function base64Encode(str: string): string {
  // Convert string to UTF-8 bytes, then to base64
  const encoder = new TextEncoder();
  const bytes = encoder.encode(str);
  let binary = '';
  for (let i = 0; i < bytes.length; i++) {
    binary += String.fromCharCode(bytes[i]);
  }
  return btoa(binary);
}

/**
 * Create HMAC-SHA256 signature
 */
async function hmacSha256(key: Uint8Array, data: string): Promise<Uint8Array> {
  const cryptoKey = await crypto.subtle.importKey(
    'raw',
    key,
    { name: 'HMAC', hash: 'SHA-256' },
    false,
    ['sign']
  );
  const signature = await crypto.subtle.sign(
    'HMAC',
    cryptoKey,
    new TextEncoder().encode(data)
  );
  return new Uint8Array(signature);
}

/**
 * Create SHA-256 hash
 */
async function sha256(data: string): Promise<string> {
  const hash = await crypto.subtle.digest(
    'SHA-256',
    new TextEncoder().encode(data)
  );
  return Array.from(new Uint8Array(hash))
    .map(b => b.toString(16).padStart(2, '0'))
    .join('');
}

/**
 * Convert bytes to hex string
 */
function toHex(bytes: Uint8Array): string {
  return Array.from(bytes)
    .map(b => b.toString(16).padStart(2, '0'))
    .join('');
}

/**
 * AWS Signature V4 signing for SES
 */
async function signAWSRequest(
  method: string,
  url: URL,
  body: string
): Promise<Headers> {
  if (!AWS_ACCESS_KEY_ID || !AWS_SECRET_ACCESS_KEY) {
    throw new Error('AWS credentials not configured');
  }

  const amzdate = new Date().toISOString().replace(/[:-]|\.\d{3}/g, '');
  const datestamp = amzdate.substring(0, 8);
  const host = url.host;
  const canonicalUri = '/';
  const canonicalQuerystring = '';
  const payloadHash = await sha256(body);

  const canonicalHeaders = `host:${host}\nx-amz-date:${amzdate}\n`;
  const signedHeaders = 'host;x-amz-date';

  const canonicalRequest = `${method}\n${canonicalUri}\n${canonicalQuerystring}\n${canonicalHeaders}\n${signedHeaders}\n${payloadHash}`;

  const scope = `${datestamp}/${AWS_REGION}/ses/aws4_request`;
  const stringToSign = `AWS4-HMAC-SHA256\n${amzdate}\n${scope}\n${await sha256(canonicalRequest)}`;

  const kDate = await hmacSha256(
    new TextEncoder().encode(`AWS4${AWS_SECRET_ACCESS_KEY}`),
    datestamp
  );
  const kRegion = await hmacSha256(kDate, AWS_REGION);
  const kService = await hmacSha256(kRegion, 'ses');
  const kSigning = await hmacSha256(kService, 'aws4_request');
  const signature = toHex(await hmacSha256(kSigning, stringToSign));

  const authorizationHeader = `AWS4-HMAC-SHA256 Credential=${AWS_ACCESS_KEY_ID}/${scope}, SignedHeaders=${signedHeaders}, Signature=${signature}`;

  const headers = new Headers({
    'Host': host,
    'X-Amz-Date': amzdate,
    'Authorization': authorizationHeader,
  });

  return headers;
}

/**
 * Send email via AWS SES
 */
async function sendEmailViaSES(
  toEmail: string,
  subject: string,
  htmlBody: string
): Promise<{ success: boolean; messageId?: string; error?: string }> {
  if (!AWS_ACCESS_KEY_ID || !AWS_SECRET_ACCESS_KEY) {
    return { success: false, error: 'AWS credentials not configured' };
  }

  const url = new URL(`https://email.${AWS_REGION}.amazonaws.com/`);
  const fromEmail = Deno.env.get('SES_FROM_EMAIL') || 'app@use60.com';

  // Build raw MIME message
  const message = `From: ${fromEmail}\r\nTo: ${toEmail}\r\nSubject: ${subject}\r\nContent-Type: text/html; charset=UTF-8\r\n\r\n${htmlBody}`;
  const encodedMessage = base64Encode(message);

  const params = new URLSearchParams();
  params.set('Action', 'SendRawEmail');
  params.set('Version', '2010-12-01');
  params.set('RawMessage.Data', encodedMessage);

  const body = params.toString();
  const headers = await signAWSRequest('POST', url, body);
  headers.set('Content-Type', 'application/x-www-form-urlencoded');

  try {
    const response = await fetch(url.toString(), {
      method: 'POST',
      headers,
      body,
    });

    const responseText = await response.text();

    if (!response.ok) {
      console.error('[waitlist-welcome-email] SES error:', responseText);
      return { success: false, error: `SES error: ${response.status}` };
    }

    const messageIdMatch = responseText.match(/<MessageId>([^<]+)<\/MessageId>/);
    const messageId = messageIdMatch ? messageIdMatch[1] : undefined;

    return { success: true, messageId };
  } catch (error) {
    console.error('[waitlist-welcome-email] SES fetch error:', error);
    return { success: false, error: error instanceof Error ? error.message : 'Fetch failed' };
  }
}

serve(async (req) => {
  // Handle CORS preflight
  if (req.method === 'OPTIONS') {
    return new Response('ok', {
      status: 200,
      headers: {
        'Access-Control-Allow-Origin': '*',
        'Access-Control-Allow-Methods': 'POST, OPTIONS',
        'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
        'Access-Control-Max-Age': '86400',
      },
    });
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
      hasAWSCredentials: !!(AWS_ACCESS_KEY_ID && AWS_SECRET_ACCESS_KEY),
      hasSupabaseUrl: !!SUPABASE_URL,
      hasServiceRoleKey: !!SUPABASE_SERVICE_ROLE_KEY,
      awsRegion: AWS_REGION,
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

    // Replace template variables
    let htmlBody = template.html_body || '';

    const variables = {
      user_name: firstName,
      full_name: full_name,
      company_name: company_name || '',
      first_name: firstName,
      email: email,
    };

    for (const [key, value] of Object.entries(variables)) {
      const regex = new RegExp(`{{${key}}}`, 'g');
      htmlBody = htmlBody.replace(regex, String(value || ''));
    }

    // Send via SES
    const emailResult = await sendEmailViaSES(
      email,
      template.subject_line || 'Welcome to use60!',
      htmlBody
    );

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
