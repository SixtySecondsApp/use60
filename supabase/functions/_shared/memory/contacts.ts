import { createClient } from 'https://esm.sh/@supabase/supabase-js@2.43.4';
import type { ContactMemory, DealMemoryEvent } from './types.ts';

// ---------------------------------------------------------------------------
// Engagement boost amounts per event type
// ---------------------------------------------------------------------------

const ENGAGEMENT_BOOSTS: Record<string, number> = {
  meeting_summary: 0.15,
  email_exchange_inbound: 0.08,
  email_exchange_outbound: 0.03,
  sentiment_shift_positive: 0.05,
  sentiment_shift_negative: -0.05,
};

function resolveBoost(event: Pick<DealMemoryEvent, 'event_type' | 'detail'>): number {
  const { event_type, detail } = event;
  if (event_type === 'meeting_summary') return ENGAGEMENT_BOOSTS.meeting_summary;
  if (event_type === 'email_exchange') {
    return detail.direction === 'inbound'
      ? ENGAGEMENT_BOOSTS.email_exchange_inbound
      : ENGAGEMENT_BOOSTS.email_exchange_outbound;
  }
  if (event_type === 'sentiment_shift') {
    return detail.direction === 'positive'
      ? ENGAGEMENT_BOOSTS.sentiment_shift_positive
      : ENGAGEMENT_BOOSTS.sentiment_shift_negative;
  }
  return 0;
}

function clamp(value: number, min: number, max: number): number {
  return Math.min(max, Math.max(min, value));
}

// ---------------------------------------------------------------------------
// updateContactFromEvent
// ---------------------------------------------------------------------------

/**
 * Update contact memory from a deal memory event.
 * Called after events are extracted — updates engagement counters,
 * interests, buying role history based on event content.
 */
export async function updateContactFromEvent(
  event: Pick<
    DealMemoryEvent,
    'event_type' | 'event_category' | 'detail' | 'source_timestamp' | 'contact_ids' | 'deal_id' | 'org_id'
  >,
  supabase: ReturnType<typeof createClient>,
): Promise<void> {
  const { event_type, detail, source_timestamp, contact_ids, org_id } = event;
  const boost = resolveBoost(event);

  for (const contactId of contact_ids) {
    // Fetch current row so we can compute deltas without a raw SQL increment
    const { data: existing } = await supabase
      .from('contact_memory')
      .select(
        'id, relationship_strength, total_meetings, total_emails_sent, total_emails_received, last_interaction_at',
      )
      .eq('org_id', org_id)
      .eq('contact_id', contactId)
      .maybeSingle();

    if (existing) {
      // ---- Update path ----
      const newStrength = clamp((existing.relationship_strength ?? 0.5) + boost, 0.1, 1.0);

      // Only advance last_interaction_at if the event is newer
      const newLastInteraction =
        existing.last_interaction_at == null ||
        source_timestamp > existing.last_interaction_at
          ? source_timestamp
          : existing.last_interaction_at;

      const updates: Record<string, unknown> = {
        relationship_strength: newStrength,
        last_interaction_at: newLastInteraction,
      };

      if (event_type === 'meeting_summary') {
        updates.total_meetings = (existing.total_meetings ?? 0) + 1;
      } else if (event_type === 'email_exchange') {
        if (detail.direction === 'inbound') {
          updates.total_emails_received = (existing.total_emails_received ?? 0) + 1;
        } else {
          updates.total_emails_sent = (existing.total_emails_sent ?? 0) + 1;
        }
      }

      await supabase
        .from('contact_memory')
        .update(updates)
        .eq('id', existing.id);
    } else {
      // ---- Insert path ----
      const initialStrength = clamp(0.5 + boost, 0.1, 1.0);

      const insert: Record<string, unknown> = {
        org_id,
        contact_id: contactId,
        relationship_strength: initialStrength,
        last_interaction_at: source_timestamp,
        total_meetings: 0,
        total_emails_sent: 0,
        total_emails_received: 0,
      };

      if (event_type === 'meeting_summary') {
        insert.total_meetings = 1;
      } else if (event_type === 'email_exchange') {
        if (detail.direction === 'inbound') {
          insert.total_emails_received = 1;
        } else {
          insert.total_emails_sent = 1;
        }
      }

      await supabase.from('contact_memory').insert(insert);
    }
  }
}

// ---------------------------------------------------------------------------
// getContactProfile
// ---------------------------------------------------------------------------

/**
 * Get a contact's memory profile.
 */
export async function getContactProfile(
  contactId: string,
  orgId: string,
  supabase: ReturnType<typeof createClient>,
): Promise<ContactMemory | null> {
  const { data, error } = await supabase
    .from('contact_memory')
    .select(
      'id, org_id, contact_id, communication_style, decision_style, interests, buying_role_history, relationship_strength, total_meetings, total_emails_sent, total_emails_received, last_interaction_at, avg_response_time_hours, summary, summary_updated_at, created_at, updated_at',
    )
    .eq('org_id', orgId)
    .eq('contact_id', contactId)
    .maybeSingle();

  if (error) {
    console.error('[memory/contacts] getContactProfile error:', error.message);
    return null;
  }

  return data as ContactMemory | null;
}

// ---------------------------------------------------------------------------
// boostEngagement
// ---------------------------------------------------------------------------

/**
 * Boost or penalize relationship strength from an engagement event.
 */
export async function boostEngagement(
  contactId: string,
  orgId: string,
  boost: number, // positive or negative
  supabase: ReturnType<typeof createClient>,
): Promise<void> {
  const { data: existing } = await supabase
    .from('contact_memory')
    .select('id, relationship_strength')
    .eq('org_id', orgId)
    .eq('contact_id', contactId)
    .maybeSingle();

  if (!existing) {
    // Nothing to boost — contact memory will be created on the next event
    return;
  }

  const newStrength = clamp((existing.relationship_strength ?? 0.5) + boost, 0.1, 1.0);

  await supabase
    .from('contact_memory')
    .update({ relationship_strength: newStrength })
    .eq('id', existing.id);
}
