/**
 * Google Gmail Edge Function
 * 
 * Provides Gmail API access for sending, listing, and managing emails.
 * 
 * SECURITY:
 * - POST only (no GET for API actions)
 * - User JWT authentication OR service-role with userId in body
 * - Allowlist-based CORS
 */

import { serve } from 'https://deno.land/std@0.168.0/http/server.ts';
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';
import { getCorsHeaders, handleCorsPreflightRequest, jsonResponse, errorResponse } from '../_shared/corsHelper.ts';
import { authenticateRequest } from '../_shared/edgeAuth.ts';
import { 
  modifyEmail,
  archiveEmail,
  trashEmail,
  starEmail,
  markAsRead,
  getFullLabel,
  replyToEmail,
  forwardEmail,
  createLabel,
  updateLabel,
  deleteLabel,
  findLabelByName,
  getOrCreateLabel
} from './gmail-actions.ts';

async function refreshAccessToken(refreshToken: string, supabase: any, userId: string): Promise<string> {
  const clientId = Deno.env.get('GOOGLE_CLIENT_ID') || '';
  const clientSecret = Deno.env.get('GOOGLE_CLIENT_SECRET') || '';
  
  const response = await fetch('https://oauth2.googleapis.com/token', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/x-www-form-urlencoded',
    },
    body: new URLSearchParams({
      client_id: clientId,
      client_secret: clientSecret,
      refresh_token: refreshToken,
      grant_type: 'refresh_token',
    }),
  });

  if (!response.ok) {
    const errorData = await response.json();
    throw new Error(`Failed to refresh token: ${errorData.error_description || 'Unknown error'}`);
  }

  const data = await response.json();
  
  // Update the stored access token
  const expiresAt = new Date();
  expiresAt.setSeconds(expiresAt.getSeconds() + (data.expires_in || 3600));
  
  const { error: updateError } = await supabase
    .from('google_integrations')
    .update({
      access_token: data.access_token,
      expires_at: expiresAt.toISOString(),
    })
    .eq('user_id', userId);
  
  if (updateError) {
    throw new Error('Failed to update access token in database');
  }
  return data.access_token;
}

interface SendEmailRequest {
  to: string;
  subject: string;
  body: string;
  isHtml?: boolean;
  // Thread context for RFC 2822 reply threading (EMAIL-004)
  threadId?: string;
  inReplyTo?: string;
  references?: string;
}

interface ListEmailsRequest {
  query?: string;
  maxResults?: number;
  pageToken?: string;
}

interface GetMessageRequest {
  messageId: string;
}

