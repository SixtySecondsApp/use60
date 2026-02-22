/**
 * Pipeline Context Loader — CC10-004
 *
 * Loads pipeline comparison data for a deal: how the deal sits relative to
 * similar deals at the same stage (avg days, win rate, velocity percentile).
 *
 * Data sources:
 *   - deals table  (current deal fields; owner_id NOT user_id)
 *   - deal_stages  (stage metadata, close probability)
 *   - deal_health_scores  (days_in_current_stage)
 *   - pipeline_snapshots  (deals_by_stage JSONB for org-level stage benchmarks)
 *
 * Returns an empty object on any failure — callers must tolerate missing data.
 */

import { createClient } from 'https://esm.sh/@supabase/supabase-js@2.43.4';

// ---------------------------------------------------------------------------
// Return type
// ---------------------------------------------------------------------------

export interface PipelineEnrichment {
  /** Human-readable stage name (e.g. "Discovery") */
  stage_name: string | null;
  /** Deal amount in the native currency stored in deals.value */
  deal_value: number | null;
  /** Stage close probability 0–100 from deal_stages.default_probability */
  stage_win_rate: number | null;
  /** How many days this deal has been in the current stage */
  days_in_current_stage: number | null;
  /** Average days at this stage across all open deals in the org snapshot */
  avg_days_in_stage: number | null;
  /**
   * Percentile 0–100 of this deal's velocity vs org peers at the same stage.
   * Higher = faster than peers (fewer days in stage).
   * NULL when insufficient comparison data.
   */
  velocity_percentile: number | null;
  /** Total number of open deals at the same stage (peer count for context) */
  peer_count_at_stage: number | null;
  /** Total open pipeline value (from latest snapshot) */
  total_pipeline_value: number | null;
  /** Coverage ratio from latest snapshot (weighted pipeline / remaining target) */
  coverage_ratio: number | null;
}

// ---------------------------------------------------------------------------
// Main export
// ---------------------------------------------------------------------------

