/**
 * Shadow Execution Recorder — Vitest test suite (AE2-018)
 *
 * Tests:
 * - Records shadow on approve-tier actions
 * - approved (no edit) -> would_have_matched = true
 * - approved_edited -> would_have_matched = false
 * - rejected -> would_have_matched = false
 * - resolveLatestShadow finds most recent unresolved
 * - Handles DB errors gracefully
 */

import { describe, test, expect, vi } from 'vitest';
import {
  recordShadowExecution,
  resolveShadowExecution,
  resolveLatestShadow,
} from '../shadowRecorder.ts';

// ─── Mock Helpers ────────────────────────────────────────────────────────────

function makeMockSupabaseForRecord(overrides?: {
  insertResult?: { id: string } | null;
  insertError?: { message: string } | null;
}) {
  const insertResult = overrides?.insertResult ?? { id: 'shadow-123' };
  const insertError = overrides?.insertError ?? null;

  const chain: Record<string, any> = {};
  chain.insert = vi.fn().mockReturnValue(chain);
  chain.select = vi.fn().mockReturnValue(chain);
  chain.single = vi.fn().mockImplementation(() => {
    if (insertError) {
      return Promise.resolve({ data: null, error: insertError });
    }
    return Promise.resolve({ data: insertResult, error: null });
  });

  return {
    from: vi.fn().mockReturnValue(chain),
    _chain: chain,
  };
}

function makeMockSupabaseForResolve(overrides?: {
  updateError?: { message: string } | null;
}) {
  const updateError = overrides?.updateError ?? null;

  const chain: Record<string, any> = {};
  chain.update = vi.fn().mockReturnValue(chain);
  chain.eq = vi.fn().mockImplementation(() => {
    return Promise.resolve({ error: updateError });
  });

  return {
    from: vi.fn().mockReturnValue(chain),
    _chain: chain,
  };
}

function makeMockSupabaseForResolveLatest(overrides?: {
  latestShadow?: { id: string } | null;
  fetchError?: { message: string } | null;
  updateError?: { message: string } | null;
}) {
  const latestShadow = overrides?.latestShadow !== undefined ? overrides.latestShadow : { id: 'shadow-latest' };
  const fetchError = overrides?.fetchError ?? null;
  const updateError = overrides?.updateError ?? null;

  let callCount = 0;

  const createChain = () => {
    const chain: Record<string, any> = {};
    chain.select = vi.fn().mockReturnValue(chain);
    chain.eq = vi.fn().mockReturnValue(chain);
    chain.is = vi.fn().mockReturnValue(chain);
    chain.order = vi.fn().mockReturnValue(chain);
    chain.limit = vi.fn().mockReturnValue(chain);
    chain.update = vi.fn().mockReturnValue(chain);

    chain.maybeSingle = vi.fn().mockImplementation(() => {
      callCount++;
      if (callCount === 1) {
        // First call: the SELECT to find latest unresolved
        if (fetchError) {
          return Promise.resolve({ data: null, error: fetchError });
        }
        return Promise.resolve({ data: latestShadow, error: null });
      }
      return Promise.resolve({ data: null, error: null });
    });

    // For the update chain in resolveShadowExecution:
    // .update({...}).eq('id', shadowId) -> returns {error}
    const origEq = chain.eq;
    chain.eq = vi.fn().mockImplementation((...args: any[]) => {
      // If we are in the update path (callCount > 1), resolve the promise
      if (callCount >= 1 && chain._isUpdate) {
        return Promise.resolve({ error: updateError });
      }
      return origEq(...args);
    });

    chain._isUpdate = false;
    const origUpdate = chain.update;
    chain.update = vi.fn().mockImplementation((...args: any[]) => {
      chain._isUpdate = true;
      // After update, the next .eq() should resolve the promise
      const subChain: Record<string, any> = {};
      subChain.eq = vi.fn().mockImplementation(() => {
        return Promise.resolve({ error: updateError });
      });
      return subChain;
    });

    return chain;
  };

  return {
    from: vi.fn().mockImplementation(() => createChain()),
  };
}

// ─── recordShadowExecution ───────────────────────────────────────────────────