serve(async (req) => {
  // Handle CORS preflight
  const preflightResponse = handleCorsPreflightRequest(req);
  if (preflightResponse) {
    return preflightResponse;
  }

  // POST only
  if (req.method !== 'POST') {
    return errorResponse('Method not allowed. Use POST.', req, 405);
  }

  // Parse URL and body for action
  const url = new URL(req.url);
  let action = url.searchParams.get('action');
  let requestBody: any = {};

  try {
    // Parse request body
    try {
      requestBody = await req.json();
      // If action not in URL, get it from body
      if (!action && requestBody.action) {
        action = requestBody.action;
      }
    } catch (parseError) {
      throw new Error('Invalid JSON in request body');
    }

    // Initialize Supabase client with service role
    const supabaseUrl = Deno.env.get('SUPABASE_URL') || '';
    const supabaseServiceKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') || '';
    
    if (!supabaseUrl || !supabaseServiceKey) {
      throw new Error('Server configuration error');
    }

    const supabase = createClient(supabaseUrl, supabaseServiceKey, {
      auth: {
        persistSession: false,
        autoRefreshToken: false,
      },
    });

    // Authenticate - supports both user JWT and service role with userId
    const { userId, mode } = await authenticateRequest(
      req,
      supabase,
      supabaseServiceKey,
      requestBody.userId
    );

    console.log(`[google-gmail] Authenticated as ${mode}, userId: ${userId}, action: ${action}`);

    // Get user's Google integration
    const { data: integration, error: integrationError } = await supabase
      .from('google_integrations')
      .select('access_token, refresh_token, expires_at, id')
      .eq('user_id', userId)
      .eq('is_active', true)
      .single();

    if (integrationError || !integration) {
      throw new Error('Google integration not found. Please connect your Google account first.');
    }

    // Check if token needs refresh
    const expiresAt = new Date(integration.expires_at);
    const now = new Date();
    let accessToken = integration.access_token;
    
    if (expiresAt <= now) {
      accessToken = await refreshAccessToken(integration.refresh_token, supabase, userId);
    }

    let response;

    switch (action) {
      case 'send':
        response = await sendEmail(accessToken, {
          to: requestBody.to,
          subject: requestBody.subject,
          body: requestBody.body,
          isHtml: requestBody.isHtml,
          // Thread context (EMAIL-004) — optional, falls back gracefully when absent
          threadId: requestBody.threadId,
          inReplyTo: requestBody.inReplyTo,
          references: requestBody.references,
        });
        break;
      
      case 'list':
        response = await listEmails(accessToken, requestBody as ListEmailsRequest);
        break;
      
      case 'get':
      case 'get-message':
        if (!requestBody.messageId) {
          throw new Error('messageId is required for get action');
        }
        response = await getMessage(accessToken, requestBody as GetMessageRequest);
        break;
      
      case 'list-labels':
      case 'labels':
        response = await getLabels(accessToken);
        break;
      
      case 'modify':
        response = await modifyEmail(accessToken, requestBody);
        break;
      
      case 'draft':
        response = await createDraft(accessToken, requestBody as SendEmailRequest);
        break;

      case 'archive':
        if (!requestBody.messageId) {
          throw new Error('messageId is required for archive action');
        }
        response = await archiveEmail(accessToken, requestBody.messageId);
        break;
      
      case 'delete':
      case 'trash':
        if (!requestBody.messageId) {
          throw new Error('messageId is required for delete action');
        }
        response = await trashEmail(accessToken, requestBody.messageId);
        break;
      
      case 'star':
        if (!requestBody.messageId) {
          throw new Error('messageId is required for star action');
        }
        if (typeof requestBody.starred !== 'boolean') {
          throw new Error('starred must be a boolean for star action');
        }
        response = await starEmail(accessToken, requestBody.messageId, requestBody.starred);
        break;
      
      case 'mark-as-read':
      case 'markAsRead':
        if (!requestBody.messageId || typeof requestBody.messageId !== 'string' || requestBody.messageId.trim() === '') {
          throw new Error('messageId is required and must be a non-empty string');
        }
        if (typeof requestBody.read !== 'boolean') {
          throw new Error('read must be a boolean');
        }
        response = await markAsRead(accessToken, requestBody.messageId.trim(), requestBody.read);
        break;
      
      case 'reply':
        if (!requestBody.messageId) {
          throw new Error('messageId is required for reply action');
        }
        if (!requestBody.body) {
          throw new Error('body is required for reply action');
        }
        response = await replyToEmail(
          accessToken,
          requestBody.messageId,
          requestBody.body,
          requestBody.replyAll || false,
          requestBody.isHtml || false
        );
        break;
      
      case 'forward':
        if (!requestBody.messageId) {
          throw new Error('messageId is required for forward action');
        }
        if (!requestBody.to || !Array.isArray(requestBody.to) || requestBody.to.length === 0) {
          throw new Error('to (array of recipients) is required for forward action');
        }
        response = await forwardEmail(
          accessToken,
          requestBody.messageId,
          requestBody.to,
          requestBody.additionalMessage
        );
        break;
      
      case 'sync':
        response = await syncEmailsToContacts(accessToken, supabase, userId, integration.id);
        break;
      
      // Label management actions for Fyxer-style categorization
      case 'create-label':
        if (!requestBody.name) {
          throw new Error('name is required for create-label action');
        }
        response = await createLabel(accessToken, requestBody.name, {
          labelListVisibility: requestBody.labelListVisibility,
          messageListVisibility: requestBody.messageListVisibility,
          backgroundColor: requestBody.backgroundColor,
          textColor: requestBody.textColor,
        });
        break;
      
      case 'update-label':
        if (!requestBody.labelId) {
          throw new Error('labelId is required for update-label action');
        }
        response = await updateLabel(accessToken, requestBody.labelId, {
          name: requestBody.name,
          labelListVisibility: requestBody.labelListVisibility,
          messageListVisibility: requestBody.messageListVisibility,
          backgroundColor: requestBody.backgroundColor,
          textColor: requestBody.textColor,
        });
        break;
      
      case 'delete-label':
        if (!requestBody.labelId) {
          throw new Error('labelId is required for delete-label action');
        }
        await deleteLabel(accessToken, requestBody.labelId);
        response = { success: true, message: 'Label deleted' };
        break;
      
      case 'find-label':
        if (!requestBody.name) {
          throw new Error('name is required for find-label action');
        }
        response = await findLabelByName(accessToken, requestBody.name);
        break;
      
      case 'get-or-create-label':
        if (!requestBody.name) {
          throw new Error('name is required for get-or-create-label action');
        }
        response = await getOrCreateLabel(accessToken, requestBody.name, {
          labelListVisibility: requestBody.labelListVisibility,
          messageListVisibility: requestBody.messageListVisibility,
          backgroundColor: requestBody.backgroundColor,
          textColor: requestBody.textColor,
        });
        break;
      
      default:
        // If no action specified, default to list for backward compatibility
        if (!action) {
          response = await listEmails(accessToken, requestBody as ListEmailsRequest);
        } else {
          throw new Error(`Unknown action: ${action}`);
        }
    }

    // Log the successful operation (non-critical)
    try {
      await supabase
        .from('google_service_logs')
        .insert({
          integration_id: integration.id,
          service: 'gmail',
          action: action || 'list',
          status: 'success',
          request_data: { action, userId },
          response_data: { success: true },
        });
    } catch {
      // Non-critical
    }

    return jsonResponse(response, req);

  } catch (error: any) {
    const errorMessage = error instanceof Error ? error.message : String(error);
    console.error('[google-gmail] Error:', {
      message: errorMessage,
      action: action || 'unknown',
    });
    
    return jsonResponse({ 
      success: false,
      error: errorMessage,
      details: 'Gmail service error',
      action: action || 'unknown'
    }, req, 200); // Return 200 to allow client to parse the error message
  }
});

