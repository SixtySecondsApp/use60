/**
 * Unit tests for Autopilot Signals — AP-004
 *
 * Tests the pure logic from signals.ts without importing Deno/esm.sh modules.
 * The constants and functions are extracted inline for Node.js compatibility.
 */

import { describe, it, expect } from 'vitest'

// =============================================================================
// Extracted constants (mirrors signals.ts exactly)
// =============================================================================

type ApprovalSignal =
  | 'approved'
  | 'approved_edited'
  | 'rejected'
  | 'expired'
  | 'undone'
  | 'auto_executed'
  | 'auto_undone'

const SIGNAL_WEIGHTS: Record<ApprovalSignal, number> = {
  approved:        +1.0,
  approved_edited: +0.3,
  rejected:        -1.0,
  expired:         -0.2,
  undone:          -2.0,
  auto_executed:   +0.1,
  auto_undone:     -3.0,
}

const RUBBER_STAMP_THRESHOLDS: Record<string, number> = {
  'crm.note_add':               2000,
  'crm.activity_log':           1500,
  'crm.contact_enrich':         2000,
  'crm.next_steps_update':      2000,
  'crm.deal_field_update':      1500,
  'crm.deal_stage_change':      3000,
  'crm.deal_amount_change':     3000,
  'crm.deal_close_date_change': 2000,
  'email.draft_save':           1500,
  'email.send':                 5000,
  'email.follow_up_send':       4000,
  'email.check_in_send':        3000,
  'task.create':                1500,
  'task.assign':                1500,
  'calendar.create_event':      2000,
  'calendar.reschedule':        2000,
  'sequence.start':             3000,
  'slack.notification_send':    1500,
  'slack.briefing_send':        2000,
}

const DEFAULT_RUBBER_STAMP_MS = 2000

function isRubberStamp(
  timeToRespondMs: number | null | undefined,
  actionType?: string,
): boolean {
  if (timeToRespondMs == null) return false
  const threshold =
    (actionType ? RUBBER_STAMP_THRESHOLDS[actionType] : null) ?? DEFAULT_RUBBER_STAMP_MS
  return timeToRespondMs < threshold
}

// =============================================================================
// Tests
// =============================================================================

describe('SIGNAL_WEIGHTS', () => {
  it('approved has weight +1.0', () => {
    expect(SIGNAL_WEIGHTS.approved).toBe(+1.0)
  })

  it('approved_edited has weight +0.3', () => {
    expect(SIGNAL_WEIGHTS.approved_edited).toBe(+0.3)
  })

  it('rejected has weight -1.0', () => {
    expect(SIGNAL_WEIGHTS.rejected).toBe(-1.0)
  })

  it('expired has weight -0.2', () => {
    expect(SIGNAL_WEIGHTS.expired).toBe(-0.2)
  })

  it('undone has weight -2.0', () => {
    expect(SIGNAL_WEIGHTS.undone).toBe(-2.0)
  })

  it('auto_executed has weight +0.1', () => {
    expect(SIGNAL_WEIGHTS.auto_executed).toBe(+0.1)
  })

  it('auto_undone has weight -3.0', () => {
    expect(SIGNAL_WEIGHTS.auto_undone).toBe(-3.0)
  })

  it('all seven signal types are present', () => {
    const keys = Object.keys(SIGNAL_WEIGHTS)
    expect(keys).toHaveLength(7)
    expect(keys).toContain('approved')
    expect(keys).toContain('approved_edited')
    expect(keys).toContain('rejected')
    expect(keys).toContain('expired')
    expect(keys).toContain('undone')
    expect(keys).toContain('auto_executed')
    expect(keys).toContain('auto_undone')
  })

  it('negative signals carry more absolute weight than positive signals (asymmetric bias)', () => {
    const maxPositive = Math.max(
      SIGNAL_WEIGHTS.approved,
      SIGNAL_WEIGHTS.approved_edited,
      SIGNAL_WEIGHTS.auto_executed,
    )
    const maxNegativeAbs = Math.max(
      Math.abs(SIGNAL_WEIGHTS.rejected),
      Math.abs(SIGNAL_WEIGHTS.undone),
      Math.abs(SIGNAL_WEIGHTS.auto_undone),
    )
    expect(maxNegativeAbs).toBeGreaterThan(maxPositive)
  })

  it('severity ordering: |auto_undone| > |undone| > |rejected| AND |auto_undone| > |rejected| = |approved|', () => {
    // The spec says negative signals are heavier than positive ones overall.
    // In the actual weights: |rejected| = 1.0 = |approved| = 1.0 (they are equal).
    // The asymmetry is that undone and auto_undone carry even more weight.
    expect(Math.abs(SIGNAL_WEIGHTS.auto_undone)).toBeGreaterThan(Math.abs(SIGNAL_WEIGHTS.undone))
    expect(Math.abs(SIGNAL_WEIGHTS.undone)).toBeGreaterThan(Math.abs(SIGNAL_WEIGHTS.rejected))
    // rejected and approved share the same absolute magnitude (1.0)
    expect(Math.abs(SIGNAL_WEIGHTS.rejected)).toBe(Math.abs(SIGNAL_WEIGHTS.approved))
    // but auto_undone is still greater than approved
    expect(Math.abs(SIGNAL_WEIGHTS.auto_undone)).toBeGreaterThan(Math.abs(SIGNAL_WEIGHTS.approved))
  })
})

