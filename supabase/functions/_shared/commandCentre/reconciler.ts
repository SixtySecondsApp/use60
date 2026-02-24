/**
 * Command Centre Reconciliation Engine — CC9-002
 *
 * Matches external actions (email sent, CRM updated, calendar created, Slack interaction)
 * to open Command Centre items and auto-resolves them.
 *
 * Callable from: email send webhooks, HubSpot property change webhooks,
 * calendar sync functions, and the Slack interaction handler.
 */

import { createClient } from 'https://esm.sh/@supabase/supabase-js@2.43.4';
import type { ItemType } from './types.ts';

// ---------------------------------------------------------------------------
// Public interface
// ---------------------------------------------------------------------------

export interface ReconcileEvent {
  type: 'email_sent' | 'crm_updated' | 'calendar_created' | 'slack_action_taken';
  org_id: string;
  user_id: string;
  deal_id?: string;
  contact_id?: string;
  /** ID of the original triggering event — used for direct matching on slack_action_taken */
  source_event_id?: string;
  /** Additional context about the resolution (stored for audit trail) */
  metadata?: Record<string, unknown>;
}

export interface ReconcileResult {
  resolved_count: number;
  resolved_item_ids: string[];
}

// ---------------------------------------------------------------------------
// Item-type mappings per event type
// ---------------------------------------------------------------------------

const ITEM_TYPE_MAP: Record<ReconcileEvent['type'], ItemType[]> = {
  email_sent: ['follow_up', 'outreach'],
  crm_updated: ['crm_update', 'deal_action'],
  calendar_created: ['follow_up', 'meeting_action' as ItemType],
  slack_action_taken: ['follow_up', 'outreach', 'crm_update', 'deal_action'],
};

/** Statuses that are still "open" and eligible for auto-resolution */
const RESOLVABLE_STATUSES = ['open', 'ready', 'enriching'] as const;

// ---------------------------------------------------------------------------
// Resolution channel derivation
// ---------------------------------------------------------------------------

function deriveResolutionChannel(eventType: ReconcileEvent['type']): string {
  // e.g. 'email_sent' → 'external_email'
  //      'crm_updated' → 'external_crm'
  //      'calendar_created' → 'external_calendar'
  //      'slack_action_taken' → 'external_slack'
  const prefix = eventType.split('_')[0];
  return `external_${prefix}`;
}

// ---------------------------------------------------------------------------
// Main reconciler function
// ---------------------------------------------------------------------------

/**
 * Reconciles a single external action event against open Command Centre items.
 * Returns the count and IDs of items that were auto-resolved.
 *
 * Designed to be side-effect safe: wraps all DB operations in try/catch and
 * returns a zero-result object on any failure rather than throwing.
 */
export async function reconcileItem(event: ReconcileEvent): Promise<ReconcileResult> {
  const SUPABASE_URL = Deno.env.get('SUPABASE_URL') ?? '';
  const SERVICE_ROLE_KEY = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') ?? '';

  const supabase = createClient(SUPABASE_URL, SERVICE_ROLE_KEY, {
    auth: { persistSession: false },
  });

  try {
    const resolvedItemIds: string[] = [];
    const now = new Date().toISOString();
    const resolutionChannel = deriveResolutionChannel(event.type);
    const compatibleTypes = ITEM_TYPE_MAP[event.type];

    // -----------------------------------------------------------------------
    // Build the match query
    // -----------------------------------------------------------------------

    let query = supabase
      .from('command_centre_items')
      .select('id, item_type, status, deal_id, contact_id, source_event_id')
      .eq('org_id', event.org_id)
      .in('status', RESOLVABLE_STATUSES)
      .in('item_type', compatibleTypes);

    // For slack_action_taken with a source_event_id, prefer a direct match
    // first; fall back to deal/contact matching below if not found.
    if (event.type === 'slack_action_taken' && event.source_event_id) {
      query = query.eq('source_event_id', event.source_event_id);
    } else {
      // Match by deal_id OR contact_id (at least one must be provided)
      if (event.deal_id && event.contact_id) {
        query = query.or(`deal_id.eq.${event.deal_id},contact_id.eq.${event.contact_id}`);
      } else if (event.deal_id) {
        query = query.eq('deal_id', event.deal_id);
      } else if (event.contact_id) {
        query = query.eq('contact_id', event.contact_id);
      } else {
        // Without any anchor we cannot safely match — return early
        console.log('[cc-reconciler] No deal_id or contact_id provided; skipping reconciliation', {
          event_type: event.type,
          org_id: event.org_id,
        });
        return { resolved_count: 0, resolved_item_ids: [] };
      }
    }

    const { data: candidates, error: selectError } = await query;

    if (selectError) {
      console.log('[cc-reconciler] Error fetching candidates', {
        event_type: event.type,
        error: selectError.message,
      });
      return { resolved_count: 0, resolved_item_ids: [] };
    }

    if (!candidates || candidates.length === 0) {
      console.log('[cc-reconciler] No matching open items found', {
        event_type: event.type,
        org_id: event.org_id,
        deal_id: event.deal_id,
        contact_id: event.contact_id,
      });
      return { resolved_count: 0, resolved_item_ids: [] };
    }

    // -----------------------------------------------------------------------
    // For slack_action_taken without source_event_id, we fall back to
    // deal/contact matching (already handled above). No extra filter needed.
    // -----------------------------------------------------------------------

    const candidateIds = candidates.map((c: { id: string }) => c.id);

    // -----------------------------------------------------------------------
    // Bulk update all matched items
    // -----------------------------------------------------------------------

    const { data: updated, error: updateError } = await supabase
      .from('command_centre_items')
      .update({
        status: 'auto_resolved',
        resolution_channel: resolutionChannel,
        resolved_at: now,
        reconciled_by: 'reconciler',
        reconciled_event_id: event.source_event_id ?? null,
      })
      .in('id', candidateIds)
      .in('status', RESOLVABLE_STATUSES) // re-check status to guard race conditions
      .select('id');

    if (updateError) {
      console.log('[cc-reconciler] Error updating items', {
        event_type: event.type,
        candidate_ids: candidateIds,
        error: updateError.message,
      });
      return { resolved_count: 0, resolved_item_ids: [] };
    }

    if (updated) {
      for (const row of updated as Array<{ id: string }>) {
        resolvedItemIds.push(row.id);
        console.log('[cc-reconciler] Auto-resolved item', {
          item_id: row.id,
          resolution_channel: resolutionChannel,
          event_type: event.type,
          org_id: event.org_id,
          user_id: event.user_id,
          deal_id: event.deal_id,
          contact_id: event.contact_id,
        });
      }
    }

    return {
      resolved_count: resolvedItemIds.length,
      resolved_item_ids: resolvedItemIds,
    };
  } catch (err) {
    console.log('[cc-reconciler] Unexpected error', {
      event_type: event.type,
      org_id: event.org_id,
      error: err instanceof Error ? err.message : String(err),
    });
    return { resolved_count: 0, resolved_item_ids: [] };
  }
}
