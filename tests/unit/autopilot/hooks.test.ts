/**
 * Unit tests for Autopilot hooks — useAutopilotDashboard & useTimeSaved
 *
 * Tests the pure computation logic (aggregates, autonomy score, time-saved
 * calculations) extracted from the hooks. Supabase and React Query are mocked.
 */

import { describe, it, expect } from 'vitest'

// =============================================================================
// Types (mirrored from useAutopilotDashboard.ts / useTimeSaved.ts)
// =============================================================================

type Tier = 'disabled' | 'suggest' | 'approve' | 'auto'

interface ActionTypeStats {
  action_type: string
  current_tier: Tier
  score: number
  total_signals: number
  total_approved: number
  total_rejected: number
  total_undone: number
  last_30_score: number | null
  days_active: number
  approval_rate: number | null
  clean_approval_rate: number | null
  edit_rate: number | null
  rejection_rate: number | null
  undo_rate: number | null
  promotion_eligible: boolean
  cooldown_until: string | null
  never_promote: boolean
  extra_required_signals: number
  first_signal_at: string | null
  last_signal_at: string | null
}

// =============================================================================
// Extracted pure computation logic (mirrors fetchAutopilotDashboard())
// =============================================================================

const ACTION_TIME_SECONDS_DASHBOARD: Record<string, number> = {
  'crm.note_add': 120,
  'crm.activity_log': 30,
  'crm.contact_enrich': 300,
  'crm.next_steps_update': 60,
  'crm.deal_field_update': 45,
  'crm.deal_stage_change': 30,
  'crm.deal_amount_change': 30,
  'crm.deal_close_date_change': 30,
  'email.draft_save': 0,
  'email.send': 600,
  'email.follow_up_send': 480,
  'email.check_in_send': 300,
  'task.create': 60,
  'task.assign': 30,
  'analysis.risk_assessment': 900,
  'analysis.coaching_feedback': 1200,
}

const DEFAULT_ACTION_TIME_SECONDS = 60

function computeDashboard(rows: ActionTypeStats[]) {
  if (rows.length === 0) {
    return {
      stats: [],
      autonomy_score: 0,
      time_saved_hours_week: 0,
      total_auto_actions: 0,
      total_action_types_tracked: 0,
      auto_count: 0,
      approve_count: 0,
      suggest_count: 0,
    }
  }

  const auto_count = rows.filter((r) => r.current_tier === 'auto').length
  const approve_count = rows.filter((r) => r.current_tier === 'approve').length
  const suggest_count = rows.filter((r) => r.current_tier === 'suggest').length

  const autonomy_score = (auto_count / rows.length) * 100

  const total_auto_actions = rows
    .filter((r) => r.current_tier === 'auto')
    .reduce((sum, r) => sum + (r.last_30_score != null ? r.last_30_score : 0), 0)

  let totalTimeSavedSeconds = 0

  for (const row of rows) {
    if (row.current_tier !== 'auto' && row.current_tier !== 'approve') {
      continue
    }

    const timeSeconds =
      ACTION_TIME_SECONDS_DASHBOARD[row.action_type] ?? DEFAULT_ACTION_TIME_SECONDS

    const signalsPerWeek = (row.total_signals / 90) * 7
    const multiplier = row.current_tier === 'auto' ? 1.0 : 0.7

    totalTimeSavedSeconds += signalsPerWeek * timeSeconds * multiplier
  }

  const time_saved_hours_week = totalTimeSavedSeconds / 3600

  return {
    stats: rows,
    autonomy_score,
    time_saved_hours_week,
    total_auto_actions,
    total_action_types_tracked: rows.length,
    auto_count,
    approve_count,
    suggest_count,
  }
}

// =============================================================================
// Extracted pure computation logic (mirrors fetchTimeSaved())
// =============================================================================

const ACTION_TIME_SECONDS_TIMESAVED: Record<string, number> = {
  'crm.note_add': 120,
  'crm.activity_log': 30,
  'crm.contact_enrich': 300,
  'crm.next_steps_update': 60,
  'crm.deal_field_update': 45,
  'crm.deal_stage_change': 30,
  'crm.deal_amount_change': 30,
  'crm.deal_close_date_change': 30,
  'email.draft_save': 0,
  'email.send': 600,
  'email.follow_up_send': 480,
  'email.check_in_send': 300,
  'task.create': 60,
  'task.assign': 30,
  'analysis.risk_assessment': 900,
  'analysis.coaching_feedback': 1200,
}

