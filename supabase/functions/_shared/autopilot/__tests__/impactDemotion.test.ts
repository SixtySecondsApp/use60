/**
 * Impact-Weighted Demotion — Vitest test suite (AE2-018)
 *
 * Tests:
 * - calculateImpactMultiplier factor components
 * - High-value deal undo triggers emergency (multiplier > 2.0)
 * - Low-value task undo stays at warn
 * - Multiplier capped at 4.0
 * - ACTION_REVERSIBILITY map accuracy
 *
 * Since calculateImpactMultiplier is not exported, we test it indirectly
 * through evaluateDemotionTriggers which calls it when context is provided.
 */

import { describe, test, expect, vi, beforeEach } from 'vitest';
import { evaluateDemotionTriggers } from '../demotionEngine.ts';

// ─── Mock Helpers ────────────────────────────────────────────────────────────

function makeMockSupabase(overrides: {
  currentTier?: string | null;
  signals?: Array<{ signal: string; created_at: string }>;
}) {
  const { currentTier = 'auto', signals = [] } = overrides;

  const createChain = (tableName: string) => {
    const chain: Record<string, any> = {};
    chain.select = vi.fn().mockReturnValue(chain);
    chain.eq = vi.fn().mockReturnValue(chain);
    chain.is = vi.fn().mockReturnValue(chain);
    chain.gte = vi.fn().mockReturnValue(chain);
    chain.order = vi.fn().mockReturnValue(chain);
    chain.limit = vi.fn().mockReturnValue(chain);

    chain.maybeSingle = vi.fn().mockImplementation(() => {
      if (tableName === 'autopilot_confidence') {
        if (currentTier === null) {
          return Promise.resolve({ data: null, error: null });
        }
        return Promise.resolve({
          data: { current_tier: currentTier },
          error: null,
        });
      }
      return Promise.resolve({ data: null, error: null });
    });

    // For the signals query which returns an array (not maybeSingle)
    chain.then = vi.fn().mockImplementation((cb: any) => {
      if (tableName === 'autopilot_signals') {
        return Promise.resolve(cb({ data: signals, error: null }));
      }
      return Promise.resolve(cb({ data: null, error: null }));
    });

    // Override: from('autopilot_signals').select(...).eq(...).eq(...).gte(...)
    // returns {data, error} directly (no maybeSingle)
    if (tableName === 'autopilot_signals') {
      // The function awaits the chain directly after .gte()
      // The chain.gte returns chain, but the await expects a promise
      const originalGte = chain.gte;
      let gteCallCount = 0;
      chain.gte = vi.fn().mockImplementation((...args: any[]) => {
        gteCallCount++;
        // Only the last .gte() in the chain triggers the resolution
        // The actual code does: .eq().eq().gte() -> awaits this
        // But we need the chain to resolve as a promise
        const result = originalGte(...args);
        // Make the chain thenable
        result.then = (resolve: any) => {
          return Promise.resolve({ data: signals, error: null }).then(resolve);
        };
        // But also keep it as a chain for further chaining
        return result;
      });
    }

    return chain;
  };

  return {
    from: vi.fn().mockImplementation((table: string) => createChain(table)),
  };
}

/**
 * Creates a set of signals with undo events over the specified time windows.
 */
function buildSignals(overrides: {
  undos3d?: number;
  undos7d?: number;
  undos14d?: number;
  totalExtra7d?: number;
  totalExtra14d?: number;
}): Array<{ signal: string; created_at: string }> {
  const now = Date.now();
  const signals: Array<{ signal: string; created_at: string }> = [];

  const { undos3d = 0, undos7d = 0, undos14d = 0, totalExtra7d = 0, totalExtra14d = 0 } = overrides;

  // Add undo signals in the 3-day window
  for (let i = 0; i < undos3d; i++) {
    signals.push({
      signal: 'undone',
      created_at: new Date(now - 1 * 24 * 60 * 60 * 1000).toISOString(), // 1 day ago
    });
  }

  // Add undo signals in the 7-day window (but not 3-day)
  const undos7dOnly = undos7d - undos3d;
  for (let i = 0; i < Math.max(0, undos7dOnly); i++) {
    signals.push({
      signal: 'undone',
      created_at: new Date(now - 5 * 24 * 60 * 60 * 1000).toISOString(), // 5 days ago
    });
  }

  // Add undo signals in the 14-day window (but not 7-day)
  const undos14dOnly = undos14d - undos7d;
  for (let i = 0; i < Math.max(0, undos14dOnly); i++) {
    signals.push({
      signal: 'undone',
      created_at: new Date(now - 10 * 24 * 60 * 60 * 1000).toISOString(), // 10 days ago
    });
  }

  // Add non-undo signals in the 7-day window for rate calculation
  for (let i = 0; i < totalExtra7d; i++) {
    signals.push({
      signal: 'approved',
      created_at: new Date(now - 2 * 24 * 60 * 60 * 1000).toISOString(), // 2 days ago
    });
  }

  // Add non-undo signals in the 14-day window (but not 7-day)
  for (let i = 0; i < totalExtra14d; i++) {
    signals.push({
      signal: 'approved',
      created_at: new Date(now - 12 * 24 * 60 * 60 * 1000).toISOString(), // 12 days ago
    });
  }

  return signals;
}

