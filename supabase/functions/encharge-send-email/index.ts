/**
 * Encharge Send Email Edge Function
 * 
 * Sends emails via AWS SES using templates stored in Supabase
 * Tracks events in Encharge for analytics and segmentation
 * No Encharge UI required - everything managed programmatically
 * 
 * Uses AWS SES v2 REST API directly (no SDK) for Deno compatibility
 */

import { serve } from 'https://deno.land/std@0.190.0/http/server.ts';
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';
import { crypto } from 'https://deno.land/std@0.190.0/crypto/mod.ts';

const ENCHARGE_WRITE_KEY = Deno.env.get('ENCHARGE_WRITE_KEY');
const AWS_REGION = Deno.env.get('AWS_REGION') || 'eu-west-2';
const AWS_ACCESS_KEY_ID = Deno.env.get('AWS_ACCESS_KEY_ID');
const AWS_SECRET_ACCESS_KEY = Deno.env.get('AWS_SECRET_ACCESS_KEY');
const SUPABASE_URL = Deno.env.get('SUPABASE_URL')!;
const SUPABASE_SERVICE_ROLE_KEY = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
};

interface SendEmailRequest {
  template_type: string; // 'welcome', 'trial_ending', etc.
  to_email: string;
  to_name?: string;
  user_id?: string;
  variables?: Record<string, any>; // Template variables: { user_name: "John", days_remaining: 3 }
}

/**
 * Replace template variables in HTML/text
 */
