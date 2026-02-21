/**
 * Overnight Work Summary Tracker (BRF-006)
 *
 * Queries multiple sources to surface work completed overnight (between
 * end of business yesterday and start of business today). Used by the
 * enhanced morning briefing to give reps awareness of automated activity
 * and inbound signals that happened while they were offline.
 *
 * Sources:
 *   - activities table (enrichments, email opens, logged calls)
 *   - deal_signal_temperature (new or elevated signals)
 *   - (future) campaign replies, LinkedIn notifications
 *
 * Returns a structured list of overnight events sorted by recency.
 */

import type { SkillAdapter, SequenceState, SequenceStep, StepResult } from '../types.ts';
import { getServiceClient } from './contextEnrichment.ts';
import type { SupabaseClient } from 'jsr:@supabase/supabase-js@2';

// =============================================================================
// Types
// =============================================================================

export type OvernightEventType =
  | 'enrichment_completed'
  | 'email_open'
  | 'email_reply'
  | 'signal_elevated'
  | 'signal_new'
  | 'campaign_reply'
  | 'deal_stage_change'
  | 'task_completed';

export interface OvernightEvent {
  type: OvernightEventType;
  description: string;
  timestamp: string;     // ISO 8601
  deal_id: string | null;
  deal_name: string | null;
  contact_name: string | null;
  severity: 'info' | 'positive' | 'attention';
  metadata: Record<string, unknown>;
}

export interface OvernightSummaryResult {
  events: OvernightEvent[];
  total_count: number;
  since_timestamp: string;
  high_attention_count: number;
  positive_count: number;
}

// =============================================================================
// Core function: getOvernightSummary
// =============================================================================

/**
 * Fetch and categorise work completed overnight for a given user.
 *
 * @param supabase          Service-role Supabase client
 * @param userId            User to fetch summary for
 * @param orgId             Organisation context
 * @param sinceTimestamp    ISO timestamp to query from (defaults to 7 PM yesterday)
 */
export async function getOvernightSummary(
  supabase: SupabaseClient,
  userId: string,
  orgId: string,
  sinceTimestamp?: string
): Promise<OvernightSummaryResult> {
  // Default to 7 PM yesterday in UTC (covers US overnight)
  const since = sinceTimestamp ?? getPreviousEveningTimestamp();
  const events: OvernightEvent[] = [];

  // -------------------------------------------------------------------------
  // 1. Activities: enrichments, email opens, logged calls (activities table)
  // -------------------------------------------------------------------------
  const { data: activities, error: activitiesError } = await supabase
    .from('activities')
    .select('id, type, description, created_at, deal_id, contact_id, metadata')
    .eq('user_id', userId)
    .gte('created_at', since)
    .in('type', ['enrichment', 'email_open', 'email_reply', 'call_logged', 'task_completed'])
    .order('created_at', { ascending: false })
    .limit(50);

  if (activitiesError) {
    console.warn('[overnight-summary] Failed to fetch activities:', activitiesError.message);
  } else {
    // Batch-fetch deal names for all deal_ids referenced
    const dealIds = [...new Set((activities || []).map((a: any) => a.deal_id).filter(Boolean))];
    const dealIdToName: Record<string, string> = {};
    if (dealIds.length > 0) {
      const { data: deals } = await supabase
        .from('deals')
        .select('id, name')
        .in('id', dealIds);
      for (const d of deals || []) {
        dealIdToName[d.id] = d.name;
      }
    }

    // Batch-fetch contact names
    const contactIds = [...new Set((activities || []).map((a: any) => a.contact_id).filter(Boolean))];
    const contactIdToName: Record<string, string> = {};
    if (contactIds.length > 0) {
      const { data: contacts } = await supabase
        .from('contacts')
        .select('id, first_name, last_name, full_name')
        .in('id', contactIds);
      for (const c of contacts || []) {
        contactIdToName[c.id] = c.full_name ||
          [c.first_name, c.last_name].filter(Boolean).join(' ');
      }
    }

    for (const activity of activities || []) {
      const dealName = activity.deal_id ? dealIdToName[activity.deal_id] : null;
      const contactName = activity.contact_id ? contactIdToName[activity.contact_id] : null;

      const eventType = mapActivityTypeToOvernightType(activity.type);
      if (!eventType) continue;

      events.push({
        type: eventType,
        description: activity.description || buildActivityDescription(eventType, dealName, contactName),
        timestamp: activity.created_at,
        deal_id: activity.deal_id || null,
        deal_name: dealName,
        contact_name: contactName,
        severity: activitySeverity(eventType),
        metadata: (activity.metadata as Record<string, unknown>) || {},
      });
    }
  }

  // -------------------------------------------------------------------------
  // 2. deal_signal_temperature: new or elevated signals since overnight
  // -------------------------------------------------------------------------
  const { data: signalChanges, error: signalsError } = await supabase
    .from('deal_signal_temperature')
    .select('id, deal_id, signal_type, temperature, detected_at, expires_at, metadata')
    .gte('detected_at', since)
    .order('detected_at', { ascending: false })
    .limit(20);

  if (signalsError) {
    console.warn('[overnight-summary] Failed to fetch signal temperature:', signalsError.message);
  } else {
    // Fetch deal names for signal records (may overlap with activities)
    const signalDealIds = [...new Set((signalChanges || []).map((s: any) => s.deal_id).filter(Boolean))];
    const missingIds = signalDealIds.filter(id => !(id in Object.keys({})));

    if (signalDealIds.length > 0) {
      const { data: signalDeals } = await supabase
        .from('deals')
        .select('id, name')
        .in('id', signalDealIds);
      for (const d of signalDeals || []) {
        // Augment dealIdToName (safe even if already populated from activities)
        if (!Object.prototype.hasOwnProperty.call({}, d.id)) {
          // Just build a local map — dealIdToName scope is in activity block above
        }
      }

      // Build fresh lookup for signals
      const signalDealNameMap: Record<string, string> = {};
      const { data: signalDealRows } = await supabase
        .from('deals')
        .select('id, name')
        .in('id', signalDealIds);
      for (const d of signalDealRows || []) {
        signalDealNameMap[d.id] = d.name;
      }

      for (const signal of signalChanges || []) {
        const dealName = signal.deal_id ? signalDealNameMap[signal.deal_id] : null;
        const temperature = signal.temperature as number ?? 0;
        const isNewSignal = isRecentSignal(signal.detected_at, since);
        const eventType: OvernightEventType = isNewSignal ? 'signal_new' : 'signal_elevated';
        const signalTypeFmt = formatSignalType(signal.signal_type as string);

        events.push({
          type: eventType,
          description: dealName
            ? `${signalTypeFmt} signal detected for ${dealName} (temperature: ${temperature})`
            : `${signalTypeFmt} signal detected`,
          timestamp: signal.detected_at as string,
          deal_id: signal.deal_id || null,
          deal_name: dealName,
          contact_name: null,
          severity: temperature >= 70 ? 'attention' : 'info',
          metadata: {
            signal_type: signal.signal_type,
            temperature,
            expires_at: signal.expires_at,
            ...(typeof signal.metadata === 'object' && signal.metadata !== null ? signal.metadata as Record<string, unknown> : {}),
          },
        });
      }
    }
  }

  // -------------------------------------------------------------------------
  // 3. Sort all events by timestamp descending, cap at 20
  // -------------------------------------------------------------------------
  events.sort((a, b) => new Date(b.timestamp).getTime() - new Date(a.timestamp).getTime());
  const cappedEvents = events.slice(0, 20);

  const highAttentionCount = cappedEvents.filter(e => e.severity === 'attention').length;
  const positiveCount = cappedEvents.filter(e => e.severity === 'positive').length;

  return {
    events: cappedEvents,
    total_count: cappedEvents.length,
    since_timestamp: since,
    high_attention_count: highAttentionCount,
    positive_count: positiveCount,
  };
}

