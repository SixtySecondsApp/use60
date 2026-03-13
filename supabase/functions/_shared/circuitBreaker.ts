/**
 * Circuit Breaker for Cron Jobs (US-023)
 *
 * Tracks consecutive failures per cron job name. When failures reach the
 * threshold (default 5), the job is "tripped" — callers should skip execution
 * until the cooldown expires. Cooldown uses exponential backoff (60 -> 240 -> 1440 min cap).
 *
 * Usage in an edge function:
 *   if (await isCircuitOpen(supabase, 'my-cron-job')) {
 *     return jsonResponse({ skipped: true, reason: 'circuit_open' }, req);
 *   }
 *   try {
 *     // ... do work
 *     await recordSuccess(supabase, 'my-cron-job');
 *   } catch (err) {
 *     await recordFailure(supabase, 'my-cron-job');
 *   }
 */

import { SupabaseClient } from 'https://esm.sh/@supabase/supabase-js@2.43.4';

/** Number of consecutive failures before tripping the breaker */
const FAILURE_THRESHOLD = 5;

/** Initial cooldown in minutes after tripping */
const INITIAL_COOLDOWN_MINUTES = 60;

/** Maximum cooldown cap in minutes (24 hours) */
const MAX_COOLDOWN_MINUTES = 1440;

// ---------------------------------------------------------------------------
// isCircuitOpen
// ---------------------------------------------------------------------------

/**
 * Check whether the circuit breaker is currently open (tripped) for a job.
 *
 * Returns `true` if the job should be SKIPPED (disabled_until > now).
 * Returns `false` if the job is allowed to run.
 *
 * On any error, returns `false` (fail-open: better to run than silently skip).
 */
export async function isCircuitOpen(
  supabase: SupabaseClient,
  jobName: string
): Promise<boolean> {
  try {
    const { data, error } = await supabase
      .from('cron_circuit_breaker')
      .select('disabled_until')
      .eq('job_name', jobName)
      .maybeSingle();

    if (error) {
      console.error('[circuitBreaker] isCircuitOpen query error, failing open:', error.message);
      return false;
    }

    if (!data || !data.disabled_until) {
      return false;
    }

    const disabledUntil = new Date(data.disabled_until);
    const now = new Date();

    if (disabledUntil > now) {
      console.log(`[circuitBreaker] Circuit OPEN for ${jobName} — disabled until ${data.disabled_until}`);
      return true;
    }

    return false;
  } catch (err) {
    console.error('[circuitBreaker] isCircuitOpen unexpected error, failing open:', String(err));
    return false;
  }
}

// ---------------------------------------------------------------------------
// recordSuccess
// ---------------------------------------------------------------------------

/**
 * Record a successful job execution. Resets consecutive_failures to 0 and
 * clears disabled_until. If the job was previously tripped, logs a recovery.
 */
export async function recordSuccess(
  supabase: SupabaseClient,
  jobName: string
): Promise<void> {
  try {
    // Fetch current state to detect recovery
    const { data: current } = await supabase
      .from('cron_circuit_breaker')
      .select('consecutive_failures, disabled_until')
      .eq('job_name', jobName)
      .maybeSingle();

    const wasTripped = current && current.disabled_until && new Date(current.disabled_until) > new Date();
    const hadFailures = current && current.consecutive_failures > 0;

    const now = new Date().toISOString();

    const { error } = await supabase
      .from('cron_circuit_breaker')
      .upsert({
        job_name: jobName,
        consecutive_failures: 0,
        last_success_at: now,
        disabled_until: null,
        cooldown_minutes: INITIAL_COOLDOWN_MINUTES,
        updated_at: now,
      }, {
        onConflict: 'job_name',
      });

    if (error) {
      console.error('[circuitBreaker] recordSuccess upsert error:', error.message);
      return;
    }

    if (wasTripped || hadFailures) {
      console.log(
        `[circuitBreaker] RECOVERED: ${jobName} — reset from ${current?.consecutive_failures ?? 0} failures`
      );
    }
  } catch (err) {
    console.error('[circuitBreaker] recordSuccess unexpected error:', String(err));
  }
}

// ---------------------------------------------------------------------------
// recordFailure
// ---------------------------------------------------------------------------

/**
 * Record a failed job execution. Increments consecutive_failures. If the
 * threshold is reached, sets disabled_until with exponential backoff.
 *
 * Exponential backoff: cooldown doubles each time the breaker re-trips after a
 * recovery attempt fails, capped at MAX_COOLDOWN_MINUTES (24h).
 */
export async function recordFailure(
  supabase: SupabaseClient,
  jobName: string
): Promise<void> {
  try {
    // Fetch current state
    const { data: current } = await supabase
      .from('cron_circuit_breaker')
      .select('consecutive_failures, cooldown_minutes, disabled_until')
      .eq('job_name', jobName)
      .maybeSingle();

    const prevFailures = current?.consecutive_failures ?? 0;
    const newFailures = prevFailures + 1;
    const prevCooldown = current?.cooldown_minutes ?? INITIAL_COOLDOWN_MINUTES;

    const now = new Date();
    const nowISO = now.toISOString();

    // Determine if we need to trip the breaker
    let disabledUntil: string | null = current?.disabled_until ?? null;
    let cooldownMinutes = prevCooldown;

    if (newFailures >= FAILURE_THRESHOLD) {
      // If already disabled, apply exponential backoff on the cooldown
      if (disabledUntil && new Date(disabledUntil) > now) {
        // Still within cooldown — just increment, don't extend further
      } else {
        // Trip the breaker (fresh trip or re-trip after cooldown expired)
        // Double cooldown if this is a re-trip (prevCooldown > INITIAL_COOLDOWN_MINUTES means it was doubled before)
        if (prevFailures >= FAILURE_THRESHOLD) {
          // Re-trip: recovery attempt failed, double the cooldown
          cooldownMinutes = Math.min(prevCooldown * 2, MAX_COOLDOWN_MINUTES);
        } else {
          // First trip
          cooldownMinutes = prevCooldown;
        }
        disabledUntil = new Date(now.getTime() + cooldownMinutes * 60 * 1000).toISOString();

        console.warn(
          `[circuitBreaker] TRIPPED: ${jobName} — ${newFailures} consecutive failures, ` +
          `disabled for ${cooldownMinutes} min until ${disabledUntil}`
        );
      }
    }

    const { error } = await supabase
      .from('cron_circuit_breaker')
      .upsert({
        job_name: jobName,
        consecutive_failures: newFailures,
        last_failure_at: nowISO,
        disabled_until: disabledUntil,
        cooldown_minutes: cooldownMinutes,
        updated_at: nowISO,
      }, {
        onConflict: 'job_name',
      });

    if (error) {
      console.error('[circuitBreaker] recordFailure upsert error:', error.message);
    }
  } catch (err) {
    console.error('[circuitBreaker] recordFailure unexpected error:', String(err));
  }
}
