/**
 * Context Risk Scorer — Vitest test suite (AE2-018)
 *
 * Tests:
 * - parseSeniority: CEO->1.0, VP->0.7, Director->0.5, Manager->0.3, IC->0.0
 * - Deal value thresholds: <$25K->0.0, $25K-$100K->0.5, >$100K->1.0
 * - Composite score calculation with all factors
 * - Escalation recommendations: >0.9->two_levels, >0.7->one_level, else->none
 * - Missing data defaults safely (no crashes)
 */

import { describe, test, expect, vi, beforeEach } from 'vitest';
import { calculateContextRisk, parseSeniority } from '../contextRiskScorer.ts';

// ─── Mock Helpers ────────────────────────────────────────────────────────────

function makeMockSupabase(overrides?: {
  deal?: { amount: number | null; stage_id: string | null } | null;
  contact?: { job_title: string | null } | null;
  warmth?: { warmth_score: number | null } | null;
  stagePosition?: { position: number } | null;
}) {
  const createChain = (tableName: string) => {
    const chain: Record<string, any> = {};
    chain.select = vi.fn().mockReturnValue(chain);
    chain.eq = vi.fn().mockReturnValue(chain);
    chain.is = vi.fn().mockReturnValue(chain);

    chain.maybeSingle = vi.fn().mockImplementation(() => {
      if (tableName === 'deals') {
        return Promise.resolve({ data: overrides?.deal ?? null, error: null });
      }
      if (tableName === 'contacts') {
        return Promise.resolve({ data: overrides?.contact ?? null, error: null });
      }
      if (tableName === 'contact_warmth_scores') {
        return Promise.resolve({ data: overrides?.warmth ?? null, error: null });
      }
      if (tableName === 'pipeline_stages') {
        return Promise.resolve({ data: overrides?.stagePosition ?? null, error: null });
      }
      return Promise.resolve({ data: null, error: null });
    });

    return chain;
  };

  return {
    from: vi.fn().mockImplementation((table: string) => createChain(table)),
  };
}

// ─── parseSeniority ──────────────────────────────────────────────────────────

describe('parseSeniority', () => {
  test('CEO returns 1.0', () => {
    expect(parseSeniority('CEO')).toBe(1.0);
  });

  test('CTO returns 1.0', () => {
    expect(parseSeniority('CTO')).toBe(1.0);
  });

  test('CFO returns 1.0', () => {
    expect(parseSeniority('CFO')).toBe(1.0);
  });

  test('COO returns 1.0', () => {
    expect(parseSeniority('COO')).toBe(1.0);
  });

  test('CMO returns 1.0', () => {
    expect(parseSeniority('CMO')).toBe(1.0);
  });

  test('CRO returns 1.0', () => {
    expect(parseSeniority('CRO')).toBe(1.0);
  });

  test('Chief Revenue Officer returns 1.0', () => {
    expect(parseSeniority('Chief Revenue Officer')).toBe(1.0);
  });

  test('VP of Sales returns 0.7', () => {
    expect(parseSeniority('VP of Sales')).toBe(0.7);
  });

  test('Vice President of Engineering returns 0.7', () => {
    expect(parseSeniority('Vice President of Engineering')).toBe(0.7);
  });

  test('Director of Marketing returns 0.5', () => {
    expect(parseSeniority('Director of Marketing')).toBe(0.5);
  });

  test('Engineering Manager returns 0.3', () => {
    expect(parseSeniority('Engineering Manager')).toBe(0.3);
  });

  test('Head of Product returns 0.3', () => {
    expect(parseSeniority('Head of Product')).toBe(0.3);
  });

  test('Software Engineer returns 0.0 (IC)', () => {
    expect(parseSeniority('Software Engineer')).toBe(0.0);
  });

  test('Account Executive returns 0.0 (IC)', () => {
    expect(parseSeniority('Account Executive')).toBe(0.0);
  });

  test('empty string returns 0.0', () => {
    expect(parseSeniority('')).toBe(0.0);
  });

  test('whitespace-only string returns 0.0', () => {
    expect(parseSeniority('   ')).toBe(0.0);
  });

  test('case-insensitive matching', () => {
    expect(parseSeniority('ceo')).toBe(1.0);
    expect(parseSeniority('vp')).toBe(0.7);
    expect(parseSeniority('DIRECTOR')).toBe(0.5);
    expect(parseSeniority('MANAGER')).toBe(0.3);
  });
});

// ─── Deal value scoring ──────────────────────────────────────────────────────