// =============================================================================
// Skill Adapter (for use in morning briefing fleet sequence)
// =============================================================================

export const overnightSummaryAdapter: SkillAdapter = {
  name: 'overnight-summary',
  async execute(state: SequenceState, step: SequenceStep): Promise<StepResult> {
    const start = Date.now();
    try {
      console.log('[overnight-summary] Building overnight summary...');
      const supabase = getServiceClient();
      const userId = state.event.user_id;
      const orgId = state.event.org_id;

      if (!userId || !orgId) {
        throw new Error('user_id and org_id are required in event payload');
      }

      // Allow caller to pass a custom since timestamp in payload
      const sinceTimestamp = state.event.payload?.since_timestamp as string | undefined;

      const result = await getOvernightSummary(supabase, userId, orgId, sinceTimestamp);

      console.log(
        `[overnight-summary] Found ${result.total_count} overnight events ` +
        `(${result.high_attention_count} attention, ${result.positive_count} positive)`
      );

      return {
        success: true,
        output: result,
        duration_ms: Date.now() - start,
      };
    } catch (err) {
      console.error('[overnight-summary] Error:', err);
      return { success: false, error: String(err), duration_ms: Date.now() - start };
    }
  },
};

// =============================================================================
// Helpers
// =============================================================================

/**
 * Returns ISO timestamp for 7 PM UTC yesterday.
 * This is a reasonable "start of overnight" window covering most global time zones.
 */
function getPreviousEveningTimestamp(): string {
  const now = new Date();
  const yesterday = new Date(now);
  yesterday.setUTCDate(yesterday.getUTCDate() - 1);
  yesterday.setUTCHours(19, 0, 0, 0);
  return yesterday.toISOString();
}

function mapActivityTypeToOvernightType(activityType: string): OvernightEventType | null {
  const map: Record<string, OvernightEventType> = {
    enrichment: 'enrichment_completed',
    email_open: 'email_open',
    email_reply: 'email_reply',
    task_completed: 'task_completed',
    call_logged: 'task_completed',  // map to task for display
  };
  return map[activityType] ?? null;
}

function activitySeverity(type: OvernightEventType): 'info' | 'positive' | 'attention' {
  if (type === 'email_reply' || type === 'campaign_reply') return 'positive';
  if (type === 'signal_elevated' || type === 'signal_new') return 'attention';
  return 'info';
}

function buildActivityDescription(
  type: OvernightEventType,
  dealName: string | null,
  contactName: string | null
): string {
  const dealContext = dealName ? ` for ${dealName}` : '';
  const contactContext = contactName ? ` from ${contactName}` : '';

  switch (type) {
    case 'enrichment_completed': return `Enrichment completed${dealContext}`;
    case 'email_open': return `Email opened${contactContext}${dealContext}`;
    case 'email_reply': return `Email reply received${contactContext}${dealContext}`;
    case 'task_completed': return `Task completed${dealContext}`;
    case 'campaign_reply': return `Campaign reply${contactContext}`;
    default: return 'Overnight activity';
  }
}

function formatSignalType(signalType: string): string {
  return signalType
    .replace(/_/g, ' ')
    .replace(/\b\w/g, c => c.toUpperCase());
}

function isRecentSignal(detectedAt: string, since: string): boolean {
  const detectedTime = new Date(detectedAt).getTime();
  const sinceTime = new Date(since).getTime();
  // "New" if detected within the last 2 hours of the query window
  return (Date.now() - detectedTime) < (2 * 60 * 60 * 1000);
}
