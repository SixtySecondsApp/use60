/**
 * Email Sync Service
 * 
 * Syncs emails from Gmail API for CRM contacts only, analyzes them with Claude Haiku 4.5,
 * and stores them in communication_events table for health score calculations.
 */

import { supabase } from '@/lib/supabase/clientV2';
import { analyzeEmailWithClaude, EmailAnalysis } from './emailAIAnalysis';

export type SyncPeriod = '30days' | '60days' | '90days' | 'all_time';

export interface SyncResult {
  success: boolean;
  totalEmails: number;
  crmContactCount: number;
  crmEmailsMatched: number;
  emailsAnalyzed: number;
  emailsStored: number;
  errors: string[];
  lastSyncTime: string;
}

/**
 * Get CRM contact emails for a user
 */
async function getCRMContactEmails(userId: string): Promise<Set<string>> {
  const { data, error } = await supabase
    .from('contacts')
    .select('email')
    .eq('owner_id', userId) // contacts table uses owner_id, not user_id
    .not('email', 'is', null);

  if (error) {
    console.error('Error fetching CRM contacts:', error);
    return new Set();
  }

  // Normalize emails to lowercase for matching
  const emails = (data || [])
    .map(c => c.email?.toLowerCase().trim())
    .filter((email): email is string => Boolean(email));

  return new Set(emails);
}

/**
 * Check if an email matches a CRM contact
 */
function matchesCRMContact(
  fromEmail: string | null,
  toEmails: string[],
  crmContactEmails: Set<string>
): boolean {
  if (!fromEmail) return false;

  const normalizedFrom = fromEmail.toLowerCase().trim();
  
  // Check if from email matches a CRM contact
  if (crmContactEmails.has(normalizedFrom)) {
    return true;
  }

  // Check if any recipient matches a CRM contact
  return toEmails.some(email => {
    const normalized = email.toLowerCase().trim();
    return crmContactEmails.has(normalized);
  });
}

/**
 * Extract email addresses from Gmail message headers
 */
function extractEmailAddresses(headers: any[]): { from: string | null; to: string[] } {
  let from: string | null = null;
  const to: string[] = [];

  for (const header of headers || []) {
    if (header.name === 'From') {
      // Extract email from "Name <email@domain.com>" format
      const match = header.value.match(/<([^>]+)>/) || header.value.match(/([\w\.-]+@[\w\.-]+\.\w+)/);
      from = match ? match[1] : header.value;
    } else if (header.name === 'To') {
      // Extract all emails from To header
      const emails = header.value.match(/[\w\.-]+@[\w\.-]+\.\w+/g) || [];
      to.push(...emails);
    }
  }

  return { from, to };
}

/**
 * Fetch emails from Gmail API for a period
 * Uses edge function to handle Gmail API calls
 */
async function fetchGmailEmails(
  userId: string,
  period: SyncPeriod
): Promise<any[]> {
  // Build Gmail query based on period
  let query = '';
  const now = new Date();
  
  if (period === '30days') {
    const thirtyDaysAgo = new Date(now.getTime() - 30 * 24 * 60 * 60 * 1000);
    query = `after:${Math.floor(thirtyDaysAgo.getTime() / 1000)}`;
  } else if (period === '60days') {
    const sixtyDaysAgo = new Date(now.getTime() - 60 * 24 * 60 * 60 * 1000);
    query = `after:${Math.floor(sixtyDaysAgo.getTime() / 1000)}`;
  } else if (period === '90days') {
    const ninetyDaysAgo = new Date(now.getTime() - 90 * 24 * 60 * 60 * 1000);
    query = `after:${Math.floor(ninetyDaysAgo.getTime() / 1000)}`;
  }
  // 'all_time' uses no date filter

  // Call Gmail edge function to fetch emails
  // supabase.functions.invoke automatically includes JWT auth header
  const { data, error } = await supabase.functions.invoke('google-services-router', {
    body: {
      action: 'gmail',
      handlerAction: 'list',
      query,
      maxResults: 500, // Fetch up to 500 emails per sync
    },
  });

  if (error) {
    console.error('Error fetching Gmail emails:', error);
    throw new Error(`Failed to fetch Gmail emails: ${error.message}`);
  }

  // Gmail handler returns HTTP 200 with { success: false, error } on failure
  if (data && data.success === false) {
    console.error('Gmail API error:', data.error);
    throw new Error(data.error || 'Gmail API returned an error');
  }

  return data?.messages || [];
}

