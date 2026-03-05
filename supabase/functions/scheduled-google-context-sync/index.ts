/**
 * Scheduled Google Context Sync Edge Function
 * 
 * Every 15 minutes:
 * 1. Sync Google Calendar events for active users
 * 2. Incrementally sync Gmail messages (using historyId cursor)
 * 3. Categorize new emails (Fyxer-style: to_respond, fyi, marketing)
 * 4. Extract sales signals for Slack assistant
 * 
 * SECURITY:
 * - POST only
 * - FAIL-CLOSED: Requires CRON_SECRET or service role authentication
 * - No anonymous triggers
 */

import { serve } from 'https://deno.land/std@0.168.0/http/server.ts';
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2.43.4';
import { logAICostEvent } from '../_shared/costTracking.ts';
import { verifyCronSecret, isServiceRoleAuth, getUserOrgId } from '../_shared/edgeAuth.ts';
import { getCorsHeaders, handleCorsPreflightRequest, errorResponse, jsonResponse } from '../_shared/corsHelper.ts';

// ============================================================================
// Types
// ============================================================================

interface SyncResult {
  userId: string;
  calendarEventsProcessed: number;
  emailsProcessed: number;
  categorized: number;
  errors: string[];
}

interface AggregateResult {
  usersProcessed: number;
  totalCalendarEvents: number;
  totalEmails: number;
  totalCategorized: number;
  errors: string[];
}

// ============================================================================
// Main Handler
// ============================================================================

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

  try {
    // SECURITY: Fail-closed authentication
    const cronSecret = Deno.env.get('CRON_SECRET');
    const supabaseServiceKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') || '';
    const authHeader = req.headers.get('Authorization');

    const isCronAuth = verifyCronSecret(req, cronSecret);
    const isServiceRole = isServiceRoleAuth(authHeader, supabaseServiceKey);

    if (!isCronAuth && !isServiceRole) {
      console.error('[scheduled-google-context-sync] Unauthorized access attempt');
      return errorResponse('Unauthorized: valid CRON_SECRET or service role key required', req, 401);
    }

    // Initialize Supabase client with service role
    const supabaseUrl = Deno.env.get('SUPABASE_URL') || '';
    
    if (!supabaseUrl || !supabaseServiceKey) {
      throw new Error('Missing Supabase configuration');
    }

    const supabase = createClient(supabaseUrl, supabaseServiceKey, {
      auth: {
        persistSession: false,
        autoRefreshToken: false,
      },
    });

    // Get active users with Google integration (logged in last 7 days)
    const sevenDaysAgo = new Date();
    sevenDaysAgo.setDate(sevenDaysAgo.getDate() - 7);

    const { data: activeUsers, error: usersError } = await supabase
      .from('profiles')
      .select(`
        id,
        google_integrations!inner(id, is_active, access_token, refresh_token, expires_at, scopes)
      `)
      .gte('last_login_at', sevenDaysAgo.toISOString())
      .not('last_login_at', 'is', null)
      .eq('google_integrations.is_active', true);

    if (usersError) {
      throw new Error(`Failed to fetch active users: ${usersError.message}`);
    }

    if (!activeUsers || activeUsers.length === 0) {
      return jsonResponse({
        success: true,
        message: 'No active users with Google integration to sync',
        usersProcessed: 0,
        timestamp: new Date().toISOString(),
      }, req);
    }

    // Process each user
    const aggregateResult: AggregateResult = {
      usersProcessed: 0,
      totalCalendarEvents: 0,
      totalEmails: 0,
      totalCategorized: 0,
      errors: [],
    };

    // Limit concurrent processing to avoid rate limits
    const batchSize = 5;
    for (let i = 0; i < activeUsers.length; i += batchSize) {
      const batch = activeUsers.slice(i, i + batchSize);
      
      const results = await Promise.allSettled(
        batch.map(user => processUser(supabase, user, supabaseServiceKey))
      );
      
      for (const result of results) {
        if (result.status === 'fulfilled') {
          const userResult = result.value;
          aggregateResult.usersProcessed++;
          aggregateResult.totalCalendarEvents += userResult.calendarEventsProcessed;
          aggregateResult.totalEmails += userResult.emailsProcessed;
          aggregateResult.totalCategorized += userResult.categorized;
          aggregateResult.errors.push(...userResult.errors);
        } else {
          aggregateResult.errors.push(result.reason?.message || 'Unknown error');
        }
      }
      
      // Small delay between batches to avoid rate limits
      if (i + batchSize < activeUsers.length) {
        await new Promise(resolve => setTimeout(resolve, 1000));
      }
    }

    return jsonResponse({
      success: aggregateResult.errors.length === 0,
      ...aggregateResult,
      timestamp: new Date().toISOString(),
    }, req);

  } catch (error: any) {
    console.error('[scheduled-google-context-sync] Error:', error);
    return errorResponse(error.message || 'Unknown error', req, 500);
  }
});

