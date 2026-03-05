/**
 * warmth-recalculate — RG-003
 *
 * Recalculates warmth scores for one or all contacts in an org.
 *
 * POST body:
 *   { contact_id?: string, org_id: string, mode: 'single' | 'batch' }
 *
 * Returns:
 *   { processed: number, updated: number }
 *
 * Deploy with --no-verify-jwt (staging ES256 JWT issue).
 */

import { serve } from 'https://deno.land/std@0.168.0/http/server.ts';
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2.43.4';
import {
  getCorsHeaders,
  handleCorsPreflightRequest,
  errorResponse,
  jsonResponse,
} from '../_shared/corsHelper.ts';
import {
  computeWarmth,
  type WarmthSignal,
} from '../_shared/warmth/scoring.ts';

// ============================================================================
// Config
// ============================================================================

const SUPABASE_URL             = Deno.env.get('SUPABASE_URL')!;
const SUPABASE_SERVICE_ROLE_KEY = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;

// How far back to fetch signals (days)
const SIGNAL_WINDOW_DAYS = 90;

// ============================================================================
// Types
// ============================================================================

interface RequestBody {
  contact_id?: string;
  org_id: string;           // UUID — org_id for warmth_scores/signals tables
  mode: 'single' | 'batch';
}

interface ContactRow {
  id: string;
  owner_id: string;
}

interface WarmthScoreRow {
  warmth_score: number;
}

interface SignalRow {
  signal_type: string;
  signal_weight: number;
  occurred_at: string;
  metadata: Record<string, unknown>;
}

// ============================================================================
// Entry point
// ============================================================================

serve(async (req: Request) => {
  const preflight = handleCorsPreflightRequest(req);
  if (preflight) return preflight;

  if (req.method !== 'POST') {
    return errorResponse('Method not allowed', req, 405);
  }

  let body: RequestBody;
  try {
    body = await req.json();
  } catch {
    return errorResponse('Invalid JSON body', req, 400);
  }

  const { contact_id, org_id, mode } = body;

  if (!org_id) {
    return errorResponse('org_id is required', req, 400);
  }
  if (!mode || (mode !== 'single' && mode !== 'batch')) {
    return errorResponse('mode must be "single" or "batch"', req, 400);
  }
  if (mode === 'single' && !contact_id) {
    return errorResponse('contact_id is required for single mode', req, 400);
  }

  const supabase = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY, {
    auth: { persistSession: false, autoRefreshToken: false },
  });

  try {
    // ---- Resolve contacts to process --------------------------------------
    let contacts: ContactRow[];

    if (mode === 'single') {
      const { data, error } = await supabase
        .from('contacts')
        .select('id, owner_id')
        .eq('id', contact_id!)
        .maybeSingle();

      if (error) {
        console.error('[warmth-recalculate] contact lookup error:', error.message);
        return errorResponse('Failed to fetch contact', req, 500);
      }
      if (!data) {
        return errorResponse('Contact not found', req, 404);
      }
      contacts = [data as ContactRow];
    } else {
      // Batch: all contacts whose warmth_signals exist in this org_id (uuid)
      // We use the warmth_signals org_id to stay in the org boundary.
      // We also pull contacts directly scoped by org membership via warmth_scores.
      const { data, error } = await supabase
        .from('contact_warmth_signals')
        .select('contact_id')
        .eq('org_id', org_id)
        .gte('occurred_at', new Date(Date.now() - SIGNAL_WINDOW_DAYS * 24 * 60 * 60 * 1000).toISOString());

      if (error) {
        console.error('[warmth-recalculate] batch contact lookup error:', error.message);
        return errorResponse('Failed to fetch contacts for batch', req, 500);
      }

      // Deduplicate contact_ids
      const uniqueIds = [...new Set((data ?? []).map((r: { contact_id: string }) => r.contact_id))];

      if (uniqueIds.length === 0) {
        return jsonResponse({ processed: 0, updated: 0 }, req);
      }

      // Fetch contact rows (need owner_id for warmth_scores user_id column)
      const { data: contactRows, error: contactErr } = await supabase
        .from('contacts')
        .select('id, owner_id')
        .in('id', uniqueIds);

      if (contactErr) {
        console.error('[warmth-recalculate] contact rows error:', contactErr.message);
        return errorResponse('Failed to fetch contact details', req, 500);
      }

      contacts = (contactRows ?? []) as ContactRow[];
    }

    // ---- Process each contact --------------------------------------------
    let processed = 0;
    let updated = 0;
    const cutoff = new Date(Date.now() - SIGNAL_WINDOW_DAYS * 24 * 60 * 60 * 1000).toISOString();

    for (const contact of contacts) {
      processed++;

      // Fetch signals for this contact in the last 90 days
      const { data: signalRows, error: signalErr } = await supabase
        .from('contact_warmth_signals')
        .select('signal_type, signal_weight, occurred_at, metadata')
        .eq('contact_id', contact.id)
        .eq('org_id', org_id)
        .gte('occurred_at', cutoff)
        .order('occurred_at', { ascending: false });

      if (signalErr) {
        console.warn('[warmth-recalculate] signal fetch error for', contact.id, signalErr.message);
        continue;
      }

      const signals: WarmthSignal[] = (signalRows ?? []) as SignalRow[];

      // Fetch current warmth score (to compute delta / trending direction)
      const { data: currentScoreRow } = await supabase
        .from('contact_warmth_scores')
        .select('warmth_score')
        .eq('contact_id', contact.id)
        .eq('org_id', org_id)
        .maybeSingle();

      const previousScore = (currentScoreRow as WarmthScoreRow | null)?.warmth_score ?? 0;

      // Compute new warmth
      const result = computeWarmth(signals, previousScore);

      // Count signals in last 30 days
      const thirtyDaysAgo = new Date(Date.now() - 30 * 24 * 60 * 60 * 1000).toISOString();
      const signal_count_30d = signals.filter(s => s.occurred_at >= thirtyDaysAgo).length;

      // Most recent signal
      const mostRecentSignal = signals.length > 0 ? signals[0] : null;

      // UPSERT into contact_warmth_scores
      const { error: upsertErr } = await supabase
        .from('contact_warmth_scores')
        .upsert(
          {
            contact_id:             contact.id,
            org_id,
            user_id:                contact.owner_id,
            warmth_score:           result.warmth_score,
            warmth_score_previous:  previousScore,
            warmth_delta:           Math.round((result.warmth_score - previousScore) * 1000) / 1000,
            tier:                   result.tier,
            recency_score:          result.recency_score,
            engagement_score:       result.engagement_score,
            deal_momentum_score:    result.deal_momentum_score,
            multi_thread_score:     result.multi_thread_score,
            sentiment_score:        result.sentiment_score,
            trending_direction:     result.trending_direction,
            last_interaction_at:    mostRecentSignal?.occurred_at ?? null,
            last_interaction_type:  mostRecentSignal?.signal_type ?? null,
            signal_count_30d,
            calculated_at:          new Date().toISOString(),
          },
          { onConflict: 'contact_id,org_id' }
        );

      if (upsertErr) {
        console.error('[warmth-recalculate] upsert error for', contact.id, upsertErr.message);
        continue;
      }

      updated++;
    }

    return jsonResponse({ processed, updated }, req);
  } catch (err) {
    console.error('[warmth-recalculate] unexpected error:', err instanceof Error ? err.message : String(err));
    return errorResponse(
      err instanceof Error ? err.message : 'Internal server error',
      req,
      500,
    );
  }
});