describe('deal value scoring (via calculateContextRisk)', () => {
  test('deal < $25K contributes 0.0 to deal_value signal', async () => {
    const supabase = makeMockSupabase();
    const result = await calculateContextRisk(supabase as never, {
      dealValue: 10000,
    });
    const dvFactor = result.factors.find((f) => f.signal === 'deal_value');
    expect(dvFactor).toBeDefined();
    expect(dvFactor!.contribution).toBe(0.0);
  });

  test('deal $25K-$100K contributes 0.15 (0.5 * 0.30 weight)', async () => {
    const supabase = makeMockSupabase();
    const result = await calculateContextRisk(supabase as never, {
      dealValue: 50000,
    });
    const dvFactor = result.factors.find((f) => f.signal === 'deal_value');
    expect(dvFactor).toBeDefined();
    expect(dvFactor!.contribution).toBeCloseTo(0.15, 5);
  });

  test('deal > $100K contributes 0.30 (1.0 * 0.30 weight)', async () => {
    const supabase = makeMockSupabase();
    const result = await calculateContextRisk(supabase as never, {
      dealValue: 200000,
    });
    const dvFactor = result.factors.find((f) => f.signal === 'deal_value');
    expect(dvFactor).toBeDefined();
    expect(dvFactor!.contribution).toBeCloseTo(0.30, 5);
  });

  test('deal value exactly $25K counts as 0.5 tier', async () => {
    const supabase = makeMockSupabase();
    const result = await calculateContextRisk(supabase as never, {
      dealValue: 25000,
    });
    const dvFactor = result.factors.find((f) => f.signal === 'deal_value');
    expect(dvFactor!.contribution).toBeCloseTo(0.15, 5);
  });

  test('deal value exactly $100K counts as 1.0 tier', async () => {
    const supabase = makeMockSupabase();
    const result = await calculateContextRisk(supabase as never, {
      dealValue: 100000,
    });
    const dvFactor = result.factors.find((f) => f.signal === 'deal_value');
    expect(dvFactor!.contribution).toBeCloseTo(0.30, 5);
  });
});

// ─── Composite score calculation ─────────────────────────────────────────────

describe('composite score calculation', () => {
  test('all maximum inputs produce a score of 1.0', async () => {
    const supabase = makeMockSupabase({
      stagePosition: { position: 8 },
    });

    const result = await calculateContextRisk(supabase as never, {
      dealValue: 200000,         // 1.0 * 0.30 = 0.30
      contactTitle: 'CEO',       // 1.0 * 0.25 = 0.25
      dealStage: 'stage-uuid',   // position 8 -> 1.0 * 0.20 = 0.20
      warmthScore: 0,            // inverted: 1.0 * 0.15 = 0.15
      actionReversibility: 1.0,  // 1.0 * 0.10 = 0.10
    });

    // Sum = 1.00
    expect(result.score).toBeCloseTo(1.0, 2);
  });

  test('all minimum inputs produce a score of 0.0', async () => {
    const supabase = makeMockSupabase();

    const result = await calculateContextRisk(supabase as never, {
      dealValue: 0,                // 0.0 * 0.30 = 0.00
      contactTitle: 'Intern',     // 0.0 * 0.25 = 0.00
      warmthScore: 1.0,           // inverted: 0.0 * 0.15 = 0.00
      actionReversibility: 0.0,   // 0.0 * 0.10 = 0.00
    });

    // No stage info -> stage contribution = 0.0
    expect(result.score).toBeCloseTo(0.0, 2);
  });

  test('mixed inputs produce correct weighted sum', async () => {
    const supabase = makeMockSupabase({
      stagePosition: { position: 4 },
    });

    const result = await calculateContextRisk(supabase as never, {
      dealValue: 50000,           // 0.5 * 0.30 = 0.15
      contactTitle: 'VP Sales',   // 0.7 * 0.25 = 0.175
      dealStage: 'stage-uuid',    // position 4 -> (4-1)/7 = 0.4286 * 0.20 = 0.0857
      warmthScore: 0.6,           // inverted: 0.4 * 0.15 = 0.06
      actionReversibility: 0.5,   // 0.5 * 0.10 = 0.05
    });

    // Sum = 0.15 + 0.175 + 0.0857 + 0.06 + 0.05 = 0.5207
    expect(result.score).toBeCloseTo(0.5207, 2);
  });

  test('returns all 5 factor signals', async () => {
    const supabase = makeMockSupabase();
    const result = await calculateContextRisk(supabase as never, {
      dealValue: 50000,
      contactTitle: 'Manager',
      warmthScore: 0.5,
      actionReversibility: 0.3,
    });

    const signals = result.factors.map((f) => f.signal);
    expect(signals).toContain('deal_value');
    expect(signals).toContain('contact_seniority');
    expect(signals).toContain('deal_stage');
    expect(signals).toContain('relationship_warmth');
    expect(signals).toContain('action_reversibility');
    expect(result.factors).toHaveLength(5);
  });
});

// ─── Escalation recommendations ──────────────────────────────────────────────

