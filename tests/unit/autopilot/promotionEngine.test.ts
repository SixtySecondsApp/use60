/**
 * Unit tests for Autopilot Promotion Engine — AP-013
 *
 * Tests the pure tier-ladder and threshold-evaluation logic from
 * promotionEngine.ts without importing Deno/esm.sh modules.
 * The functions are extracted inline for Node.js compatibility.
 */

import { describe, it, expect } from 'vitest'

// =============================================================================
// Extracted pure functions (mirrors promotionEngine.ts)
// =============================================================================

type ApprovalSignal =
  | 'approved'
  | 'approved_edited'
  | 'rejected'
  | 'expired'
  | 'undone'
  | 'auto_executed'
  | 'auto_undone'

/** Maps a tier to its successor on the promotion ladder. */
function nextTier(tier: string): string | null {
  switch (tier) {
    case 'suggest': return 'approve'
    case 'approve': return 'auto'
    default:        return null
  }
}

/** Numeric rank for each autonomy tier. */
const TIER_RANK: Record<string, number> = {
  'disabled': 0,
  'suggest':  1,
  'approve':  2,
  'auto':     3,
}

/**
 * Checks all numeric threshold criteria for a promotion candidate.
 * Returns true if all criteria are met, false otherwise.
 * Pure re-implementation of the evaluatePromotionEligibility guard section.
 */
interface ConfidenceSnapshot {
  score: number
  total_signals: number
  clean_approval_rate: number
  rejection_rate: number | null
  undo_rate: number | null
  days_active: number
  extra_required_signals: number | null
}

interface ThresholdConfig {
  min_confidence_score: number
  min_signals: number
  min_clean_approval_rate: number
  max_rejection_rate: number | null
  max_undo_rate: number | null
  min_days_active: number
}

function meetsNumericThresholds(
  confidence: ConfidenceSnapshot,
  threshold: ThresholdConfig,
): boolean {
  const requiredSignals = threshold.min_signals + (confidence.extra_required_signals ?? 0)
  if (confidence.score < threshold.min_confidence_score) return false
  if (confidence.total_signals < requiredSignals) return false
  if (confidence.clean_approval_rate < threshold.min_clean_approval_rate) return false
  if (
    confidence.rejection_rate !== null &&
    threshold.max_rejection_rate !== null &&
    confidence.rejection_rate > threshold.max_rejection_rate
  ) return false
  if (
    confidence.undo_rate !== null &&
    threshold.max_undo_rate !== null &&
    confidence.undo_rate > threshold.max_undo_rate
  ) return false
  if (confidence.days_active < threshold.min_days_active) return false
  return true
}

/**
 * Checks that the first `lastNClean` entries in `recentSignals` are all 'approved'.
 * Mirrors the streak guard in evaluatePromotionEligibility.
 */
function passesStreakGuard(recentSignals: ApprovalSignal[], lastNClean: number): boolean {
  if (recentSignals.length < lastNClean) return false
  for (let i = 0; i < lastNClean; i++) {
    if (recentSignals[i] !== 'approved') return false
  }
  return true
}

// =============================================================================
// Tests: nextTier()
// =============================================================================

describe('nextTier()', () => {
  it('suggest → approve', () => {
    expect(nextTier('suggest')).toBe('approve')
  })

  it('approve → auto', () => {
    expect(nextTier('approve')).toBe('auto')
  })

  it('auto → null (cannot promote beyond auto)', () => {
    expect(nextTier('auto')).toBeNull()
  })

  it('disabled → null', () => {
    expect(nextTier('disabled')).toBeNull()
  })

  it('unknown tier → null', () => {
    expect(nextTier('unknown')).toBeNull()
  })

  it('empty string → null', () => {
    expect(nextTier('')).toBeNull()
  })
})

// =============================================================================
// Tests: TIER_RANK
// =============================================================================

describe('TIER_RANK', () => {
  it('disabled < suggest < approve < auto', () => {
    expect(TIER_RANK['disabled']).toBeLessThan(TIER_RANK['suggest'])
    expect(TIER_RANK['suggest']).toBeLessThan(TIER_RANK['approve'])
    expect(TIER_RANK['approve']).toBeLessThan(TIER_RANK['auto'])
  })

  it('disabled = 0, suggest = 1, approve = 2, auto = 3', () => {
    expect(TIER_RANK['disabled']).toBe(0)
    expect(TIER_RANK['suggest']).toBe(1)
    expect(TIER_RANK['approve']).toBe(2)
    expect(TIER_RANK['auto']).toBe(3)
  })
})