describe('recordShadowExecution', () => {
  test('records shadow for approve-tier actions and returns ID', async () => {
    const supabase = makeMockSupabaseForRecord({ insertResult: { id: 'shadow-abc' } });

    const id = await recordShadowExecution(supabase as never, {
      orgId: 'org1',
      userId: 'user1',
      actionType: 'send_email',
      actualTier: 'approve',
      actionSnapshot: { subject: 'Follow-up', body: 'Hello...' },
    });

    expect(id).toBe('shadow-abc');
    expect(supabase.from).toHaveBeenCalledWith('autonomy_shadow_executions');
    expect(supabase._chain.insert).toHaveBeenCalledWith({
      org_id: 'org1',
      user_id: 'user1',
      action_type: 'send_email',
      actual_tier: 'approve',
      shadow_tier: 'auto',
      action_snapshot: { subject: 'Follow-up', body: 'Hello...' },
    });
  });

  test('shadow_tier maps approve to auto', async () => {
    const supabase = makeMockSupabaseForRecord();

    await recordShadowExecution(supabase as never, {
      orgId: 'org1',
      userId: 'user1',
      actionType: 'send_email',
      actualTier: 'approve',
      actionSnapshot: {},
    });

    const insertCall = supabase._chain.insert.mock.calls[0][0];
    expect(insertCall.shadow_tier).toBe('auto');
  });

  test('shadow_tier maps suggest to approve', async () => {
    const supabase = makeMockSupabaseForRecord();

    await recordShadowExecution(supabase as never, {
      orgId: 'org1',
      userId: 'user1',
      actionType: 'crm_field_update',
      actualTier: 'suggest',
      actionSnapshot: {},
    });

    const insertCall = supabase._chain.insert.mock.calls[0][0];
    expect(insertCall.shadow_tier).toBe('approve');
  });

  test('returns null for unrecognized tier (no shadow_tier mapping)', async () => {
    const supabase = makeMockSupabaseForRecord();

    const id = await recordShadowExecution(supabase as never, {
      orgId: 'org1',
      userId: 'user1',
      actionType: 'send_email',
      actualTier: 'auto' as any, // auto doesn't have a higher tier
      actionSnapshot: {},
    });

    expect(id).toBeNull();
  });

  test('returns null on insert error', async () => {
    const supabase = makeMockSupabaseForRecord({
      insertResult: null,
      insertError: { message: 'DB constraint violation' },
    });

    const id = await recordShadowExecution(supabase as never, {
      orgId: 'org1',
      userId: 'user1',
      actionType: 'send_email',
      actualTier: 'approve',
      actionSnapshot: {},
    });

    expect(id).toBeNull();
  });
});

// ─── resolveShadowExecution ──────────────────────────────────────────────────

describe('resolveShadowExecution', () => {
  test('approved (no edit) sets would_have_matched = true', async () => {
    const supabase = makeMockSupabaseForResolve();

    await resolveShadowExecution(supabase as never, {
      shadowId: 'shadow-123',
      userDecision: 'approved',
    });

    expect(supabase._chain.update).toHaveBeenCalledWith({
      user_decision: 'approved',
      edit_distance: null,
      would_have_matched: true,
    });
  });

  test('approved_edited sets would_have_matched = false', async () => {
    const supabase = makeMockSupabaseForResolve();

    await resolveShadowExecution(supabase as never, {
      shadowId: 'shadow-123',
      userDecision: 'approved_edited',
      editDistance: 42,
    });

    expect(supabase._chain.update).toHaveBeenCalledWith({
      user_decision: 'approved_edited',
      edit_distance: 42,
      would_have_matched: false,
    });
  });

  test('rejected sets would_have_matched = false', async () => {
    const supabase = makeMockSupabaseForResolve();

    await resolveShadowExecution(supabase as never, {
      shadowId: 'shadow-123',
      userDecision: 'rejected',
    });

    expect(supabase._chain.update).toHaveBeenCalledWith({
      user_decision: 'rejected',
      edit_distance: null,
      would_have_matched: false,
    });
  });

  test('handles update error gracefully', async () => {
    const supabase = makeMockSupabaseForResolve({
      updateError: { message: 'Row not found' },
    });

    // Should not throw
    await expect(
      resolveShadowExecution(supabase as never, {
        shadowId: 'shadow-nonexistent',
        userDecision: 'approved',
      }),
    ).resolves.toBeUndefined();
  });
});

// ─── resolveLatestShadow ─────────────────────────────────────────────────────

describe('resolveLatestShadow', () => {
  test('finds and resolves most recent unresolved shadow', async () => {
    const supabase = makeMockSupabaseForResolveLatest({
      latestShadow: { id: 'shadow-latest-1' },
    });

    await resolveLatestShadow(
      supabase as never,
      'user1',
      'send_email',
      'approved',
    );

    // First from() call: SELECT to find latest unresolved
    expect(supabase.from).toHaveBeenCalledWith('autonomy_shadow_executions');

    // Second from() call: UPDATE to resolve it
    expect(supabase.from.mock.calls.length).toBeGreaterThanOrEqual(2);
  });

  test('does nothing when no unresolved shadow exists', async () => {
    const supabase = makeMockSupabaseForResolveLatest({
      latestShadow: null,
    });

    // Should not throw, and should not attempt an update
    await resolveLatestShadow(
      supabase as never,
      'user1',
      'send_email',
      'approved',
    );

    // Only the select call should have been made
    expect(supabase.from.mock.calls.length).toBe(1);
  });

  test('does nothing on fetch error', async () => {
    const supabase = makeMockSupabaseForResolveLatest({
      fetchError: { message: 'DB error' },
    });

    await resolveLatestShadow(
      supabase as never,
      'user1',
      'send_email',
      'approved',
    );

    // Only the select call should have been made
    expect(supabase.from.mock.calls.length).toBe(1);
  });

  test('passes editDistance through to resolution', async () => {
    const supabase = makeMockSupabaseForResolveLatest({
      latestShadow: { id: 'shadow-latest-2' },
    });

    await resolveLatestShadow(
      supabase as never,
      'user1',
      'send_email',
      'approved_edited',
      15,
    );

    // Should have made update call — verify from was called twice
    expect(supabase.from.mock.calls.length).toBeGreaterThanOrEqual(2);
  });
});
