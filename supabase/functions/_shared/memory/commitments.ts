/**
 * commitments.ts — Deal memory commitment lifecycle management.
 *
 * Provides read and write helpers for commitment_made, commitment_fulfilled,
 * commitment_broken, and associated risk_flag events stored in deal_memory_events.
 *
 * Rules:
 *   - Never select('*') — always explicit columns
 *   - Always filter by org_id (belt-and-suspenders on top of RLS)
 *   - maybeSingle() when a record might not exist
 *   - Return false / empty arrays for missing data — never throw
 */

import { createClient } from 'https://esm.sh/@supabase/supabase-js@2.43.4';
import type { Commitment, DealMemoryEvent } from './types.ts';

// ---- getOpenCommitments -----------------------------------------------------

/**
 * Get all open (pending) commitments for a deal.
 */
export async function getOpenCommitments(
  dealId: string,
  orgId: string,
  supabase: ReturnType<typeof createClient>,
): Promise<Commitment[]> {
  const { data, error } = await supabase
    .from('deal_memory_events')
    .select('id, summary, detail, source_timestamp, contact_ids')
    .eq('org_id', orgId)
    .eq('deal_id', dealId)
    .eq('is_active', true)
    .eq('event_type', 'commitment_made')
    .order('source_timestamp', { ascending: false });

  if (error) {
    console.error('[commitments] getOpenCommitments error:', error.message);
    return [];
  }

  return ((data ?? []) as Array<{
    id: string;
    summary: string;
    detail: Record<string, unknown>;
    source_timestamp: string;
    contact_ids: string[];
  }>)
    .filter((row) => row.detail.status === 'pending')
    .map((row) => ({
      event_id: row.id,
      owner: ((row.detail.owner ?? 'rep') as 'rep' | 'prospect'),
      action: row.summary,
      deadline: (row.detail.deadline as string) ?? null,
      status: 'pending' as const,
      created_at: row.source_timestamp,
    }));
}

// ---- getOverdueCommitments --------------------------------------------------

/**
 * Get all overdue commitments across all deals for an org.
 * A commitment is overdue when detail.status='pending' AND detail.deadline < now.
 */
export async function getOverdueCommitments(
  orgId: string,
  supabase: ReturnType<typeof createClient>,
): Promise<Array<Commitment & { deal_id: string }>> {
  const { data, error } = await supabase
    .from('deal_memory_events')
    .select('id, deal_id, summary, detail, source_timestamp')
    .eq('org_id', orgId)
    .eq('is_active', true)
    .eq('event_type', 'commitment_made')
    .order('source_timestamp', { ascending: false })
    .limit(200);

  if (error) {
    console.error('[commitments] getOverdueCommitments error:', error.message);
    return [];
  }

  const now = new Date();

  return ((data ?? []) as Array<{
    id: string;
    deal_id: string;
    summary: string;
    detail: Record<string, unknown>;
    source_timestamp: string;
  }>)
    .filter((row) => {
      return (
        row.detail.status === 'pending' &&
        row.detail.deadline &&
        new Date(row.detail.deadline as string) < now
      );
    })
    .map((row) => ({
      event_id: row.id,
      deal_id: row.deal_id,
      owner: ((row.detail.owner ?? 'rep') as 'rep' | 'prospect'),
      action: row.summary,
      deadline: (row.detail.deadline as string) ?? null,
      status: 'pending' as const,
      created_at: row.source_timestamp,
    }));
}

// ---- markCommitmentFulfilled ------------------------------------------------

/**
 * Mark a commitment as fulfilled. Creates a commitment_fulfilled event
 * and updates the original commitment's detail.status to 'fulfilled'.
 */
