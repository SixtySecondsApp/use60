import { serve } from 'https://deno.land/std@0.168.0/http/server.ts';
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2.43.4';
import {
  getCorsHeaders,
  handleCorsPreflightRequest,
  jsonResponse,
  errorResponse,
} from '../_shared/corsHelper.ts';

/**
 * Relationship Milestone Scanner
 *
 * Daily cron that scans for due relationship milestones and fires signals
 * to task-signal-processor to create proactive outreach tasks.
 *
 * Milestone types and their windows:
 * - renewal_reminder: 60 days before target_date
 * - onboarding_checkin: 7/14/30 days after target_date (deal close)
 * - qbr_due: 90 days after target_date (last QBR)
 * - trial_ending: day 7 and day 12 of trial (target_date = trial end)
 * - contract_expiring: 30 days before target_date
 */

interface MilestoneRow {
  id: string;
  org_id: string;
  contact_id: string | null;
  deal_id: string | null;
  milestone_type: string;
  target_date: string;
  status: string;
  metadata: Record<string, unknown>;
}

serve(async (req) => {
  const preflightResponse = handleCorsPreflightRequest(req);
  if (preflightResponse) return preflightResponse;

  try {
    // Validate caller — only service role (cron) allowed
    const authHeader = req.headers.get('Authorization');
    const supabaseUrl = Deno.env.get('SUPABASE_URL')!;
    const supabaseServiceKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;
    const token = authHeader?.replace('Bearer ', '');
    if (token !== supabaseServiceKey) {
      return errorResponse('Unauthorized — service role only', req, 401);
    }

    const supabase = createClient(supabaseUrl, supabaseServiceKey);
    const signalProcessorUrl = `${supabaseUrl}/functions/v1/task-signal-processor`;
    const now = new Date();
    const results: Record<string, number> = {};

    // Helper: fire signal and mark milestone as signal_sent
    async function processMilestone(
      milestone: MilestoneRow,
      userId: string,
      signalType: string,
      signalData: Record<string, unknown>
    ) {
      try {
        await fetch(signalProcessorUrl, {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            Authorization: `Bearer ${supabaseServiceKey}`,
          },
          body: JSON.stringify({
            signal_type: signalType,
            user_id: userId,
            data: signalData,
          }),
        });

        // Mark milestone as signal_sent
        await supabase
          .from('relationship_milestones')
          .update({
            status: 'signal_sent',
            metadata: {
              ...milestone.metadata,
              signal_sent_at: now.toISOString(),
              signal_type: signalType,
            },
            updated_at: now.toISOString(),
          })
          .eq('id', milestone.id);

        results[milestone.milestone_type] = (results[milestone.milestone_type] || 0) + 1;
      } catch (err) {
        console.error(`Failed to process milestone ${milestone.id}:`, err);
      }
    }

    // Helper: get deal owner for a milestone
    async function getDealOwner(dealId: string): Promise<string | null> {
      const { data } = await supabase
        .from('deals')
        .select('owner_id')
        .eq('id', dealId)
        .maybeSingle();
      return data?.owner_id || null;
    }

    // Helper: get contact owner
    async function getContactOwner(contactId: string): Promise<string | null> {
      const { data } = await supabase
        .from('contacts')
        .select('owner_id')
        .eq('id', contactId)
        .maybeSingle();
      return data?.owner_id || null;
    }

    // Fetch all pending milestones that need scanning
    // We look at milestones whose target_date falls within their relevant window
    const { data: pendingMilestones, error: fetchError } = await supabase
      .from('relationship_milestones')
      .select('id, org_id, contact_id, deal_id, milestone_type, target_date, status, metadata')
      .eq('status', 'pending')
      .order('target_date', { ascending: true })
      .limit(200);

    if (fetchError) {
      throw new Error(`Failed to fetch milestones: ${fetchError.message}`);
    }

    if (!pendingMilestones || pendingMilestones.length === 0) {
      return jsonResponse({
        success: true,
        message: 'No pending milestones to process',
        scanned_at: now.toISOString(),
      }, req);
    }

    for (const milestone of pendingMilestones) {
      const targetDate = new Date(milestone.target_date);
      const daysUntilTarget = Math.ceil((targetDate.getTime() - now.getTime()) / (24 * 60 * 60 * 1000));
      const daysSinceTarget = Math.ceil((now.getTime() - targetDate.getTime()) / (24 * 60 * 60 * 1000));

      // Determine the owner to assign the task to
      let userId: string | null = null;
      if (milestone.deal_id) {
        userId = await getDealOwner(milestone.deal_id);
      }
      if (!userId && milestone.contact_id) {
        userId = await getContactOwner(milestone.contact_id);
      }
      if (!userId) continue; // Skip if no owner found

      // Get contact name for better task titles
      let contactName: string | null = null;
      if (milestone.contact_id) {
        const { data: contact } = await supabase
          .from('contacts')
          .select('first_name, last_name')
          .eq('id', milestone.contact_id)
          .maybeSingle();
        if (contact) contactName = `${contact.first_name || ''} ${contact.last_name || ''}`.trim();
      }

      // Get deal name for context
      let dealName: string | null = null;
      if (milestone.deal_id) {
        const { data: deal } = await supabase
          .from('deals')
          .select('name')
          .eq('id', milestone.deal_id)
          .maybeSingle();
        if (deal) dealName = deal.name;
      }

      switch (milestone.milestone_type) {
        case 'renewal_reminder':
          // Fire 60 days before target_date
          if (daysUntilTarget <= 60 && daysUntilTarget > 0) {
            await processMilestone(milestone, userId, 'close_date_approaching', {
              deal_id: milestone.deal_id,
              deal_name: dealName,
              contact_id: milestone.contact_id,
              contact_name: contactName,
              days_until_close: daysUntilTarget,
              milestone_type: 'renewal_reminder',
            });
          }
          break;

        case 'onboarding_checkin':
          // Fire at 7, 14, 30 days after target_date (deal close)
          if (daysSinceTarget === 7 || daysSinceTarget === 14 || daysSinceTarget === 30) {
            await processMilestone(milestone, userId, 'buyer_commitment_due', {
              deal_id: milestone.deal_id,
              deal_name: dealName,
              contact_id: milestone.contact_id,
              contact_name: contactName,
              commitment: `${daysSinceTarget}-day onboarding check-in`,
              milestone_type: 'onboarding_checkin',
              days_since_close: daysSinceTarget,
            });
          }
          break;

        case 'qbr_due':
          // Fire 90 days after target_date (last QBR)
          if (daysSinceTarget >= 90) {
            await processMilestone(milestone, userId, 'close_date_approaching', {
              deal_id: milestone.deal_id,
              deal_name: dealName,
              contact_id: milestone.contact_id,
              contact_name: contactName,
              days_until_close: 0,
              milestone_type: 'qbr_due',
              days_since_last_qbr: daysSinceTarget,
            });
          }
          break;

        case 'trial_ending':
          // Fire at day 7 and day 12 of trial (target_date = trial end)
          // Trial typically 14 days, so day 7 = 7 days before end, day 12 = 2 days before
          if (daysUntilTarget === 7 || daysUntilTarget === 2) {
            await processMilestone(milestone, userId, 'close_date_approaching', {
              deal_id: milestone.deal_id,
              deal_name: dealName,
              contact_id: milestone.contact_id,
              contact_name: contactName,
              days_until_close: daysUntilTarget,
              milestone_type: 'trial_ending',
              trial_day: daysUntilTarget === 7 ? 7 : 12,
            });
          }
          break;

        case 'contract_expiring':
          // Fire 30 days before target_date
          if (daysUntilTarget <= 30 && daysUntilTarget > 0) {
            await processMilestone(milestone, userId, 'close_date_approaching', {
              deal_id: milestone.deal_id,
              deal_name: dealName,
              contact_id: milestone.contact_id,
              contact_name: contactName,
              days_until_close: daysUntilTarget,
              milestone_type: 'contract_expiring',
            });
          }
          break;
      }
    }

    return jsonResponse({
      success: true,
      milestones_scanned: pendingMilestones.length,
      signals_fired: results,
      scanned_at: now.toISOString(),
    }, req);
  } catch (error) {
    console.error('Error in relationship-milestone-scanner:', error);
    return errorResponse(
      error instanceof Error ? error.message : 'Internal server error',
      req,
      500
    );
  }
});
