/**
 * Unit tests for Autopilot Demotion Engine — AP-017
 *
 * Tests the pure demotion trigger logic from demotionEngine.ts without
 * importing Deno/esm.sh modules. The functions are extracted inline for
 * Node.js compatibility.
 */

import { describe, it, expect } from 'vitest'

// =============================================================================
// Extracted types (mirrors demotionEngine.ts)
// =============================================================================

type DemotionSeverity = 'warn' | 'demote' | 'emergency'

interface DemotionTriggerResult {
  triggered: boolean
  severity?: DemotionSeverity
  trigger_name?: string
  trigger_reason?: string
  undo_count?: number
  undo_rate?: number
  window_days?: number
}

// =============================================================================
// Extracted pure functions
//
// The actual evaluateDemotionTriggers() in demotionEngine.ts queries the DB
// and applies the rules. Here we extract just the rule evaluation logic
// as a pure function so it can be tested without Supabase.
// =============================================================================

/**
 * Pure rule evaluator — mirrors the trigger evaluation section of
 * evaluateDemotionTriggers() in demotionEngine.ts.
 *
 * Inputs are the pre-computed window aggregates that the function derives
 * from the DB query results.
 */
function evaluateDemotionRules(
  actionType: string,
  undos3d: number,
  undos7d: number,
  undos14d: number,
  total7d: number,
  total14d: number,
): DemotionTriggerResult {
  const undoRate7d  = total7d  > 0 ? undos7d  / total7d  : 0
  const undoRate14d = total14d > 0 ? undos14d / total14d : 0

  // Rule 1: EMERGENCY — email.send: even 1 undo in 7 days
  if (actionType === 'email.send' && undos7d >= 1) {
    return {
      triggered: true,
      severity: 'emergency',
      trigger_name: 'email_undo_any',
      trigger_reason: `email.send had ${undos7d} undo(s) in the last 7 days`,
      undo_count: undos7d,
      window_days: 7,
    }
  }

  // Rule 2: EMERGENCY — 3+ undos in 3 days (any action type)
  if (undos3d >= 3) {
    return {
      triggered: true,
      severity: 'emergency',
      trigger_name: 'undo_spike',
      trigger_reason: `${undos3d} undos in the last 3 days`,
      undo_count: undos3d,
      window_days: 3,
    }
  }

  // Rule 3: DEMOTE — >8% undo rate over 14 days with >= 10 actions
  if (undoRate14d > 0.08 && total14d >= 10) {
    return {
      triggered: true,
      severity: 'demote',
      trigger_name: 'sustained_undo_rate',
      trigger_reason: `${Math.round(undoRate14d * 100)}% undo rate over last 14 days (${total14d} actions)`,
      undo_count: undos14d,
      undo_rate: undoRate14d,
      window_days: 14,
    }
  }

  // Rule 4: WARN — >10% undo rate over 7 days with >= 5 actions
  if (undoRate7d > 0.10 && total7d >= 5) {
    return {
      triggered: true,
      severity: 'warn',
      trigger_name: 'undo_rate_rising',
      trigger_reason: `${Math.round(undoRate7d * 100)}% undo rate over last 7 days (${total7d} actions)`,
      undo_count: undos7d,
      undo_rate: undoRate7d,
      window_days: 7,
    }
  }

  return { triggered: false }
}

/**
 * Cooldown days per severity — mirrors the `cooldownDays` map in executeDemotion().
 */
function getCooldownDays(severity: DemotionSeverity): number {
  switch (severity) {
    case 'warn':      return 14
    case 'demote':    return 30
    case 'emergency': return 60
  }
}

/**
 * Extra signals boost per severity — mirrors `extraSignalsBoost` in executeDemotion().
 */
function getExtraSignals(severity: DemotionSeverity): number {
  switch (severity) {
    case 'warn':      return 10
    case 'demote':    return 15
    case 'emergency': return 25
  }
}

// =============================================================================
// Tests: getCooldownDays()
// =============================================================================

