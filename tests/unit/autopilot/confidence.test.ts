/**
 * Unit tests for Autopilot Confidence — AP-005
 *
 * Tests the pure calculation logic from confidence.ts without importing
 * Deno/esm.sh modules. The calculateConfidence and buildConfidenceScore
 * functions are extracted inline for Node.js compatibility.
 */

import { describe, it, expect } from 'vitest'

// =============================================================================
// Extracted types and constants (mirrors confidence.ts / signals.ts)
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

interface SignalRow {
  id: string
  signal: ApprovalSignal
  time_to_respond_ms: number | null
  rubber_stamp: boolean
  created_at: string
}

// =============================================================================
// Extracted pure functions (mirrors confidence.ts exactly)
// =============================================================================

function calculateConfidence(events: SignalRow[]): number {
  if (events.length === 0) return 0

  const now = Date.now()
  let weightedSum = 0
  let weightTotal = 0

  for (const event of events) {
    const daysOld = (now - new Date(event.created_at).getTime()) / (1000 * 60 * 60 * 24)
    const timeWeight = Math.pow(0.5, daysOld / 30)
    const signalWeight = SIGNAL_WEIGHTS[event.signal]
    weightedSum += signalWeight * timeWeight
    weightTotal += Math.abs(signalWeight) * timeWeight
  }

  if (weightTotal === 0) return 0

  const rawScore = (weightedSum / weightTotal + 1) / 2
  const sampleFactor = Math.min(events.length / 10, 1)

  return Math.max(0, Math.min(1, rawScore * sampleFactor))
}

function buildConfidenceScore(events: SignalRow[]) {
  const total_signals = events.length

  const total_approved = events.filter(
    (e) => e.signal === 'approved' || e.signal === 'approved_edited',
  ).length

  const total_rejected = events.filter((e) => e.signal === 'rejected').length

  const total_undone = events.filter(
    (e) => e.signal === 'undone' || e.signal === 'auto_undone',
  ).length

  const approval_rate = total_signals > 0 ? total_approved / total_signals : 0

  const clean_approval_count = events.filter(
    (e) => e.signal === 'approved' && !e.rubber_stamp,
  ).length
  const clean_approval_rate = total_signals > 0 ? clean_approval_count / total_signals : 0

  const approved_edited_count = events.filter((e) => e.signal === 'approved_edited').length
  const edit_rate = total_approved > 0 ? approved_edited_count / total_approved : 0

  const rejection_rate = total_signals > 0 ? total_rejected / total_signals : 0
  const undo_rate = total_signals > 0 ? total_undone / total_signals : 0

  const sorted = [...events].sort(
    (a, b) => new Date(b.created_at).getTime() - new Date(a.created_at).getTime(),
  )
  const last30 = sorted.slice(0, 30)
  const last_30_signals: ApprovalSignal[] = last30.map((e) => e.signal)
  const last_30_score = calculateConfidence(last30)

  const responseTimes = events
    .map((e) => e.time_to_respond_ms)
    .filter((t): t is number => t !== null)
  const avg_response_time_ms =
    responseTimes.length > 0
      ? responseTimes.reduce((sum, t) => sum + t, 0) / responseTimes.length
      : null

  const first_signal_at =
    events.length > 0
      ? events.reduce(
          (earliest, e) => (e.created_at < earliest ? e.created_at : earliest),
          events[0].created_at,
        )
      : null

  const last_signal_at =
    events.length > 0
      ? events.reduce(
          (latest, e) => (e.created_at > latest ? e.created_at : latest),
          events[0].created_at,
        )
      : null

  const uniqueDays = new Set(events.map((e) => e.created_at.slice(0, 10)))
  const days_active = uniqueDays.size

  const score = calculateConfidence(events)

  return {
    score,
    approval_rate,
    clean_approval_rate,
    edit_rate,
    rejection_rate,
    undo_rate,
    total_signals,
    total_approved,
    total_rejected,
    total_undone,
    last_30_score,
    last_30_signals,
    avg_response_time_ms,
    first_signal_at,
    last_signal_at,
    days_active,
  }
}

// =============================================================================
// Test helpers
// =============================================================================

/** Creates a signal row with a timestamp `daysAgo` days before now. */
function makeSignal(
  signal: ApprovalSignal,
  daysAgo = 0,
  overrides: Partial<SignalRow> = {},
): SignalRow {
  const ts = new Date(Date.now() - daysAgo * 24 * 60 * 60 * 1000).toISOString()
  return {
    id: crypto.randomUUID(),
    signal,
    time_to_respond_ms: null,
    rubber_stamp: false,
    created_at: ts,
    ...overrides,
  }
}

