/**
 * Command Centre Undo Execution
 *
 * Provides rollback capability for auto-executed Command Centre items.
 * Reps can undo any auto_exec'd action within a 24-hour window.
 * Undoing records a 'rejected' outcome in action_trust_scores, which
 * resets the trust threshold for that action type per drift rules.
 *
 * Story: CC12-002
 */

import { createClient } from 'https://esm.sh/@supabase/supabase-js@2.43.4';
import { DraftedAction } from './types.ts';
import { mapDraftedActionToActionType, recordOutcome } from './trustScorer.ts';

// ---------------------------------------------------------------------------
// Constants
// ---------------------------------------------------------------------------

const UNDO_WINDOW_HOURS = 24;
const UNDO_WINDOW_MS = UNDO_WINDOW_HOURS * 60 * 60 * 1000;

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export interface UndoableItem {
  id: string;
  title: string;
  item_type: string;
  drafted_action: DraftedAction;
  resolved_at: string;
  undo_expires_at: string;
}

// ---------------------------------------------------------------------------
// undoAutoExecution
// ---------------------------------------------------------------------------

/**
 * Rolls back a single auto-executed Command Centre item.
 *
 * Validates:
 *   - Item exists and belongs to userId
 *   - status = 'completed' and resolution_channel = 'auto_exec'
 *   - resolved_at is within the 24h undo window
 *
 * On success:
 *   - Resets item to status = 'ready', clears resolution_channel and resolved_at
 *   - Appends undo record to context.undo_history
 *   - Records 'rejected' outcome in action_trust_scores (resets threshold)
 */
export async function undoAutoExecution(
  supabase: ReturnType<typeof createClient>,
  itemId: string,
  userId: string,
): Promise<{ success: boolean; reason?: string }> {
  try {
    // Fetch the item — use maybeSingle() since it may not exist
    const { data: item, error: fetchError } = await supabase
      .from('command_centre_items')
      .select(
        'id, user_id, item_type, status, resolution_channel, resolved_at, drafted_action, context',
      )
      .eq('id', itemId)
      .maybeSingle();

    if (fetchError) {
      console.error('[cc-undo] fetch error', { itemId, userId, error: fetchError.message });
      return { success: false, reason: 'Item not found' };
    }

    if (!item) {
      return { success: false, reason: 'Item not found' };
    }

    if (item.user_id !== userId) {
      return { success: false, reason: 'Not your item' };
    }

    if (item.status !== 'completed' || item.resolution_channel !== 'auto_exec') {
      return { success: false, reason: 'Not auto-executed' };
    }

    if (!item.resolved_at) {
      return { success: false, reason: 'Not auto-executed' };
    }

    const resolvedAt = new Date(item.resolved_at).getTime();
    const now = Date.now();
    if (now - resolvedAt > UNDO_WINDOW_MS) {
      return { success: false, reason: 'Undo window expired (24h)' };
    }

    // Build updated context with undo_history entry
    const existingContext: Record<string, unknown> = item.context ?? {};
    const undoHistory: unknown[] = Array.isArray(existingContext.undo_history)
      ? (existingContext.undo_history as unknown[])
      : [];

    const updatedContext: Record<string, unknown> = {
      ...existingContext,
      undo_history: [
        ...undoHistory,
        {
          undone_at: new Date().toISOString(),
          previous_resolution: 'auto_exec',
        },
      ],
    };

    // Reset item back to 'ready'
    const { error: updateError } = await supabase
      .from('command_centre_items')
      .update({
        status: 'ready',
        resolution_channel: null,
        resolved_at: null,
        context: updatedContext,
        updated_at: new Date().toISOString(),
      })
      .eq('id', itemId)
      .eq('user_id', userId);

    if (updateError) {
      console.error('[cc-undo] update error', { itemId, userId, error: updateError.message });
      return { success: false, reason: 'Item not found' };
    }

    // Record rejection in trust scores — this resets the threshold for the action type
    const draftedAction = item.drafted_action as DraftedAction | null;
    if (draftedAction?.type) {
      const actionType = mapDraftedActionToActionType(draftedAction.type, item.item_type);
      await recordOutcome(supabase, userId, actionType, 'rejected');
    }

    console.log('[cc-undo] undo successful', { itemId, userId });
    return { success: true };
  } catch (err) {
    console.error('[cc-undo] undoAutoExecution unexpected error', { itemId, userId, err });
    return { success: false, reason: 'Item not found' };
  }
}

// ---------------------------------------------------------------------------
// canUndoItem
// ---------------------------------------------------------------------------

/**
 * Quick eligibility check for undoing an item — does not perform the undo.
 * Returns the expiry timestamp of the undo window when eligible.
 */
export async function canUndoItem(
  supabase: ReturnType<typeof createClient>,
  itemId: string,
  userId: string,
): Promise<{ canUndo: boolean; reason?: string; expiresAt?: string }> {
  try {
    const { data: item, error: fetchError } = await supabase
      .from('command_centre_items')
      .select('id, user_id, status, resolution_channel, resolved_at')
      .eq('id', itemId)
      .maybeSingle();

    if (fetchError || !item) {
      return { canUndo: false, reason: 'Item not found' };
    }

    if (item.user_id !== userId) {
      return { canUndo: false, reason: 'Not your item' };
    }

    if (item.status !== 'completed' || item.resolution_channel !== 'auto_exec') {
      return { canUndo: false, reason: 'Not auto-executed' };
    }

    if (!item.resolved_at) {
      return { canUndo: false, reason: 'Not auto-executed' };
    }

    const resolvedAt = new Date(item.resolved_at).getTime();
    const expiresAt = new Date(resolvedAt + UNDO_WINDOW_MS).toISOString();

    if (Date.now() > resolvedAt + UNDO_WINDOW_MS) {
      return { canUndo: false, reason: 'Undo window expired (24h)', expiresAt };
    }

    return { canUndo: true, expiresAt };
  } catch (err) {
    console.error('[cc-undo] canUndoItem unexpected error', { itemId, userId, err });
    return { canUndo: false, reason: 'Item not found' };
  }
}

// ---------------------------------------------------------------------------
// getUndoableItems
// ---------------------------------------------------------------------------

/**
 * Returns all items for this user that were auto_exec'd within the last 24 hours
 * and are therefore still eligible for undo.
 */
export async function getUndoableItems(
  supabase: ReturnType<typeof createClient>,
  userId: string,
): Promise<UndoableItem[]> {
  try {
    const windowStart = new Date(Date.now() - UNDO_WINDOW_MS).toISOString();

    const { data, error } = await supabase
      .from('command_centre_items')
      .select('id, title, item_type, drafted_action, resolved_at')
      .eq('user_id', userId)
      .eq('status', 'completed')
      .eq('resolution_channel', 'auto_exec')
      .gte('resolved_at', windowStart)
      .order('resolved_at', { ascending: false });

    if (error) {
      console.error('[cc-undo] getUndoableItems error', { userId, error: error.message });
      return [];
    }

    if (!data) return [];

    return data.map((item) => ({
      id: item.id,
      title: item.title,
      item_type: item.item_type,
      drafted_action: item.drafted_action as DraftedAction,
      resolved_at: item.resolved_at,
      undo_expires_at: new Date(
        new Date(item.resolved_at).getTime() + UNDO_WINDOW_MS,
      ).toISOString(),
    }));
  } catch (err) {
    console.error('[cc-undo] getUndoableItems unexpected error', { userId, err });
    return [];
  }
}