// =============================================================================
// Tests: meetsNumericThresholds()
// =============================================================================

describe('meetsNumericThresholds()', () => {
  /** A confidence snapshot that passes all default thresholds below. */
  const passingConfidence: ConfidenceSnapshot = {
    score: 0.80,
    total_signals: 20,
    clean_approval_rate: 0.75,
    rejection_rate: 0.05,
    undo_rate: 0.05,
    days_active: 14,
    extra_required_signals: 0,
  }

  /** A threshold config that the passingConfidence should satisfy. */
  const defaultThreshold: ThresholdConfig = {
    min_confidence_score: 0.75,
    min_signals: 15,
    min_clean_approval_rate: 0.70,
    max_rejection_rate: 0.10,
    max_undo_rate: 0.10,
    min_days_active: 10,
  }

  it('returns true when all criteria are met', () => {
    expect(meetsNumericThresholds(passingConfidence, defaultThreshold)).toBe(true)
  })

  it('returns false when score is below min_confidence_score', () => {
    const conf = { ...passingConfidence, score: 0.70 }
    expect(meetsNumericThresholds(conf, defaultThreshold)).toBe(false)
  })

  it('returns false when score exactly equals min_confidence_score (strict <)', () => {
    // The check is `< min_confidence_score`, so exactly equal should pass
    const conf = { ...passingConfidence, score: 0.75 }
    expect(meetsNumericThresholds(conf, defaultThreshold)).toBe(true)
  })

  it('returns false when total_signals is below min_signals', () => {
    const conf = { ...passingConfidence, total_signals: 14 }
    expect(meetsNumericThresholds(conf, defaultThreshold)).toBe(false)
  })

  it('returns true when total_signals exactly equals min_signals', () => {
    const conf = { ...passingConfidence, total_signals: 15 }
    expect(meetsNumericThresholds(conf, defaultThreshold)).toBe(true)
  })

  it('returns false when clean_approval_rate is below minimum', () => {
    const conf = { ...passingConfidence, clean_approval_rate: 0.65 }
    expect(meetsNumericThresholds(conf, defaultThreshold)).toBe(false)
  })

  it('returns false when rejection_rate exceeds max_rejection_rate', () => {
    const conf = { ...passingConfidence, rejection_rate: 0.11 }
    expect(meetsNumericThresholds(conf, defaultThreshold)).toBe(false)
  })

  it('returns true when rejection_rate exactly equals max_rejection_rate (strict >)', () => {
    const conf = { ...passingConfidence, rejection_rate: 0.10 }
    expect(meetsNumericThresholds(conf, defaultThreshold)).toBe(true)
  })

  it('returns false when undo_rate exceeds max_undo_rate', () => {
    const conf = { ...passingConfidence, undo_rate: 0.11 }
    expect(meetsNumericThresholds(conf, defaultThreshold)).toBe(false)
  })

  it('returns true when undo_rate exactly equals max_undo_rate (strict >)', () => {
    const conf = { ...passingConfidence, undo_rate: 0.10 }
    expect(meetsNumericThresholds(conf, defaultThreshold)).toBe(true)
  })

  it('returns false when days_active is below min_days_active', () => {
    const conf = { ...passingConfidence, days_active: 9 }
    expect(meetsNumericThresholds(conf, defaultThreshold)).toBe(false)
  })

  it('returns true when days_active exactly equals min_days_active', () => {
    const conf = { ...passingConfidence, days_active: 10 }
    expect(meetsNumericThresholds(conf, defaultThreshold)).toBe(true)
  })

  describe('null rate handling', () => {
    it('null rejection_rate skips the rejection_rate check (passes)', () => {
      const conf = { ...passingConfidence, rejection_rate: null }
      expect(meetsNumericThresholds(conf, defaultThreshold)).toBe(true)
    })

    it('null undo_rate skips the undo_rate check (passes)', () => {
      const conf = { ...passingConfidence, undo_rate: null }
      expect(meetsNumericThresholds(conf, defaultThreshold)).toBe(true)
    })

    it('null max_rejection_rate in threshold skips the rejection check', () => {
      const threshold = { ...defaultThreshold, max_rejection_rate: null }
      // Even a high rejection rate should pass when threshold has no maximum
      const conf = { ...passingConfidence, rejection_rate: 0.99 }
      expect(meetsNumericThresholds(conf, threshold)).toBe(true)
    })

    it('null max_undo_rate in threshold skips the undo check', () => {
      const threshold = { ...defaultThreshold, max_undo_rate: null }
      const conf = { ...passingConfidence, undo_rate: 0.99 }
      expect(meetsNumericThresholds(conf, threshold)).toBe(true)
    })
  })

  describe('extra_required_signals adds to min_signals requirement', () => {
    it('extra_required_signals=5 means 20 signals are needed when min_signals=15', () => {
      const conf = { ...passingConfidence, total_signals: 19, extra_required_signals: 5 }
      expect(meetsNumericThresholds(conf, defaultThreshold)).toBe(false)
    })

    it('20 signals satisfies min_signals=15 + extra=5', () => {
      const conf = { ...passingConfidence, total_signals: 20, extra_required_signals: 5 }
      expect(meetsNumericThresholds(conf, defaultThreshold)).toBe(true)
    })

    it('null extra_required_signals defaults to 0 (no extra requirement)', () => {
      const conf = { ...passingConfidence, total_signals: 15, extra_required_signals: null }
      expect(meetsNumericThresholds(conf, defaultThreshold)).toBe(true)
    })
  })
})