/**
 * Link email to contact and deal based on email addresses
 */
async function linkEmailToContactAndDeal(
  userId: string,
  emailAddress: string
): Promise<{ contactId: string | null; dealId: string | null }> {
  // Find contact by email
  const { data: contact } = await supabase
    .from('contacts')
    .select('id')
    .eq('owner_id', userId) // contacts table uses owner_id, not user_id
    .ilike('email', emailAddress)
    .single();

  if (!contact) {
    return { contactId: null, dealId: null };
  }

  // Find active deal for this contact
  const { data: deal } = await supabase
    .from('deals')
    .select('id')
    .eq('owner_id', userId)
    .eq('status', 'active')
    .or(`primary_contact_id.eq.${contact.id},contact_email.ilike.${emailAddress}`)
    .order('created_at', { ascending: false })
    .limit(1)
    .maybeSingle();

  return {
    contactId: contact.id,
    dealId: deal?.id || null,
  };
}

/**
 * Store email as communication event with AI analysis
 */
async function storeEmailAsCommunicationEvent(
  userId: string,
  gmailMessage: any,
  analysis: EmailAnalysis | null,
  contactId: string | null,
  dealId: string | null
): Promise<boolean> {
  try {
    const headers = gmailMessage.payload?.headers || [];
    const { from, to } = extractEmailAddresses(headers);

    // Extract subject
    const subjectHeader = headers.find((h: any) => h.name === 'Subject');
    const subject = subjectHeader?.value || '';

    // Extract body preview (first 500 chars)
    let bodyPreview = '';
    if (gmailMessage.payload?.body?.data) {
      try {
        const bodyText = atob(gmailMessage.payload.body.data.replace(/-/g, '+').replace(/_/g, '/'));
        bodyPreview = bodyText.substring(0, 500);
      } catch (e) {
        // Handle error decoding body
      }
    } else if (gmailMessage.payload?.parts) {
      // Try to get text from parts
      for (const part of gmailMessage.payload.parts) {
        if (part.mimeType === 'text/plain' && part.body?.data) {
          try {
            const bodyText = atob(part.body.data.replace(/-/g, '+').replace(/_/g, '/'));
            bodyPreview = bodyText.substring(0, 500);
            break;
          } catch (e) {
            // Continue to next part
          }
        }
      }
    }

    // Determine event type and direction
    const isSent = gmailMessage.labelIds?.includes('SENT') || false;
    const eventType = isSent ? 'email_sent' : 'email_received';
    const direction = isSent ? 'outbound' : 'inbound';

    // Extract date
    const dateHeader = headers.find((h: any) => h.name === 'Date');
    const eventTimestamp = dateHeader?.value 
      ? new Date(dateHeader.value).toISOString()
      : new Date().toISOString();

    // Store in communication_events
    const { error } = await supabase
      .from('communication_events')
      .insert({
        user_id: userId,
        contact_id: contactId,
        deal_id: dealId,
        event_type: eventType,
        direction,
        subject,
        snippet: bodyPreview,
        body: bodyPreview, // Store preview as body
        email_subject: subject,
        email_body_preview: bodyPreview,
        email_thread_id: gmailMessage.threadId,
        external_id: gmailMessage.id,
        sync_source: 'gmail',
        event_timestamp: eventTimestamp,
        sentiment_score: analysis?.sentiment_score || null,
        ai_analyzed: analysis !== null,
        ai_model: analysis !== null ? 'claude-haiku-4-5-20251001' : null,
        key_topics: analysis?.key_topics || null,
        action_items: analysis?.action_items || null,
        urgency: analysis?.urgency || null,
        response_required: analysis?.response_required || null,
      });

    if (error) {
      // Handle unique constraint violation (duplicate email)
      if (error.code === '23505') {
        console.log('Email already exists, skipping:', gmailMessage.id);
        return false;
      }
      console.error('Error storing communication event:', error);
      return false;
    }

    return true;
  } catch (error) {
    console.error('Error storing email:', error);
    return false;
  }
}

/**
 * Perform email sync for CRM contacts only
 */
