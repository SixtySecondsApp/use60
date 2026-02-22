/**
 * Command Centre Action Executor
 *
 * Wires CC approve/execute actions to existing execution infrastructure.
 * Dispatches drafted actions to the appropriate edge function or direct
 * Supabase write based on the DraftedAction.type.
 *
 * Story: CC12-007
 */

import { createClient } from 'https://esm.sh/@supabase/supabase-js@2.43.4';
import { CommandCentreItem } from './types.ts';
import { recordOutcome, mapDraftedActionToActionType } from './trustScorer.ts';

// ---------------------------------------------------------------------------
// Return type
// ---------------------------------------------------------------------------

export interface ExecutionResult {
  success: boolean;
  error?: string;
  executionDetails?: Record<string, unknown>;
}

// ---------------------------------------------------------------------------
// executeApprovedAction
// ---------------------------------------------------------------------------

/**
 * Main dispatch function. Executes the drafted action on an approved CC item.
 * Merges editedPayload fields over the draft payload when provided.
 */
export async function executeApprovedAction(
  supabase: ReturnType<typeof createClient>,
  item: CommandCentreItem,
  editedPayload?: Record<string, unknown>,
): Promise<ExecutionResult> {
  const draft = item.drafted_action;
  if (!draft) {
    return { success: false, error: 'No drafted_action on item' };
  }

  // Merge editedPayload fields over the draft payload
  const payload = editedPayload
    ? { ...draft.payload, ...editedPayload }
    : draft.payload;

  console.log('[cc-executor] dispatching', {
    itemId: item.id,
    actionType: draft.type,
    wasEdited: !!editedPayload,
  });

  try {
    switch (draft.type) {
      case 'send_email':
        return await executeSendEmail(supabase, item, payload);

      case 'update_crm':
        return await executeUpdateCrm(supabase, item, payload);

      case 'create_task':
        return await executeCreateTask(supabase, item, payload);

      case 'schedule_meeting':
        return await executeScheduleMeeting(supabase, item, payload);

      case 'send_proposal':
        // Proposal sends are surfaced as suggestions only — mark as completed
        console.log('[cc-executor] send_proposal surfaced, marking completed');
        return {
          success: true,
          executionDetails: { note: 'Proposal intent surfaced to rep — no automated send' },
        };

      default:
        return { success: false, error: `Unknown action type: ${(draft as { type: string }).type}` };
    }
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    console.error('[cc-executor] unexpected error in executeApprovedAction', {
      itemId: item.id,
      actionType: draft.type,
      err: message,
    });
    return { success: false, error: message };
  }
}

// ---------------------------------------------------------------------------
// Private dispatchers
// ---------------------------------------------------------------------------

async function executeSendEmail(
  supabase: ReturnType<typeof createClient>,
  item: CommandCentreItem,
  payload: Record<string, unknown>,
): Promise<ExecutionResult> {
  const { to, subject, body } = payload as {
    to?: string;
    subject?: string;
    body?: string;
  };

  if (!to || !subject || !body) {
    return {
      success: false,
      error: `send_email missing required fields — to: ${to}, subject: ${subject}, body length: ${body?.length ?? 0}`,
    };
  }

  const { data, error } = await supabase.functions.invoke('email-send-as-rep', {
    body: { to, subject, body, user_id: item.user_id },
  });

  if (error) {
    console.error('[cc-executor] email-send-as-rep error', { itemId: item.id, error: error.message });
    return { success: false, error: error.message };
  }

  return {
    success: true,
    executionDetails: { to, subject, response: data },
  };
}

async function executeUpdateCrm(
  supabase: ReturnType<typeof createClient>,
  item: CommandCentreItem,
  payload: Record<string, unknown>,
): Promise<ExecutionResult> {
  const { entity, field_updates } = payload as {
    entity?: string;
    field_updates?: Record<string, unknown>;
  };

  if (!entity || !field_updates || Object.keys(field_updates).length === 0) {
    return {
      success: false,
      error: `update_crm missing required fields — entity: ${entity}, field_updates keys: ${Object.keys(field_updates ?? {}).join(', ')}`,
    };
  }

  if (entity === 'deal') {
    if (!item.deal_id) {
      return { success: false, error: 'update_crm entity=deal but item has no deal_id' };
    }
    const { error } = await supabase
      .from('deals')
      .update(field_updates)
      .eq('id', item.deal_id);

    if (error) {
      console.error('[cc-executor] deals update error', { itemId: item.id, dealId: item.deal_id, error: error.message });
      return { success: false, error: error.message };
    }

    return {
      success: true,
      executionDetails: { entity: 'deal', id: item.deal_id, field_updates },
    };
  }

  if (entity === 'contact') {
    if (!item.contact_id) {
      return { success: false, error: 'update_crm entity=contact but item has no contact_id' };
    }
    const { error } = await supabase
      .from('contacts')
      .update(field_updates)
      .eq('id', item.contact_id);

    if (error) {
      console.error('[cc-executor] contacts update error', { itemId: item.id, contactId: item.contact_id, error: error.message });
      return { success: false, error: error.message };
    }

    return {
      success: true,
      executionDetails: { entity: 'contact', id: item.contact_id, field_updates },
    };
  }

  return { success: false, error: `update_crm unsupported entity type: ${entity}` };
}

