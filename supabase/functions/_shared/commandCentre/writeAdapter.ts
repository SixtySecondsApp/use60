/**
 * Command Centre Write Adapter
 *
 * Shared module for all proactive agents to write items into command_centre_items.
 *
 * Why service role: Agents run as edge functions (not on behalf of an authenticated
 * user session) and write items on behalf of users. RLS INSERT policy for
 * authenticated users only allows inserting own rows, but agents operate outside
 * the user's JWT context. Service role bypasses RLS — the "Service role full
 * access" policy explicitly allows this for edge functions / orchestrator agents.
 *
 * CRITICAL: CC write failures must never break the calling agent's primary flow.
 * All public functions catch and log errors rather than throwing.
 */

import { createClient } from 'https://esm.sh/@supabase/supabase-js@2.43.4';
import type { WriteItemParams } from './types.ts';

const SUPABASE_URL = Deno.env.get('SUPABASE_URL')!;
const SUPABASE_SERVICE_ROLE_KEY = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;

function getServiceClient() {
  // Service role needed: agents write on behalf of users, outside their JWT context.
  return createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY);
}

/**
 * Write a single item to the Command Centre.
 *
 * Returns the new item ID on success, or null if the write failed.
 * Errors are logged but NOT thrown — CC failures must not break the calling agent.
 */
export async function writeToCommandCentre(params: WriteItemParams): Promise<string | null> {
  // Validate required fields
  if (!params.org_id || !params.user_id || !params.source_agent || !params.item_type || !params.title) {
    console.error('[commandCentre] writeToCommandCentre: missing required fields', {
      has_org_id: !!params.org_id,
      has_user_id: !!params.user_id,
      has_source_agent: !!params.source_agent,
      has_item_type: !!params.item_type,
      has_title: !!params.title,
    });
    return null;
  }

  try {
    const supabase = getServiceClient();

    const { data, error } = await supabase
      .from('command_centre_items')
      .insert({
        org_id: params.org_id,
        user_id: params.user_id,
        source_agent: params.source_agent,
        source_event_id: params.source_event_id ?? null,
        item_type: params.item_type,
        title: params.title,
        summary: params.summary ?? null,
        context: params.context ?? {},
        urgency: params.urgency ?? 'normal',
        due_date: params.due_date ?? null,
        deal_id: params.deal_id ?? null,
        contact_id: params.contact_id ?? null,
        parent_item_id: params.parent_item_id ?? null,
      })
      .select('id')
      .single();

    if (error) {
      console.error('[commandCentre] writeToCommandCentre: insert failed', error.message, { params });
      return null;
    }

    console.log('[commandCentre] writeToCommandCentre: item created', data.id, {
      source_agent: params.source_agent,
      item_type: params.item_type,
      urgency: params.urgency ?? 'normal',
    });

    return data.id as string;
  } catch (err) {
    console.error('[commandCentre] writeToCommandCentre: unexpected error', String(err), { params });
    return null;
  }
}

/**
 * Batch-write multiple items to the Command Centre in a single query.
 *
 * Intended for post-meeting flows and other agents that generate multiple items
 * at once. Returns an array of new item IDs (parallel-indexed with input array).
 * Items that fail validation are skipped and logged. The entire batch uses a
 * single INSERT — if the batch insert fails, an empty array is returned.
 *
 * Errors are logged but NOT thrown — CC failures must not break the calling agent.
 */
export async function writeMultipleItems(items: WriteItemParams[]): Promise<string[]> {
  if (!items || items.length === 0) {
    return [];
  }

  // Validate and filter items, logging any that are missing required fields
  const validItems = items.filter((params, idx) => {
    if (!params.org_id || !params.user_id || !params.source_agent || !params.item_type || !params.title) {
      console.error(`[commandCentre] writeMultipleItems: item[${idx}] missing required fields, skipping`, {
        has_org_id: !!params.org_id,
        has_user_id: !!params.user_id,
        has_source_agent: !!params.source_agent,
        has_item_type: !!params.item_type,
        has_title: !!params.title,
      });
      return false;
    }
    return true;
  });

  if (validItems.length === 0) {
    console.error('[commandCentre] writeMultipleItems: no valid items to insert');
    return [];
  }

  try {
    const supabase = getServiceClient();

    const rows = validItems.map(params => ({
      org_id: params.org_id,
      user_id: params.user_id,
      source_agent: params.source_agent,
      source_event_id: params.source_event_id ?? null,
      item_type: params.item_type,
      title: params.title,
      summary: params.summary ?? null,
      context: params.context ?? {},
      urgency: params.urgency ?? 'normal',
      due_date: params.due_date ?? null,
      deal_id: params.deal_id ?? null,
      contact_id: params.contact_id ?? null,
      parent_item_id: params.parent_item_id ?? null,
    }));

    const { data, error } = await supabase
      .from('command_centre_items')
      .insert(rows)
      .select('id');

    if (error) {
      console.error('[commandCentre] writeMultipleItems: batch insert failed', error.message, {
        count: validItems.length,
      });
      return [];
    }

    const ids = (data ?? []).map((row: { id: string }) => row.id);

    console.log('[commandCentre] writeMultipleItems: batch inserted', ids.length, 'items', {
      source_agents: [...new Set(validItems.map(p => p.source_agent))],
      item_types: [...new Set(validItems.map(p => p.item_type))],
    });

    return ids;
  } catch (err) {
    console.error('[commandCentre] writeMultipleItems: unexpected error', String(err), {
      count: validItems.length,
    });
    return [];
  }
}
