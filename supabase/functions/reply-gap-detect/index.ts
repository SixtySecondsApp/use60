// supabase/functions/reply-gap-detect/index.ts
// WS-019: Reply Gap Detection
//
// Detects sent emails without replies within configured time windows.
// Can be invoked directly or by the background job dispatcher.

import { serve } from 'https://deno.land/std@0.168.0/http/server.ts';
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2.43.4';
import { getCorsHeaders, handleCorsPreflightRequest, jsonResponse, errorResponse } from '../_shared/corsHelper.ts';
import { authenticateRequest } from '../_shared/edgeAuth.ts';

const SUPABASE_URL = Deno.env.get('SUPABASE_URL')!;
const SUPABASE_SERVICE_ROLE_KEY = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;

serve(async (req) => {
  const preflightResponse = handleCorsPreflightRequest(req);
  if (preflightResponse) return preflightResponse;
  const corsHeaders = getCorsHeaders(req);

  try {
    const supabase = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY, {
      auth: { persistSession: false, autoRefreshToken: false },
    });

    const { userId } = await authenticateRequest(req, supabase);
    const body = await req.json().catch(() => ({}));
    const targetUserId = body.user_id || userId;

    // Get user's email addresses
    const userEmails: string[] = [];
    const { data: google } = await supabase
      .from('google_integrations')
      .select('email')
      .eq('user_id', targetUserId)
      .eq('is_active', true)
      .maybeSingle();
    if (google?.email) userEmails.push(google.email);

    const { data: microsoft } = await supabase
      .from('microsoft_integrations')
      .select('email')
      .eq('user_id', targetUserId)
      .eq('is_active', true)
      .maybeSingle();
    if (microsoft?.email) userEmails.push(microsoft.email);

    if (userEmails.length === 0) {
      return jsonResponse({ gaps: [], message: 'No connected email accounts' }, corsHeaders);
    }

    // Find sent emails in last 7 days
    const sevenDaysAgo = new Date(Date.now() - 7 * 24 * 60 * 60 * 1000).toISOString();

    const { data: sentEmails } = await supabase
      .from('email_messages')
      .select('id, thread_id, provider, from_email, to_emails, received_at')
      .eq('user_id', targetUserId)
      .in('from_email', userEmails)
      .gte('received_at', sevenDaysAgo)
      .order('received_at', { ascending: false })
      .limit(200);

    if (!sentEmails || sentEmails.length === 0) {
      return jsonResponse({ gaps: [], checked: 0 }, corsHeaders);
    }

    const gaps: Array<{
      threadId: string;
      contactEmail: string;
      sentAt: string;
      gapHours: number;
      urgency: string;
    }> = [];

    for (const sent of sentEmails) {
      // Check for reply in same thread
      const { data: replies } = await supabase
        .from('email_messages')
        .select('id')
        .eq('user_id', targetUserId)
        .eq('thread_id', sent.thread_id)
        .not('from_email', 'in', `(${userEmails.join(',')})`)
        .gt('received_at', sent.received_at)
        .limit(1);

      if (!replies || replies.length === 0) {
        const gapHours = Math.floor((Date.now() - new Date(sent.received_at).getTime()) / (1000 * 60 * 60));
        const contactEmail = (sent.to_emails || [])[0] || '';

        // Skip very recent emails (< 24h)
        if (gapHours < 24) continue;

        let urgency: 'low' | 'medium' | 'high' = 'low';
        if (gapHours >= 72) urgency = 'high';
        else if (gapHours >= 48) urgency = 'medium';

        // Check if contact has a deal
        let dealId: string | null = null;
        const { data: contact } = await supabase
          .from('contacts')
          .select('id')
          .eq('email', contactEmail)
          .eq('owner_id', targetUserId)
          .maybeSingle();

        if (contact) {
          const { data: deal } = await supabase
            .from('deals')
            .select('id')
            .eq('primary_contact_id', contact.id)
            .eq('owner_id', targetUserId)
            .not('stage_id', 'is', null)
            .maybeSingle();
          if (deal) {
            dealId = deal.id;
            if (urgency !== 'high') urgency = 'medium'; // Bump if has deal
          }
        }

        // Upsert gap
        await supabase
          .from('reply_gaps')
          .upsert(
            {
              user_id: targetUserId,
              provider: sent.provider,
              thread_id: sent.thread_id,
              contact_email: contactEmail,
              sent_at: sent.received_at,
              gap_hours: gapHours,
              urgency,
              deal_id: dealId,
              resolved: false,
            },
            { onConflict: 'user_id,thread_id' }
          );

        gaps.push({ threadId: sent.thread_id, contactEmail, sentAt: sent.received_at, gapHours, urgency });
      } else {
        // Reply found — resolve gap
        await supabase
          .from('reply_gaps')
          .update({ resolved: true })
          .eq('user_id', targetUserId)
          .eq('thread_id', sent.thread_id);
      }
    }

    return jsonResponse({
      gaps,
      checked: sentEmails.length,
      newGaps: gaps.length,
    }, corsHeaders);
  } catch (error) {
    console.error('[reply-gap-detect] Error:', error);
    return errorResponse((error as Error).message, 500, corsHeaders);
  }
});