// ============================================================================
// User Processing
// ============================================================================

async function processUser(
  supabase: any,
  user: any,
  serviceRoleKey: string
): Promise<SyncResult> {
  const result: SyncResult = {
    userId: user.id,
    calendarEventsProcessed: 0,
    emailsProcessed: 0,
    categorized: 0,
    errors: [],
  };

  try {
    const integration = (user as any).google_integrations;
    if (!integration || !integration.access_token) {
      result.errors.push(`User ${user.id}: No valid Google integration`);
      return result;
    }

    // Check if token needs refresh
    let accessToken = integration.access_token;
    const expiresAt = new Date(integration.expires_at);
    const now = new Date();

    if (now >= expiresAt && integration.refresh_token) {
      try {
        accessToken = await refreshAccessToken(integration.refresh_token, supabase, user.id);
      } catch (refreshError: any) {
        result.errors.push(`User ${user.id}: Token refresh failed - ${refreshError.message}`);
        return result;
      }
    }

    // Get user's org ID
    const orgId = await getUserOrgId(supabase, user.id);

    // Check org categorization settings
    let orgSettings = null;
    if (orgId) {
      const { data: settings } = await supabase
        .from('org_email_categorization_settings')
        .select('*')
        .eq('org_id', orgId)
        .single();
      orgSettings = settings;
    }

    // 1. Sync Calendar Events
    const calendarResult = await syncCalendarEvents(accessToken, supabase, user.id, orgId);
    result.calendarEventsProcessed = calendarResult.eventsProcessed;
    result.errors.push(...calendarResult.errors);

    // 2. Sync Gmail (if email scope is present)
    const hasGmailScope = integration.scopes?.includes('gmail') || 
                          integration.scopes?.includes('https://www.googleapis.com/auth/gmail.readonly');
    
    if (hasGmailScope) {
      const emailResult = await syncGmailMessages(
        accessToken, 
        supabase, 
        user.id, 
        orgId,
        orgSettings
      );
      result.emailsProcessed = emailResult.emailsProcessed;
      result.categorized = emailResult.categorized;
      result.errors.push(...emailResult.errors);
    }

    // Update sync status
    await supabase
      .from('user_sync_status')
      .upsert({
        user_id: user.id,
        calendar_last_synced_at: new Date().toISOString(),
        email_last_synced_at: hasGmailScope ? new Date().toISOString() : null,
        last_categorization_run_at: hasGmailScope ? new Date().toISOString() : null,
        updated_at: new Date().toISOString(),
      }, {
        onConflict: 'user_id',
      });

  } catch (error: any) {
    result.errors.push(`User ${user.id}: ${error.message}`);
  }

  return result;
}

// ============================================================================
// Calendar Sync
// ============================================================================

