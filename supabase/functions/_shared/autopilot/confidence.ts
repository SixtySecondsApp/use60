/**
 * Autopilot Confidence — AP-005
 *
 * Time-decayed confidence scoring for the Autopilot Engine.
 * Aggregates approval/rejection/undo signals from `autopilot_signals` into a
 * single composite score per (user, action_type) pair, persists the result to
 * `autopilot_confidence`, and optionally syncs the autonomy profile back to
 * `rep_memory`.
 */

import { SupabaseClient } from 'https://esm.sh/@supabase/supabase-js@2.43.4'
import { ApprovalSignal, SIGNAL_WEIGHTS } from './signals.ts'

// =============================================================================
// Types
// =============================================================================

export interface ConfidenceScore {
  user_id: string
  org_id: string
  action_type: string
  score: number                      // 0.0 - 1.0 composite
  approval_rate: number
  clean_approval_rate: number        // excludes rubber-stamps
  edit_rate: number
  rejection_rate: number
  undo_rate: number
  total_signals: number
  total_approved: number
  total_rejected: number
  total_undone: number
  last_30_score: number
  last_30_signals: ApprovalSignal[]
  avg_response_time_ms: number | null
  first_signal_at: string | null
  last_signal_at: string | null
  days_active: number
  current_tier: string
  promotion_eligible: boolean
  cooldown_until: string | null
  never_promote: boolean
  extra_required_signals: number
}

/** Minimal shape of a signal row fetched from the database. */
interface SignalRow {
  id: string
  signal: ApprovalSignal
  time_to_respond_ms: number | null
  rubber_stamp: boolean
  created_at: string
}

// =============================================================================
// Core Calculations
// =============================================================================

/**
 * Calculates a time-decayed composite confidence score from an array of signal
 * rows.
 *
 * Algorithm:
 * - Each signal is weighted by `SIGNAL_WEIGHTS[signal]`.
 * - A time-decay factor (`Math.pow(0.5, daysOld / 30)`) applies exponential
 *   decay with a 30-day half-life — older signals have less influence.
 * - The raw weighted average is normalised from the [-1,+1] range to [0,1]
 *   via `(weightedSum / weightTotal + 1) / 2`.
 * - A sample factor (`Math.min(n / 10, 1)`) penalises scores derived from
 *   fewer than 10 signals to avoid over-confidence on thin data.
 * - Returns `0` if the events array is empty.
 *
 * @param events - Signal rows ordered by recency (newest first or any order)
 */
