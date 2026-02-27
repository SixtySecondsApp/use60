/**
 * EOD Overnight Plan Generator (EOD-005)
 *
 * Determines what the agent will do overnight for a given user and
 * surfaces that plan at end-of-day so the rep knows what to expect
 * in their morning briefing.
 *
 * Plan sources:
 *   - Enrichment queue (contacts pending background enrichment)
 *   - Reengagement watchlist (deals due for signal monitoring)
 *   - Scheduled campaign processing (campaign sequences running tonight)
 *   - Tomorrow's meeting attendees needing research
 *
 * Returns a structured list of planned overnight items with estimated
 * completion, linked to the morning briefing delivery.
 */

import type { SkillAdapter, SequenceState, SequenceStep, StepResult } from '../types.ts';
import { getServiceClient } from './contextEnrichment.ts';
import type { SupabaseClient } from 'jsr:@supabase/supabase-js@2.43.4';

// =============================================================================
// Types
// =============================================================================

export type OvernightPlanItemType =
  | 'enrichment'
  | 'reengagement_monitoring'
  | 'campaign_processing'
  | 'meeting_research'
  | 'pipeline_snapshot'
  | 'signal_scan';

export interface OvernightPlanItem {
  type: OvernightPlanItemType;
  label: string;
  description: string;
  count: number;
  estimated_completion: string; // ISO timestamp (estimated)
  deal_id: string | null;
  contact_ids: string[];
  will_appear_in_briefing: boolean;
}

export interface OvernightPlanResult {
  plan_items: OvernightPlanItem[];
  total_items: number;
  enrichment_count: number;
  monitoring_count: number;
  research_count: number;
  morning_briefing_preview: string;
}

// =============================================================================
// generateOvernightPlan
// =============================================================================

/**
 * Determines what the agent will do overnight and returns a structured plan.
 *
 * @param supabase   Service-role Supabase client
 * @param userId     User ID to generate the plan for
 * @param orgId      Organisation context
 */