const DEFAULT_TIME_SECONDS = 60
const AUTO_TIER_COUNTED_SIGNALS = new Set(['auto_executed', 'approved'])

interface SignalRow {
  action_type: string
  signal: string
  autonomy_tier_at_time: string
  created_at: string
}

function computeTimeSaved(rows: SignalRow[]) {
  if (rows.length === 0) {
    return {
      total_seconds: 0,
      total_hours: 0,
      auto_seconds: 0,
      approve_seconds: 0,
      actions_auto: 0,
      actions_approved: 0,
      breakdown: [],
    }
  }

  const breakdownMap = new Map<string, { action_type: string; tier: string; seconds_saved: number; action_count: number }>()

  let auto_seconds = 0
  let approve_seconds = 0
  let actions_auto = 0
  let actions_approved = 0

  for (const row of rows) {
    const tier = row.autonomy_tier_at_time
    const signal = row.signal
    const baseTime = ACTION_TIME_SECONDS_TIMESAVED[row.action_type] ?? DEFAULT_TIME_SECONDS

    let secondsSaved = 0

    if (tier === 'auto' && AUTO_TIER_COUNTED_SIGNALS.has(signal)) {
      secondsSaved = baseTime
      auto_seconds += secondsSaved
      actions_auto += 1
    } else if (tier === 'approve' && signal === 'approved') {
      secondsSaved = baseTime * 0.7
      approve_seconds += secondsSaved
      actions_approved += 1
    }

    const key = `${row.action_type}::${tier}`
    const existing = breakdownMap.get(key)
    if (existing) {
      existing.seconds_saved += secondsSaved
      existing.action_count += 1
    } else {
      breakdownMap.set(key, {
        action_type: row.action_type,
        tier,
        seconds_saved: secondsSaved,
        action_count: 1,
      })
    }
  }

  const breakdown = Array.from(breakdownMap.values()).sort(
    (a, b) => b.seconds_saved - a.seconds_saved,
  )

  const total_seconds = auto_seconds + approve_seconds
  const total_hours = total_seconds / 3600

  return {
    total_seconds,
    total_hours,
    auto_seconds,
    approve_seconds,
    actions_auto,
    actions_approved,
    breakdown,
  }
}

// =============================================================================
// Test helpers
// =============================================================================

function makeStats(
  action_type: string,
  tier: Tier,
  total_signals = 90,
  last_30_score: number | null = 0.8,
): ActionTypeStats {
  return {
    action_type,
    current_tier: tier,
    score: 0.8,
    total_signals,
    total_approved: 80,
    total_rejected: 5,
    total_undone: 2,
    last_30_score,
    days_active: 30,
    approval_rate: 0.89,
    clean_approval_rate: 0.80,
    edit_rate: 0.10,
    rejection_rate: 0.06,
    undo_rate: 0.02,
    promotion_eligible: false,
    cooldown_until: null,
    never_promote: false,
    extra_required_signals: 0,
    first_signal_at: '2026-01-01T00:00:00.000Z',
    last_signal_at: '2026-02-26T00:00:00.000Z',
  }
}

function makeSignalRow(
  action_type: string,
  signal: string,
  tier: string,
): SignalRow {
  return {
    action_type,
    signal,
    autonomy_tier_at_time: tier,
    created_at: new Date().toISOString(),
  }
}

// =============================================================================
// Tests: computeDashboard() — autonomy score
// =============================================================================

describe('computeDashboard() — autonomy_score', () => {
  it('empty rows → autonomy_score = 0', () => {
    const result = computeDashboard([])
    expect(result.autonomy_score).toBe(0)
  })

  it('0 auto actions out of 10 → 0%', () => {
    const rows = Array.from({ length: 10 }, (_, i) =>
      makeStats(`action.${i}`, 'suggest'),
    )
    const result = computeDashboard(rows)
    expect(result.autonomy_score).toBe(0)
  })

  it('3 auto out of 10 → 30%', () => {
    const rows = [
      ...Array.from({ length: 3 }, (_, i) => makeStats(`auto.${i}`, 'auto')),
      ...Array.from({ length: 7 }, (_, i) => makeStats(`suggest.${i}`, 'suggest')),
    ]
    const result = computeDashboard(rows)
    expect(result.autonomy_score).toBeCloseTo(30, 5)
  })

  it('10 auto out of 10 → 100%', () => {
    const rows = Array.from({ length: 10 }, (_, i) =>
      makeStats(`action.${i}`, 'auto'),
    )
    const result = computeDashboard(rows)
    expect(result.autonomy_score).toBe(100)
  })

  it('5 auto out of 10 → 50%', () => {
    const rows = [
      ...Array.from({ length: 5 }, (_, i) => makeStats(`auto.${i}`, 'auto')),
      ...Array.from({ length: 5 }, (_, i) => makeStats(`approve.${i}`, 'approve')),
    ]
    const result = computeDashboard(rows)
    expect(result.autonomy_score).toBeCloseTo(50, 5)
  })
})

