import { serve } from 'https://deno.land/std@0.168.0/http/server.ts';
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2.43.4';
import {
  getCorsHeaders,
  handleCorsPreflightRequest,
  jsonResponse,
  errorResponse,
} from '../_shared/corsHelper.ts';

serve(async (req) => {
  const preflightResponse = handleCorsPreflightRequest(req);
  if (preflightResponse) return preflightResponse;

  try {
    // Validate caller — only service role (cron) or internal calls allowed
    const authHeader = req.headers.get('Authorization');
    const supabaseUrl = Deno.env.get('SUPABASE_URL')!;
    const supabaseServiceKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;
    const token = authHeader?.replace('Bearer ', '');
    if (token !== supabaseServiceKey) {
      return errorResponse('Unauthorized — service role only', req, 401);
    }

    const supabase = createClient(supabaseUrl, supabaseServiceKey);
    const signalProcessorUrl = `${supabaseUrl}/functions/v1/task-signal-processor`;
    const results: Record<string, number> = {};

    // Helper: fire signal to task-signal-processor
    async function fireSignal(signalType: string, userId: string, data: Record<string, unknown>) {
      // Check for duplicate: has this signal been fired for same entity in last 7 days?
      const { data: existing } = await supabase
        .from('tasks')
        .select('id')
        .eq('source', signalType === 'close_date_approaching' ? 'deal_signal' :
              signalType === 'proposal_stale' ? 'deal_signal' :
              signalType === 'thread_dormant' ? 'email_detected' : 'meeting_transcript')
        .eq('trigger_event', signalType)
        .eq('assigned_to', userId)
        .gte('created_at', new Date(Date.now() - 7 * 24 * 60 * 60 * 1000).toISOString())
        .maybeSingle();

      if (existing) return; // Already fired recently

      await fetch(signalProcessorUrl, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${supabaseServiceKey}`,
        },
        body: JSON.stringify({ signal_type: signalType, data, user_id: userId }),
      });

      results[signalType] = (results[signalType] || 0) + 1;
    }

    // 1. Close date approaching (deals closing within 7 days)
    const sevenDaysFromNow = new Date(Date.now() + 7 * 24 * 60 * 60 * 1000).toISOString();
    const { data: approachingDeals } = await supabase
      .from('deals')
      .select('id, name, close_date, owner_id, contact_id, company_id')
      .lte('close_date', sevenDaysFromNow)
      .gte('close_date', new Date().toISOString())
      .not('stage', 'in', '("won","lost","closed_won","closed_lost")');

    if (approachingDeals) {
      for (const deal of approachingDeals) {
        if (!deal.owner_id) continue;
        const daysUntil = Math.ceil((new Date(deal.close_date).getTime() - Date.now()) / (24 * 60 * 60 * 1000));
        await fireSignal('close_date_approaching', deal.owner_id, {
          deal_id: deal.id,
          deal_name: deal.name,
          days_until_close: daysUntil,
          contact_id: deal.contact_id,
          company_id: deal.company_id,
        });
      }
    }

    // 2. Proposal stale (tasks with source proposal, >3 days, still pending)
    const threeDaysAgo = new Date(Date.now() - 3 * 24 * 60 * 60 * 1000).toISOString();
    const { data: staleProposals } = await supabase
      .from('tasks')
      .select('id, title, assigned_to, deal_id, contact_id, company_id, created_at')
      .eq('task_type', 'proposal')
      .in('status', ['pending', 'pending_review', 'approved'])
      .lte('created_at', threeDaysAgo);

    if (staleProposals) {
      for (const proposal of staleProposals) {
        if (!proposal.assigned_to) continue;
        const daysSince = Math.ceil((Date.now() - new Date(proposal.created_at).getTime()) / (24 * 60 * 60 * 1000));
        await fireSignal('proposal_stale', proposal.assigned_to, {
          proposal_title: proposal.title,
          days_since_sent: daysSince,
          deal_id: proposal.deal_id,
          contact_id: proposal.contact_id,
          company_id: proposal.company_id,
        });
      }
    }

    // 3. Thread dormant (deals with last activity >5 days ago)
    const fiveDaysAgo = new Date(Date.now() - 5 * 24 * 60 * 60 * 1000).toISOString();
    const { data: dormantDeals } = await supabase
      .from('deals')
      .select('id, name, owner_id, contact_id, company_id, updated_at')
      .not('stage', 'in', '("won","lost","closed_won","closed_lost")')
      .lte('updated_at', fiveDaysAgo);

    if (dormantDeals) {
      for (const deal of dormantDeals) {
        if (!deal.owner_id) continue;
        const daysDormant = Math.ceil((Date.now() - new Date(deal.updated_at).getTime()) / (24 * 60 * 60 * 1000));
        // Get contact name for better task title
        let contactName: string | null = null;
        if (deal.contact_id) {
          const { data: contact } = await supabase
            .from('contacts')
            .select('first_name, last_name')
            .eq('id', deal.contact_id)
            .maybeSingle();
          if (contact) contactName = `${contact.first_name || ''} ${contact.last_name || ''}`.trim();
        }
        await fireSignal('thread_dormant', deal.owner_id, {
          deal_id: deal.id,
          deal_name: deal.name,
          days_dormant: daysDormant,
          contact_id: deal.contact_id,
          contact_name: contactName,
          company_id: deal.company_id,
        });
      }
    }

    // 4. Buyer commitment due (action items past due date)
    const { data: overdueItems } = await supabase
      .from('tasks')
      .select('id, title, description, assigned_to, deal_id, contact_id, meeting_id, contact_name, due_date')
      .eq('task_type', 'action_item')
      .eq('source', 'meeting_transcript')
      .in('status', ['pending', 'pending_review'])
      .lte('due_date', new Date().toISOString())
      .not('due_date', 'is', null);

    if (overdueItems) {
      for (const item of overdueItems) {
        if (!item.assigned_to) continue;
        await fireSignal('buyer_commitment_due', item.assigned_to, {
          commitment: item.title,
          contact_name: item.contact_name,
          deal_id: item.deal_id,
          contact_id: item.contact_id,
          meeting_id: item.meeting_id,
        });
      }
    }

    return jsonResponse({
      success: true,
      signals_fired: results,
      scanned_at: new Date().toISOString(),
    }, req);

  } catch (error) {
    console.error('Error in proactive-signal-scanner:', error);
    return errorResponse(
      error instanceof Error ? error.message : 'Internal server error',
      req,
      500
    );
  }
});