// ─── Tests ───────────────────────────────────────────────────────────────────

describe('evaluateDemotionTriggers', () => {
  test('does not trigger when current tier is not auto', async () => {
    const supabase = makeMockSupabase({ currentTier: 'approve' });
    const result = await evaluateDemotionTriggers(
      supabase as never, 'user1', 'org1', 'crm.note_add',
    );
    expect(result.triggered).toBe(false);
  });

  test('does not trigger when no confidence data exists', async () => {
    const supabase = makeMockSupabase({ currentTier: null });
    const result = await evaluateDemotionTriggers(
      supabase as never, 'user1', 'org1', 'crm.note_add',
    );
    expect(result.triggered).toBe(false);
  });
});

describe('impact multiplier via evaluateDemotionTriggers', () => {
  test('high-value deal with senior contact escalates demote to emergency', async () => {
    // Set up signals that trigger DEMOTE (>8% undo rate in 14 days, >=10 actions)
    // 2 undos + 20 approved in 14 days = 2/22 = 9.1% > 8% AND 22 >= 10
    const signals = buildSignals({
      undos14d: 2,
      totalExtra14d: 20,
    });

    const supabase = makeMockSupabase({
      currentTier: 'auto',
      signals,
    });

    const result = await evaluateDemotionTriggers(
      supabase as never, 'user1', 'org1', 'email.send',
      {
        dealValue: 200000,          // factor = 1.0
        contactTitle: 'CEO',        // factor = 1.0
        actionReversibility: 0.8,   // factor = 0.8
      },
    );

    // multiplier = 1 + 1.0 + 1.0 + 0.8 = 3.8 > 2.0
    expect(result.triggered).toBe(true);
    expect(result.severity).toBe('emergency');
    expect(result.impact_multiplier).toBeGreaterThan(2.0);
    expect(result.impact_factors).toBeDefined();
    expect(result.impact_factors!.deal_value_factor).toBe(1.0);
    expect(result.impact_factors!.seniority_factor).toBe(1.0);
  });

  test('low-value task with no context stays at demote severity', async () => {
    // Set up signals that trigger DEMOTE (>8% undo rate in 14 days, >=10 actions)
    const signals = buildSignals({
      undos14d: 2,
      totalExtra14d: 20,
    });

    const supabase = makeMockSupabase({
      currentTier: 'auto',
      signals,
    });

    const result = await evaluateDemotionTriggers(
      supabase as never, 'user1', 'org1', 'task.create',
      {
        dealValue: 5000,       // factor = 0.0 (<$25K)
        contactTitle: 'Intern', // factor = 0.0 (IC)
        // task.create reversibility = 0.0 from ACTION_REVERSIBILITY map
      },
    );

    // multiplier = 1 + 0.0 + 0.0 + 0.0 = 1.0 <= 2.0
    expect(result.triggered).toBe(true);
    expect(result.severity).toBe('demote');
    expect(result.impact_multiplier).toBeLessThanOrEqual(2.0);
  });

  test('warn severity with high context escalates to emergency', async () => {
    // Set up signals that trigger WARN (>10% undo rate in 7 days, >=5 actions)
    // but NOT DEMOTE (<=8% undo rate in 14 days).
    // 7-day: 2 undos + 10 approved = 12 total, 2/12 = 16.7% > 10% AND 12 >= 5 -> WARN
    // 14-day: 2 undos + 10 + 40 extra = 52 total, 2/52 = 3.8% < 8% -> not DEMOTE
    const signals = buildSignals({
      undos7d: 2,
      totalExtra7d: 10,
      totalExtra14d: 40,
    });

    const supabase = makeMockSupabase({
      currentTier: 'auto',
      signals,
    });

    const result = await evaluateDemotionTriggers(
      supabase as never, 'user1', 'org1', 'crm.deal_stage_change',
      {
        dealValue: 150000,           // factor = 1.0
        contactTitle: 'VP of Sales', // factor = 0.7
        actionReversibility: 0.5,    // factor = 0.5
      },
    );

    // multiplier = 1 + 1.0 + 0.7 + 0.5 = 3.2 > 2.0
    expect(result.triggered).toBe(true);
    expect(result.severity).toBe('emergency');
    expect(result.trigger_name).toBe('impact_escalated_warn');
  });

  test('multiplier is capped at 4.0', async () => {
    // Set up signals that trigger DEMOTE
    const signals = buildSignals({
      undos14d: 2,
      totalExtra14d: 20,
    });

    const supabase = makeMockSupabase({
      currentTier: 'auto',
      signals,
    });

    const result = await evaluateDemotionTriggers(
      supabase as never, 'user1', 'org1', 'proposal.send',
      {
        dealValue: 500000,           // factor = 1.0
        contactTitle: 'CEO',         // factor = 1.0
        actionReversibility: 1.0,    // factor = 1.0
      },
    );

    // Raw: 1 + 1.0 + 1.0 + 1.0 = 4.0 (at cap)
    expect(result.impact_multiplier).toBeLessThanOrEqual(4.0);
  });

  test('no context provided: no impact multiplier on result', async () => {
    // Set up signals that trigger DEMOTE
    const signals = buildSignals({
      undos14d: 2,
      totalExtra14d: 20,
    });

    const supabase = makeMockSupabase({
      currentTier: 'auto',
      signals,
    });

    const result = await evaluateDemotionTriggers(
      supabase as never, 'user1', 'org1', 'crm.note_add',
      // No context
    );

    expect(result.triggered).toBe(true);
    expect(result.severity).toBe('demote');
    expect(result.impact_multiplier).toBeUndefined();
    expect(result.impact_factors).toBeUndefined();
  });
});