async function syncCalendarEvents(
  accessToken: string,
  supabase: any,
  userId: string,
  orgId: string | null
): Promise<{ eventsProcessed: number; errors: string[] }> {
  const errors: string[] = [];
  let eventsProcessed = 0;

  try {
    // Get sync status for incremental sync
    const { data: syncStatus } = await supabase
      .from('user_sync_status')
      .select('calendar_sync_token, calendar_last_synced_at')
      .eq('user_id', userId)
      .single();

    // Build API URL
    let apiUrl = 'https://www.googleapis.com/calendar/v3/calendars/primary/events';
    const params = new URLSearchParams({
      maxResults: '100',
      singleEvents: 'true',
      orderBy: 'updated',
    });

    // Use sync token for incremental sync, or time-based for initial
    if (syncStatus?.calendar_sync_token) {
      params.set('syncToken', syncStatus.calendar_sync_token);
    } else {
      // Initial sync: last 7 days
      const sevenDaysAgo = new Date();
      sevenDaysAgo.setDate(sevenDaysAgo.getDate() - 7);
      params.set('timeMin', sevenDaysAgo.toISOString());
    }

    const response = await fetch(`${apiUrl}?${params}`, {
      headers: {
        'Authorization': `Bearer ${accessToken}`,
      },
    });

    if (!response.ok) {
      // If sync token is invalid, do a full sync
      if (response.status === 410) {
        const fullSyncParams = new URLSearchParams({
          maxResults: '100',
          singleEvents: 'true',
          orderBy: 'updated',
          timeMin: new Date(Date.now() - 7 * 24 * 60 * 60 * 1000).toISOString(),
        });
        
        const retryResponse = await fetch(`${apiUrl}?${fullSyncParams}`, {
          headers: {
            'Authorization': `Bearer ${accessToken}`,
          },
        });
        
        if (!retryResponse.ok) {
          const errorData = await retryResponse.json().catch(() => ({}));
          errors.push(`Calendar API error: ${errorData.error?.message || retryResponse.statusText}`);
          return { eventsProcessed, errors };
        }
        
        const data = await retryResponse.json();
        eventsProcessed = await processCalendarEvents(supabase, userId, orgId, data.items || []);
        
        // Store new sync token
        if (data.nextSyncToken) {
          await supabase
            .from('user_sync_status')
            .upsert({
              user_id: userId,
              calendar_sync_token: data.nextSyncToken,
              calendar_last_synced_at: new Date().toISOString(),
            }, { onConflict: 'user_id' });
        }
        
        return { eventsProcessed, errors };
      }
      
      const errorData = await response.json().catch(() => ({}));
      errors.push(`Calendar API error: ${errorData.error?.message || response.statusText}`);
      return { eventsProcessed, errors };
    }

    const data = await response.json();
    eventsProcessed = await processCalendarEvents(supabase, userId, orgId, data.items || []);

    // Store sync token for next incremental sync
    if (data.nextSyncToken) {
      await supabase
        .from('user_sync_status')
        .upsert({
          user_id: userId,
          calendar_sync_token: data.nextSyncToken,
          calendar_last_synced_at: new Date().toISOString(),
        }, { onConflict: 'user_id' });
    }

  } catch (error: any) {
    errors.push(`Calendar sync error: ${error.message}`);
  }

  return { eventsProcessed, errors };
}

async function processCalendarEvents(
  supabase: any,
  userId: string,
  orgId: string | null,
  events: any[]
): Promise<number> {
  let processed = 0;

  for (const event of events) {
    try {
      // Handle cancelled events
      if (event.status === 'cancelled') {
        await supabase
          .from('calendar_events')
          .update({ status: 'cancelled', updated_at: new Date().toISOString() })
          .eq('external_id', event.id)
          .eq('user_id', userId);
        processed++;
        continue;
      }

      // Upsert event
      const { error } = await supabase
        .from('calendar_events')
        .upsert({
          user_id: userId,
          org_id: orgId,
          external_id: event.id,
          title: event.summary || '(No title)',
          description: event.description || null,
          location: event.location || null,
          start_time: event.start?.dateTime || event.start?.date,
          end_time: event.end?.dateTime || event.end?.date,
          is_all_day: Boolean(event.start?.date),
          status: event.status || 'confirmed',
          calendar_id: event.organizer?.email || 'primary',
          source: 'google',
          attendees: event.attendees || [],
          metadata: {
            htmlLink: event.htmlLink,
            conferenceData: event.conferenceData,
            recurringEventId: event.recurringEventId,
          },
          synced_at: new Date().toISOString(),
          updated_at: new Date().toISOString(),
        }, {
          onConflict: 'user_id,external_id',
        });

      if (!error) {
        processed++;
      }
    } catch (e: any) {
      // Continue processing other events
      console.error(`[calendar-sync] Error processing event ${event.id}:`, e);
    }
  }

  return processed;
}

// ============================================================================
// Gmail Sync with Categorization
// ============================================================================