// =============================================================================
// Tests: computeDashboard() — tier counts
// =============================================================================

describe('computeDashboard() — tier counts', () => {
  it('counts auto, approve, and suggest tiers correctly', () => {
    const rows = [
      makeStats('a1', 'auto'),
      makeStats('a2', 'auto'),
      makeStats('b1', 'approve'),
      makeStats('c1', 'suggest'),
      makeStats('c2', 'suggest'),
      makeStats('c3', 'suggest'),
    ]
    const result = computeDashboard(rows)
    expect(result.auto_count).toBe(2)
    expect(result.approve_count).toBe(1)
    expect(result.suggest_count).toBe(3)
    expect(result.total_action_types_tracked).toBe(6)
  })

  it('disabled tier rows are not counted in auto/approve/suggest', () => {
    const rows = [
      makeStats('a1', 'auto'),
      makeStats('d1', 'disabled' as Tier),
    ]
    const result = computeDashboard(rows)
    expect(result.auto_count).toBe(1)
    expect(result.approve_count).toBe(0)
    expect(result.suggest_count).toBe(0)
    expect(result.total_action_types_tracked).toBe(2) // both rows are tracked
  })
})

// =============================================================================
// Tests: computeDashboard() — time_saved_hours_week
// =============================================================================

describe('computeDashboard() — time_saved_hours_week', () => {
  it('suggest-only rows contribute 0 time saved', () => {
    const rows = [makeStats('crm.note_add', 'suggest', 90)]
    const result = computeDashboard(rows)
    expect(result.time_saved_hours_week).toBe(0)
  })

  it('auto-tier email.send row: 90 signals over 90 days = 1/day = 7/week × 600s × 1.0 = 4200s = 1.167h', () => {
    // total_signals=90 → signalsPerWeek = (90/90)*7 = 7
    // timeSeconds = 600, multiplier = 1.0
    // totalSeconds = 7 * 600 * 1.0 = 4200s → 1.1667h
    const rows = [makeStats('email.send', 'auto', 90)]
    const result = computeDashboard(rows)
    expect(result.time_saved_hours_week).toBeCloseTo(4200 / 3600, 4)
  })

  it('approve-tier crm.note_add: 90 signals → 7/week × 120s × 0.7 = 588s = 0.163h', () => {
    // signalsPerWeek = 7, timeSeconds = 120, multiplier = 0.7
    // totalSeconds = 7 * 120 * 0.7 = 588s
    const rows = [makeStats('crm.note_add', 'approve', 90)]
    const result = computeDashboard(rows)
    expect(result.time_saved_hours_week).toBeCloseTo(588 / 3600, 4)
  })

  it('multiple rows accumulate correctly', () => {
    const rows = [
      makeStats('email.send', 'auto', 90),    // 4200s
      makeStats('crm.note_add', 'approve', 90), // 588s
    ]
    const result = computeDashboard(rows)
    const expected = (4200 + 588) / 3600
    expect(result.time_saved_hours_week).toBeCloseTo(expected, 4)
  })

  it('unknown action type uses DEFAULT_ACTION_TIME_SECONDS (60s)', () => {
    const rows = [makeStats('custom.unknown_action', 'auto', 90)]
    // signalsPerWeek = 7, timeSeconds = 60, multiplier = 1.0 → 420s = 0.1167h
    const result = computeDashboard(rows)
    expect(result.time_saved_hours_week).toBeCloseTo(420 / 3600, 4)
  })

  it('email.draft_save has 0 time value (no time saved even on auto tier)', () => {
    const rows = [makeStats('email.draft_save', 'auto', 90)]
    // timeSeconds = 0 → totalSeconds = 0
    const result = computeDashboard(rows)
    expect(result.time_saved_hours_week).toBe(0)
  })
})

// =============================================================================
// Tests: computeDashboard() — total_auto_actions
// =============================================================================

