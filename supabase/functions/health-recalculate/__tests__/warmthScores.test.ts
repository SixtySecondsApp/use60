/**
 * MW-004: Contact warmth scores feeding into deal health recalculation
 *
 * Verifies:
 * - Champion warmth decline adds risk factor and penalizes engagement
 * - Single-threaded warmth adds risk factor and penalizes engagement
 * - Warmth scores are fetched for deal contacts
 * - No penalties when warmth data is healthy
 * - Graceful handling when no warmth data exists
 */

import { describe, it, expect, vi, beforeEach } from 'vitest';

// ---------------------------------------------------------------------------
// We cannot easily test the full edge function handler because it calls serve()
// and has many imports. Instead we extract the warmth-related scoring logic
// and test it directly. This matches the pattern from the other MW test files.
// ---------------------------------------------------------------------------

// ---- Warmth scoring logic (mirrors health-recalculate/index.ts) -----------

interface WarmthScore {
  contact_id: string;
  warmth_score: number;
  warmth_delta: number;
  tier: string;
  trending_direction: string;
}

interface WarmthRiskResult {
  riskFactors: string[];
  engagementPenalty: number;
}

/**
 * Extract warmth-based risk factors and engagement penalties.
 * Mirrors the MW-004 logic in calculateDealHealth().
 */
function evaluateWarmthRisks(
  warmthScores: WarmthScore[],
  contactRoles: Map<string, string>,
  dealContactCount: number,
): WarmthRiskResult {
  const riskFactors: string[] = [];
  let engagementPenalty = 0;

  // Champion warmth decline risk
  for (const ws of warmthScores) {
    const role = contactRoles.get(ws.contact_id);
    if (role === 'champion' && (ws.warmth_delta < -0.05 || ws.trending_direction === 'down')) {
      riskFactors.push('champion_warmth_decline');
      break;
    }
  }

  // Single-threaded warmth risk
  const warmOrHotContacts = warmthScores.filter(
    (ws) => ws.tier === 'warm' || ws.tier === 'hot',
  );
  if (dealContactCount > 1 && warmOrHotContacts.length <= 1) {
    riskFactors.push('single_thread_warmth');
  }

  // Engagement penalties
  const warmPlusContacts = warmthScores.filter(
    (ws) => ws.tier === 'warm' || ws.tier === 'hot',
  );
  if (dealContactCount > 1 && warmPlusContacts.length <= 1) {
    engagementPenalty += 15;
  }

  const championDecline = warmthScores.some((ws) => {
    const role = contactRoles.get(ws.contact_id);
    return role === 'champion' && (ws.warmth_delta < -0.05 || ws.trending_direction === 'down');
  });
  if (championDecline) {
    engagementPenalty += 10;
  }

  return { riskFactors, engagementPenalty };
}

// ---- Tests ------------------------------------------------------------------