describe('isRubberStamp()', () => {
  describe('null / undefined inputs', () => {
    it('returns false when timeToRespondMs is null (benefit of the doubt)', () => {
      expect(isRubberStamp(null)).toBe(false)
    })

    it('returns false when timeToRespondMs is undefined', () => {
      expect(isRubberStamp(undefined)).toBe(false)
    })

    it('returns false when null with a known action type', () => {
      expect(isRubberStamp(null, 'email.send')).toBe(false)
    })
  })

  describe('0 ms — always a rubber stamp', () => {
    it('returns true for 0ms with no action type', () => {
      expect(isRubberStamp(0)).toBe(true)
    })

    it('returns true for 0ms with email.send (5000ms threshold)', () => {
      expect(isRubberStamp(0, 'email.send')).toBe(true)
    })

    it('returns true for 0ms with crm.deal_stage_change (3000ms threshold)', () => {
      expect(isRubberStamp(0, 'crm.deal_stage_change')).toBe(true)
    })
  })

  describe('DEFAULT threshold (2000ms) — no action type supplied', () => {
    it('1999ms with no actionType is a rubber stamp (< 2000)', () => {
      expect(isRubberStamp(1999)).toBe(true)
    })

    it('2000ms with no actionType is NOT a rubber stamp (= threshold, strict <)', () => {
      expect(isRubberStamp(2000)).toBe(false)
    })

    it('2001ms with no actionType is NOT a rubber stamp (> threshold)', () => {
      expect(isRubberStamp(2001)).toBe(false)
    })
  })

  describe('crm.note_add (2000ms threshold)', () => {
    it('1999ms is a rubber stamp', () => {
      expect(isRubberStamp(1999, 'crm.note_add')).toBe(true)
    })

    it('2000ms is NOT a rubber stamp (boundary)', () => {
      expect(isRubberStamp(2000, 'crm.note_add')).toBe(false)
    })

    it('2001ms is NOT a rubber stamp', () => {
      expect(isRubberStamp(2001, 'crm.note_add')).toBe(false)
    })
  })

  describe('email.send (5000ms threshold)', () => {
    it('4999ms is a rubber stamp', () => {
      expect(isRubberStamp(4999, 'email.send')).toBe(true)
    })

    it('5000ms is NOT a rubber stamp (boundary)', () => {
      expect(isRubberStamp(5000, 'email.send')).toBe(false)
    })

    it('5001ms is NOT a rubber stamp', () => {
      expect(isRubberStamp(5001, 'email.send')).toBe(false)
    })
  })

  describe('crm.deal_stage_change (3000ms threshold)', () => {
    it('2999ms is a rubber stamp', () => {
      expect(isRubberStamp(2999, 'crm.deal_stage_change')).toBe(true)
    })

    it('3000ms is NOT a rubber stamp (boundary)', () => {
      expect(isRubberStamp(3000, 'crm.deal_stage_change')).toBe(false)
    })
  })

  describe('crm.activity_log (1500ms threshold)', () => {
    it('1499ms is a rubber stamp', () => {
      expect(isRubberStamp(1499, 'crm.activity_log')).toBe(true)
    })

    it('1500ms is NOT a rubber stamp (boundary)', () => {
      expect(isRubberStamp(1500, 'crm.activity_log')).toBe(false)
    })
  })

  describe('email.follow_up_send (4000ms threshold)', () => {
    it('3999ms is a rubber stamp', () => {
      expect(isRubberStamp(3999, 'email.follow_up_send')).toBe(true)
    })

    it('4000ms is NOT a rubber stamp (boundary)', () => {
      expect(isRubberStamp(4000, 'email.follow_up_send')).toBe(false)
    })
  })

  describe('unknown action type falls back to DEFAULT_RUBBER_STAMP_MS (2000ms)', () => {
    it('1999ms with an unknown action type is a rubber stamp', () => {
      expect(isRubberStamp(1999, 'unknown.action')).toBe(true)
    })

    it('2000ms with an unknown action type is NOT a rubber stamp', () => {
      expect(isRubberStamp(2000, 'unknown.action')).toBe(false)
    })

    it('undefined action type also falls back to 2000ms default', () => {
      expect(isRubberStamp(1999, undefined)).toBe(true)
      expect(isRubberStamp(2000, undefined)).toBe(false)
    })
  })

  describe('every action type in RUBBER_STAMP_THRESHOLDS has a correct boundary', () => {
    for (const [actionType, threshold] of Object.entries(RUBBER_STAMP_THRESHOLDS)) {
      it(`${actionType}: threshold=${threshold}ms boundary is correct`, () => {
        expect(isRubberStamp(threshold - 1, actionType)).toBe(true)
        expect(isRubberStamp(threshold, actionType)).toBe(false)
      })
    }
  })
})
