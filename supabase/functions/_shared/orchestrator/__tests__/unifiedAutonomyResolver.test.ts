/**
 * Unified Autonomy Resolver — Vitest test suite (AE2-018)
 *
 * Tests:
 * - Org ceiling wins over user tier (org=approve, user=auto -> approve)
 * - User tier wins when more restrictive (org=auto, user=suggest -> suggest)
 * - Aligned source when both agree
 * - Context risk > 0.7 downgrades auto to approve
 * - Context risk > 0.9 downgrades any tier to suggest (except disabled)
 * - Cache invalidation works
 * - Fallback to approve on error
 */

import { describe, test, expect, vi, beforeEach } from 'vitest';
import {
  resolveAutonomy,
  invalidateUnifiedCache,
} from '../unifiedAutonomyResolver.ts';
import { invalidatePolicyCache } from '../autonomyResolver.ts';

// ─── Mock Helpers ────────────────────────────────────────────────────────────

/**
 * Creates a mock Supabase client that returns pre-configured responses.
 *
 * The unified resolver makes queries in this order:
 *   1. resolveAutonomyPolicy (System A) — up to 4 chained maybeSingle calls
 *   2. autopilot_confidence (System B) — 1 maybeSingle call
 *   3. (optionally) calculateContextRisk — multiple chained queries
 *
 * We track which table is being queried via from() calls and return
 * appropriate data for each.
 */
function makeMockSupabase(overrides: {
  /** System A: the org policy to return. Defaults to 'approve'. */
  orgPolicyResult?: string;
  orgPolicySource?: string;
  /** System B: the user's confidence row. Null = no data. */
  userConfidence?: {
    current_tier: string;
    score: number;
    approval_rate: number;
    clean_approval_rate: number;
    total_signals: number;
    cooldown_until: string | null;
  } | null;
  /** For context risk: deal data */
  deal?: { amount: number | null; stage_id: string | null } | null;
  /** For context risk: contact data */
  contact?: { job_title: string | null } | null;
  /** For context risk: warmth data */
  warmth?: { warmth_score: number | null } | null;
  /** For context risk: stage position */
  stagePosition?: { position: number } | null;
  /** Force resolveAutonomyPolicy to throw */
  throwOnPolicy?: boolean;
}) {
  const orgPolicyResult = overrides.orgPolicyResult ?? 'approve';
  const orgPolicySource = overrides.orgPolicySource ?? 'default';
  const userConfidence = overrides.userConfidence ?? null;

  // Track per-table call counts so we can return different data for
  // sequential calls to the same table pattern
  let autonomyPolicyCallCount = 0;

  const createChain = (tableName: string) => {
    const chain: Record<string, any> = {};
    chain.select = vi.fn().mockReturnValue(chain);
    chain.eq = vi.fn().mockReturnValue(chain);
    chain.is = vi.fn().mockReturnValue(chain);
    chain.gte = vi.fn().mockReturnValue(chain);
    chain.order = vi.fn().mockReturnValue(chain);
    chain.limit = vi.fn().mockReturnValue(chain);
    chain.insert = vi.fn().mockReturnValue(chain);
    chain.update = vi.fn().mockReturnValue(chain);
    chain.single = vi.fn().mockReturnValue(chain);
    chain.then = vi.fn().mockImplementation((cb: any) => {
      cb({ error: null });
      return Promise.resolve();
    });

    chain.maybeSingle = vi.fn().mockImplementation(() => {
      if (overrides.throwOnPolicy && tableName === 'autonomy_policies') {
        return Promise.reject(new Error('Simulated DB error'));
      }

      if (tableName === 'autonomy_policies') {
        autonomyPolicyCallCount++;
        // The autonomy resolver queries this table multiple times:
        // 1st = user-level, 2nd = org-level, 3rd+ = preset configs
        if (autonomyPolicyCallCount === 1) {
          // User-level: return null (we don't set user-level overrides in this mock)
          return Promise.resolve({ data: null, error: null });
        }
        if (autonomyPolicyCallCount === 2) {
          // Org-level: return the configured org policy
          return Promise.resolve({
            data: { policy: orgPolicyResult, preset_name: null },
            error: null,
          });
        }
        return Promise.resolve({ data: null, error: null });
      }

      if (tableName === 'autopilot_confidence') {
        return Promise.resolve({ data: userConfidence, error: null });
      }

      if (tableName === 'agent_config_org_overrides') {
        return Promise.resolve({ data: null, error: null });
      }

      if (tableName === 'agent_config_defaults') {
        return Promise.resolve({ data: { config_value: 'balanced' }, error: null });
      }

      // Context risk scorer tables
      if (tableName === 'deals') {
        return Promise.resolve({ data: overrides.deal ?? null, error: null });
      }
      if (tableName === 'contacts') {
        return Promise.resolve({ data: overrides.contact ?? null, error: null });
      }
      if (tableName === 'contact_warmth_scores') {
        return Promise.resolve({ data: overrides.warmth ?? null, error: null });
      }
      if (tableName === 'pipeline_stages') {
        return Promise.resolve({ data: overrides.stagePosition ?? null, error: null });
      }

      return Promise.resolve({ data: null, error: null });
    });

    return chain;
  };

  return {
    from: vi.fn().mockImplementation((table: string) => createChain(table)),
  };
}