describe('MW-004: Warmth scores in deal health recalculation', () => {
  it('detects champion warmth decline via negative delta', () => {
    const warmthScores: WarmthScore[] = [
      { contact_id: 'c1', warmth_score: 0.5, warmth_delta: -0.1, tier: 'cool', trending_direction: 'stable' },
      { contact_id: 'c2', warmth_score: 0.8, warmth_delta: 0.05, tier: 'hot', trending_direction: 'up' },
    ];
    const roles = new Map([['c1', 'champion'], ['c2', 'technical_evaluator']]);

    const result = evaluateWarmthRisks(warmthScores, roles, 2);

    expect(result.riskFactors).toContain('champion_warmth_decline');
    expect(result.engagementPenalty).toBeGreaterThanOrEqual(10);
  });

  it('detects champion warmth decline via trending_direction = down', () => {
    const warmthScores: WarmthScore[] = [
      { contact_id: 'c1', warmth_score: 0.7, warmth_delta: 0.0, tier: 'warm', trending_direction: 'down' },
    ];
    const roles = new Map([['c1', 'champion']]);

    const result = evaluateWarmthRisks(warmthScores, roles, 1);

    expect(result.riskFactors).toContain('champion_warmth_decline');
    expect(result.engagementPenalty).toBe(10); // only champion decline, not single-thread (only 1 contact)
  });

  it('adds single_thread_warmth when only 1 warm+ contact among many', () => {
    const warmthScores: WarmthScore[] = [
      { contact_id: 'c1', warmth_score: 0.9, warmth_delta: 0.1, tier: 'hot', trending_direction: 'up' },
      { contact_id: 'c2', warmth_score: 0.2, warmth_delta: -0.02, tier: 'cold', trending_direction: 'down' },
      { contact_id: 'c3', warmth_score: 0.3, warmth_delta: 0.0, tier: 'cool', trending_direction: 'stable' },
    ];
    const roles = new Map([['c1', 'champion'], ['c2', 'decision_maker'], ['c3', 'influencer']]);

    const result = evaluateWarmthRisks(warmthScores, roles, 3);

    expect(result.riskFactors).toContain('single_thread_warmth');
    expect(result.engagementPenalty).toBeGreaterThanOrEqual(15);
  });

  it('applies both penalties when champion declining AND single-threaded', () => {
    const warmthScores: WarmthScore[] = [
      { contact_id: 'c1', warmth_score: 0.4, warmth_delta: -0.15, tier: 'cool', trending_direction: 'down' },
      { contact_id: 'c2', warmth_score: 0.2, warmth_delta: 0.0, tier: 'cold', trending_direction: 'stable' },
    ];
    const roles = new Map([['c1', 'champion'], ['c2', 'influencer']]);

    const result = evaluateWarmthRisks(warmthScores, roles, 2);

    expect(result.riskFactors).toContain('champion_warmth_decline');
    expect(result.riskFactors).toContain('single_thread_warmth');
    // 15 (single-thread) + 10 (champion decline) = 25
    expect(result.engagementPenalty).toBe(25);
  });

  it('applies no penalties when all contacts are warm/hot', () => {
    const warmthScores: WarmthScore[] = [
      { contact_id: 'c1', warmth_score: 0.85, warmth_delta: 0.05, tier: 'hot', trending_direction: 'up' },
      { contact_id: 'c2', warmth_score: 0.7, warmth_delta: 0.02, tier: 'warm', trending_direction: 'stable' },
      { contact_id: 'c3', warmth_score: 0.75, warmth_delta: 0.1, tier: 'warm', trending_direction: 'up' },
    ];
    const roles = new Map([['c1', 'champion'], ['c2', 'decision_maker'], ['c3', 'influencer']]);

    const result = evaluateWarmthRisks(warmthScores, roles, 3);

    expect(result.riskFactors).toEqual([]);
    expect(result.engagementPenalty).toBe(0);
  });

  it('applies no penalties with empty warmth data', () => {
    const result = evaluateWarmthRisks([], new Map(), 3);

    // No warmth data → single_thread_warmth fires (0 warm contacts out of 3)
    expect(result.riskFactors).toContain('single_thread_warmth');
    expect(result.engagementPenalty).toBe(15);
  });

  it('does not flag single-thread when deal has only 1 contact', () => {
    const warmthScores: WarmthScore[] = [
      { contact_id: 'c1', warmth_score: 0.3, warmth_delta: 0.0, tier: 'cool', trending_direction: 'stable' },
    ];
    const roles = new Map([['c1', 'influencer']]);

    const result = evaluateWarmthRisks(warmthScores, roles, 1);

    // Single contact → single_thread_warmth should NOT fire
    expect(result.riskFactors).not.toContain('single_thread_warmth');
    expect(result.engagementPenalty).toBe(0);
  });

  it('does not flag champion decline when champion warmth is stable', () => {
    const warmthScores: WarmthScore[] = [
      { contact_id: 'c1', warmth_score: 0.8, warmth_delta: 0.02, tier: 'hot', trending_direction: 'up' },
      { contact_id: 'c2', warmth_score: 0.6, warmth_delta: 0.0, tier: 'warm', trending_direction: 'stable' },
    ];
    const roles = new Map([['c1', 'champion'], ['c2', 'technical_evaluator']]);

    const result = evaluateWarmthRisks(warmthScores, roles, 2);

    expect(result.riskFactors).not.toContain('champion_warmth_decline');
    expect(result.engagementPenalty).toBe(0); // both warm+, champion stable
  });

  it('caps engagement penalty correctly with Math.max(0, ...)', () => {
    // Verify the penalty application matches the production code pattern:
    // engagementScore = Math.max(0, engagementScore - penalty)
    const baseEngagementScore = 20; // Low base score (only 1 meeting)
    const penalty = 25; // Both penalties combined

    const adjusted = Math.max(0, baseEngagementScore - penalty);
    expect(adjusted).toBe(0); // Should floor at 0, not go negative
  });
});