async function syncGmailMessages(
  accessToken: string,
  supabase: any,
  userId: string,
  orgId: string | null,
  orgSettings: any | null
): Promise<{ emailsProcessed: number; categorized: number; errors: string[] }> {
  const errors: string[] = [];
  let emailsProcessed = 0;
  let categorized = 0;

  try {
    // Check if categorization is enabled
    const isCategorizationEnabled = orgSettings?.is_enabled !== false;

    // Get sync status
    const { data: syncStatus } = await supabase
      .from('user_sync_status')
      .select('gmail_history_id, gmail_last_full_sync_at')
      .eq('user_id', userId)
      .single();

    // Get user's CRM contacts for matching
    const { data: contacts } = await supabase
      .from('contacts')
      .select('id, email')
      .eq('owner_id', userId)
      .not('email', 'is', null);

    const crmEmails = new Set(
      (contacts || [])
        .map((c: any) => c.email?.toLowerCase().trim())
        .filter((e: string): e is string => Boolean(e))
    );

    // Use history API for incremental sync if we have a historyId
    if (syncStatus?.gmail_history_id) {
      const historyResult = await syncGmailHistory(
        accessToken,
        supabase,
        userId,
        orgId,
        syncStatus.gmail_history_id,
        crmEmails,
        isCategorizationEnabled,
        orgSettings
      );
      emailsProcessed = historyResult.emailsProcessed;
      categorized = historyResult.categorized;
      errors.push(...historyResult.errors);
    } else {
      // Initial sync: last 24 hours of messages
      const listResult = await syncGmailList(
        accessToken,
        supabase,
        userId,
        orgId,
        crmEmails,
        isCategorizationEnabled,
        orgSettings
      );
      emailsProcessed = listResult.emailsProcessed;
      categorized = listResult.categorized;
      errors.push(...listResult.errors);
    }

    // Get current historyId for next sync
    const profileResponse = await fetch(
      'https://gmail.googleapis.com/gmail/v1/users/me/profile',
      {
        headers: { 'Authorization': `Bearer ${accessToken}` },
      }
    );

    if (profileResponse.ok) {
      const profile = await profileResponse.json();
      if (profile.historyId) {
        await supabase
          .from('user_sync_status')
          .upsert({
            user_id: userId,
            gmail_history_id: profile.historyId,
            gmail_last_full_sync_at: syncStatus?.gmail_last_full_sync_at || new Date().toISOString(),
            email_last_synced_at: new Date().toISOString(),
          }, { onConflict: 'user_id' });
      }
    }

  } catch (error: any) {
    errors.push(`Gmail sync error: ${error.message}`);
  }

  return { emailsProcessed, categorized, errors };
}

async function syncGmailHistory(
  accessToken: string,
  supabase: any,
  userId: string,
  orgId: string | null,
  startHistoryId: string,
  crmEmails: Set<string>,
  enableCategorization: boolean,
  orgSettings: any | null
): Promise<{ emailsProcessed: number; categorized: number; errors: string[] }> {
  const errors: string[] = [];
  let emailsProcessed = 0;
  let categorized = 0;

  try {
    const params = new URLSearchParams({
      startHistoryId,
      historyTypes: 'messageAdded',
      maxResults: '100',
    });

    const response = await fetch(
      `https://gmail.googleapis.com/gmail/v1/users/me/history?${params}`,
      {
        headers: { 'Authorization': `Bearer ${accessToken}` },
      }
    );

    if (!response.ok) {
      if (response.status === 404) {
        // History expired, need full sync
        return syncGmailList(accessToken, supabase, userId, orgId, crmEmails, enableCategorization, orgSettings);
      }
      const errorData = await response.json().catch(() => ({}));
      errors.push(`Gmail History API error: ${errorData.error?.message || response.statusText}`);
      return { emailsProcessed, categorized, errors };
    }

    const data = await response.json();
    const messageIds = new Set<string>();

    // Extract unique message IDs from history
    for (const history of data.history || []) {
      for (const added of history.messagesAdded || []) {
        messageIds.add(added.message.id);
      }
    }

    // Process each message
    for (const messageId of messageIds) {
      const result = await processGmailMessage(
        accessToken,
        supabase,
        userId,
        orgId,
        messageId,
        crmEmails,
        enableCategorization,
        orgSettings
      );
      if (result.processed) emailsProcessed++;
      if (result.categorized) categorized++;
      errors.push(...result.errors);
    }

  } catch (error: any) {
    errors.push(`Gmail history sync error: ${error.message}`);
  }

  return { emailsProcessed, categorized, errors };
}