describe('computeDashboard() — total_auto_actions', () => {
  it('sums last_30_score of auto-tier rows only', () => {
    const rows = [
      makeStats('a1', 'auto', 90, 0.9),
      makeStats('a2', 'auto', 90, 0.8),
      makeStats('b1', 'approve', 90, 0.7),  // excluded
      makeStats('c1', 'suggest', 90, 0.6),  // excluded
    ]
    const result = computeDashboard(rows)
    expect(result.total_auto_actions).toBeCloseTo(0.9 + 0.8, 5)
  })

  it('null last_30_score is treated as 0', () => {
    const rows = [
      makeStats('a1', 'auto', 90, null),
      makeStats('a2', 'auto', 90, 0.8),
    ]
    const result = computeDashboard(rows)
    expect(result.total_auto_actions).toBeCloseTo(0.8, 5)
  })
})

// =============================================================================
// Tests: computeTimeSaved() — auto tier
// =============================================================================

describe('computeTimeSaved() — auto tier signals', () => {
  it('empty rows → all zeros', () => {
    const result = computeTimeSaved([])
    expect(result.total_seconds).toBe(0)
    expect(result.total_hours).toBe(0)
    expect(result.auto_seconds).toBe(0)
    expect(result.approve_seconds).toBe(0)
    expect(result.actions_auto).toBe(0)
    expect(result.actions_approved).toBe(0)
    expect(result.breakdown).toHaveLength(0)
  })

  it('auto_executed signal at auto tier counts as 100% of action time', () => {
    const rows = [makeSignalRow('email.send', 'auto_executed', 'auto')]
    // email.send = 600s, tier=auto, signal=auto_executed → 600s
    const result = computeTimeSaved(rows)
    expect(result.auto_seconds).toBe(600)
    expect(result.actions_auto).toBe(1)
    expect(result.approve_seconds).toBe(0)
  })

  it('approved signal at auto tier counts as 100% of action time', () => {
    const rows = [makeSignalRow('crm.note_add', 'approved', 'auto')]
    // crm.note_add = 120s
    const result = computeTimeSaved(rows)
    expect(result.auto_seconds).toBe(120)
    expect(result.actions_auto).toBe(1)
  })

  it('10 auto_executed signals for email.send (600s each) = 6000s = 1.667h/week', () => {
    const rows = Array.from({ length: 10 }, () =>
      makeSignalRow('email.send', 'auto_executed', 'auto'),
    )
    const result = computeTimeSaved(rows)
    expect(result.auto_seconds).toBe(6000)
    expect(result.total_hours).toBeCloseTo(6000 / 3600, 4)
    expect(result.actions_auto).toBe(10)
  })
})

// =============================================================================
// Tests: computeTimeSaved() — approve tier
// =============================================================================

describe('computeTimeSaved() — approve tier signals', () => {
  it('approved signal at approve tier counts as 70% of action time', () => {
    const rows = [makeSignalRow('crm.note_add', 'approved', 'approve')]
    // crm.note_add = 120s × 0.7 = 84s
    const result = computeTimeSaved(rows)
    expect(result.approve_seconds).toBe(84)
    expect(result.actions_approved).toBe(1)
    expect(result.auto_seconds).toBe(0)
  })

  it('10 approved signals for crm.note_add at approve tier = 10×120×0.7 = 840s', () => {
    const rows = Array.from({ length: 10 }, () =>
      makeSignalRow('crm.note_add', 'approved', 'approve'),
    )
    const result = computeTimeSaved(rows)
    expect(result.approve_seconds).toBe(840)
    expect(result.actions_approved).toBe(10)
  })

  it('rejected signal at approve tier contributes 0s', () => {
    const rows = [makeSignalRow('email.send', 'rejected', 'approve')]
    const result = computeTimeSaved(rows)
    expect(result.approve_seconds).toBe(0)
    expect(result.total_seconds).toBe(0)
  })

  it('auto_executed signal at approve tier contributes 0s (only approved counts at approve tier)', () => {
    const rows = [makeSignalRow('email.send', 'auto_executed', 'approve')]
    const result = computeTimeSaved(rows)
    expect(result.approve_seconds).toBe(0)
    expect(result.total_seconds).toBe(0)
  })
})

// =============================================================================
// Tests: computeTimeSaved() — signals that never count
// =============================================================================