describe('getCooldownDays()', () => {
  it('warn → 14 days', () => {
    expect(getCooldownDays('warn')).toBe(14)
  })

  it('demote → 30 days', () => {
    expect(getCooldownDays('demote')).toBe(30)
  })

  it('emergency → 60 days', () => {
    expect(getCooldownDays('emergency')).toBe(60)
  })

  it('cooldown increases with severity: warn < demote < emergency', () => {
    expect(getCooldownDays('warn')).toBeLessThan(getCooldownDays('demote'))
    expect(getCooldownDays('demote')).toBeLessThan(getCooldownDays('emergency'))
  })
})

// =============================================================================
// Tests: getExtraSignals()
// =============================================================================

describe('getExtraSignals()', () => {
  it('warn → 10 extra signals', () => {
    expect(getExtraSignals('warn')).toBe(10)
  })

  it('demote → 15 extra signals', () => {
    expect(getExtraSignals('demote')).toBe(15)
  })

  it('emergency → 25 extra signals', () => {
    expect(getExtraSignals('emergency')).toBe(25)
  })

  it('extra signals increase with severity: warn < demote < emergency', () => {
    expect(getExtraSignals('warn')).toBeLessThan(getExtraSignals('demote'))
    expect(getExtraSignals('demote')).toBeLessThan(getExtraSignals('emergency'))
  })
})

// =============================================================================
// Tests: evaluateDemotionRules()
// =============================================================================