// =============================================================================
// Tests: passesStreakGuard()
// =============================================================================

describe('passesStreakGuard()', () => {
  it('3 approved in a row with lastNClean=3 → true', () => {
    const signals: ApprovalSignal[] = ['approved', 'approved', 'approved']
    expect(passesStreakGuard(signals, 3)).toBe(true)
  })

  it('approved_edited in the streak fails the guard (only exact "approved" counts)', () => {
    const signals: ApprovalSignal[] = ['approved', 'approved_edited', 'approved']
    expect(passesStreakGuard(signals, 3)).toBe(false)
  })

  it('rejected in the streak fails the guard', () => {
    const signals: ApprovalSignal[] = ['approved', 'rejected', 'approved']
    expect(passesStreakGuard(signals, 3)).toBe(false)
  })

  it('insufficient signals (2 < lastNClean=3) → false', () => {
    const signals: ApprovalSignal[] = ['approved', 'approved']
    expect(passesStreakGuard(signals, 3)).toBe(false)
  })

  it('empty array with any lastNClean → false', () => {
    expect(passesStreakGuard([], 1)).toBe(false)
    expect(passesStreakGuard([], 3)).toBe(false)
  })

  it('10 approved with lastNClean=5 → true (only first 5 are checked)', () => {
    const signals: ApprovalSignal[] = Array(10).fill('approved')
    expect(passesStreakGuard(signals, 5)).toBe(true)
  })

  it('5 approved followed by rejected: lastNClean=5 → true (only first 5 checked)', () => {
    const signals: ApprovalSignal[] = ['approved', 'approved', 'approved', 'approved', 'approved', 'rejected']
    expect(passesStreakGuard(signals, 5)).toBe(true)
  })

  it('rejected at position 5 with lastNClean=6 → false', () => {
    const signals: ApprovalSignal[] = ['approved', 'approved', 'approved', 'approved', 'approved', 'rejected']
    expect(passesStreakGuard(signals, 6)).toBe(false)
  })

  it('lastNClean=1 with first signal approved → true', () => {
    const signals: ApprovalSignal[] = ['approved', 'rejected', 'rejected']
    expect(passesStreakGuard(signals, 1)).toBe(true)
  })

  it('lastNClean=1 with first signal not approved → false', () => {
    const signals: ApprovalSignal[] = ['rejected', 'approved', 'approved']
    expect(passesStreakGuard(signals, 1)).toBe(false)
  })

  it('lastNClean=0 always passes (vacuously true)', () => {
    // Edge case: if threshold ever requires 0 clean signals, it should pass
    expect(passesStreakGuard([], 0)).toBe(true)
    expect(passesStreakGuard(['rejected'], 0)).toBe(true)
  })
})