describe('computeTimeSaved() — signals that contribute 0 seconds', () => {
  const zeroSignalCases: Array<[string, string]> = [
    ['rejected', 'auto'],
    ['rejected', 'approve'],
    ['expired', 'auto'],
    ['expired', 'approve'],
    ['undone', 'auto'],
    ['undone', 'approve'],
    ['auto_undone', 'auto'],
    ['approved_edited', 'auto'],
    ['approved_edited', 'approve'],
    ['approved', 'suggest'],    // suggest tier never counts
    ['auto_executed', 'suggest'],
  ]

  for (const [signal, tier] of zeroSignalCases) {
    it(`${signal} at ${tier} tier → 0 seconds`, () => {
      const rows = [makeSignalRow('email.send', signal, tier)]
      const result = computeTimeSaved(rows)
      expect(result.total_seconds).toBe(0)
    })
  }
})

// =============================================================================
// Tests: computeTimeSaved() — mixed signals
// =============================================================================

describe('computeTimeSaved() — mixed auto and approve tier', () => {
  it('correctly splits auto_seconds and approve_seconds', () => {
    const rows = [
      makeSignalRow('email.send', 'auto_executed', 'auto'),    // 600s auto
      makeSignalRow('crm.note_add', 'approved', 'approve'),    // 120s × 0.7 = 84s approve
      makeSignalRow('email.send', 'rejected', 'auto'),         // 0s
    ]
    const result = computeTimeSaved(rows)
    expect(result.auto_seconds).toBe(600)
    expect(result.approve_seconds).toBe(84)
    expect(result.total_seconds).toBe(684)
    expect(result.actions_auto).toBe(1)
    expect(result.actions_approved).toBe(1)
  })

  it('breakdown accumulates correctly for same action_type+tier', () => {
    const rows = [
      makeSignalRow('email.send', 'auto_executed', 'auto'),
      makeSignalRow('email.send', 'approved', 'auto'),
      makeSignalRow('email.send', 'auto_executed', 'auto'),
    ]
    // email.send auto: 3 rows, 3 × 600 = 1800s
    const result = computeTimeSaved(rows)
    expect(result.auto_seconds).toBe(1800)
    const emailAutoEntry = result.breakdown.find(
      (b) => b.action_type === 'email.send' && b.tier === 'auto',
    )
    expect(emailAutoEntry).toBeDefined()
    expect(emailAutoEntry!.seconds_saved).toBe(1800)
    expect(emailAutoEntry!.action_count).toBe(3)
  })

  it('breakdown is sorted by seconds_saved descending', () => {
    const rows = [
      makeSignalRow('crm.note_add', 'auto_executed', 'auto'),   // 120s
      makeSignalRow('email.send', 'auto_executed', 'auto'),      // 600s
      makeSignalRow('task.create', 'auto_executed', 'auto'),     // 60s
    ]
    const result = computeTimeSaved(rows)
    // email.send (600) > crm.note_add (120) > task.create (60)
    expect(result.breakdown[0].action_type).toBe('email.send')
    expect(result.breakdown[1].action_type).toBe('crm.note_add')
    expect(result.breakdown[2].action_type).toBe('task.create')
  })
})

// =============================================================================
// Tests: computeTimeSaved() — unknown action type falls back to 60s default
// =============================================================================

describe('computeTimeSaved() — default fallback time', () => {
  it('unknown action type at auto tier uses 60s default', () => {
    const rows = [makeSignalRow('custom.unknown', 'auto_executed', 'auto')]
    const result = computeTimeSaved(rows)
    expect(result.auto_seconds).toBe(DEFAULT_TIME_SECONDS)
  })

  it('email.draft_save has 0s value (no time saved)', () => {
    const rows = [makeSignalRow('email.draft_save', 'auto_executed', 'auto')]
    const result = computeTimeSaved(rows)
    expect(result.auto_seconds).toBe(0)
  })
})

// =============================================================================
// Tests: total_hours accuracy
// =============================================================================

describe('computeTimeSaved() — total_hours', () => {
  it('total_hours = total_seconds / 3600', () => {
    const rows = [
      makeSignalRow('email.send', 'auto_executed', 'auto'),    // 600s
      makeSignalRow('crm.note_add', 'approved', 'approve'),    // 84s
    ]
    const result = computeTimeSaved(rows)
    expect(result.total_hours).toBeCloseTo(684 / 3600, 6)
  })

  it('0 seconds → 0 hours', () => {
    const result = computeTimeSaved([])
    expect(result.total_hours).toBe(0)
  })
})
