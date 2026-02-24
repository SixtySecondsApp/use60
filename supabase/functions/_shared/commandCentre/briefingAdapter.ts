/**
 * Command Centre Briefing Adapter
 *
 * Loads command_centre_items for a user and groups them by urgency tier
 * so the morning brief can surface CC-sourced items in Slack.
 *
 * Story: CC8-006
 */

import { createClient } from 'https://esm.sh/@supabase/supabase-js@2.43.4';
import type { CommandCentreItem, Urgency } from './types.ts';

type SupabaseClient = ReturnType<typeof createClient>;

// ---------------------------------------------------------------------------
// Public types
// ---------------------------------------------------------------------------

export interface CCBriefItem {
  id: string;
  title: string;
  summary: string;
  urgency: Urgency;
  priority_score: number;
  item_type: string;
  source_agent: string;
  deal_id?: string;
  contact_id?: string;
  due_date?: string;
  drafted_action_text?: string;
}

export interface CCBriefItemsGrouped {
  critical: CCBriefItem[];
  high: CCBriefItem[];
  normal: CCBriefItem[];
  total: number;
}

// ---------------------------------------------------------------------------
// loadCCBriefItems
// ---------------------------------------------------------------------------

/**
 * Fetch open/ready command_centre_items for a user, ordered by priority_score DESC.
 * Returns items grouped by urgency tier (critical, high, normal).
 * Low-urgency items are intentionally excluded from the morning brief.
 *
 * @param supabase  Service-role Supabase client
 * @param userId    The sixty user ID to fetch items for
 * @param limit     Maximum items to load (default: 15)
 */
export async function loadCCBriefItems(
  supabase: SupabaseClient,
  userId: string,
  limit = 15,
): Promise<CCBriefItemsGrouped> {
  const { data, error } = await supabase
    .from('command_centre_items')
    .select(
      'id, title, summary, urgency, priority_score, item_type, source_agent, deal_id, contact_id, due_date, drafted_action',
    )
    .eq('user_id', userId)
    .in('status', ['open', 'ready'])
    .order('priority_score', { ascending: false })
    .limit(limit);

  if (error) {
    throw new Error(`CC brief load failed: ${error.message}`);
  }

  const rows = (data ?? []) as Array<
    Pick<
      CommandCentreItem,
      | 'id'
      | 'title'
      | 'summary'
      | 'urgency'
      | 'priority_score'
      | 'item_type'
      | 'source_agent'
      | 'deal_id'
      | 'contact_id'
      | 'due_date'
      | 'drafted_action'
    >
  >;

  const grouped: CCBriefItemsGrouped = { critical: [], high: [], normal: [], total: 0 };

  for (const row of rows) {
    const item: CCBriefItem = {
      id: row.id,
      title: row.title,
      summary: row.summary ?? '',
      urgency: row.urgency,
      priority_score: row.priority_score ?? 0,
      item_type: row.item_type,
      source_agent: row.source_agent,
      deal_id: row.deal_id ?? undefined,
      contact_id: row.contact_id ?? undefined,
      due_date: row.due_date ?? undefined,
      drafted_action_text: row.drafted_action?.display_text ?? undefined,
    };

    if (item.urgency === 'critical') {
      grouped.critical.push(item);
    } else if (item.urgency === 'high') {
      grouped.high.push(item);
    } else if (item.urgency === 'normal') {
      grouped.normal.push(item);
    }
    // 'low' urgency items are intentionally skipped in the morning brief
  }

  grouped.total = grouped.critical.length + grouped.high.length + grouped.normal.length;

  return grouped;
}

// ---------------------------------------------------------------------------
// convertCCItemsToPriorities
// ---------------------------------------------------------------------------

/**
 * Convert grouped CC items into a flat priority string array suitable for
 * injecting into MorningBriefData.priorities (max 3 entries).
 *
 * These strings slot directly into the existing Slack blocks renderer
 * without requiring any changes to slackBlocks.ts.
 */
export function convertCCItemsToPriorities(grouped: CCBriefItemsGrouped): string[] {
  const all = [...grouped.critical, ...grouped.high, ...grouped.normal];
  return all.slice(0, 3).map((item) => {
    const prefix = item.urgency === 'critical' ? 'URGENT: ' : '';
    return `${prefix}${item.title}`;
  });
}

// ---------------------------------------------------------------------------
// convertCCItemsToInsights
// ---------------------------------------------------------------------------

/**
 * Convert grouped CC items into insight strings for MorningBriefData.insights.
 * Surfaces summaries from critical items only (max 2).
 */
export function convertCCItemsToInsights(grouped: CCBriefItemsGrouped): string[] {
  return grouped.critical
    .filter((item) => item.summary)
    .slice(0, 2)
    .map((item) => item.summary);
}