// UTF-8 safe base64url encoder (mirrors gmail-actions.ts — btoa() crashes on chars > U+00FF)
function toBase64UrlSend(str: string): string {
  const bytes = new TextEncoder().encode(str);
  const binary = Array.from(bytes).map((b: number) => String.fromCharCode(b)).join('');
  return btoa(binary).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
}

/**
 * Fetch the user's primary Gmail signature (sendAs API).
 * Returns the HTML signature string, or empty string on failure.
 */
async function fetchGmailSignature(accessToken: string): Promise<string> {
  try {
    const resp = await fetch(
      'https://gmail.googleapis.com/gmail/v1/users/me/settings/sendAs',
      { headers: { 'Authorization': `Bearer ${accessToken}` } }
    );
    if (!resp.ok) return '';
    const data = await resp.json();
    // Find the primary (default) sendAs alias
    const primary = data.sendAs?.find((s: { isDefault?: boolean }) => s.isDefault);
    return primary?.signature || '';
  } catch {
    return '';
  }
}

async function sendEmail(accessToken: string, request: SendEmailRequest): Promise<any> {
  // Fetch Gmail signature and append to body
  let body = request.body;
  const signature = await fetchGmailSignature(accessToken);
  if (signature) {
    if (request.isHtml !== false) {
      // HTML mode: append signature with separator
      body = `${body}<br><div class="gmail_signature_dash">--</div><div class="gmail_signature">${signature}</div>`;
    } else {
      // Plain text mode: strip HTML tags from signature
      const plainSig = signature.replace(/<[^>]+>/g, '').trim();
      if (plainSig) {
        body = `${body}\n\n--\n${plainSig}`;
      }
    }
  }

  const emailLines = [
    `To: ${request.to}`,
    `Subject: ${request.subject}`,
    `Content-Type: ${request.isHtml !== false ? 'text/html' : 'text/plain'}; charset=utf-8`,
  ];

  // RFC 2822 threading headers — added when caller provides prior thread context (EMAIL-004)
  if (request.inReplyTo) {
    emailLines.push(`In-Reply-To: ${request.inReplyTo}`);
  }
  if (request.references) {
    emailLines.push(`References: ${request.references}`);
  } else if (request.inReplyTo) {
    // References must at minimum contain In-Reply-To when not explicitly provided
    emailLines.push(`References: ${request.inReplyTo}`);
  }

  emailLines.push('', body);

  const emailMessage = emailLines.join('\r\n');
  const encodedMessage = toBase64UrlSend(emailMessage);

  const messagePayload: Record<string, unknown> = { raw: encodedMessage };
  // threadId keeps the sent message in the existing Gmail thread
  if (request.threadId) {
    messagePayload.threadId = request.threadId;
  }

  const response = await fetch('https://gmail.googleapis.com/gmail/v1/users/me/messages/send', {
    method: 'POST',
    headers: {
      'Authorization': `Bearer ${accessToken}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify(messagePayload),
  });

  if (!response.ok) {
    const errorData = await response.json();
    throw new Error(`Gmail API error: ${errorData.error?.message || 'Unknown error'}`);
  }

  const data = await response.json();
  return {
    success: true,
    messageId: data.id,
    threadId: data.threadId
  };
}

/**
 * Find the most recent Gmail thread with a given recipient email (FUV3-005).
 * Returns threadId + Message-ID header for reply threading, or null if not found.
 * Fails soft — returns null on any API error.
 */
async function findRecentThread(accessToken: string, recipientEmail: string): Promise<{ threadId: string; messageId: string } | null> {
  try {
    const query = encodeURIComponent(`to:${recipientEmail} OR from:${recipientEmail}`);
    const response = await fetch(
      `https://gmail.googleapis.com/gmail/v1/users/me/messages?q=${query}&maxResults=1`,
      { headers: { 'Authorization': `Bearer ${accessToken}` } }
    );

    if (!response.ok) return null;
    const data = await response.json();
    if (!data.messages?.length) return null;

    // Get the message to extract threadId and Message-ID header
    const msgResponse = await fetch(
      `https://gmail.googleapis.com/gmail/v1/users/me/messages/${data.messages[0].id}?format=metadata&metadataHeaders=Message-ID`,
      { headers: { 'Authorization': `Bearer ${accessToken}` } }
    );

    if (!msgResponse.ok) return null;
    const msgData = await msgResponse.json();

    const messageIdHeader = msgData.payload?.headers?.find((h: any) => h.name === 'Message-ID')?.value;

    return {
      threadId: msgData.threadId,
      messageId: messageIdHeader || '',
    };
  } catch {
    return null;
  }
}

async function createDraft(accessToken: string, request: SendEmailRequest & {
  threadId?: string;
  replyToMessageId?: string;
  autoThread?: boolean;
  recipientEmail?: string;
}): Promise<any> {
  // FUV3-005: Auto-detect existing thread if requested
  let threadId = request.threadId;
  let replyToMessageId = request.replyToMessageId;
  let threadDetected = false;

  if (request.autoThread && request.recipientEmail && !threadId) {
    const existingThread = await findRecentThread(accessToken, request.recipientEmail);
    if (existingThread) {
      threadId = existingThread.threadId;
      replyToMessageId = existingThread.messageId;
      threadDetected = true;
    }
  }

  const emailLines = [
    `To: ${request.to}`,
    `Subject: ${request.subject}`,
    'Content-Type: text/html; charset=utf-8',
  ];

  // Add reply headers when threading into an existing conversation
  if (replyToMessageId) {
    emailLines.push(`In-Reply-To: ${replyToMessageId}`);
    emailLines.push(`References: ${replyToMessageId}`);
  }

  emailLines.push('', request.body);

  const emailMessage = emailLines.join('\r\n');

  const encodedMessage = btoa(emailMessage)
    .replace(/\+/g, '-')
    .replace(/\//g, '_')
    .replace(/=+$/, '');

  const messagePayload: Record<string, unknown> = { raw: encodedMessage };
  if (threadId) {
    messagePayload.threadId = threadId;
  }

  const response = await fetch('https://gmail.googleapis.com/gmail/v1/users/me/drafts', {
    method: 'POST',
    headers: {
      'Authorization': `Bearer ${accessToken}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({
      message: messagePayload,
    }),
  });

  if (!response.ok) {
    const errorData = await response.json();
    throw new Error(`Gmail API error: ${errorData.error?.message || 'Unknown error'}`);
  }

  const data = await response.json();
  return {
    success: true,
    draftId: data.id,
    messageId: data.message?.id,
    threadId: data.message?.threadId,
    threadDetected,
  };
}

async function listEmails(accessToken: string, request: ListEmailsRequest): Promise<any> {
  const params = new URLSearchParams();
  if (request.query) params.set('q', request.query);
  if (request.maxResults) params.set('maxResults', request.maxResults.toString());
  if (request.pageToken) params.set('pageToken', request.pageToken);

  const listResponse = await fetch(`https://gmail.googleapis.com/gmail/v1/users/me/messages?${params}`, {
    headers: {
      'Authorization': `Bearer ${accessToken}`,
    },
  });

  if (!listResponse.ok) {
    const errorData = await listResponse.json();
    throw new Error(`Gmail API error: ${errorData.error?.message || 'Unknown error'}`);
  }

  const listData = await listResponse.json();
  
  if (!listData.messages || listData.messages.length === 0) {
    return {
      messages: [],
      nextPageToken: listData.nextPageToken,
      resultSizeEstimate: listData.resultSizeEstimate
    };
  }
  
  // Fetch full details for first 10 messages
  const messagePromises = listData.messages.slice(0, 10).map(async (msg: any) => {
    try {
      const messageResponse = await fetch(
        `https://gmail.googleapis.com/gmail/v1/users/me/messages/${msg.id}`,
        {
          headers: {
            'Authorization': `Bearer ${accessToken}`,
          },
        }
      );
      
      if (!messageResponse.ok) {
        return msg;
      }
      
      return await messageResponse.json();
    } catch (error) {
      return msg;
    }
  });
  
  const fullMessages = await Promise.all(messagePromises);
  return {
    messages: fullMessages,
    nextPageToken: listData.nextPageToken,
    resultSizeEstimate: listData.resultSizeEstimate
  };
}

async function getLabels(accessToken: string): Promise<any> {
  const response = await fetch('https://gmail.googleapis.com/gmail/v1/users/me/labels', {
    headers: {
      'Authorization': `Bearer ${accessToken}`,
    },
  });

  if (!response.ok) {
    const errorData = await response.json();
    throw new Error(`Gmail API error: ${errorData.error?.message || 'Unknown error'}`);
  }

  const data = await response.json();
  
  const labelPromises = data.labels?.map(async (label: any) => {
    try {
      return await getFullLabel(accessToken, label.id);
    } catch (error) {
      return label;
    }
  }) || [];
  
  const fullLabels = await Promise.all(labelPromises);
  
  return {
    labels: fullLabels
  };
}

async function syncEmailsToContacts(
  accessToken: string, 
  supabase: any, 
  userId: string, 
  integrationId: string
): Promise<any> {
  try {
    // Get or create sync status
    let { data: syncStatus } = await supabase
      .from('email_sync_status')
      .select('*')
      .eq('integration_id', integrationId)
      .single();
    
    if (!syncStatus) {
      const { data: newStatus, error: createError } = await supabase
        .from('email_sync_status')
        .insert({
          integration_id: integrationId,
          sync_enabled: true,
          sync_interval_minutes: 15,
          sync_direction: 'both',
        })
        .select()
        .single();
      
      if (createError) {
        throw new Error('Failed to initialize sync status');
      }
      
      syncStatus = newStatus;
    }
    
    // Get user's contacts
    const { data: contacts, error: contactsError } = await supabase
      .from('contacts')
      .select('id, email')
      .eq('owner_id', userId);
    
    if (contactsError || !contacts || contacts.length === 0) {
      return {
        success: true,
        message: 'No contacts to sync',
        syncedCount: 0,
      };
    }
    
    // Build email search query
    const emailAddresses = contacts.map((c: any) => c.email).filter(Boolean);
    const query = emailAddresses.map((email: string) => `from:${email} OR to:${email}`).join(' OR ');
    
    const params = new URLSearchParams({
      q: query,
      maxResults: '50',
    });
    
    if (syncStatus.next_page_token) {
      params.set('pageToken', syncStatus.next_page_token);
    }
    
    const response = await fetch(`https://gmail.googleapis.com/gmail/v1/users/me/messages?${params}`, {
      headers: {
        'Authorization': `Bearer ${accessToken}`,
      },
    });
    
    if (!response.ok) {
      const errorData = await response.json();
      throw new Error(`Gmail API error: ${errorData.error?.message || 'Unknown error'}`);
    }
    
    const data = await response.json();
    const messages = data.messages || [];
    let syncedCount = 0;
    
    // Process each message
    for (const message of messages.slice(0, 10)) {
      try {
        const msgResponse = await fetch(
          `https://gmail.googleapis.com/gmail/v1/users/me/messages/${message.id}`,
          {
            headers: {
              'Authorization': `Bearer ${accessToken}`,
            },
          }
        );
        
        if (!msgResponse.ok) continue;
        
        const msgData = await msgResponse.json();
        
        const headers = msgData.payload?.headers || [];
        const fromHeader = headers.find((h: any) => h.name === 'From');
        const toHeader = headers.find((h: any) => h.name === 'To');
        const subjectHeader = headers.find((h: any) => h.name === 'Subject');
        const dateHeader = headers.find((h: any) => h.name === 'Date');
        
        if (!fromHeader || !toHeader) continue;
        
        const fromEmail = extractEmail(fromHeader.value);
        const toEmails = extractEmails(toHeader.value);
        
        let contactId = null;
        let direction = 'inbound';
        
        const fromContact = contacts.find((c: any) => c.email?.toLowerCase() === fromEmail.toLowerCase());
        if (fromContact) {
          contactId = fromContact.id;
          direction = 'inbound';
        } else {
          for (const toEmail of toEmails) {
            const toContact = contacts.find((c: any) => c.email?.toLowerCase() === toEmail.toLowerCase());
            if (toContact) {
              contactId = toContact.id;
              direction = 'outbound';
              break;
            }
          }
        }
        
        if (!contactId) continue;
        
        const body = extractBody(msgData.payload);
        
        const { error: insertError } = await supabase
          .from('contact_emails')
          .upsert({
            contact_id: contactId,
            integration_id: integrationId,
            gmail_message_id: message.id,
            gmail_thread_id: message.threadId || '',
            subject: subjectHeader?.value || '',
            snippet: msgData.snippet || '',
            from_email: fromEmail,
            from_name: extractName(fromHeader.value),
            to_emails: toEmails,
            body_plain: body,
            sent_at: dateHeader ? new Date(dateHeader.value).toISOString() : new Date().toISOString(),
            direction,
            labels: msgData.labelIds || [],
          }, {
            onConflict: 'gmail_message_id',
          });
        
        if (!insertError) {
          syncedCount++;
        }
      } catch (err) {
        // Continue with other messages
      }
    }
    
    // Update sync status
    await supabase
      .from('email_sync_status')
      .update({
        last_sync_at: new Date().toISOString(),
        next_page_token: data.nextPageToken || null,
        total_emails_synced: (syncStatus.total_emails_synced || 0) + syncedCount,
        updated_at: new Date().toISOString(),
      })
      .eq('integration_id', integrationId);

    return {
      success: true,
      syncedCount,
      totalMessages: messages.length,
      hasMore: !!data.nextPageToken,
    };
  } catch (error: any) {
    const errorMessage = error instanceof Error ? error.message : String(error);
    
    // Update sync status with error
    const { data: currentStatus } = await supabase
      .from('email_sync_status')
      .select('consecutive_errors')
      .eq('integration_id', integrationId)
      .single();
    
    const currentConsecutiveErrors = currentStatus?.consecutive_errors || 0;
    
    await supabase
      .from('email_sync_status')
      .update({
        last_error: errorMessage,
        last_error_at: new Date().toISOString(),
        consecutive_errors: currentConsecutiveErrors + 1,
        updated_at: new Date().toISOString(),
      })
      .eq('integration_id', integrationId);
    
    throw error;
  }
}

// Helper functions
function extractEmail(emailString: string): string {
  const match = emailString.match(/<(.+)>/);
  return match ? match[1] : emailString.trim();
}

function extractEmails(emailString: string): string[] {
  return emailString.split(',').map(e => extractEmail(e.trim()));
}

function extractName(emailString: string): string {
  const match = emailString.match(/^(.+) </);
  return match ? match[1].trim() : '';
}

function extractBody(payload: any): string {
  if (!payload) return '';
  
  let textBody = '';
  
  const decodeBase64 = (data: string) => {
    try {
      return atob(data.replace(/-/g, '+').replace(/_/g, '/'));
    } catch {
      return '';
    }
  };
  
  const extractFromParts = (parts: any[]) => {
    for (const part of parts) {
      if (part.mimeType === 'text/plain' && part.body?.data) {
        textBody = decodeBase64(part.body.data);
      } else if (part.parts) {
        extractFromParts(part.parts);
      }
    }
  };
  
  if (payload.parts) {
    extractFromParts(payload.parts);
  } else if (payload.mimeType === 'text/plain' && payload.body?.data) {
    textBody = decodeBase64(payload.body.data);
  }
  
  return textBody;
}

async function getMessage(accessToken: string, request: GetMessageRequest): Promise<any> {
  if (!request.messageId) {
    throw new Error('messageId is required');
  }
  
  const response = await fetch(
    `https://gmail.googleapis.com/gmail/v1/users/me/messages/${request.messageId}?format=full`,
    {
      headers: {
        'Authorization': `Bearer ${accessToken}`,
      },
    }
  );

  if (!response.ok) {
    const errorData = await response.json().catch(() => ({}));
    const errorMessage = errorData.error?.message || `HTTP ${response.status}: ${response.statusText}`;
    throw new Error(`Gmail API error: ${errorMessage}`);
  }

  const message = await response.json();
  
  const headers = message.payload?.headers || [];
  const fromHeader = headers.find((h: any) => h.name?.toLowerCase() === 'from')?.value || '';
  const subject = headers.find((h: any) => h.name?.toLowerCase() === 'subject')?.value || '(No Subject)';
  const dateHeader = headers.find((h: any) => h.name?.toLowerCase() === 'date')?.value || '';
  const toHeader = headers.find((h: any) => h.name?.toLowerCase() === 'to')?.value || '';
  const ccHeader = headers.find((h: any) => h.name?.toLowerCase() === 'cc')?.value || '';
  const replyToHeader = headers.find((h: any) => h.name?.toLowerCase() === 'reply-to')?.value || '';
  
  const fromMatch = fromHeader.match(/^(.+?)\s*<(.+)>$/);
  const fromName = fromMatch ? fromMatch[1].replace(/"/g, '') : fromHeader.split('@')[0];
  const fromEmail = fromMatch ? fromMatch[2] : fromHeader;
  
  const bodyText = extractBody(message.payload);
  
  let timestamp = new Date();
  if (dateHeader) {
    const parsedDate = new Date(dateHeader);
    if (!isNaN(parsedDate.getTime())) {
      timestamp = parsedDate;
    }
  } else if (message.internalDate) {
    timestamp = new Date(parseInt(message.internalDate));
  }
  
  const attachments: any[] = [];
  const extractAttachments = (parts: any[]) => {
    for (const part of parts) {
      if (part.filename && part.body?.attachmentId) {
        attachments.push({
          id: part.body.attachmentId,
          filename: part.filename,
          mimeType: part.mimeType,
          size: part.body.size || 0
        });
      }
      if (part.parts) {
        extractAttachments(part.parts);
      }
    }
  };
  
  if (message.payload?.parts) {
    extractAttachments(message.payload.parts);
  }
  
  return {
    id: message.id,
    threadId: message.threadId,
    from: fromEmail,
    fromName,
    subject,
    body: bodyText,
    timestamp: timestamp.toISOString(),
    read: !message.labelIds?.includes('UNREAD'),
    starred: message.labelIds?.includes('STARRED'),
    labels: message.labelIds || [],
    to: toHeader,
    cc: ccHeader,
    replyTo: replyToHeader || fromEmail,
    attachments,
    snippet: message.snippet || ''
  };
}