export function calculateConfidence(events: SignalRow[]): number {
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

/**
 * Builds all rate and count metrics from an array of signal rows.
 *
 * The returned object covers all fields of `ConfidenceScore` except the
 * identity/tier fields (`user_id`, `org_id`, `action_type`, `current_tier`,
 * `promotion_eligible`, `cooldown_until`, `never_promote`,
 * `extra_required_signals`) which are managed by the caller.
 *
 * @param events   - All signal rows to aggregate (typically last 90 days)
 * @param existing - Optional existing row; reserved for future delta logic
 */
export function buildConfidenceScore(
  events: SignalRow[],
  // eslint-disable-next-line @typescript-eslint/no-unused-vars
  existing?: Partial<ConfidenceScore>,
): Omit<ConfidenceScore, 'user_id' | 'org_id' | 'action_type' | 'current_tier' | 'promotion_eligible' | 'cooldown_until' | 'never_promote' | 'extra_required_signals'> {
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

  // Last 30 signals (most recent first, then take first 30)
  const sorted = [...events].sort(
    (a, b) => new Date(b.created_at).getTime() - new Date(a.created_at).getTime(),
  )
  const last30 = sorted.slice(0, 30)
  const last_30_signals: ApprovalSignal[] = last30.map((e) => e.signal)
  const last_30_score = calculateConfidence(last30)

  // Average response time (non-null only)
  const responseTimes = events
    .map((e) => e.time_to_respond_ms)
    .filter((t): t is number => t !== null)
  const avg_response_time_ms =
    responseTimes.length > 0
      ? responseTimes.reduce((sum, t) => sum + t, 0) / responseTimes.length
      : null

  // Temporal boundaries
  const first_signal_at = events.length > 0
    ? events.reduce((earliest, e) =>
        e.created_at < earliest ? e.created_at : earliest,
      events[0].created_at)
    : null

  const last_signal_at = events.length > 0
    ? events.reduce((latest, e) =>
        e.created_at > latest ? e.created_at : latest,
      events[0].created_at)
    : null

  // Count distinct calendar days (YYYY-MM-DD)
  const uniqueDays = new Set(
    events.map((e) => e.created_at.slice(0, 10)),
  )
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
// Persistence
// =============================================================================

/**
 * Recalculates the confidence score for a specific (user, action_type) pair
 * and upserts the result into `autopilot_confidence`.
 *
 * Steps:
 * 1. Fetches the last 90 days of signals from `autopilot_signals`.
 * 2. Calls `buildConfidenceScore` to compute all metrics.
 * 3. Reads any existing row from `autopilot_confidence` to preserve tier/
 *    cooldown fields that are managed separately (promotion/demotion engine).
 * 4. Determines `promotion_eligible` (score > 0.7 AND >= 10 total signals).
 * 5. Upserts the merged row to `autopilot_confidence`.
 * 6. Returns the full `ConfidenceScore` or `null` if the upsert fails.
 *
 * NOTE: This function does NOT call `updateRepMemory`. The caller (edge
 * function) is responsible for calling that separately after this returns.
 *
 * @param supabase   - Supabase client (service role recommended)
 * @param userId     - UUID of the user
 * @param orgId      - UUID of the organisation
 * @param actionType - Action type slug (e.g. `'send_email'`)
 */
export async function recalculateUserConfidence(
  supabase: SupabaseClient,
  userId: string,
  orgId: string,
  actionType: string,
): Promise<ConfidenceScore | null> {
  const ninetyDaysAgo = new Date(Date.now() - 90 * 24 * 60 * 60 * 1000).toISOString()

  // 1. Fetch last 90 days of signals
  const { data: signals, error: signalsError } = await supabase
    .from('autopilot_signals')
    .select('id, signal, time_to_respond_ms, rubber_stamp, created_at')
    .eq('user_id', userId)
    .eq('action_type', actionType)
    .gte('created_at', ninetyDaysAgo)
    .order('created_at', { ascending: false })

  if (signalsError) {
    console.error('[autopilot/confidence] recalculateUserConfidence signals fetch error:', signalsError)
    return null
  }

  const rows: SignalRow[] = (signals ?? []) as SignalRow[]

  // 2. Calculate metrics
  const metrics = buildConfidenceScore(rows)

  // 3. Fetch existing row to preserve tier/cooldown fields
  const { data: existing, error: existingError } = await supabase
    .from('autopilot_confidence')
    .select('current_tier, cooldown_until, never_promote, extra_required_signals')
    .eq('user_id', userId)
    .eq('org_id', orgId)
    .eq('action_type', actionType)
    .maybeSingle()

  if (existingError) {
    console.error('[autopilot/confidence] recalculateUserConfidence existing row fetch error:', existingError)
    // Continue — we can still upsert with defaults
  }

  // 4. Determine promotion eligibility
  const promotion_eligible = metrics.score > 0.7 && metrics.total_signals >= 10

  // 5. Merge with preserved fields from existing row
  const upsertRow: ConfidenceScore = {
    user_id: userId,
    org_id: orgId,
    action_type: actionType,
    ...metrics,
    current_tier: existing?.current_tier ?? 'suggest',
    promotion_eligible,
    cooldown_until: existing?.cooldown_until ?? null,
    never_promote: existing?.never_promote ?? false,
    extra_required_signals: existing?.extra_required_signals ?? 0,
  }

  const { error: upsertError } = await supabase
    .from('autopilot_confidence')
    .upsert(upsertRow, { onConflict: 'user_id,action_type' })

  if (upsertError) {
    console.error('[autopilot/confidence] recalculateUserConfidence upsert error:', upsertError)
    return null
  }

  return upsertRow
}

/**
 * Syncs the autonomy profile for a user into the `rep_memory` table.
 *
 * Reads all `autopilot_confidence` rows for the user and writes two summary
 * maps back to `rep_memory`:
 * - `approval_stats`:  `{ [action_type]: { level, confidence } }`
 * - `autonomy_profile`: `{ [action_type]: { level, score } }`
 *
 * This function is **fire-and-forget safe** — all errors are caught and logged;
 * nothing is re-thrown. If the `rep_memory` table does not exist (PostgREST
 * error code `42P01`) a warning is logged and the function returns silently.
 *
 * NOTE: This function is intentionally NOT called by `recalculateUserConfidence`.
 * The caller (edge function) decides when to invoke it.
 *
 * @param supabase - Supabase client (service role recommended)
 * @param userId   - UUID of the user
 * @param orgId    - UUID of the organisation
 */
export async function updateRepMemory(
  supabase: SupabaseClient,
  userId: string,
  orgId: string,
): Promise<void> {
  try {
    // 1. Fetch all confidence rows for this user
    const { data: rows, error: fetchError } = await supabase
      .from('autopilot_confidence')
      .select('action_type, current_tier, score')
      .eq('user_id', userId)
      .eq('org_id', orgId)

    if (fetchError) {
      console.error('[autopilot/confidence] updateRepMemory fetch error:', fetchError)
      return
    }

    const confidenceRows = rows ?? []

    // 2. Build maps
    const approval_stats: Record<string, { level: string; confidence: number }> = {}
    const autonomy_profile: Record<string, { level: string; score: number }> = {}

    for (const row of confidenceRows) {
      approval_stats[row.action_type] = {
        level: row.current_tier,
        confidence: row.score,
      }
      autonomy_profile[row.action_type] = {
        level: row.current_tier,
        score: row.score,
      }
    }

    // 3. Upsert to rep_memory
    const { error: upsertError } = await supabase
      .from('rep_memory')
      .upsert(
        {
          user_id: userId,
          org_id: orgId,
          approval_stats,
          autonomy_profile,
          updated_at: new Date().toISOString(),
        },
        { onConflict: 'user_id,org_id' },
      )

    if (upsertError) {
      // If the table doesn't exist, log a warning and return silently
      if (
        upsertError.code === '42P01' ||
        upsertError.message?.includes('42P01') ||
        upsertError.message?.toLowerCase().includes('does not exist')
      ) {
        console.warn('[autopilot/confidence] updateRepMemory: rep_memory table does not exist yet — skipping')
        return
      }
      console.error('[autopilot/confidence] updateRepMemory upsert error:', upsertError)
    }
  } catch (err) {
    console.error('[autopilot/confidence] updateRepMemory unexpected error:', err)
  }
}