async function executeCreateTask(
  supabase: ReturnType<typeof createClient>,
  item: CommandCentreItem,
  payload: Record<string, unknown>,
): Promise<ExecutionResult> {
  const taskRow = {
    title: item.title,
    description: (payload.body as string | undefined) ?? item.summary ?? null,
    assigned_to: item.user_id,
    due_date: item.due_date ?? null,
    org_id: item.org_id,
    status: 'pending',
  };

  const { data, error } = await supabase
    .from('tasks')
    .insert(taskRow)
    .select('id')
    .single();

  if (error) {
    console.error('[cc-executor] tasks insert error', { itemId: item.id, error: error.message });
    return { success: false, error: error.message };
  }

  return {
    success: true,
    executionDetails: { task_id: data?.id, title: taskRow.title },
  };
}

async function executeScheduleMeeting(
  supabase: ReturnType<typeof createClient>,
  item: CommandCentreItem,
  payload: Record<string, unknown>,
): Promise<ExecutionResult> {
  // Scheduling is a suggestion flow — invoke find-available-slots to surface
  // options, but do not auto-book. Mark intent as completed.
  const { data, error } = await supabase.functions.invoke('find-available-slots', {
    body: {
      user_id: item.user_id,
      org_id: item.org_id,
      contact_id: item.contact_id ?? null,
      deal_id: item.deal_id ?? null,
      duration_minutes: (payload.duration_minutes as number | undefined) ?? 30,
      suggested_times: (payload.suggested_times as string[] | undefined) ?? [],
    },
  });

  if (error) {
    // Non-fatal — intent was still surfaced
    console.warn('[cc-executor] find-available-slots error (non-fatal)', {
      itemId: item.id,
      error: error.message,
    });
    return {
      success: true,
      executionDetails: {
        note: 'Meeting intent surfaced — slot finder returned error but action is still complete',
        slotFinderError: error.message,
      },
    };
  }

  return {
    success: true,
    executionDetails: {
      note: 'Meeting scheduling intent surfaced to rep',
      available_slots: data,
    },
  };
}

// ---------------------------------------------------------------------------
// recordExecutionOutcome
// ---------------------------------------------------------------------------

/**
 * Records the rep's outcome for trust scoring.
 * wasEdited=true records 'approved_with_edit'; false records 'approved'.
 */
export async function recordExecutionOutcome(
  supabase: ReturnType<typeof createClient>,
  item: CommandCentreItem,
  outcome: 'approved' | 'approved_with_edit' | 'rejected',
  wasEdited: boolean,
): Promise<void> {
  const draft = item.drafted_action;
  if (!draft) return;

  const resolvedOutcome = wasEdited ? 'approved_with_edit' : outcome;
  const actionType = mapDraftedActionToActionType(draft.type, item.item_type);

  await recordOutcome(supabase, item.user_id, actionType, resolvedOutcome);
}

// ---------------------------------------------------------------------------
// markItemCompleted
// ---------------------------------------------------------------------------

/**
 * Updates the command_centre_items row to status='completed' with the
 * given resolution_channel and resolved_at timestamp.
 */
export async function markItemCompleted(
  supabase: ReturnType<typeof createClient>,
  itemId: string,
  resolutionChannel: string,
): Promise<void> {
  const { error } = await supabase
    .from('command_centre_items')
    .update({
      status: 'completed',
      resolution_channel: resolutionChannel,
      resolved_at: new Date().toISOString(),
    })
    .eq('id', itemId);

  if (error) {
    console.error('[cc-executor] markItemCompleted error', { itemId, resolutionChannel, error: error.message });
    // Errors logged but not thrown — CC failures must not break calling flows
  } else {
    console.log('[cc-executor] item marked completed', { itemId, resolutionChannel });
  }
}