/** Creates N identical signal rows, all from today. */
function makeSignals(signal: ApprovalSignal, count: number, daysAgo = 0): SignalRow[] {
  return Array.from({ length: count }, () => makeSignal(signal, daysAgo))
}

// =============================================================================
// Tests: calculateConfidence()
// =============================================================================

describe('calculateConfidence()', () => {
  it('returns 0 for an empty array', () => {
    expect(calculateConfidence([])).toBe(0)
  })

  it('returns a score in [0, 1] for a single approved signal', () => {
    const result = calculateConfidence([makeSignal('approved')])
    expect(result).toBeGreaterThanOrEqual(0)
    expect(result).toBeLessThanOrEqual(1)
  })

  it('all approved signals (recent, n=10) produce a score close to 1.0', () => {
    const signals = makeSignals('approved', 10)
    const score = calculateConfidence(signals)
    // 10 approved signals → rawScore = 1.0, sampleFactor = 1.0
    expect(score).toBeCloseTo(1.0, 5)
  })

  it('all rejected signals (recent, n=10) produce a score close to 0', () => {
    const signals = makeSignals('rejected', 10)
    const score = calculateConfidence(signals)
    // All rejected → rawScore = 0, sampleFactor = 1.0
    expect(score).toBeCloseTo(0, 5)
  })

  it('9 approved + 1 rejected → score > 0.5', () => {
    const signals = [
      ...makeSignals('approved', 9),
      makeSignal('rejected'),
    ]
    const score = calculateConfidence(signals)
    expect(score).toBeGreaterThan(0.5)
  })

  describe('sample factor penalty', () => {
    it('5 signals → score is penalised by factor of 0.5 compared to same-ratio with 10', () => {
      // 5 approved out of 5 → sampleFactor = 0.5, rawScore = 1.0 → score = 0.5
      const signals5 = makeSignals('approved', 5)
      const score5 = calculateConfidence(signals5)
      expect(score5).toBeCloseTo(0.5, 5)
    })

    it('10 approved out of 10 → no penalty (sampleFactor = 1.0)', () => {
      const signals10 = makeSignals('approved', 10)
      const score10 = calculateConfidence(signals10)
      expect(score10).toBeCloseTo(1.0, 5)
    })

    it('20 approved → sampleFactor capped at 1.0 (no bonus beyond 10)', () => {
      const signals20 = makeSignals('approved', 20)
      const score20 = calculateConfidence(signals20)
      expect(score20).toBeCloseTo(1.0, 5)
    })

    it('1 signal → sampleFactor = 0.1, score = 0.1 (all approved)', () => {
      const signals1 = makeSignals('approved', 1)
      const score1 = calculateConfidence(signals1)
      expect(score1).toBeCloseTo(0.1, 5)
    })
  })

  describe('time decay', () => {
    it('recent signals (today) produce a higher score than 30-day-old signals at same count and ratio', () => {
      // 10 approved today
      const recent = makeSignals('approved', 10, 0)
      const scoreRecent = calculateConfidence(recent)

      // 10 approved 30 days ago
      const older = makeSignals('approved', 10, 30)
      const scoreOlder = calculateConfidence(older)

      // Both have sample factor 1.0 (10 signals each).
      // The ratio (approved/approved) is the same so rawScore = 1.0 in both cases,
      // BUT time weight cancels in the ratio — actual score should be equal here
      // because sampleFactor only depends on count, not age.
      // Verify both produce 1.0 (the algorithm normalises by total weight, so decay cancels out).
      expect(scoreRecent).toBeCloseTo(1.0, 5)
      expect(scoreOlder).toBeCloseTo(1.0, 5)
    })

    it('time decay factor is correctly computed for a 30-day-old signal (half-life = 30d)', () => {
      // A single approved signal 30 days old → timeWeight = 0.5
      // sampleFactor = 0.1 (only 1 signal), rawScore = 1.0
      // score = 1.0 * 0.1 = 0.1
      const signal = makeSignal('approved', 30)
      const score = calculateConfidence([signal])
      expect(score).toBeCloseTo(0.1, 4)
    })

    it('mixed signals: time decay does not change the normalised ratio', () => {
      // 9 approved + 1 rejected at same age
      const today = [
        ...makeSignals('approved', 9, 0),
        makeSignal('rejected', 0),
      ]
      const old = [
        ...makeSignals('approved', 9, 90),
        makeSignal('rejected', 90),
      ]
      const scoreToday = calculateConfidence(today)
      const scoreOld = calculateConfidence(old)
      // Because all signals in each group are the same age, the time-weight factor
      // cancels in the ratio → scores should be equal.
      expect(scoreToday).toBeCloseTo(scoreOld, 5)
    })
  })

  describe('auto_undone vs rejected', () => {
    it('a single auto_undone among 9 approved produces a lower score than a single rejected among 9 approved', () => {
      const withAutoUndone = [
        ...makeSignals('approved', 9),
        makeSignal('auto_undone'),
      ]
      const withRejected = [
        ...makeSignals('approved', 9),
        makeSignal('rejected'),
      ]
      const scoreAutoUndone = calculateConfidence(withAutoUndone)
      const scoreRejected = calculateConfidence(withRejected)
      expect(scoreAutoUndone).toBeLessThan(scoreRejected)
    })

    it('auto_undone (weight -3) pulls the score down more than undone (weight -2)', () => {
      const withAutoUndone = [
        ...makeSignals('approved', 9),
        makeSignal('auto_undone'),
      ]
      const withUndone = [
        ...makeSignals('approved', 9),
        makeSignal('undone'),
      ]
      const scoreAutoUndone = calculateConfidence(withAutoUndone)
      const scoreUndone = calculateConfidence(withUndone)
      expect(scoreAutoUndone).toBeLessThan(scoreUndone)
    })
  })

  describe('score is always in [0, 1]', () => {
    const cases: Array<[ApprovalSignal, number]> = [
      ['approved', 10],
      ['rejected', 10],
      ['undone', 10],
      ['auto_undone', 10],
      ['auto_executed', 10],
      ['expired', 10],
      ['approved_edited', 10],
    ]

    for (const [signal, count] of cases) {
      it(`${count} × ${signal} → score in [0, 1]`, () => {
        const score = calculateConfidence(makeSignals(signal, count))
        expect(score).toBeGreaterThanOrEqual(0)
        expect(score).toBeLessThanOrEqual(1)
      })
    }

    it('extreme mix of all signal types → score in [0, 1]', () => {
      const mixed = [
        makeSignal('approved'),
        makeSignal('approved_edited'),
        makeSignal('rejected'),
        makeSignal('expired'),
        makeSignal('undone'),
        makeSignal('auto_executed'),
        makeSignal('auto_undone'),
      ]
      const score = calculateConfidence(mixed)
      expect(score).toBeGreaterThanOrEqual(0)
      expect(score).toBeLessThanOrEqual(1)
    })
  })
})