async function syncGmailList(
  accessToken: string,
  supabase: any,
  userId: string,
  orgId: string | null,
  crmEmails: Set<string>,
  enableCategorization: boolean,
  orgSettings: any | null
): Promise<{ emailsProcessed: number; categorized: number; errors: string[] }> {
  const errors: string[] = [];
  let emailsProcessed = 0;
  let categorized = 0;

  try {
    // Fetch last 24 hours of emails
    const oneDayAgo = new Date();
    oneDayAgo.setDate(oneDayAgo.getDate() - 1);
    const afterTimestamp = Math.floor(oneDayAgo.getTime() / 1000);

    const params = new URLSearchParams({
      q: `after:${afterTimestamp}`,
      maxResults: '50',
    });

    const response = await fetch(
      `https://gmail.googleapis.com/gmail/v1/users/me/messages?${params}`,
      {
        headers: { 'Authorization': `Bearer ${accessToken}` },
      }
    );

    if (!response.ok) {
      const errorData = await response.json().catch(() => ({}));
      errors.push(`Gmail List API error: ${errorData.error?.message || response.statusText}`);
      return { emailsProcessed, categorized, errors };
    }

    const data = await response.json();

    for (const msgRef of data.messages || []) {
      const result = await processGmailMessage(
        accessToken,
        supabase,
        userId,
        orgId,
        msgRef.id,
        crmEmails,
        enableCategorization,
        orgSettings
      );
      if (result.processed) emailsProcessed++;
      if (result.categorized) categorized++;
      errors.push(...result.errors);
    }

  } catch (error: any) {
    errors.push(`Gmail list sync error: ${error.message}`);
  }

  return { emailsProcessed, categorized, errors };
}

async function processGmailMessage(
  accessToken: string,
  supabase: any,
  userId: string,
  orgId: string | null,
  messageId: string,
  crmEmails: Set<string>,
  enableCategorization: boolean,
  orgSettings: any | null
): Promise<{ processed: boolean; categorized: boolean; errors: string[] }> {
  const errors: string[] = [];
  let processed = false;
  let categorized = false;

  try {
    // Fetch full message
    const msgResponse = await fetch(
      `https://gmail.googleapis.com/gmail/v1/users/me/messages/${messageId}`,
      {
        headers: { 'Authorization': `Bearer ${accessToken}` },
      }
    );

    if (!msgResponse.ok) {
      return { processed, categorized, errors };
    }

    const message = await msgResponse.json();
    const headers = message.payload?.headers || [];
    
    const getHeader = (name: string) => 
      headers.find((h: any) => h.name?.toLowerCase() === name)?.value || '';

    const fromHeader = getHeader('from');
    const toHeader = getHeader('to');
    const subject = getHeader('subject');
    const dateHeader = getHeader('date');

    // Extract from email
    const fromMatch = fromHeader.match(/<([^>]+)>/) || fromHeader.match(/([\w\.-]+@[\w\.-]+\.\w+)/);
    const fromEmail = fromMatch ? fromMatch[1].toLowerCase().trim() : fromHeader.toLowerCase().trim();

    // Extract to emails
    const toEmails = (toHeader.match(/[\w\.-]+@[\w\.-]+\.\w+/g) || [])
      .map((e: string) => e.toLowerCase().trim());

    // Determine direction
    const isSent = message.labelIds?.includes('SENT') || false;
    const direction: 'inbound' | 'outbound' = isSent ? 'outbound' : 'inbound';

    // Check if email involves a CRM contact
    const matchesCRM = crmEmails.has(fromEmail) || 
                       toEmails.some((e: string) => crmEmails.has(e));

    // Store in communication_events if CRM related
    if (matchesCRM) {
      // Find matching contact
      let contactId = null;
      const { data: matchedContacts } = await supabase
        .from('contacts')
        .select('id')
        .eq('owner_id', userId)
        .or(`email.ilike.${fromEmail},email.ilike.${toEmails.join(',email.ilike.')}`);
      
      if (matchedContacts && matchedContacts.length > 0) {
        contactId = matchedContacts[0].id;
      }

      const { error: commError } = await supabase
        .from('communication_events')
        .upsert({
          user_id: userId,
          org_id: orgId,
          contact_id: contactId,
          event_type: direction === 'outbound' ? 'email_sent' : 'email_received',
          direction,
          subject,
          snippet: message.snippet || '',
          external_id: messageId,
          external_source: 'gmail',
          email_thread_id: message.threadId,
          sync_source: 'gmail',
          event_timestamp: dateHeader ? new Date(dateHeader).toISOString() : new Date().toISOString(),
          communication_date: dateHeader ? new Date(dateHeader).toISOString() : new Date().toISOString(),
          metadata: {
            from: fromEmail,
            to: toEmails,
            gmail_message_id: messageId,
            synced_at: new Date().toISOString(),
          },
        }, {
          onConflict: 'external_id,user_id',
        });

      if (!commError) {
        processed = true;
      }
    }

    // Categorize email if enabled
    if (enableCategorization) {
      const categoryResult = await categorizeEmail(
        supabase,
        userId,
        orgId,
        message,
        direction,
        fromEmail,
        subject,
        matchesCRM,
        orgSettings,
        accessToken
      );
      
      if (categoryResult.success) {
        categorized = true;
        
        // Apply Gmail labels if modeC is enabled
        if (orgSettings?.label_mode === 'mode_c_sync_labels' && categoryResult.category) {
          const labelResult = await applyGmailLabel(
            accessToken,
            supabase,
            userId,
            messageId,
            categoryResult.category as string,
            orgSettings
          );
          
          if (!labelResult.success) {
            errors.push(...labelResult.errors);
          }
        }
      }
      errors.push(...categoryResult.errors);
    }

  } catch (error: any) {
    errors.push(`Message ${messageId}: ${error.message}`);
  }

  return { processed, categorized, errors };
}

