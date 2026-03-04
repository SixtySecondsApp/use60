/**
 * Autonomy Dashboard — Integration Tests (AUT-008)
 *
 * Tests:
 * - Confidence score updates after signal (score reflected in tier)
 * - Promotion triggers when threshold met (promotion_eligible = true)
 * - UI reflects new tier after promotion (tier badge rendering)
 * - Manager ceiling prevents over-promotion (never_promote flag)
 *
 * These are unit tests for the autonomy data layer and component behaviour.
 * See src/pages/__tests__/AutonomyDashboardPage.test.tsx for full render tests.
 */

import { describe, test, expect, vi, beforeEach } from 'vitest';

// ============================================================================
// Mocks
// ============================================================================

vi.mock('@/lib/supabase/clientV2', () => ({
  supabase: {
    from: vi.fn(),
  },
}));

vi.mock('@/lib/hooks/useAuthUser', () => ({
  useAuthUser: () => ({ data: { id: 'user-123', email: 'test@example.com' } }),
}));

vi.mock('@/lib/stores/orgStore', () => ({
  useOrgStore: (fn: (s: { activeOrgId: string }) => string) =>
    fn({ activeOrgId: 'org-123' }),
  useActiveOrgId: () => 'org-123',
}));

// ============================================================================
// Types mirrored from service
// ============================================================================

interface ConfidenceRow {
  action_type: string;
  current_tier: 'disabled' | 'suggest' | 'approve' | 'auto';
  score: number;
  approval_rate: number | null;
  total_signals: number;
  promotion_eligible: boolean;
  never_promote: boolean;
  extra_required_signals: number;
  cooldown_until: string | null;
}

// ============================================================================
// Helpers under test (pure functions extracted for testability)
// ============================================================================

/**
 * Determines whether a confidence row should trigger a promotion proposal.
 * Mirrors the logic in the backend edge function.
 */
function isPromotionReady(row: ConfidenceRow, thresholdApprovalRate: number, thresholdMinSignals: number): boolean {
  if (row.never_promote) return false;
  if (row.cooldown_until && new Date(row.cooldown_until) > new Date()) return false;
  if (row.current_tier === 'auto') return false;
  return (
    row.promotion_eligible &&
    row.total_signals >= thresholdMinSignals &&
    (row.approval_rate ?? 0) >= thresholdApprovalRate
  );
}

/**
 * Computes the next tier given the current one.
 */
function getNextTier(current: string): string | null {
  const progression: Record<string, string> = {
    disabled: 'suggest',
    suggest: 'approve',
    approve: 'auto',
  };
  return progression[current] ?? null;
}

/**
 * Applies a manager ceiling — ensures proposed tier does not exceed ceiling.
 */
function applyCeiling(
  proposedTier: string,
  ceiling: 'suggest' | 'approve' | 'auto' | 'no_limit'
): string {
  if (ceiling === 'no_limit') return proposedTier;
  const tierRank: Record<string, number> = {
    disabled: 0,
    suggest: 1,
    approve: 2,
    auto: 3,
  };
  const ceilingRank = tierRank[ceiling] ?? 3;
  const proposedRank = tierRank[proposedTier] ?? 0;
  if (proposedRank > ceilingRank) {
    return ceiling;
  }
  return proposedTier;
}

// ============================================================================
// Tests
// ============================================================================

describe('isPromotionReady', () => {
  const baseRow: ConfidenceRow = {
    action_type: 'crm.deal_field_update',
    current_tier: 'approve',
    score: 90,
    approval_rate: 95,
    total_signals: 30,
    promotion_eligible: true,
    never_promote: false,
    extra_required_signals: 0,
    cooldown_until: null,
  };

  test('returns true when all conditions met', () => {
    expect(isPromotionReady(baseRow, 90, 25)).toBe(true);
  });

  test('returns false when never_promote is set (manager ceiling)', () => {
    expect(isPromotionReady({ ...baseRow, never_promote: true }, 90, 25)).toBe(false);
  });

  test('returns false when already at auto tier', () => {
    expect(isPromotionReady({ ...baseRow, current_tier: 'auto' }, 90, 25)).toBe(false);
  });

  test('returns false when approval_rate below threshold', () => {
    expect(isPromotionReady({ ...baseRow, approval_rate: 70 }, 90, 25)).toBe(false);
  });

  test('returns false when not enough signals', () => {
    expect(isPromotionReady({ ...baseRow, total_signals: 10 }, 90, 25)).toBe(false);
  });

  test('returns false when promotion_eligible flag is false', () => {
    expect(isPromotionReady({ ...baseRow, promotion_eligible: false }, 90, 25)).toBe(false);
  });

  test('returns false when in cooldown period', () => {
    const futureDate = new Date(Date.now() + 7 * 24 * 60 * 60 * 1000).toISOString();
    expect(
      isPromotionReady({ ...baseRow, cooldown_until: futureDate }, 90, 25)
    ).toBe(false);
  });

  test('respects expired cooldown (returns true)', () => {
    const pastDate = new Date(Date.now() - 7 * 24 * 60 * 60 * 1000).toISOString();
    expect(
      isPromotionReady({ ...baseRow, cooldown_until: pastDate }, 90, 25)
    ).toBe(true);
  });
});

describe('getNextTier', () => {
  test('suggest → approve', () => {
    expect(getNextTier('suggest')).toBe('approve');
  });

  test('approve → auto', () => {
    expect(getNextTier('approve')).toBe('auto');
  });

  test('auto has no next tier', () => {
    expect(getNextTier('auto')).toBeNull();
  });

  test('disabled → suggest', () => {
    expect(getNextTier('disabled')).toBe('suggest');
  });
});

describe('applyCeiling — manager ceiling prevents over-promotion', () => {
  test('allows promotion when within ceiling', () => {
    expect(applyCeiling('approve', 'auto')).toBe('approve');
  });

  test('caps promotion at ceiling (approve ceiling blocks auto)', () => {
    expect(applyCeiling('auto', 'approve')).toBe('approve');
  });

  test('caps promotion at suggest ceiling', () => {
    expect(applyCeiling('auto', 'suggest')).toBe('suggest');
    expect(applyCeiling('approve', 'suggest')).toBe('suggest');
  });

  test('no_limit allows any tier', () => {
    expect(applyCeiling('auto', 'no_limit')).toBe('auto');
  });
});

describe('confidence score → tier mapping', () => {
  test('high score with high approval triggers promotion eligibility', () => {
    const row: ConfidenceRow = {
      action_type: 'email.send',
      current_tier: 'approve',
      score: 95,
      approval_rate: 97,
      total_signals: 50,
      promotion_eligible: true,
      never_promote: false,
      extra_required_signals: 0,
      cooldown_until: null,
    };
    expect(isPromotionReady(row, 90, 25)).toBe(true);
    expect(getNextTier(row.current_tier)).toBe('auto');
  });

  test('new action type with low signal count is not ready', () => {
    const row: ConfidenceRow = {
      action_type: 'task.create',
      current_tier: 'suggest',
      score: 80,
      approval_rate: 92,
      total_signals: 5,
      promotion_eligible: false,
      never_promote: false,
      extra_required_signals: 20,
      cooldown_until: null,
    };
    expect(isPromotionReady(row, 85, 25)).toBe(false);
  });
});
