/**
 * Scheduled Email Sync Edge Function
 * 
 * Daily incremental email sync for active users (logged in last 7 days).
 * Syncs last 24 hours of emails for CRM contacts only.
 * Called daily via GitHub Actions cron job or Vercel cron.
 * 
 * SECURITY:
 * - POST only (no GET)
 * - FAIL-CLOSED: Requires CRON_SECRET or service role authentication
 * - No anonymous triggers allowed
 */

import { serve } from 'https://deno.land/std@0.168.0/http/server.ts';
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2.43.4';
import { verifyCronSecret, isServiceRoleAuth } from '../_shared/edgeAuth.ts';
import { getCorsHeaders, handleCorsPreflightRequest, errorResponse, jsonResponse } from '../_shared/corsHelper.ts';
import { processEmailForDealTruth } from '../_shared/dealTruthExtraction.ts';

serve(async (req) => {
  // Handle CORS preflight
  const preflightResponse = handleCorsPreflightRequest(req);
  if (preflightResponse) {
    return preflightResponse;
  }

  // POST only - no GET allowed for scheduled jobs
  if (req.method !== 'POST') {
    return errorResponse('Method not allowed. Use POST.', req, 405);
  }

  try {
    // SECURITY: Fail-closed authentication
    // Must have valid CRON_SECRET OR service role key
    const cronSecret = Deno.env.get('CRON_SECRET');
    const supabaseServiceKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') || '';
    const authHeader = req.headers.get('Authorization');

    const isCronAuth = verifyCronSecret(req, cronSecret);
    const isServiceRole = isServiceRoleAuth(authHeader, supabaseServiceKey);

    if (!isCronAuth && !isServiceRole) {
      console.error('[scheduled-email-sync] Unauthorized access attempt');
      return errorResponse('Unauthorized: valid CRON_SECRET or service role key required', req, 401);
    }

    // Initialize Supabase client with service role (bypasses RLS)
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

    // Get active users (logged in last 7 days) with Gmail integration
    const sevenDaysAgo = new Date();
    sevenDaysAgo.setDate(sevenDaysAgo.getDate() - 7);

    const { data: activeUsers, error: usersError } = await supabase
      .from('profiles')
      .select(`
        id,
        google_integrations!inner(id, is_active, access_token, refresh_token, expires_at)
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
        message: 'No active users with Gmail integration to sync',
        usersProcessed: 0,
      }, req);
    }

    // Sync emails for each active user
    const results = {
      usersProcessed: 0,
      emailsSynced: 0,
      contactsWithEmails: 0,
      dealTruthUpdates: 0,
      errors: [] as string[],
    };

    for (const user of activeUsers) {
      try {
        // Get user's CRM contacts with emails
        const { data: contacts, error: contactsError } = await supabase
          .from('contacts')
          .select('id, email')
          .eq('owner_id', user.id)
          .not('email', 'is', null);

        if (contactsError) {
          results.errors.push(`User ${user.id}: Failed to fetch contacts - ${contactsError.message}`);
          continue;
        }

        if (!contacts || contacts.length === 0) {
          // Skip users with no CRM contacts
          continue;
        }

        results.contactsWithEmails += contacts.length;

        // Get user's Google integration
        const integration = (user as any).google_integrations;
        if (!integration || !integration.access_token) {
          results.errors.push(`User ${user.id}: No valid Google integration`);
          continue;
        }

        // Check if token needs refresh
        let accessToken = integration.access_token;
        const expiresAt = new Date(integration.expires_at);
        const now = new Date();

        if (now >= expiresAt && integration.refresh_token) {
          try {
            accessToken = await refreshAccessToken(integration.refresh_token, supabase, user.id);
          } catch (refreshError: any) {
            results.errors.push(`User ${user.id}: Token refresh failed - ${refreshError.message}`);
            continue;
          }
        }

        // Fetch emails from Gmail API (last 24 hours only for incremental sync)
        const oneDayAgo = new Date();
        oneDayAgo.setDate(oneDayAgo.getDate() - 1);
        const afterTimestamp = Math.floor(oneDayAgo.getTime() / 1000);

        // Directly call Gmail API (avoiding supabase.functions.invoke auth issues)
        const gmailParams = new URLSearchParams({
          q: `after:${afterTimestamp}`,
          maxResults: '100',
        });

        const gmailListResponse = await fetch(
          `https://gmail.googleapis.com/gmail/v1/users/me/messages?${gmailParams}`,
          {
            headers: {
              'Authorization': `Bearer ${accessToken}`,
            },
          }
        );

        if (!gmailListResponse.ok) {
          const errorData = await gmailListResponse.json().catch(() => ({}));
          results.errors.push(`User ${user.id}: Gmail API error - ${errorData.error?.message || gmailListResponse.statusText}`);
          continue;
        }

        const gmailData = await gmailListResponse.json();
        const messageIds = gmailData.messages || [];

        // Create a set of CRM contact emails for matching
        const crmEmails = new Set(
          contacts
            .map(c => c.email?.toLowerCase().trim())
            .filter((email): email is string => Boolean(email))
        );

        // Process each email and store if it matches a CRM contact
        let emailsStoredForUser = 0;
        
        // Limit to first 20 messages for performance
        for (const msgRef of messageIds.slice(0, 20)) {
          try {
            // Fetch full message details
            const msgResponse = await fetch(
              `https://gmail.googleapis.com/gmail/v1/users/me/messages/${msgRef.id}`,
              {
                headers: {
                  'Authorization': `Bearer ${accessToken}`,
                },
              }
            );

            if (!msgResponse.ok) continue;

            const message = await msgResponse.json();

            // Extract email addresses from headers
            const headers = message.payload?.headers || [];
            const fromHeader = headers.find((h: any) => h.name === 'From');
            const toHeader = headers.find((h: any) => h.name === 'To');
            const subjectHeader = headers.find((h: any) => h.name === 'Subject');
            const dateHeader = headers.find((h: any) => h.name === 'Date');

            // Extract from email
            const fromMatch = fromHeader?.value?.match(/<([^>]+)>/) ||
                              fromHeader?.value?.match(/([\w\.-]+@[\w\.-]+\.\w+)/);
            const fromEmail = fromMatch ? fromMatch[1] : fromHeader?.value;

            // Extract to emails
            const toEmails = toHeader?.value?.match(/[\w\.-]+@[\w\.-]+\.\w+/g) || [];

            // Check if email involves a CRM contact
            const normalizedFrom = fromEmail?.toLowerCase().trim();
            const matchesCRM = (normalizedFrom && crmEmails.has(normalizedFrom)) ||
                               toEmails.some((e: string) => crmEmails.has(e.toLowerCase().trim()));

            if (!matchesCRM) {
              continue; // Skip non-CRM emails
            }

            // Find matching contact
            let contactId = null;
            if (normalizedFrom && crmEmails.has(normalizedFrom)) {
              const contact = contacts.find(c => c.email?.toLowerCase().trim() === normalizedFrom);
              contactId = contact?.id || null;
            } else {
              // Check recipients
              for (const toEmail of toEmails) {
                const normalized = toEmail.toLowerCase().trim();
                if (crmEmails.has(normalized)) {
                  const contact = contacts.find(c => c.email?.toLowerCase().trim() === normalized);
                  if (contact) {
                    contactId = contact.id;
                    break;
                  }
                }
              }
            }

            // Store as communication event
            const { error: insertError } = await supabase
              .from('communication_events')
              .upsert({
                user_id: user.id,
                contact_id: contactId,
                event_type: 'email_received',
                communication_date: dateHeader ? new Date(dateHeader.value).toISOString() : new Date().toISOString(),
                subject: subjectHeader?.value || '',
                summary: `Email: ${subjectHeader?.value || '(no subject)'}`,
                external_id: message.id,
                metadata: {
                  from: fromEmail,
                  to: toEmails,
                  gmail_message_id: message.id,
                  synced_at: new Date().toISOString(),
                },
              }, {
                onConflict: 'external_id',
              });

            if (!insertError) {
              emailsStoredForUser++;

              // Process email for Deal Truth extraction
              try {
                const dealTruthResult = await processEmailForDealTruth(
                  supabase,
                  user.id,
                  message.id,
                  fromEmail || '',
                  toEmails,
                  subjectHeader?.value || ''
                );
                if (dealTruthResult.processed && dealTruthResult.updates.length > 0) {
                  results.dealTruthUpdates += dealTruthResult.updates.length;
                }
              } catch (dealTruthError) {
                console.error(`[scheduled-email-sync] Deal Truth extraction error:`, dealTruthError);
                // Don't fail email sync for Deal Truth errors
              }
            }
          } catch (emailError: any) {
            // Continue processing other emails even if one fails
            console.error(`[scheduled-email-sync] Error processing email ${msgRef.id}:`, emailError);
          }
        }

        results.emailsSynced += emailsStoredForUser;
        results.usersProcessed++;
      } catch (error: any) {
        results.errors.push(`User ${user.id}: ${error.message}`);
      }
    }

    return jsonResponse({
      success: results.errors.length === 0,
      ...results,
      timestamp: new Date().toISOString(),
    }, req);

  } catch (error: any) {
    console.error('[scheduled-email-sync] Error:', error);
    return errorResponse(error.message || 'Unknown error', req, 500);
  }
});

/**
 * Refresh Google access token
 */
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