// ============================================================================
// Email Categorization (Fyxer-style)
// ============================================================================

async function categorizeEmail(
  supabase: any,
  userId: string,
  orgId: string | null,
  message: any,
  direction: 'inbound' | 'outbound',
  fromEmail: string,
  subject: string,
  isCrmRelated: boolean,
  orgSettings: any | null,
  accessToken?: string
): Promise<{ success: boolean; category?: string; errors: string[] }> {
  const errors: string[] = [];
  
  try {
    // Check if AI categorization is enabled
    const useAI = orgSettings?.use_ai_categorization !== false;
    const anthropicKey = Deno.env.get('ANTHROPIC_API_KEY');
    
    let category: string;
    let confidence: number;
    let signals: any;
    let source: 'ai' | 'rules';
    
    // Try AI categorization if enabled and API key available
    if (useAI && anthropicKey && direction === 'inbound') {
      try {
        const aiResult = await categorizeWithAI(
          subject,
          message.snippet || '',
          fromEmail,
          message.labelIds || [],
          direction,
          anthropicKey
        );
        category = aiResult.category;
        confidence = aiResult.confidence;
        signals = aiResult.signals;
        source = 'ai';

        // Add CRM context to signals
        signals.isCrmRelated = isCrmRelated;

        // Log AI cost event (fire-and-forget)
        if (aiResult.inputTokens !== undefined || aiResult.outputTokens !== undefined) {
          logAICostEvent(
            supabase, userId, orgId,
            'anthropic', 'claude-3-5-haiku-20241022',
            aiResult.inputTokens || 0, aiResult.outputTokens || 0,
            'scheduled_email_categorize',
            undefined,
            { source: 'agent_automated', agentType: 'scheduled-google-context-sync' },
          ).catch((e: unknown) => console.warn('[scheduled-google-context-sync] cost log error:', e));
        }
      } catch (aiError: any) {
        console.warn(`[categorize] AI failed, falling back to rules: ${aiError.message}`);
        const rulesResult = categorizeByrules(message, direction, fromEmail, subject, isCrmRelated);
        category = rulesResult.category;
        confidence = rulesResult.confidence;
        signals = rulesResult.signals;
        source = 'rules';
      }
    } else {
      // Use rules-based categorization
      const rulesResult = categorizeByrules(message, direction, fromEmail, subject, isCrmRelated);
      category = rulesResult.category;
      confidence = rulesResult.confidence;
      signals = rulesResult.signals;
      source = 'rules';
    }

    // Check enabled categories
    const enabledCategories = orgSettings?.enabled_categories || 
      ['to_respond', 'fyi', 'marketing', 'calendar_related', 'automated'];
    
    const finalCategory = enabledCategories.includes(category) ? category : 'uncategorized';

    // Store categorization
    const { error } = await supabase
      .from('email_categorizations')
      .upsert({
        user_id: userId,
        org_id: orgId,
        external_id: message.id,
        thread_id: message.threadId,
        direction,
        received_at: new Date().toISOString(),
        category: finalCategory,
        category_confidence: confidence,
        signals: signals,
        source: source,
        gmail_label_applied: false,
        processed_at: new Date().toISOString(),
      }, {
        onConflict: 'user_id,external_id',
      });

    if (error) {
      errors.push(`Categorization error: ${error.message}`);
      return { success: false, errors };
    }

    return { success: true, category: finalCategory, errors };

  } catch (error: any) {
    errors.push(`Categorization error: ${error.message}`);
    return { success: false, errors };
  }
}