export async function generateOvernightPlan(
  supabase: SupabaseClient,
  userId: string,
  orgId: string,
): Promise<OvernightPlanResult> {
  const planItems: OvernightPlanItem[] = [];
  const now = new Date();

  // Overnight runs roughly 8 PM–6 AM: estimated completion is 7 AM local
  // (stored as UTC since we don't have timezone access here)
  const tomorrowMorning = new Date(now);
  tomorrowMorning.setDate(tomorrowMorning.getDate() + 1);
  tomorrowMorning.setUTCHours(7, 0, 0, 0);
  const morningIso = tomorrowMorning.toISOString();

  // Tomorrow's date boundaries for meeting research
  const tomorrowStart = new Date(now);
  tomorrowStart.setDate(tomorrowStart.getDate() + 1);
  tomorrowStart.setHours(0, 0, 0, 0);
  const tomorrowEnd = new Date(tomorrowStart);
  tomorrowEnd.setHours(23, 59, 59, 999);

  let enrichmentCount = 0;
  let monitoringCount = 0;
  let researchCount = 0;

  // -------------------------------------------------------------------------
  // 1. Enrichment queue: contacts awaiting background enrichment
  //    Sourced from activities with type='enrichment_queued' or contacts with
  //    enrichment_status='pending' (org-scoped, not user-scoped)
  // -------------------------------------------------------------------------
  const { count: pendingEnrichments, error: enrichErr } = await supabase
    .from('contacts')
    .select('id', { count: 'exact', head: true })
    .eq('owner_id', userId)
    .eq('enrichment_status', 'pending');

  if (!enrichErr && (pendingEnrichments ?? 0) > 0) {
    enrichmentCount = pendingEnrichments ?? 0;
    planItems.push({
      type: 'enrichment',
      label: 'Contact enrichment',
      description: `${enrichmentCount} contact${enrichmentCount !== 1 ? 's' : ''} queued for overnight enrichment (LinkedIn, company data, email verification)`,
      count: enrichmentCount,
      estimated_completion: morningIso,
      deal_id: null,
      contact_ids: [],
      will_appear_in_briefing: true,
    });
  }

  // -------------------------------------------------------------------------
  // 2. Reengagement watchlist: active deals due for signal monitoring
  //    Checks reengagement_watchlist for active entries not in cooldown
  // -------------------------------------------------------------------------
  const { data: watchlistEntries, error: watchlistErr } = await supabase
    .from('reengagement_watchlist')
    .select('deal_id, attempt_count, max_attempts, cooldown_until')
    .eq('org_id', orgId)
    .eq('status', 'active')
    .eq('unsubscribed', false)
    .or(`cooldown_until.is.null,cooldown_until.lt.${now.toISOString()}`)
    .limit(50);

  if (!watchlistErr && (watchlistEntries || []).length > 0) {
    // Filter to deals the user owns
    const watchlistDealIds = (watchlistEntries || []).map((w: any) => w.deal_id);
    const { data: ownedDeals } = await supabase
      .from('deals')
      .select('id, name')
      .in('id', watchlistDealIds)
      .eq('owner_id', userId);

    monitoringCount = (ownedDeals || []).length;

    if (monitoringCount > 0) {
      planItems.push({
        type: 'reengagement_monitoring',
        label: 'Signal monitoring',
        description: `Scanning ${monitoringCount} stalled deal${monitoringCount !== 1 ? 's' : ''} for buying signals (job changes, funding, company news)`,
        count: monitoringCount,
        estimated_completion: morningIso,
        deal_id: null,
        contact_ids: [],
        will_appear_in_briefing: true,
      });
    }
  } else if (watchlistErr) {
    console.warn('[eod-overnight] Failed to fetch reengagement watchlist:', watchlistErr.message);
  }

  // -------------------------------------------------------------------------
  // 3. Signal scan: deal_signal_temperature rows needing refresh
  //    (temperature > 0 and last_signal older than 24h = due for rescan)
  // -------------------------------------------------------------------------
  const oneDayAgo = new Date(now);
  oneDayAgo.setHours(oneDayAgo.getHours() - 24);

  const { count: signalScanCount, error: signalErr } = await supabase
    .from('deal_signal_temperature')
    .select('id', { count: 'exact', head: true })
    .eq('org_id', orgId)
    .gt('temperature', 0.3)
    .or(`last_signal.is.null,last_signal.lt.${oneDayAgo.toISOString()}`);

  if (!signalErr && (signalScanCount ?? 0) > 0) {
    planItems.push({
      type: 'signal_scan',
      label: 'Deal signal refresh',
      description: `Refreshing signal temperature for ${signalScanCount} warm deal${signalScanCount !== 1 ? 's' : ''} to catch any activity since yesterday`,
      count: signalScanCount ?? 0,
      estimated_completion: morningIso,
      deal_id: null,
      contact_ids: [],
      will_appear_in_briefing: false,
    });
  }

  // -------------------------------------------------------------------------
  // 4. Meeting research: tomorrow's meetings needing attendee research
  //    (calendar_events tomorrow with attendees_count > 1 and no existing brief)
  // -------------------------------------------------------------------------
  const { data: tomorrowEvents, error: eventErr } = await supabase
    .from('calendar_events')
    .select('id, title, attendees, deal_id')
    .eq('user_id', userId)
    .gte('start_time', tomorrowStart.toISOString())
    .lte('start_time', tomorrowEnd.toISOString())
    .gt('attendees_count', 1)
    .not('status', 'eq', 'cancelled')
    .limit(10);

  if (eventErr) {
    console.warn('[eod-overnight] Failed to fetch tomorrow events:', eventErr.message);
  } else {
    // Count events that don't already have a brief
    const eventIds = (tomorrowEvents || []).map((e: any) => e.id);
    const briefedEventIds = new Set<string>();

    if (eventIds.length > 0) {
      const { data: existingBriefs } = await supabase
        .from('activities')
        .select('metadata')
        .eq('type', 'meeting_brief')
        .in('metadata->>calendar_event_id', eventIds);

      for (const brief of existingBriefs || []) {
        const meta = brief.metadata as Record<string, unknown>;
        if (meta?.calendar_event_id) {
          briefedEventIds.add(meta.calendar_event_id as string);
        }
      }
    }

    const unpreppedEvents = (tomorrowEvents || []).filter((e: any) => !briefedEventIds.has(e.id));
    researchCount = unpreppedEvents.length;

    if (researchCount > 0) {
      // Collect unique contact IDs from attendees across unprepped events
      const researchContactIds: string[] = [];
      for (const event of unpreppedEvents) {
        const attendees = (event.attendees as any[]) || [];
        for (const attendee of attendees) {
          if (attendee.contact_id && !researchContactIds.includes(attendee.contact_id)) {
            researchContactIds.push(attendee.contact_id);
          }
        }
      }

      planItems.push({
        type: 'meeting_research',
        label: 'Meeting prep research',
        description: `Preparing briefings for ${researchCount} meeting${researchCount !== 1 ? 's' : ''} tomorrow — attendee enrichment, deal context, and news research`,
        count: researchCount,
        estimated_completion: morningIso,
        deal_id: null,
        contact_ids: researchContactIds.slice(0, 10),
        will_appear_in_briefing: true,
      });
    }
  }

  // -------------------------------------------------------------------------
  // 5. Pipeline snapshot: always queued for overnight cron
  // -------------------------------------------------------------------------
  planItems.push({
    type: 'pipeline_snapshot',
    label: 'Pipeline snapshot',
    description: 'Taking a pipeline snapshot to enable delta tracking and trend analysis in your morning briefing',
    count: 1,
    estimated_completion: morningIso,
    deal_id: null,
    contact_ids: [],
    will_appear_in_briefing: true,
  });

  // -------------------------------------------------------------------------
  // 6. Build morning briefing preview message
  // -------------------------------------------------------------------------
  const briefingParts: string[] = [];
  if (enrichmentCount > 0) briefingParts.push(`${enrichmentCount} enrichment${enrichmentCount !== 1 ? 's' : ''}`);
  if (monitoringCount > 0) briefingParts.push(`signal scan on ${monitoringCount} stalled deal${monitoringCount !== 1 ? 's' : ''}`);
  if (researchCount > 0) briefingParts.push(`prep for ${researchCount} meeting${researchCount !== 1 ? 's' : ''}`);

  const morningBriefingPreview = briefingParts.length > 0
    ? `Results from tonight's work — ${briefingParts.join(', ')} — will appear in your morning briefing.`
    : 'Your pipeline snapshot will be ready in your morning briefing.';

  return {
    plan_items: planItems,
    total_items: planItems.length,
    enrichment_count: enrichmentCount,
    monitoring_count: monitoringCount,
    research_count: researchCount,
    morning_briefing_preview: morningBriefingPreview,
  };
}

// =============================================================================
// Skill Adapter
// =============================================================================

export const eodOvernightPlanAdapter: SkillAdapter = {
  name: 'eod-overnight-plan',
  async execute(state: SequenceState, _step: SequenceStep): Promise<StepResult> {
    const start = Date.now();
    try {
      console.log('[eod-overnight-plan] Generating overnight plan...');
      const supabase = getServiceClient();
      const userId = state.event.user_id;
      const orgId = state.event.org_id;

      if (!userId || !orgId) {
        throw new Error('user_id and org_id are required in event payload');
      }

      const result = await generateOvernightPlan(supabase, userId, orgId);

      console.log(
        `[eod-overnight-plan] Plan has ${result.total_items} items ` +
        `(${result.enrichment_count} enrichments, ` +
        `${result.monitoring_count} monitoring, ` +
        `${result.research_count} research)`
      );

      return { success: true, output: result, duration_ms: Date.now() - start };
    } catch (err) {
      console.error('[eod-overnight-plan] Error:', err);
      return { success: false, error: String(err), duration_ms: Date.now() - start };
    }
  },
};