describe('escalation recommendations', () => {
  test('score > 0.9 returns two_levels', async () => {
    const supabase = makeMockSupabase({
      stagePosition: { position: 8 },
    });

    const result = await calculateContextRisk(supabase as never, {
      dealValue: 200000,
      contactTitle: 'CEO',
      dealStage: 'stage-uuid',
      warmthScore: 0,
      actionReversibility: 1.0,
    });

    expect(result.score).toBeGreaterThan(0.9);
    expect(result.escalation_recommendation).toBe('two_levels');
  });

  test('score > 0.7 but <= 0.9 returns one_level', async () => {
    const supabase = makeMockSupabase();

    // Target: ~0.78
    // deal_value: $200K -> 1.0 * 0.30 = 0.30
    // contact_seniority: CEO -> 1.0 * 0.25 = 0.25
    // warmth: 0 -> 1.0 * 0.15 = 0.15
    // reversibility: 0.8 -> 0.8 * 0.10 = 0.08
    // stage: no data -> 0.0
    // total = 0.78
    const result = await calculateContextRisk(supabase as never, {
      dealValue: 200000,
      contactTitle: 'CEO',
      warmthScore: 0,
      actionReversibility: 0.8,
    });

    expect(result.score).toBeGreaterThan(0.7);
    expect(result.score).toBeLessThanOrEqual(0.9);
    expect(result.escalation_recommendation).toBe('one_level');
  });

  test('score <= 0.7 returns none', async () => {
    const supabase = makeMockSupabase();

    const result = await calculateContextRisk(supabase as never, {
      dealValue: 10000,
      contactTitle: 'Account Executive',
      warmthScore: 0.8,
      actionReversibility: 0.2,
    });

    expect(result.score).toBeLessThanOrEqual(0.7);
    expect(result.escalation_recommendation).toBe('none');
  });
});

// ─── Missing data handling ───────────────────────────────────────────────────

describe('missing data defaults', () => {
  test('no deal value defaults to 0 contribution', async () => {
    const supabase = makeMockSupabase();
    const result = await calculateContextRisk(supabase as never, {});
    const dvFactor = result.factors.find((f) => f.signal === 'deal_value');
    expect(dvFactor!.contribution).toBe(0.0);
  });

  test('no contact title defaults to 0 seniority', async () => {
    const supabase = makeMockSupabase();
    const result = await calculateContextRisk(supabase as never, {});
    const senFactor = result.factors.find((f) => f.signal === 'contact_seniority');
    expect(senFactor!.contribution).toBe(0.0);
  });

  test('no warmth score defaults to cold (riskiest assumption)', async () => {
    const supabase = makeMockSupabase();
    const result = await calculateContextRisk(supabase as never, {});
    const warmFactor = result.factors.find((f) => f.signal === 'relationship_warmth');
    // Unknown warmth -> warmthScore=0 -> risk=1.0 -> contribution = 1.0 * 0.15 = 0.15
    expect(warmFactor!.contribution).toBeCloseTo(0.15, 5);
  });

  test('no action reversibility defaults to 0', async () => {
    const supabase = makeMockSupabase();
    const result = await calculateContextRisk(supabase as never, {});
    const revFactor = result.factors.find((f) => f.signal === 'action_reversibility');
    expect(revFactor!.contribution).toBe(0.0);
  });

  test('completely empty input does not crash', async () => {
    const supabase = makeMockSupabase();
    const result = await calculateContextRisk(supabase as never, {});
    expect(result.score).toBeGreaterThanOrEqual(0);
    expect(result.score).toBeLessThanOrEqual(1);
    expect(result.factors).toHaveLength(5);
  });

  test('fetches deal from DB when dealId provided without dealValue', async () => {
    const supabase = makeMockSupabase({
      deal: { amount: 75000, stage_id: null },
    });

    const result = await calculateContextRisk(supabase as never, {
      dealId: 'deal-123',
    });

    // Should have used the fetched $75K value -> 0.5 tier -> 0.5 * 0.30 = 0.15
    const dvFactor = result.factors.find((f) => f.signal === 'deal_value');
    expect(dvFactor!.contribution).toBeCloseTo(0.15, 5);
    expect(supabase.from).toHaveBeenCalledWith('deals');
  });

  test('fetches contact title from DB when contactId provided without contactTitle', async () => {
    const supabase = makeMockSupabase({
      contact: { job_title: 'VP Engineering' },
    });

    const result = await calculateContextRisk(supabase as never, {
      contactId: 'contact-123',
    });

    const senFactor = result.factors.find((f) => f.signal === 'contact_seniority');
    // VP -> 0.7 * 0.25 = 0.175
    expect(senFactor!.contribution).toBeCloseTo(0.175, 5);
    expect(supabase.from).toHaveBeenCalledWith('contacts');
  });

  test('fetches warmth score from DB when contactId provided without warmthScore', async () => {
    const supabase = makeMockSupabase({
      warmth: { warmth_score: 0.8 },
    });

    const result = await calculateContextRisk(supabase as never, {
      contactId: 'contact-123',
    });

    const warmFactor = result.factors.find((f) => f.signal === 'relationship_warmth');
    // warmth=0.8 -> risk=0.2 -> 0.2 * 0.15 = 0.03
    expect(warmFactor!.contribution).toBeCloseTo(0.03, 5);
    expect(supabase.from).toHaveBeenCalledWith('contact_warmth_scores');
  });
});