export async function loadPipelineContext(
  supabase: ReturnType<typeof createClient>,
  dealId?: string | null,
  orgId?: string | null,
  userId?: string | null,
): Promise<PipelineEnrichment> {
  const empty: PipelineEnrichment = {
    stage_name: null,
    deal_value: null,
    stage_win_rate: null,
    days_in_current_stage: null,
    avg_days_in_stage: null,
    velocity_percentile: null,
    peer_count_at_stage: null,
    total_pipeline_value: null,
    coverage_ratio: null,
  };

  if (!dealId) {
    console.log('[cc-loader:pipeline] no dealId — skipping');
    return empty;
  }

  try {
    // ------------------------------------------------------------------
    // 1. Fetch the deal itself + stage info + health score
    // ------------------------------------------------------------------
    const { data: deal, error: dealError } = await supabase
      .from('deals')
      .select(
        'id, value, stage_id, owner_id, org_id',
      )
      .eq('id', dealId)
      .maybeSingle();

    if (dealError) {
      console.error('[cc-loader:pipeline] deal fetch error:', dealError.message);
      return empty;
    }
    if (!deal) {
      console.log('[cc-loader:pipeline] deal not found:', dealId);
      return empty;
    }

    // ------------------------------------------------------------------
    // 2. Fetch stage metadata (name + win rate)
    // ------------------------------------------------------------------
    let stageName: string | null = null;
    let stageWinRate: number | null = null;

    if (deal.stage_id) {
      const { data: stage, error: stageError } = await supabase
        .from('deal_stages')
        .select('name, default_probability')
        .eq('id', deal.stage_id)
        .maybeSingle();

      if (stageError) {
        console.warn('[cc-loader:pipeline] stage fetch error:', stageError.message);
      } else if (stage) {
        stageName = stage.name ?? null;
        stageWinRate = stage.default_probability ?? null;
      }
    }

    // ------------------------------------------------------------------
    // 3. Fetch deal health score for days_in_current_stage
    // ------------------------------------------------------------------
    let daysInCurrentStage: number | null = null;

    const { data: healthScore, error: healthError } = await supabase
      .from('deal_health_scores')
      .select('days_in_current_stage')
      .eq('deal_id', dealId)
      .maybeSingle();

    if (healthError) {
      console.warn('[cc-loader:pipeline] health score fetch error:', healthError.message);
    } else if (healthScore) {
      daysInCurrentStage = healthScore.days_in_current_stage ?? null;
    }

    // ------------------------------------------------------------------
    // 4. Compute avg_days_in_stage + velocity_percentile
    //    by comparing this deal against peer deals at the same stage
    //    using deal_health_scores.days_in_current_stage
    // ------------------------------------------------------------------
    let avgDaysInStage: number | null = null;
    let velocityPercentile: number | null = null;
    let peerCountAtStage: number | null = null;

    if (deal.stage_id) {
      // Get days_in_current_stage for all open deals at the same stage/org
      const resolvedOrgId = orgId ?? deal.org_id;
      const { data: peers, error: peersError } = await supabase
        .from('deals')
        .select('id, deal_health_scores!inner(days_in_current_stage)')
        .eq('stage_id', deal.stage_id)
        .eq('org_id', resolvedOrgId)
        .not('status', 'in', '("won","lost")')
        .neq('id', dealId) // exclude the deal itself from peer set
        .limit(200);

      if (peersError) {
        console.warn('[cc-loader:pipeline] peers fetch error:', peersError.message);
      } else if (peers && peers.length > 0) {
        peerCountAtStage = peers.length;

        const peerDays = peers
          .map((p: { deal_health_scores: { days_in_current_stage: number | null }[] | { days_in_current_stage: number | null } }) => {
            const hs = Array.isArray(p.deal_health_scores)
              ? p.deal_health_scores[0]
              : p.deal_health_scores;
            return hs?.days_in_current_stage ?? null;
          })
          .filter((d): d is number => d !== null);

        if (peerDays.length > 0) {
          avgDaysInStage = Math.round(
            peerDays.reduce((sum, d) => sum + d, 0) / peerDays.length,
          );

          // Velocity percentile: % of peers with MORE days in stage than this deal
          // Higher percentile = faster (fewer days = moving more quickly)
          if (daysInCurrentStage !== null) {
            const slowerPeerCount = peerDays.filter((d) => d > daysInCurrentStage!).length;
            velocityPercentile = Math.round((slowerPeerCount / peerDays.length) * 100);
          }
        }
      }
    }

    // ------------------------------------------------------------------
    // 5. Latest pipeline snapshot (org-level totals)
    // ------------------------------------------------------------------
    let totalPipelineValue: number | null = null;
    let coverageRatio: number | null = null;

    const snapshotUserId = userId ?? deal.owner_id;
    const snapshotOrgId = orgId ?? deal.org_id;

    if (snapshotOrgId && snapshotUserId) {
      const { data: snapshot, error: snapError } = await supabase
        .from('pipeline_snapshots')
        .select('total_pipeline_value, coverage_ratio')
        .eq('org_id', snapshotOrgId)
        .eq('user_id', snapshotUserId)
        .order('snapshot_date', { ascending: false })
        .limit(1)
        .maybeSingle();

      if (snapError) {
        console.warn('[cc-loader:pipeline] snapshot fetch error:', snapError.message);
      } else if (snapshot) {
        totalPipelineValue = snapshot.total_pipeline_value ?? null;
        coverageRatio = snapshot.coverage_ratio ?? null;
      }
    }

    const result: PipelineEnrichment = {
      stage_name: stageName,
      deal_value: deal.value ?? null,
      stage_win_rate: stageWinRate,
      days_in_current_stage: daysInCurrentStage,
      avg_days_in_stage: avgDaysInStage,
      velocity_percentile: velocityPercentile,
      peer_count_at_stage: peerCountAtStage,
      total_pipeline_value: totalPipelineValue,
      coverage_ratio: coverageRatio,
    };

    console.log(
      `[cc-loader:pipeline] deal=${dealId} stage="${stageName}" days=${daysInCurrentStage} avg=${avgDaysInStage} pct=${velocityPercentile} peers=${peerCountAtStage}`,
    );

    return result;
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    console.error('[cc-loader:pipeline] unexpected error:', message);
    return empty;
  }
}
