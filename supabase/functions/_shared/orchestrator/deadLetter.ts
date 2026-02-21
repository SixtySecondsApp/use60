/**
 * Dead Letter Queue — Failed Event Recovery
 *
 * Handles enqueuing failed events and retrying them with exponential backoff.
 *
 * Story: FLT-009
 */

import { SupabaseClient } from 'https://esm.sh/@supabase/supabase-js@2';

// =============================================================================
// Types
// =============================================================================

interface DeadLetterEntry {
  org_id: string;
  user_id: string;
  event_type: string;
  event_payload: Record<string, unknown>;
  source_job_id?: string;
  error_message: string;
  error_step?: string;
  max_retries?: number;
}

interface DeadLetterRow {
  id: string;
  org_id: string;
  user_id: string;
  event_type: string;
  event_payload: Record<string, unknown>;
  source_job_id: string | null;
  error_message: string;
  error_step: string | null;
  retry_count: number;
  max_retries: number;
  status: string;
  next_retry_at: string | null;
  created_at: string;
}

// =============================================================================
// Enqueue
// =============================================================================

/**
 * Write a failed event to the dead-letter queue for later retry.
 * Calculates next_retry_at with exponential backoff: 1min, 4min, 16min, ...
 */
export async function enqueueDeadLetter(
  supabase: SupabaseClient,
  entry: DeadLetterEntry,
): Promise<{ id: string | null; error: string | null }> {
  try {
    const backoffMinutes = 1; // First retry in 1 minute
    const nextRetry = new Date(Date.now() + backoffMinutes * 60 * 1000).toISOString();

    const { data, error } = await supabase
      .from('fleet_dead_letter_queue')
      .insert({
        org_id: entry.org_id,
        user_id: entry.user_id,
        event_type: entry.event_type,
        event_payload: entry.event_payload,
        source_job_id: entry.source_job_id || null,
        error_message: entry.error_message,
        error_step: entry.error_step || null,
        max_retries: entry.max_retries ?? 3,
        status: 'pending',
        next_retry_at: nextRetry,
      })
      .select('id')
      .single();

    if (error) {
      // Table may not exist yet — non-fatal
      if (error.message.includes('relation') || error.message.includes('does not exist')) {
        console.warn('[deadLetter] fleet_dead_letter_queue table not found');
        return { id: null, error: null };
      }
      return { id: null, error: error.message };
    }

    console.log(`[deadLetter] Enqueued dead letter ${data.id} for event ${entry.event_type}`);
    return { id: data.id, error: null };
  } catch (err) {
    console.warn('[deadLetter] Failed to enqueue (non-fatal):', err);
    return { id: null, error: String(err) };
  }
}

// =============================================================================
// Retry
// =============================================================================

/**
 * Poll for dead letters ready to retry and process them.
 * Called from agent-orchestrator's cron handler.
 */
export async function retryDeadLetters(
  supabase: SupabaseClient,
  limit = 10,
): Promise<{ processed: number; succeeded: number; failed: number; abandoned: number }> {
  const stats = { processed: 0, succeeded: 0, failed: 0, abandoned: 0 };

  try {
    // Fetch entries ready for retry
    const { data: entries, error } = await supabase
      .from('fleet_dead_letter_queue')
      .select('id, org_id, user_id, event_type, event_payload, source_job_id, retry_count, max_retries')
      .in('status', ['pending', 'retrying'])
      .lte('next_retry_at', new Date().toISOString())
      .order('next_retry_at', { ascending: true })
      .limit(limit);

    if (error) {
      if (error.message.includes('relation') || error.message.includes('does not exist')) {
        return stats;
      }
      console.error('[deadLetter] Retry poll error:', error);
      return stats;
    }

    if (!entries || entries.length === 0) return stats;

    const supabaseUrl = Deno.env.get('SUPABASE_URL')!;
    const serviceKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;

    for (const entry of entries as DeadLetterRow[]) {
      stats.processed++;

      // Check if max retries exceeded
      if (entry.retry_count >= entry.max_retries) {
        await supabase.from('fleet_dead_letter_queue').update({
          status: 'abandoned',
          resolved_at: new Date().toISOString(),
        }).eq('id', entry.id);
        stats.abandoned++;
        console.log(`[deadLetter] Abandoned ${entry.id} after ${entry.retry_count} retries`);
        continue;
      }

      // Mark as retrying
      await supabase.from('fleet_dead_letter_queue').update({
        status: 'retrying',
        retry_count: entry.retry_count + 1,
      }).eq('id', entry.id);

      try {
        // Re-fire the event through agent-orchestrator
        const response = await fetch(`${supabaseUrl}/functions/v1/agent-orchestrator`, {
          method: 'POST',
          headers: {
            'Authorization': `Bearer ${serviceKey}`,
            'Content-Type': 'application/json',
          },
          body: JSON.stringify({
            type: entry.event_type,
            source: 'orchestrator:dead-letter-retry',
            org_id: entry.org_id,
            user_id: entry.user_id,
            payload: entry.event_payload,
            parent_job_id: entry.source_job_id,
            idempotency_key: `dlq-retry:${entry.id}:${entry.retry_count + 1}`,
          }),
        });

        if (response.ok) {
          await supabase.from('fleet_dead_letter_queue').update({
            status: 'resolved',
            resolved_at: new Date().toISOString(),
          }).eq('id', entry.id);
          stats.succeeded++;
          console.log(`[deadLetter] Retried ${entry.id} successfully`);
        } else {
          // Calculate next retry with exponential backoff: 1min * 4^retry_count
          const backoffMs = Math.min(
            1 * 60 * 1000 * Math.pow(4, entry.retry_count),
            60 * 60 * 1000, // Max 1 hour
          );
          const nextRetry = new Date(Date.now() + backoffMs).toISOString();

          await supabase.from('fleet_dead_letter_queue').update({
            status: 'pending',
            next_retry_at: nextRetry,
            error_message: `Retry ${entry.retry_count + 1} failed: ${response.status}`,
          }).eq('id', entry.id);
          stats.failed++;
        }
      } catch (retryErr) {
        const backoffMs = Math.min(
          1 * 60 * 1000 * Math.pow(4, entry.retry_count),
          60 * 60 * 1000,
        );
        const nextRetry = new Date(Date.now() + backoffMs).toISOString();

        await supabase.from('fleet_dead_letter_queue').update({
          status: 'pending',
          next_retry_at: nextRetry,
          error_message: `Retry ${entry.retry_count + 1} error: ${String(retryErr)}`,
        }).eq('id', entry.id);
        stats.failed++;
      }
    }
  } catch (err) {
    console.error('[deadLetter] Retry loop error:', err);
  }

  return stats;
}