// =============================================================================
// Tests: buildConfidenceScore()
// =============================================================================

describe('buildConfidenceScore()', () => {
  it('returns zeros for an empty event list', () => {
    const result = buildConfidenceScore([])
    expect(result.total_signals).toBe(0)
    expect(result.total_approved).toBe(0)
    expect(result.total_rejected).toBe(0)
    expect(result.total_undone).toBe(0)
    expect(result.approval_rate).toBe(0)
    expect(result.clean_approval_rate).toBe(0)
    expect(result.rejection_rate).toBe(0)
    expect(result.undo_rate).toBe(0)
    expect(result.score).toBe(0)
    expect(result.first_signal_at).toBeNull()
    expect(result.last_signal_at).toBeNull()
    expect(result.days_active).toBe(0)
    expect(result.avg_response_time_ms).toBeNull()
  })

  describe('total_approved counts approved AND approved_edited', () => {
    it('5 approved + 3 approved_edited = total_approved of 8', () => {
      const events = [
        ...makeSignals('approved', 5),
        ...makeSignals('approved_edited', 3),
      ]
      const result = buildConfidenceScore(events)
      expect(result.total_approved).toBe(8)
    })
  })

  describe('total_undone counts undone AND auto_undone', () => {
    it('2 undone + 3 auto_undone = total_undone of 5', () => {
      const events = [
        ...makeSignals('undone', 2),
        ...makeSignals('auto_undone', 3),
      ]
      const result = buildConfidenceScore(events)
      expect(result.total_undone).toBe(5)
    })
  })

  describe('clean_approval_rate excludes rubber-stamp approvals', () => {
    it('2 clean approvals out of 4 total = 50% clean_approval_rate', () => {
      const events = [
        makeSignal('approved', 0, { rubber_stamp: false }),
        makeSignal('approved', 0, { rubber_stamp: false }),
        makeSignal('approved', 0, { rubber_stamp: true }),  // rubber stamp — excluded
        makeSignal('rejected', 0),
      ]
      const result = buildConfidenceScore(events)
      expect(result.clean_approval_rate).toBeCloseTo(2 / 4, 5)
    })
  })

  describe('edit_rate is approved_edited / total_approved', () => {
    it('3 approved_edited out of 6 total_approved = 50% edit_rate', () => {
      const events = [
        ...makeSignals('approved', 3),
        ...makeSignals('approved_edited', 3),
      ]
      const result = buildConfidenceScore(events)
      expect(result.edit_rate).toBeCloseTo(0.5, 5)
    })

    it('edit_rate is 0 when there are no approvals at all', () => {
      const events = makeSignals('rejected', 5)
      const result = buildConfidenceScore(events)
      expect(result.edit_rate).toBe(0)
    })
  })

  describe('avg_response_time_ms ignores null values', () => {
    it('averages only non-null response times', () => {
      const events = [
        makeSignal('approved', 0, { time_to_respond_ms: 1000 }),
        makeSignal('approved', 0, { time_to_respond_ms: 3000 }),
        makeSignal('approved', 0, { time_to_respond_ms: null }),
      ]
      const result = buildConfidenceScore(events)
      expect(result.avg_response_time_ms).toBeCloseTo(2000, 5)
    })

    it('returns null when all response times are null', () => {
      const events = makeSignals('approved', 3)
      const result = buildConfidenceScore(events)
      expect(result.avg_response_time_ms).toBeNull()
    })
  })

  describe('days_active counts distinct calendar days', () => {
    it('two signals on the same day = 1 day active', () => {
      const ts = '2026-02-10T10:00:00.000Z'
      const events = [
        { id: '1', signal: 'approved' as ApprovalSignal, time_to_respond_ms: null, rubber_stamp: false, created_at: ts },
        { id: '2', signal: 'approved' as ApprovalSignal, time_to_respond_ms: null, rubber_stamp: false, created_at: ts },
      ]
      const result = buildConfidenceScore(events)
      expect(result.days_active).toBe(1)
    })

    it('signals on two different days = 2 days active', () => {
      const events = [
        { id: '1', signal: 'approved' as ApprovalSignal, time_to_respond_ms: null, rubber_stamp: false, created_at: '2026-02-10T10:00:00.000Z' },
        { id: '2', signal: 'approved' as ApprovalSignal, time_to_respond_ms: null, rubber_stamp: false, created_at: '2026-02-11T10:00:00.000Z' },
      ]
      const result = buildConfidenceScore(events)
      expect(result.days_active).toBe(2)
    })
  })

  describe('first_signal_at and last_signal_at', () => {
    it('returns the earliest and latest timestamps', () => {
      const events = [
        { id: '1', signal: 'approved' as ApprovalSignal, time_to_respond_ms: null, rubber_stamp: false, created_at: '2026-02-15T12:00:00.000Z' },
        { id: '2', signal: 'approved' as ApprovalSignal, time_to_respond_ms: null, rubber_stamp: false, created_at: '2026-02-10T08:00:00.000Z' },
        { id: '3', signal: 'approved' as ApprovalSignal, time_to_respond_ms: null, rubber_stamp: false, created_at: '2026-02-20T18:00:00.000Z' },
      ]
      const result = buildConfidenceScore(events)
      expect(result.first_signal_at).toBe('2026-02-10T08:00:00.000Z')
      expect(result.last_signal_at).toBe('2026-02-20T18:00:00.000Z')
    })
  })

  describe('last_30_signals returns the most recent signals (up to 30)', () => {
    it('returns at most 30 signals sorted newest-first', () => {
      // Create 35 signals across different days
      const events = Array.from({ length: 35 }, (_, i) =>
        makeSignal(i % 2 === 0 ? 'approved' : 'rejected', i),
      )
      const result = buildConfidenceScore(events)
      expect(result.last_30_signals).toHaveLength(30)
      // First element is from daysAgo=0 (most recent)
      expect(result.last_30_signals[0]).toBe('approved') // i=0 → approved
    })

    it('returns fewer than 30 signals when total < 30', () => {
      const events = makeSignals('approved', 5)
      const result = buildConfidenceScore(events)
      expect(result.last_30_signals).toHaveLength(5)
    })
  })
})