export async function markCommitmentFulfilled(
  eventId: string,
  orgId: string,
  supabase: ReturnType<typeof createClient>,
  method?: string,
): Promise<boolean> {
  // 1. Fetch the original event
  const { data: original, error: fetchError } = await supabase
    .from('deal_memory_events')
    .select('id, deal_id, event_type, detail')
    .eq('id', eventId)
    .eq('org_id', orgId)
    .maybeSingle();

  if (fetchError) {
    console.error('[commitments] markCommitmentFulfilled fetch error:', fetchError.message);
    return false;
  }

  if (!original || original.event_type !== 'commitment_made') {
    console.warn('[commitments] markCommitmentFulfilled: event not found or wrong type', eventId);
    return false;
  }

  const row = original as {
    id: string;
    deal_id: string;
    event_type: string;
    detail: Record<string, unknown>;
  };

  // 2 & 3. Update detail.status to 'fulfilled' on the original event
  const updatedDetail = { ...row.detail, status: 'fulfilled' };
  const { error: updateError } = await supabase
    .from('deal_memory_events')
    .update({ detail: updatedDetail })
    .eq('id', eventId)
    .eq('org_id', orgId);

  if (updateError) {
    console.error('[commitments] markCommitmentFulfilled update error:', updateError.message);
    return false;
  }

  // 4. Insert a commitment_fulfilled event
  const { error: insertError } = await supabase
    .from('deal_memory_events')
    .insert({
      org_id: orgId,
      deal_id: row.deal_id,
      event_type: 'commitment_fulfilled',
      event_category: 'commitment',
      source_type: 'agent_inference',
      source_timestamp: new Date().toISOString(),
      summary: `Commitment fulfilled: ${(row.detail.action as string) ?? 'see original commitment'}`,
      detail: {
        original_commitment_id: eventId,
        fulfilled_at: new Date().toISOString(),
        method: method || 'manual',
      },
      confidence: 1.0,
      salience: 'medium',
      is_active: true,
      contact_ids: [],
      extracted_by: 'commitment-tracker',
      credit_cost: 0,
    });

  if (insertError) {
    console.error('[commitments] markCommitmentFulfilled insert error:', insertError.message);
    return false;
  }

  return true;
}

// ---- markCommitmentBroken ---------------------------------------------------

/**
 * Mark a commitment as broken. Creates a commitment_broken event,
 * generates a risk_flag event, and updates the original commitment's detail.status.
 */
export async function markCommitmentBroken(
  eventId: string,
  orgId: string,
  dealId: string,
  supabase: ReturnType<typeof createClient>,
  daysOverdue: number,
): Promise<boolean> {
  // 1. Fetch the original event
  const { data: original, error: fetchError } = await supabase
    .from('deal_memory_events')
    .select('id, deal_id, event_type, detail')
    .eq('id', eventId)
    .eq('org_id', orgId)
    .maybeSingle();

  if (fetchError) {
    console.error('[commitments] markCommitmentBroken fetch error:', fetchError.message);
    return false;
  }

  if (!original || original.event_type !== 'commitment_made') {
    console.warn('[commitments] markCommitmentBroken: event not found or wrong type', eventId);
    return false;
  }

  const row = original as {
    id: string;
    deal_id: string;
    event_type: string;
    detail: Record<string, unknown>;
  };

  // 2. Update detail.status to 'broken' on the original event
  const updatedDetail = { ...row.detail, status: 'broken' };
  const { error: updateError } = await supabase
    .from('deal_memory_events')
    .update({ detail: updatedDetail })
    .eq('id', eventId)
    .eq('org_id', orgId);

  if (updateError) {
    console.error('[commitments] markCommitmentBroken update error:', updateError.message);
    return false;
  }

  const now = new Date().toISOString();

  // 3. Insert a commitment_broken event
  const { error: brokenInsertError } = await supabase
    .from('deal_memory_events')
    .insert({
      org_id: orgId,
      deal_id: dealId,
      event_type: 'commitment_broken',
      event_category: 'commitment',
      source_type: 'agent_inference',
      source_timestamp: now,
      summary: `Commitment broken (${daysOverdue} day${daysOverdue === 1 ? '' : 's'} overdue): ${(row.detail.action as string) ?? 'see original commitment'}`,
      detail: {
        original_commitment_id: eventId,
        days_overdue: daysOverdue,
        acknowledged: false,
      },
      confidence: 1.0,
      salience: daysOverdue > 7 ? 'high' : 'medium',
      is_active: true,
      contact_ids: [],
      extracted_by: 'commitment-tracker',
      credit_cost: 0,
    });

  if (brokenInsertError) {
    console.error('[commitments] markCommitmentBroken broken insert error:', brokenInsertError.message);
    return false;
  }

  // 4. Insert a risk_flag event
  const { error: riskInsertError } = await supabase
    .from('deal_memory_events')
    .insert({
      org_id: orgId,
      deal_id: dealId,
      event_type: 'risk_flag',
      event_category: 'signal',
      source_type: 'agent_inference',
      source_timestamp: now,
      summary: `Risk: commitment broken — ${daysOverdue} day${daysOverdue === 1 ? '' : 's'} overdue`,
      detail: {
        risk_type: 'commitment_broken',
        severity: daysOverdue > 7 ? 'high' : 'medium',
        contributing_events: [eventId],
        recommended_action: 'Follow up on the overdue commitment immediately',
      },
      confidence: 1.0,
      salience: daysOverdue > 7 ? 'high' : 'medium',
      is_active: true,
      contact_ids: [],
      extracted_by: 'commitment-tracker',
      credit_cost: 0,
    });

  if (riskInsertError) {
    console.error('[commitments] markCommitmentBroken risk insert error:', riskInsertError.message);
    return false;
  }

  return true;
}