describe('impact multiplier factor components', () => {
  test('deal value $25K-$100K gives 0.5 factor', async () => {
    const signals = buildSignals({
      undos14d: 2,
      totalExtra14d: 20,
    });

    const supabase = makeMockSupabase({
      currentTier: 'auto',
      signals,
    });

    const result = await evaluateDemotionTriggers(
      supabase as never, 'user1', 'org1', 'task.create',
      {
        dealValue: 50000,
        contactTitle: 'Intern',
      },
    );

    expect(result.impact_factors!.deal_value_factor).toBe(0.5);
  });

  test('director title gives 0.5 seniority factor', async () => {
    const signals = buildSignals({
      undos14d: 2,
      totalExtra14d: 20,
    });

    const supabase = makeMockSupabase({
      currentTier: 'auto',
      signals,
    });

    const result = await evaluateDemotionTriggers(
      supabase as never, 'user1', 'org1', 'task.create',
      {
        dealValue: 5000,
        contactTitle: 'Director of Sales',
      },
    );

    expect(result.impact_factors!.seniority_factor).toBe(0.5);
  });

  test('uses ACTION_REVERSIBILITY map when no context reversibility provided', async () => {
    const signals = buildSignals({
      undos14d: 2,
      totalExtra14d: 20,
    });

    const supabase = makeMockSupabase({
      currentTier: 'auto',
      signals,
    });

    const result = await evaluateDemotionTriggers(
      supabase as never, 'user1', 'org1', 'email.send',
      {
        dealValue: 5000,
        contactTitle: 'Intern',
        // No actionReversibility — should use ACTION_REVERSIBILITY['email.send'] = 0.8
      },
    );

    expect(result.impact_factors!.reversibility_factor).toBe(0.8);
  });

  test('context actionReversibility overrides ACTION_REVERSIBILITY map', async () => {
    const signals = buildSignals({
      undos14d: 2,
      totalExtra14d: 20,
    });

    const supabase = makeMockSupabase({
      currentTier: 'auto',
      signals,
    });

    const result = await evaluateDemotionTriggers(
      supabase as never, 'user1', 'org1', 'email.send',
      {
        dealValue: 5000,
        contactTitle: 'Intern',
        actionReversibility: 0.2, // Override the 0.8 from the map
      },
    );

    expect(result.impact_factors!.reversibility_factor).toBe(0.2);
  });
});
