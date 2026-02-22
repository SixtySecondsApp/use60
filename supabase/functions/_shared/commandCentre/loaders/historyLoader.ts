/**
 * History Context Loader — CC10-004
 *
 * Loads past command_centre_items for the same deal or contact to show what
 * actions were previously taken on this entity. This helps the AI synthesis
 * step avoid suggesting duplicate work and understand prior engagement.
 *
 * Filters: items with status in (completed, dismissed, auto_resolved)
 * Returns: last 5 resolved items with title, status, resolution_channel, resolved_at
 */

import { createClient } from 'https://esm.sh/@supabase/supabase-js@2.43.4';

// ---------------------------------------------------------------------------
// Return types
// ---------------------------------------------------------------------------

export interface PreviousItem {
  id: string;
  title: string;
  item_type: string;
  status: string;
  resolution_channel: string | null;
  resolved_at: string | null;
  source_agent: string;
  created_at: string;
}

export interface HistoryEnrichment {
  /** Resolved items for the same deal (most recent first, up to 5) */
  deal_history: PreviousItem[];
  /** Resolved items for the same contact, excluding items already in deal_history */
  contact_history: PreviousItem[];
  /** Total count of resolved items found (across both deal and contact) */
  total_resolved_count: number;
}

// ---------------------------------------------------------------------------
// Resolved statuses that indicate a completed action cycle
// ---------------------------------------------------------------------------

const RESOLVED_STATUSES = ['completed', 'dismissed', 'auto_resolved'];

// ---------------------------------------------------------------------------
// Main export
// ---------------------------------------------------------------------------

export async function loadPreviousItems(
  supabase: ReturnType<typeof createClient>,
  dealId?: string | null,
  contactId?: string | null,
): Promise<HistoryEnrichment> {
  const empty: HistoryEnrichment = {
    deal_history: [],
    contact_history: [],
    total_resolved_count: 0,
  };

  if (!dealId && !contactId) {
    console.log('[cc-loader:history] no dealId or contactId — skipping');
    return empty;
  }

  try {
    const dealHistory: PreviousItem[] = [];
    const contactHistory: PreviousItem[] = [];
    const seenIds = new Set<string>();

    // ------------------------------------------------------------------
    // 1. Deal history — fetch last 5 resolved items for this deal
    // ------------------------------------------------------------------
    if (dealId) {
      const { data: dealItems, error: dealError } = await supabase
        .from('command_centre_items')
        .select(
          'id, title, item_type, status, resolution_channel, resolved_at, source_agent, created_at',
        )
        .eq('deal_id', dealId)
        .in('status', RESOLVED_STATUSES)
        .order('resolved_at', { ascending: false, nullsFirst: false })
        .limit(5);

      if (dealError) {
        console.error('[cc-loader:history] deal history fetch error:', dealError.message);
        // Continue — contact history can still be loaded
      } else if (dealItems) {
        for (const item of dealItems) {
          dealHistory.push({
            id: item.id,
            title: item.title,
            item_type: item.item_type,
            status: item.status,
            resolution_channel: item.resolution_channel ?? null,
            resolved_at: item.resolved_at ?? null,
            source_agent: item.source_agent,
            created_at: item.created_at,
          });
          seenIds.add(item.id);
        }
      }
    }

    // ------------------------------------------------------------------
    // 2. Contact history — fetch last 5 resolved items for this contact
    //    Exclude IDs already returned in deal_history to avoid duplication
    // ------------------------------------------------------------------
    if (contactId) {
      let query = supabase
        .from('command_centre_items')
        .select(
          'id, title, item_type, status, resolution_channel, resolved_at, source_agent, created_at',
        )
        .eq('contact_id', contactId)
        .in('status', RESOLVED_STATUSES)
        .order('resolved_at', { ascending: false, nullsFirst: false })
        .limit(10); // fetch extra so we can filter seenIds and still get up to 5

      const { data: contactItems, error: contactError } = await query;

      if (contactError) {
        console.error('[cc-loader:history] contact history fetch error:', contactError.message);
      } else if (contactItems) {
        for (const item of contactItems) {
          if (seenIds.has(item.id)) continue;
          if (contactHistory.length >= 5) break;

          contactHistory.push({
            id: item.id,
            title: item.title,
            item_type: item.item_type,
            status: item.status,
            resolution_channel: item.resolution_channel ?? null,
            resolved_at: item.resolved_at ?? null,
            source_agent: item.source_agent,
            created_at: item.created_at,
          });
        }
      }
    }

    const totalResolved = dealHistory.length + contactHistory.length;

    console.log(
      `[cc-loader:history] deal=${dealId ?? 'none'} contact=${contactId ?? 'none'} deal_history=${dealHistory.length} contact_history=${contactHistory.length}`,
    );

    return {
      deal_history: dealHistory,
      contact_history: contactHistory,
      total_resolved_count: totalResolved,
    };
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    console.error('[cc-loader:history] unexpected error:', message);
    return empty;
  }
}