function processTemplate(template: string, variables: Record<string, any>): string {
  let processed = template;
  for (const [key, value] of Object.entries(variables)) {
    const regex = new RegExp(`{{${key}}}`, 'g');
    processed = processed.replace(regex, String(value || ''));
  }
  return processed;
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
 * AWS Signature V4 signing
 */
async function signAWSRequest(
  method: string,
  url: URL,
  body: string,
  region: string,
  service: string,
  accessKeyId: string,
  secretAccessKey: string
): Promise<Headers> {
  const now = new Date();
  const amzDate = now.toISOString().replace(/[:-]|\.\d{3}/g, '');
  const dateStamp = amzDate.slice(0, 8);
  
  const host = url.host;
  const canonicalUri = url.pathname;
  const canonicalQueryString = '';
  
  const payloadHash = await sha256(body);
  
  const canonicalHeaders = 
    `content-type:application/x-www-form-urlencoded\n` +
    `host:${host}\n` +
    `x-amz-date:${amzDate}\n`;
  
  const signedHeaders = 'content-type;host;x-amz-date';
  
  const canonicalRequest = 
    `${method}\n` +
    `${canonicalUri}\n` +
    `${canonicalQueryString}\n` +
    `${canonicalHeaders}\n` +
    `${signedHeaders}\n` +
    `${payloadHash}`;
  
  const algorithm = 'AWS4-HMAC-SHA256';
  const credentialScope = `${dateStamp}/${region}/${service}/aws4_request`;
  
  const stringToSign = 
    `${algorithm}\n` +
    `${amzDate}\n` +
    `${credentialScope}\n` +
    `${await sha256(canonicalRequest)}`;
  
  // Create signing key
  const kDate = await hmacSha256(
    new TextEncoder().encode('AWS4' + secretAccessKey),
    dateStamp
  );
  const kRegion = await hmacSha256(kDate, region);
  const kService = await hmacSha256(kRegion, service);
  const kSigning = await hmacSha256(kService, 'aws4_request');
  
  // Create signature
  const signature = toHex(await hmacSha256(kSigning, stringToSign));
  
  const authorizationHeader = 
    `${algorithm} ` +
    `Credential=${accessKeyId}/${credentialScope}, ` +
    `SignedHeaders=${signedHeaders}, ` +
    `Signature=${signature}`;
  
  const headers = new Headers();
  headers.set('Content-Type', 'application/x-www-form-urlencoded');
  headers.set('Host', host);
  headers.set('X-Amz-Date', amzDate);
  headers.set('Authorization', authorizationHeader);
  
  return headers;
}

/**
 * Base64 encode for AWS (moved before buildMimeMessage)
 */
function base64Encode(str: string): string {
  return btoa(unescape(encodeURIComponent(str)));
}

/**
 * Build a MIME email message with proper encoding
 * Uses multipart/alternative structure for maximum compatibility
 */
function buildMimeMessage(
  toEmail: string,
  fromEmail: string,
  subject: string,
  htmlBody: string,
  textBody?: string
): string {
  const boundary = `----=_Part_${Date.now()}_${Math.random().toString(36).slice(2)}`;
  
  // Ensure HTML is complete and valid
  let htmlContent = htmlBody.trim();
  if (!htmlContent.includes('<!DOCTYPE') && !htmlContent.includes('<html')) {
    // Wrap in HTML structure if not already wrapped
    htmlContent = `<!DOCTYPE html><html><head><meta charset="UTF-8"></head><body>${htmlContent}</body></html>`;
  }
  
  // Base64 encode HTML for reliable delivery
  const htmlEncoded = base64Encode(htmlContent);
  
  // Build email headers
  let message = '';
  message += `From: ${fromEmail}\r\n`;
  message += `To: ${toEmail}\r\n`;
  message += `Subject: ${subject}\r\n`;
  message += `MIME-Version: 1.0\r\n`;
  message += `Content-Type: multipart/alternative; boundary="${boundary}"\r\n`;
  message += `\r\n`;
  
  // Plain text part (always include for better deliverability)
  const plainText = textBody || htmlContent.replace(/<[^>]*>/g, '').replace(/\s+/g, ' ').trim();
  message += `--${boundary}\r\n`;
  message += `Content-Type: text/plain; charset=UTF-8\r\n`;
  message += `Content-Transfer-Encoding: 7bit\r\n`;
  message += `\r\n`;
  message += `${plainText}\r\n`;
  message += `\r\n`;
  
  // HTML part (base64 encoded)
  message += `--${boundary}\r\n`;
  message += `Content-Type: text/html; charset=UTF-8\r\n`;
  message += `Content-Transfer-Encoding: base64\r\n`;
  message += `\r\n`;
  // Split base64 into 76-character lines per RFC 2045
  const htmlLines = htmlEncoded.match(/.{1,76}/g) || [htmlEncoded];
  message += htmlLines.join('\r\n');
  message += `\r\n`;
  
  // Close boundary
  message += `--${boundary}--\r\n`;
  
  return message;
}

/**
 * Send email via AWS SES using the SendRawEmail API action
 * This is more reliable and has fewer configuration requirements
 */
async function sendEmailViaSES(
  toEmail: string,
  fromEmail: string,
  subject: string,
  htmlBody: string,
  textBody?: string
): Promise<{ success: boolean; messageId?: string; error?: string }> {
  if (!AWS_ACCESS_KEY_ID || !AWS_SECRET_ACCESS_KEY) {
    return { success: false, error: 'AWS credentials not configured' };
  }

  const url = new URL(`https://email.${AWS_REGION}.amazonaws.com/`);
  
  // Build raw MIME message
  const rawMessage = buildMimeMessage(toEmail, fromEmail, subject, htmlBody, textBody);
  const encodedMessage = base64Encode(rawMessage);
  
  // Build the form body for SendRawEmail
  const params = new URLSearchParams();
  params.set('Action', 'SendRawEmail');
  params.set('Version', '2010-12-01');
  params.set('RawMessage.Data', encodedMessage);
  
  const body = params.toString();
  
  const headers = await signAWSRequest(
    'POST',
    url,
    body,
    AWS_REGION,
    'ses',
    AWS_ACCESS_KEY_ID,
    AWS_SECRET_ACCESS_KEY
  );
  
  try {
    const response = await fetch(url.toString(), {
      method: 'POST',
      headers,
      body,
    });
    
    const responseText = await response.text();
    
    if (!response.ok) {
      console.error('[encharge-send-email] SES error response:', responseText);
      return { success: false, error: `SES error: ${response.status} - ${responseText}` };
    }
    
    // Parse message ID from XML response
    const messageIdMatch = responseText.match(/<MessageId>([^<]+)<\/MessageId>/);
    const messageId = messageIdMatch ? messageIdMatch[1] : undefined;
    
    return { success: true, messageId };
  } catch (error) {
    console.error('[encharge-send-email] SES fetch error:', error);
    return { success: false, error: error instanceof Error ? error.message : 'Fetch failed' };
  }
}

/**
 * Send event to Encharge for tracking
 */
async function trackEnchargeEvent(
  email: string,
  userId: string | undefined,
  eventName: string,
  properties: Record<string, any>
): Promise<void> {
  if (!ENCHARGE_WRITE_KEY) {
    console.warn('[encharge-send-email] No ENCHARGE_WRITE_KEY, skipping tracking');
    return;
  }

  try {
    const nameParts = properties.user_name?.split(' ') || [];
    const firstName = nameParts[0] || '';
    const lastName = nameParts.slice(1).join(' ') || undefined;

    await fetch('https://ingest.encharge.io/v1/', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'X-Encharge-Token': ENCHARGE_WRITE_KEY,
      },
      body: JSON.stringify({
        name: eventName,
        user: {
          email,
          ...(userId && { userId }),
          ...(firstName && { firstName }),
          ...(lastName && { lastName }),
        },
        properties,
      }),
    });
  } catch (error) {
    console.error('[encharge-send-email] Failed to track event:', error);
    // Non-fatal, continue
  }
}