describe('evaluateDemotionRules()', () => {
  // -------------------------------------------------------------------------
  // Rule 1: EMERGENCY — email.send any undo in 7 days
  // -------------------------------------------------------------------------
  describe('Rule 1: EMERGENCY — email.send with ≥1 undo in 7 days', () => {
    it('email.send + 1 undo in 7 days → emergency', () => {
      const result = evaluateDemotionRules('email.send', 0, 1, 1, 5, 10)
      expect(result.triggered).toBe(true)
      expect(result.severity).toBe('emergency')
      expect(result.trigger_name).toBe('email_undo_any')
      expect(result.window_days).toBe(7)
    })

    it('email.send + 3 undos in 7 days → emergency', () => {
      const result = evaluateDemotionRules('email.send', 1, 3, 3, 10, 14)
      expect(result.triggered).toBe(true)
      expect(result.severity).toBe('emergency')
    })

    it('email.send + 0 undos in 7 days → no trigger', () => {
      const result = evaluateDemotionRules('email.send', 0, 0, 0, 5, 10)
      expect(result.triggered).toBe(false)
    })

    it('non-email action type with 1 undo in 7 days does NOT trigger Rule 1', () => {
      // total14d=9 (< 10, Rule 3 blocked), total7d=5, undos7d=1, undoRate7d=20% → warn
      const result = evaluateDemotionRules('crm.note_add', 0, 1, 1, 5, 9)
      // Should not fire as emergency for Rule 1 — may still fire warn/demote
      expect(result.severity).not.toBe('emergency')
      // Given 1/5 = 20% > 10% in 7d with ≥5 actions → should be warn
      expect(result.severity).toBe('warn')
    })
  })

  // -------------------------------------------------------------------------
  // Rule 2: EMERGENCY — 3+ undos in 3 days (any action type)
  // -------------------------------------------------------------------------
  describe('Rule 2: EMERGENCY — ≥3 undos in 3 days', () => {
    it('3 undos in 3 days (non-email) → emergency', () => {
      const result = evaluateDemotionRules('crm.note_add', 3, 3, 3, 5, 10)
      expect(result.triggered).toBe(true)
      expect(result.severity).toBe('emergency')
      expect(result.trigger_name).toBe('undo_spike')
      expect(result.window_days).toBe(3)
    })

    it('2 undos in 3 days → NOT emergency from Rule 2', () => {
      // undos3d=2 (< 3, Rule 2 blocked); total14d=9 (< 10, Rule 3 blocked)
      // total7d=5, undos7d=2, undoRate7d=40% > 10% → warn
      const result = evaluateDemotionRules('crm.note_add', 2, 2, 2, 5, 9)
      expect(result.severity).not.toBe('emergency')
      expect(result.severity).toBe('warn')
    })

    it('exactly 3 undos in 3 days → emergency (≥3 required)', () => {
      const result = evaluateDemotionRules('crm.note_add', 3, 4, 4, 10, 20)
      expect(result.severity).toBe('emergency')
    })

    it('4 undos in 3 days → emergency', () => {
      const result = evaluateDemotionRules('crm.note_add', 4, 4, 4, 10, 20)
      expect(result.severity).toBe('emergency')
    })
  })

  // -------------------------------------------------------------------------
  // Rule 3: DEMOTE — >8% undo rate in 14 days with ≥10 actions
  // -------------------------------------------------------------------------
  describe('Rule 3: DEMOTE — >8% undo rate in 14 days with ≥10 actions', () => {
    it('2 undos in 12 actions over 14 days (~16.7% rate) → demote', () => {
      // undos3d=0, undos7d=0 (no Rule 1/2 trigger), undos14d=2, total7d=4 (<5, no warn), total14d=12
      const result = evaluateDemotionRules('crm.note_add', 0, 0, 2, 4, 12)
      expect(result.triggered).toBe(true)
      expect(result.severity).toBe('demote')
      expect(result.trigger_name).toBe('sustained_undo_rate')
      expect(result.window_days).toBe(14)
    })

    it('1 undo in 12 actions over 14 days (8.3% rate) → demote (>8%)', () => {
      const result = evaluateDemotionRules('crm.note_add', 0, 0, 1, 4, 12)
      expect(result.severity).toBe('demote')
    })

    it('exactly 8% undo rate (1/12.5 not possible with integers; use 0.08 = 8/100)', () => {
      // 8 undos in 100 actions = exactly 8%, NOT >8% → no demote trigger
      const result = evaluateDemotionRules('crm.note_add', 0, 0, 8, 4, 100)
      // 8/100 = 0.08, not > 0.08, so no demote from Rule 3
      // total7d=4 < 5 so no warn from Rule 4 either
      expect(result.triggered).toBe(false)
    })

    it('insufficient volume (9 actions < 10 minimum) prevents Rule 3 even with high rate', () => {
      // 2/9 ≈ 22% > 8% but total14d < 10
      const result = evaluateDemotionRules('crm.note_add', 0, 0, 2, 4, 9)
      // total7d=4 < 5 so Rule 4 won't trigger either
      expect(result.triggered).toBe(false)
    })

    it('exactly 10 actions with >8% rate triggers Rule 3', () => {
      // 1/10 = 10% > 8%
      const result = evaluateDemotionRules('crm.note_add', 0, 0, 1, 4, 10)
      expect(result.severity).toBe('demote')
    })

    it('Rule 3 includes undo_rate in result', () => {
      const result = evaluateDemotionRules('crm.note_add', 0, 0, 2, 4, 10)
      expect(result.undo_rate).toBeCloseTo(0.2, 5)
    })
  })

  // -------------------------------------------------------------------------
  // Rule 4: WARN — >10% undo rate in 7 days with ≥5 actions
  // -------------------------------------------------------------------------
  describe('Rule 4: WARN — >10% undo rate in 7 days with ≥5 actions', () => {
    it('1 undo in 6 actions over 7 days (~16.7% rate) → warn', () => {
      // No Rule 1/2/3 triggers: undos3d=0, undos14d=1, total14d=6 (<10)
      const result = evaluateDemotionRules('crm.note_add', 0, 1, 1, 6, 6)
      expect(result.triggered).toBe(true)
      expect(result.severity).toBe('warn')
      expect(result.trigger_name).toBe('undo_rate_rising')
      expect(result.window_days).toBe(7)
    })

    it('exactly 10% undo rate in 7 days (1/10) → NOT warn (>10% required)', () => {
      // 1/10 = 10%, not > 10%
      const result = evaluateDemotionRules('crm.note_add', 0, 1, 1, 10, 10)
      // total14d=10 but undoRate14d=10% not >8%? Let's check: 1/10=10% > 8% → should demote
      // Actually 10% > 8% with total14d=10 → Rule 3 fires first as demote
      expect(result.severity).toBe('demote')
    })

    it('11% undo rate (1/9) in 7 days with ≥5 actions → warn (when Rule 3 does not trigger)', () => {
      // undos3d=0, undos14d=1, total14d=9 (<10, Rule 3 blocked), total7d=9, undos7d=1
      const result = evaluateDemotionRules('crm.note_add', 0, 1, 1, 9, 9)
      expect(result.severity).toBe('warn')
    })

    it('insufficient volume (4 actions < 5 minimum) prevents Rule 4', () => {
      // 1/4 = 25% > 10% but total7d < 5
      const result = evaluateDemotionRules('crm.note_add', 0, 1, 1, 4, 4)
      expect(result.triggered).toBe(false)
    })

    it('exactly 5 actions with >10% rate triggers Rule 4', () => {
      // 1/5 = 20% > 10%
      const result = evaluateDemotionRules('crm.note_add', 0, 1, 1, 5, 5)
      expect(result.severity).toBe('warn')
    })

    it('Rule 4 includes undo_rate in result', () => {
      const result = evaluateDemotionRules('crm.note_add', 0, 1, 1, 6, 6)
      expect(result.undo_rate).toBeCloseTo(1 / 6, 5)
    })
  })

  // -------------------------------------------------------------------------
  // No trigger
  // -------------------------------------------------------------------------
  describe('No trigger scenarios', () => {
    it('0 undos across all windows → no trigger', () => {
      const result = evaluateDemotionRules('crm.note_add', 0, 0, 0, 20, 50)
      expect(result.triggered).toBe(false)
    })

    it('low undo rate well below thresholds → no trigger', () => {
      // 1 undo in 100 actions = 1% — well below all thresholds
      const result = evaluateDemotionRules('crm.note_add', 0, 0, 1, 50, 100)
      expect(result.triggered).toBe(false)
    })

    it('email.send with 0 undos and low signal volume → no trigger', () => {
      const result = evaluateDemotionRules('email.send', 0, 0, 0, 3, 5)
      expect(result.triggered).toBe(false)
    })

    it('triggered=false result has no severity, trigger_name, or undo_count', () => {
      const result = evaluateDemotionRules('crm.note_add', 0, 0, 0, 10, 20)
      expect(result.triggered).toBe(false)
      expect(result.severity).toBeUndefined()
      expect(result.trigger_name).toBeUndefined()
      expect(result.undo_count).toBeUndefined()
    })
  })

  // -------------------------------------------------------------------------
  // Priority ordering (highest severity wins)
  // -------------------------------------------------------------------------
  describe('Priority ordering — highest severity wins', () => {
    it('email.send undo fires emergency even when demote and warn would also trigger', () => {
      // email.send, undos7d=2 → Rule 1 (emergency)
      // Also: undos14d=2, total14d=10 → Rule 3 would fire demote
      // Also: total7d=8, undoRate7d=25% → Rule 4 would fire warn
      const result = evaluateDemotionRules('email.send', 0, 2, 2, 8, 10)
      expect(result.severity).toBe('emergency')
      expect(result.trigger_name).toBe('email_undo_any')
    })

    it('undo spike (3 in 3 days) fires emergency before demote/warn', () => {
      // undos3d=3 → Rule 2 (emergency)
      // Also: undos14d=3, total14d=10 → Rule 3 would fire demote (30% > 8%)
      const result = evaluateDemotionRules('crm.note_add', 3, 3, 3, 7, 10)
      expect(result.severity).toBe('emergency')
      expect(result.trigger_name).toBe('undo_spike')
    })

    it('demote fires before warn when both would trigger', () => {
      // No Rule 1/2 triggers (undos3d=0, non-email)
      // undos14d=2, total14d=10 → Rule 3: demote (20% > 8%)
      // undos7d=2, total7d=5 → Rule 4: warn (40% > 10%)
      const result = evaluateDemotionRules('crm.note_add', 0, 2, 2, 5, 10)
      expect(result.severity).toBe('demote')
    })
  })
})