/**
 * Apply Gmail label based on email category (for modeC: sync_labels)
 */
async function applyGmailLabel(
  accessToken: string,
  supabase: any,
  userId: string,
  messageId: string,
  category: string,
  orgSettings: any
): Promise<{ success: boolean; errors: string[] }> {
  const errors: string[] = [];
  
  try {
    // Get the label mapping for this category
    const { data: mapping, error: mappingError } = await supabase
      .from('gmail_label_mappings')
      .select('gmail_label_id, gmail_label_name, is_sixty_managed')
      .eq('user_id', userId)
      .eq('category_key', category)
      .single();
    
    if (mappingError || !mapping?.gmail_label_id) {
      // No label mapping exists, skip label application
      // This is not an error - user may not have set up labels for this category
      return { success: true, errors };
    }
    
    // Apply the label to the Gmail message
    const response = await fetch(
      `https://gmail.googleapis.com/gmail/v1/users/me/messages/${messageId}/modify`,
      {
        method: 'POST',
        headers: {
          'Authorization': `Bearer ${accessToken}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          addLabelIds: [mapping.gmail_label_id],
        }),
      }
    );
    
    if (!response.ok) {
      const errorData = await response.json().catch(() => ({}));
      errors.push(`Gmail label apply error: ${errorData.error?.message || response.statusText}`);
      return { success: false, errors };
    }
    
    // Update the categorization record to mark label as applied
    await supabase
      .from('email_categorizations')
      .update({
        gmail_label_applied: true,
        gmail_label_applied_at: new Date().toISOString(),
      })
      .eq('user_id', userId)
      .eq('external_id', messageId);
    
    return { success: true, errors };
    
  } catch (error: any) {
    errors.push(`Gmail label error: ${error.message}`);
    return { success: false, errors };
  }
}

/**
 * AI-based email categorization using Claude Haiku
 */
async function categorizeWithAI(
  subject: string,
  snippet: string,
  from: string,
  labels: string[],
  direction: string,
  apiKey: string
): Promise<{
  category: string;
  confidence: number;
  signals: any;
  inputTokens?: number;
  outputTokens?: number;
}> {
  const systemPrompt = `You are an email categorizer. Categorize emails into exactly one of these categories:
- to_respond: Requires a reply (questions, requests, asks)
- fyi: Informational, no reply needed
- marketing: Newsletters, promos, cold outreach
- calendar_related: Meeting invites, event updates
- automated: Receipts, notifications, system emails

Also extract signals. Respond ONLY with JSON:
{
  "category": "to_respond" | "fyi" | "marketing" | "calendar_related" | "automated",
  "confidence": 0.0-1.0,
  "signals": {
    "response_required": true/false,
    "urgency": "low" | "medium" | "high",
    "is_sales_related": true/false,
    "keywords": ["keyword1"]
  }
}`;

  const userPrompt = `From: ${from}
Subject: ${subject}
Labels: ${labels.join(', ') || 'none'}
Preview: ${snippet.substring(0, 500)}`;

  const response = await fetch('https://api.anthropic.com/v1/messages', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'x-api-key': apiKey,
      'anthropic-version': '2023-06-01',
    },
    body: JSON.stringify({
      model: 'claude-3-5-haiku-20241022',
      max_tokens: 512,
      temperature: 0.1,
      system: systemPrompt,
      messages: [{ role: 'user', content: userPrompt }],
    }),
  });

  if (!response.ok) {
    const errorText = await response.text();
    throw new Error(`Claude API error: ${response.status}`);
  }

  const data = await response.json();
  const content = data.content[0].text;
  
  const jsonMatch = content.match(/\{[\s\S]*\}/);
  if (!jsonMatch) throw new Error('No JSON in response');
  
  const parsed = JSON.parse(jsonMatch[0]);
  
  return {
    category: parsed.category || 'uncategorized',
    confidence: Math.max(0, Math.min(1, parsed.confidence || 0.7)),
    signals: {
      response_required: Boolean(parsed.signals?.response_required),
      urgency: parsed.signals?.urgency || 'low',
      is_sales_related: Boolean(parsed.signals?.is_sales_related),
      keywords: parsed.signals?.keywords || [],
    },
    inputTokens: data.usage?.input_tokens || 0,
    outputTokens: data.usage?.output_tokens || 0,
  };
}

/**
 * Rule-based email categorization
 * Returns category, confidence, signals, and source
 */
function categorizeByrules(
  message: any,
  direction: 'inbound' | 'outbound',
  fromEmail: string,
  subject: string,
  isCrmRelated: boolean
): {
  category: string;
  confidence: number;
  signals: any;
  source: 'rules';
} {
  const labels = message.labelIds || [];
  const subjectLower = subject.toLowerCase();
  const fromLower = fromEmail.toLowerCase();
  
  const signals: any = {
    direction,
    isCrmRelated,
    keywords: [],
  };

  // Marketing indicators
  const marketingPatterns = [
    'unsubscribe', 'newsletter', 'promo', 'sale', 'discount',
    'marketing', 'noreply', 'no-reply', 'mailchimp', 'hubspot',
    'sendgrid', 'campaign', 'offer', 'deal of',
  ];
  
  const isMarketing = marketingPatterns.some(p => 
    subjectLower.includes(p) || fromLower.includes(p)
  );
  
  if (isMarketing) {
    signals.keywords.push('marketing');
    return { category: 'marketing', confidence: 0.85, signals, source: 'rules' };
  }

  // Calendar-related
  const calendarPatterns = [
    'invitation', 'invite', 'calendar', 'meeting request',
    'rsvp', 'event', 'accepted:', 'declined:', 'tentative:',
  ];
  
  const isCalendar = calendarPatterns.some(p => subjectLower.includes(p)) ||
                     labels.includes('CATEGORY_UPDATES');
  
  if (isCalendar) {
    signals.keywords.push('calendar');
    return { category: 'calendar_related', confidence: 0.9, signals, source: 'rules' };
  }

  // Automated/receipts
  const automatedPatterns = [
    'receipt', 'confirmation', 'order', 'invoice', 'payment',
    'shipping', 'delivery', 'notification', 'alert', 'automated',
  ];
  
  const isAutomated = automatedPatterns.some(p => subjectLower.includes(p)) ||
                      fromLower.includes('noreply') ||
                      fromLower.includes('no-reply') ||
                      fromLower.includes('notifications@');
  
  if (isAutomated) {
    signals.keywords.push('automated');
    return { category: 'automated', confidence: 0.8, signals, source: 'rules' };
  }

  // Response required indicators
  const responsePatterns = [
    'urgent', 'asap', 'please respond', 'please reply',
    'action required', 'quick question', 'thoughts?',
    'can you', 'would you', 'could you', '?',
  ];
  
  const needsResponse = direction === 'inbound' && 
                        responsePatterns.some(p => subjectLower.includes(p));
  
  if (needsResponse) {
    signals.response_required = true;
    signals.keywords.push('needs_response');
    
    // Check urgency
    if (subjectLower.includes('urgent') || subjectLower.includes('asap')) {
      signals.urgency = 'high';
    } else {
      signals.urgency = 'medium';
    }
    
    return { category: 'to_respond', confidence: 0.75, signals, source: 'rules' };
  }

  // CRM-related emails are more likely to need response
  if (isCrmRelated && direction === 'inbound') {
    signals.response_required = true;
    signals.urgency = 'medium';
    return { category: 'to_respond', confidence: 0.7, signals, source: 'rules' };
  }

  // Default: FYI for inbound, uncategorized for outbound
  if (direction === 'inbound') {
    return { category: 'fyi', confidence: 0.5, signals, source: 'rules' };
  }
  
  return { category: 'uncategorized', confidence: 0.3, signals, source: 'rules' };
}

// ============================================================================
// Token Refresh
// ============================================================================

async function refreshAccessToken(
  refreshToken: string, 
  supabase: any, 
  userId: string
): Promise<string> {
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