// ─── Tests ───────────────────────────────────────────────────────────────────

describe('resolveAutonomy', () => {
  beforeEach(() => {
    invalidateUnifiedCache();
    invalidatePolicyCache();
  });

  // ─── Tier combination logic ──────────────────────────────────────────────

  test('org ceiling wins over user tier when org is more restrictive', async () => {
    const supabase = makeMockSupabase({
      orgPolicyResult: 'approve',
      userConfidence: {
        current_tier: 'auto',
        score: 0.95,
        approval_rate: 0.98,
        clean_approval_rate: 0.97,
        total_signals: 50,
        cooldown_until: null,
      },
    });

    const result = await resolveAutonomy(supabase as never, 'org1', 'user1', 'send_email');

    expect(result.tier).toBe('approve');
    expect(result.source).toBe('org_policy');
    expect(result.userTier).toBe('auto');
  });

  test('user tier wins when more restrictive than org policy', async () => {
    const supabase = makeMockSupabase({
      orgPolicyResult: 'auto',
      userConfidence: {
        current_tier: 'suggest',
        score: 0.3,
        approval_rate: 0.5,
        clean_approval_rate: 0.45,
        total_signals: 10,
        cooldown_until: null,
      },
    });

    const result = await resolveAutonomy(supabase as never, 'org1', 'user1', 'send_email');

    expect(result.tier).toBe('suggest');
    expect(result.source).toBe('user_autopilot');
    expect(result.userTier).toBe('suggest');
  });

  test('aligned source when both systems agree', async () => {
    const supabase = makeMockSupabase({
      orgPolicyResult: 'approve',
      userConfidence: {
        current_tier: 'approve',
        score: 0.6,
        approval_rate: 0.85,
        clean_approval_rate: 0.80,
        total_signals: 30,
        cooldown_until: null,
      },
    });

    const result = await resolveAutonomy(supabase as never, 'org1', 'user1', 'send_email');

    expect(result.tier).toBe('approve');
    expect(result.source).toBe('aligned');
  });

  test('falls back to org policy when no user confidence data', async () => {
    const supabase = makeMockSupabase({
      orgPolicyResult: 'auto',
      userConfidence: null,
    });

    const result = await resolveAutonomy(supabase as never, 'org1', 'user1', 'send_email');

    expect(result.tier).toBe('auto');
    expect(result.source).toBe('org_policy');
    expect(result.userTier).toBeNull();
    expect(result.confidenceScore).toBeNull();
  });

  // ─── Context risk adjustments ────────────────────────────────────────────

  test('context risk > 0.7 downgrades auto to approve', async () => {
    // Set up: org=auto, user=auto (aligned at auto), context risk is high
    const supabase = makeMockSupabase({
      orgPolicyResult: 'auto',
      userConfidence: {
        current_tier: 'auto',
        score: 0.95,
        approval_rate: 0.98,
        clean_approval_rate: 0.97,
        total_signals: 50,
        cooldown_until: null,
      },
      // Context risk inputs that will produce a score > 0.7
      // deal_value=$200K -> 1.0 * 0.30 = 0.30
      // contact_seniority=CEO -> 1.0 * 0.25 = 0.25
      // warmth=0 (cold) -> 1.0 * 0.15 = 0.15
      // actionReversibility=0.8 -> 0.8 * 0.10 = 0.08
      // Total = 0.78 (> 0.7)
    });

    const result = await resolveAutonomy(supabase as never, 'org1', 'user1', 'send_email', {
      dealValue: 200000,
      contactTitle: 'CEO',
      warmthScore: 0,
      actionReversibility: 0.8,
    });

    expect(result.tier).toBe('approve');
    expect(result.contextAdjusted).toBe(true);
    expect(result.source).toBe('context_risk');
    expect(result.contextRisk).toBeGreaterThan(0.7);
  });

  test('context risk > 0.9 downgrades approve to suggest', async () => {
    // Set up: both agree on approve, but extremely high context risk should push to suggest
    const supabase = makeMockSupabase({
      orgPolicyResult: 'auto',
      userConfidence: {
        current_tier: 'auto',
        score: 0.95,
        approval_rate: 0.98,
        clean_approval_rate: 0.97,
        total_signals: 50,
        cooldown_until: null,
      },
      // Context risk inputs that will produce a score > 0.9
      // deal_value=$200K -> 1.0 * 0.30 = 0.30
      // contact_seniority=CEO -> 1.0 * 0.25 = 0.25
      // deal_stage position 8 -> 1.0 * 0.20 = 0.20
      // warmth=0 (cold) -> 1.0 * 0.15 = 0.15
      // actionReversibility=1.0 -> 1.0 * 0.10 = 0.10
      // Total = 1.0 (> 0.9)
      stagePosition: { position: 8 },
    });

    const result = await resolveAutonomy(supabase as never, 'org1', 'user1', 'send_email', {
      dealValue: 200000,
      contactTitle: 'CEO',
      dealStage: 'stage-uuid',
      warmthScore: 0,
      actionReversibility: 1.0,
    });

    expect(result.tier).toBe('suggest');
    expect(result.contextAdjusted).toBe(true);
    expect(result.source).toBe('context_risk');
    expect(result.contextRisk).toBeGreaterThan(0.9);
  });

  test('context risk does not downgrade disabled tier', async () => {
    const supabase = makeMockSupabase({
      orgPolicyResult: 'disabled',
      userConfidence: null,
    });

    const result = await resolveAutonomy(supabase as never, 'org1', 'user1', 'send_email', {
      dealValue: 200000,
      contactTitle: 'CEO',
      warmthScore: 0,
      actionReversibility: 1.0,
    });

    // disabled is already more restrictive than suggest, so no downgrade
    expect(result.tier).toBe('disabled');
    expect(result.contextAdjusted).toBe(false);
  });

  test('context risk does not downgrade suggest tier (already at suggest)', async () => {
    const supabase = makeMockSupabase({
      orgPolicyResult: 'suggest',
      userConfidence: null,
    });

    const result = await resolveAutonomy(supabase as never, 'org1', 'user1', 'send_email', {
      dealValue: 200000,
      contactTitle: 'CEO',
      warmthScore: 0,
      actionReversibility: 0.8,
    });

    // already at suggest — 0.7 rule only affects auto, 0.9 rule only affects tiers > suggest
    expect(result.tier).toBe('suggest');
    expect(result.contextAdjusted).toBe(false);
  });

  // ─── Cache ───────────────────────────────────────────────────────────────

  test('cache is used for non-context calls', async () => {
    const supabase = makeMockSupabase({
      orgPolicyResult: 'auto',
      userConfidence: null,
    });

    // First call populates cache
    const result1 = await resolveAutonomy(supabase as never, 'org1', 'user1', 'send_email');
    expect(result1.tier).toBe('auto');

    // Second call should return cached result (from() won't be called again for this key)
    const callCountBefore = supabase.from.mock.calls.length;
    const result2 = await resolveAutonomy(supabase as never, 'org1', 'user1', 'send_email');
    expect(result2.tier).toBe('auto');
    expect(supabase.from.mock.calls.length).toBe(callCountBefore); // No new DB calls
  });

  test('cache is skipped when context is provided', async () => {
    const supabase = makeMockSupabase({
      orgPolicyResult: 'auto',
      userConfidence: null,
    });

    // Call with context — should not cache
    await resolveAutonomy(supabase as never, 'org1', 'user1', 'send_email', {
      dealValue: 5000,
    });

    // Another call without context should still hit DB (not use cached context result)
    const callCountBefore = supabase.from.mock.calls.length;
    await resolveAutonomy(supabase as never, 'org1', 'user1', 'send_email');
    expect(supabase.from.mock.calls.length).toBeGreaterThan(callCountBefore);
  });

  test('invalidateUnifiedCache clears cache', async () => {
    const supabase = makeMockSupabase({
      orgPolicyResult: 'auto',
      userConfidence: null,
    });

    // Populate cache
    await resolveAutonomy(supabase as never, 'org1', 'user1', 'send_email');

    // Invalidate
    invalidateUnifiedCache();

    // Next call should hit DB again
    const callCountBefore = supabase.from.mock.calls.length;
    await resolveAutonomy(supabase as never, 'org1', 'user1', 'send_email');
    expect(supabase.from.mock.calls.length).toBeGreaterThan(callCountBefore);
  });

  // ─── Error fallback ──────────────────────────────────────────────────────

  test('falls back to approve on resolution error', async () => {
    // We need the error to propagate to resolveAutonomy's outer catch block.
    // resolveAutonomyPolicy has its own try/catch, so we can't break it there.
    // Instead, we make the autopilot_confidence query throw synchronously.
    const supabase = makeMockSupabase({
      orgPolicyResult: 'approve',
      userConfidence: null,
    });

    // Override: when from('autopilot_confidence') is called, throw synchronously.
    // This happens inside resolveAutonomy's try block, after resolveAutonomyPolicy
    // has already completed.
    const originalFrom = supabase.from;
    supabase.from = vi.fn().mockImplementation((table: string) => {
      if (table === 'autopilot_confidence') {
        throw new Error('Simulated catastrophic DB failure');
      }
      return originalFrom(table);
    });

    const result = await resolveAutonomy(supabase as never, 'org1', 'user1', 'send_email');

    expect(result.tier).toBe('approve');
    expect(result.source).toBe('default');
    expect(result.explanation).toContain('error');
  });

  // ─── Explainability factors ──────────────────────────────────────────────

  test('includes org_policy factor in decision', async () => {
    const supabase = makeMockSupabase({
      orgPolicyResult: 'approve',
      userConfidence: null,
    });

    const result = await resolveAutonomy(supabase as never, 'org1', 'user1', 'send_email');

    const orgFactor = result.factors.find((f) => f.signal === 'org_policy');
    expect(orgFactor).toBeDefined();
    expect(orgFactor!.value).toBe('approve');
  });

  test('includes confidence factors when user has confidence data', async () => {
    const supabase = makeMockSupabase({
      orgPolicyResult: 'auto',
      userConfidence: {
        current_tier: 'auto',
        score: 0.92,
        approval_rate: 0.95,
        clean_approval_rate: 0.93,
        total_signals: 40,
        cooldown_until: null,
      },
    });

    const result = await resolveAutonomy(supabase as never, 'org1', 'user1', 'send_email');

    expect(result.confidenceScore).toBe(0.92);
    const scoreFactor = result.factors.find((f) => f.signal === 'confidence_score');
    expect(scoreFactor).toBeDefined();
    expect(scoreFactor!.value).toBe(0.92);
  });

  test('includes cooldown factor when cooldown is active', async () => {
    const futureDate = new Date(Date.now() + 7 * 24 * 60 * 60 * 1000).toISOString();
    const supabase = makeMockSupabase({
      orgPolicyResult: 'approve',
      userConfidence: {
        current_tier: 'approve',
        score: 0.4,
        approval_rate: 0.6,
        clean_approval_rate: 0.55,
        total_signals: 20,
        cooldown_until: futureDate,
      },
    });

    const result = await resolveAutonomy(supabase as never, 'org1', 'user1', 'send_email');

    const cooldownFactor = result.factors.find((f) => f.signal === 'cooldown_active');
    expect(cooldownFactor).toBeDefined();
    expect(cooldownFactor!.weight).toBe(-1.0);
  });
});