/**
 * Test SES connection and get account status
 */
async function testSESConnection(): Promise<{ success: boolean; message: string; data?: any }> {
  if (!AWS_ACCESS_KEY_ID || !AWS_SECRET_ACCESS_KEY) {
    return { success: false, message: 'AWS credentials not configured' };
  }

  const url = new URL(`https://email.${AWS_REGION}.amazonaws.com/`);
  
  const params = new URLSearchParams();
  params.set('Action', 'GetSendQuota');
  params.set('Version', '2010-12-01');
  
  const body = params.toString();
  
  const headers = await signAWSRequest(
    'POST',
    url,
    body,
    AWS_REGION,
    'ses',
    AWS_ACCESS_KEY_ID,
    AWS_SECRET_ACCESS_KEY
  );
  
  try {
    const response = await fetch(url.toString(), {
      method: 'POST',
      headers,
      body,
    });
    
    const responseText = await response.text();
    
    if (!response.ok) {
      return { 
        success: false, 
        message: `SES API Error (${response.status}): ${responseText.substring(0, 500)}`,
        data: { status: response.status, response: responseText }
      };
    }
    
    // Parse XML response
    const max24HourSendMatch = responseText.match(/<Max24HourSend>([^<]+)<\/Max24HourSend>/);
    const maxSendRateMatch = responseText.match(/<MaxSendRate>([^<]+)<\/MaxSendRate>/);
    const sentLast24HoursMatch = responseText.match(/<SentLast24Hours>([^<]+)<\/SentLast24Hours>/);
    
    const quota = {
      max24HourSend: max24HourSendMatch ? max24HourSendMatch[1] : 'unknown',
      maxSendRate: maxSendRateMatch ? maxSendRateMatch[1] : 'unknown',
      sentLast24Hours: sentLast24HoursMatch ? sentLast24HoursMatch[1] : 'unknown',
    };
    
    return { 
      success: true, 
      message: 'SES connection successful',
      data: quota
    };
  } catch (error) {
    return { 
      success: false, 
      message: `Failed to connect to SES: ${error instanceof Error ? error.message : 'Unknown error'}`,
      data: { error: error instanceof Error ? error.message : 'Unknown error' }
    };
  }
}

/**
 * Check if request is authenticated with service role key
 */
function isServiceRoleAuth(authHeader: string | null, serviceRoleKey: string): boolean {
  if (!authHeader) return false;
  if (!serviceRoleKey) {
    console.warn('[encharge-send-email] Service role key not configured');
    return false;
  }
  const token = authHeader.replace(/^Bearer\s+/i, '');
  const match = token === serviceRoleKey;
  console.log('[encharge-send-email] Service role comparison:', {
    tokenLength: token.length,
    keyLength: serviceRoleKey.length,
    match,
  });
  return match;
}

serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response('ok', { headers: corsHeaders });
  }

  // Check authentication - allow service role key or user JWT
  const authHeader = req.headers.get('Authorization');
  const apikeyHeader = req.headers.get('apikey');

  console.log('[encharge-send-email] Auth check:', {
    hasAuthHeader: !!authHeader,
    hasApiKeyHeader: !!apikeyHeader,
    authHeaderPreview: authHeader ? authHeader.substring(0, 20) + '...' : null,
    serviceRoleKeySet: !!SUPABASE_SERVICE_ROLE_KEY,
    serviceRoleKeyLength: SUPABASE_SERVICE_ROLE_KEY?.length,
  });

  // Allow service role authentication (for service-to-service calls)
  const isServiceRole = isServiceRoleAuth(authHeader, SUPABASE_SERVICE_ROLE_KEY) ||
                        (apikeyHeader === SUPABASE_SERVICE_ROLE_KEY);

  console.log('[encharge-send-email] Service role check result:', { isServiceRole });

  // If we have a service role key match, skip further auth checks
  if (isServiceRole) {
    console.log('[encharge-send-email] Authenticated as service role - proceeding');
  } else if (authHeader) {
    // If not service role, try to validate as user JWT (optional - for direct calls)
    try {
      const supabase = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY);
      const token = authHeader.replace(/^Bearer\s+/i, '');
      const { data: { user }, error } = await supabase.auth.getUser(token);
      console.log('[encharge-send-email] JWT validation result:', {
        error: error?.message,
        hasUser: !!user,
        userId: user?.id,
      });
      if (error || !user) {
        return new Response(
          JSON.stringify({
            success: false,
            error: 'Unauthorized: invalid authentication',
            details: {
              message: error?.message || 'User not found',
              hint: 'Please ensure you are logged in and your session is valid'
            }
          }),
          { status: 401, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
        );
      }

      // Verify user is an admin (check profiles table)
      const { data: profile, error: profileError } = await supabase
        .from('profiles')
        .select('is_admin')
        .eq('id', user.id)
        .single();

      if (profileError || !profile?.is_admin) {
        console.log('[encharge-send-email] User is not an admin:', { userId: user.id, profileError: profileError?.message });
        return new Response(
          JSON.stringify({
            success: false,
            error: 'Unauthorized: admin access required',
            details: {
              message: 'Only administrators can send waitlist invitations'
            }
          }),
          { status: 403, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
        );
      }

      console.log('[encharge-send-email] Authenticated as admin user - proceeding');
    } catch (authError) {
      console.log('[encharge-send-email] Auth exception:', authError);
      return new Response(
        JSON.stringify({
          success: false,
          error: 'Unauthorized: authentication failed',
          details: {
            message: authError instanceof Error ? authError.message : 'Unknown error'
          }
        }),
        { status: 401, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }
  } else {
    // No auth headers provided
    return new Response(
      JSON.stringify({
        success: false,
        error: 'Unauthorized: no authentication provided'
      }),
      { status: 401, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );
  }

  // Handle test endpoint
  const url = new URL(req.url);
  if (url.searchParams.get('test') === 'ses' || (req.method === 'GET' && url.pathname.includes('test'))) {
    const testResult = await testSESConnection();
    return new Response(
      JSON.stringify({
        success: testResult.success,
        message: testResult.message,
        data: testResult.data,
        timestamp: new Date().toISOString(),
      }),
      {
        status: testResult.success ? 200 : 500,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      }
    );
  }

  try {
    const request: SendEmailRequest = await req.json();

    if (!request.template_type || !request.to_email) {
      return new Response(
        JSON.stringify({ success: false, error: 'Missing template_type or to_email' }),
        { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    const supabase = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY);

    // 1. Get template from database
    const { data: template, error: templateError } = await supabase
      .from('encharge_email_templates')
      .select('*')
      .eq('template_type', request.template_type)
      .eq('is_active', true)
      .single();

    if (templateError || !template) {
      return new Response(
        JSON.stringify({
          success: false,
          error: `Template not found: ${request.template_type}`,
        }),
        { status: 404, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    // 2. Process template variables
    const variables = {
      user_name: request.to_name || request.to_email.split('@')[0],
      user_email: request.to_email,
      ...request.variables,
    };

    const subject = processTemplate(template.subject_line, variables);
    const htmlBody = processTemplate(template.html_body, variables);
    const textBody = template.text_body ? processTemplate(template.text_body, variables) : undefined;

    // 3. Send email via AWS SES (using REST API directly, not SDK)
    const sesResult = await sendEmailViaSES(
      request.to_email,
      'Sixty Seconds <app@use60.com>',
      subject,
      htmlBody,
      textBody
    );

    if (!sesResult.success) {
      return new Response(
        JSON.stringify({
          success: false,
          error: sesResult.error,
        }),
        { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    // 4. Track event in Encharge
    const eventNameMap: Record<string, string> = {
      welcome: 'Account Created',
      waitlist_invite: 'Waitlist Invite Sent',
      trial_ending: 'Trial Ending Soon',
      trial_expired: 'Trial Expired',
      first_summary_viewed: 'First Summary Viewed',
      fathom_connected: 'Fathom Connected',
      first_meeting_synced: 'First Meeting Synced',
      join_request_approved: 'Join Request Approved',
      join_request_rejected: 'Join Request Rejected',
    };

    const eventName = eventNameMap[request.template_type] || 'Email Sent';
    await trackEnchargeEvent(
      request.to_email,
      request.user_id,
      eventName,
      {
        template_type: request.template_type,
        template_name: template.template_name,
        ...variables,
      }
    );

    // 5. Log to database
    try {
      await supabase.from('email_logs').insert({
        email_type: request.template_type,
        to_email: request.to_email,
        user_id: request.user_id,
        status: 'sent',
        metadata: {
          template_id: template.id,
          template_name: template.template_name,
          message_id: sesResult.messageId,
          variables,
        },
        sent_via: 'aws_ses',
      });
    } catch (logError) {
      console.warn('[encharge-send-email] Failed to log email:', logError);
    }

    return new Response(
      JSON.stringify({
        success: true,
        message_id: sesResult.messageId,
        template_type: request.template_type,
        template_name: template.template_name,
        event_tracked: eventName,
      }),
      {
        status: 200,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      }
    );
  } catch (error) {
    console.error('[encharge-send-email] Error:', error);
    return new Response(
      JSON.stringify({
        success: false,
        error: error instanceof Error ? error.message : 'Unknown error',
      }),
      {
        status: 500,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      }
    );
  }
});