export async function performEmailSync(
  userId: string,
  period: SyncPeriod
): Promise<SyncResult> {
  const errors: string[] = [];
  let totalEmails = 0;
  let crmEmailsMatched = 0;
  let emailsAnalyzed = 0;
  let emailsStored = 0;

  try {
    // 0. Verify user has Google OAuth integration
    const { data: integration, error: integrationError } = await supabase
      .from('google_integrations')
      .select('id, is_active')
      .eq('user_id', userId)
      .eq('is_active', true)
      .single();

    if (integrationError || !integration) {
      return {
        success: false,
        totalEmails: 0,
        crmContactCount: 0,
        crmEmailsMatched: 0,
        emailsAnalyzed: 0,
        emailsStored: 0,
        errors: ['Google account not connected. Please connect your Google account in Settings > Integrations.'],
        lastSyncTime: new Date().toISOString(),
      };
    }

    // 1. Get CRM contacts for this user
    const crmContactEmails = await getCRMContactEmails(userId);
    const crmContactCount = crmContactEmails.size;

    if (crmContactCount === 0) {
      return {
        success: true,
        totalEmails: 0,
        crmContactCount: 0,
        crmEmailsMatched: 0,
        emailsAnalyzed: 0,
        emailsStored: 0,
        errors: ['No CRM contacts found'],
        lastSyncTime: new Date().toISOString(),
      };
    }

    // 2. Fetch emails from Gmail API for period
    const gmailMessages = await fetchGmailEmails(userId, period);
    totalEmails = gmailMessages.length;

    // 3. Filter: Only emails matching CRM contacts
    const crmEmails: any[] = [];
    for (const message of gmailMessages) {
      // Get full message details if not already available
      let fullMessage = message;
      if (!message.payload) {
        // Fetch full message details
        try {
          const { data: messageData, error: msgError } = await supabase.functions.invoke('google-services-router', {
            body: {
              action: 'gmail',
              handlerAction: 'get',
              messageId: message.id,
            },
          });
          if (!msgError && messageData && messageData.success !== false) {
            fullMessage = messageData;
          }
        } catch (e) {
          errors.push(`Failed to fetch message ${message.id}: ${e}`);
          continue;
        }
      }

      const headers = fullMessage.payload?.headers || [];
      const { from, to } = extractEmailAddresses(headers);

      if (matchesCRMContact(from, to, crmContactEmails)) {
        crmEmails.push(fullMessage);
      }
    }

    crmEmailsMatched = crmEmails.length;

    // 4. For each CRM email: analyze and store
    for (const email of crmEmails) {
      try {
        const headers = email.payload?.headers || [];
        const { from } = extractEmailAddresses(headers);
        
        const subjectHeader = headers.find((h: any) => h.name === 'Subject');
        const subject = subjectHeader?.value || '';

        // Extract body text for analysis
        let bodyText = '';
        if (email.payload?.body?.data) {
          try {
            bodyText = atob(email.payload.body.data.replace(/-/g, '+').replace(/_/g, '/'));
          } catch (e) {
            // Try parts if direct body fails
          }
        }
        if (!bodyText && email.payload?.parts) {
          for (const part of email.payload.parts) {
            if (part.mimeType === 'text/plain' && part.body?.data) {
              try {
                bodyText = atob(part.body.data.replace(/-/g, '+').replace(/_/g, '/'));
                break;
              } catch (e) {
                // Continue
              }
            }
          }
        }

        // Run Claude Haiku 4.5 analysis
        let analysis: EmailAnalysis | null = null;
        if (subject && bodyText) {
          try {
            analysis = await analyzeEmailWithClaude(subject, bodyText);
            emailsAnalyzed++;
          } catch (error: any) {
            errors.push(`Failed to analyze email ${email.id}: ${error.message}`);
            // Continue without analysis
          }
        }

        // Link to contact and deal
        const { contactId, dealId } = await linkEmailToContactAndDeal(
          userId,
          from || ''
        );

        // Store in communication_events
        const stored = await storeEmailAsCommunicationEvent(
          userId,
          email,
          analysis,
          contactId,
          dealId
        );

        if (stored) {
          emailsStored++;
        }
      } catch (error: any) {
        errors.push(`Error processing email ${email.id}: ${error.message}`);
      }
    }

    return {
      success: errors.length === 0,
      totalEmails,
      crmContactCount,
      crmEmailsMatched,
      emailsAnalyzed,
      emailsStored,
      errors,
      lastSyncTime: new Date().toISOString(),
    };
  } catch (error: any) {
    errors.push(`Sync failed: ${error.message}`);
    return {
      success: false,
      totalEmails,
      crmContactCount: 0,
      crmEmailsMatched,
      emailsAnalyzed,
      emailsStored,
      errors,
      lastSyncTime: new Date().toISOString(),
    };
  }
}

