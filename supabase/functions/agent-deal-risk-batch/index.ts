/**
 * Agent Deal Risk Batch Edge Function
 *
 * Daily batch scoring of all deals needing risk assessment.
 * Called by fleet orchestrator cron route (cron.deal_risk_scan).
 * Can also be called directly for a specific org or deal.
 *
 * Story: RSK-004
 */

import { serve } from 'https://deno.land/std@0.168.0/http/server.ts';
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2.43.4';
import {
  handleCorsPreflightRequest,
  jsonResponse,
  errorResponse,
} from '../_shared/corsHelper.ts';
import { isServiceRoleAuth } from '../_shared/edgeAuth.ts';
import {
  loadRiskScorerConfig,
  getEffectiveAlertThreshold,
  isQuietHours,
} from '../_shared/orchestrator/riskScorerConfig.ts';
import type { RiskScorerConfig } from '../_shared/orchestrator/riskScorerConfig.ts';
import { isCircuitAllowed, recordSuccess, recordFailure } from '../_shared/orchestrator/circuitBreaker.ts';

const SUPABASE_URL = Deno.env.get('SUPABASE_URL')!;
const SUPABASE_SERVICE_ROLE_KEY = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;

// Signal-to-dimension classification (must match RSK-003)
const ENGAGEMENT_SIGNALS = ['stalled_deal'];
const CHAMPION_SIGNALS = ['champion_silent', 'stakeholder_concern'];
const MOMENTUM_SIGNALS = ['timeline_slip', 'decision_delay', 'scope_creep'];
const SENTIMENT_SIGNALS = ['budget_concern', 'competitor_mention', 'sentiment_decline', 'objection_unresolved'];

interface BatchResult {
  scored_deals: number;
  alerts_flagged: number;
  errors: string[];
  skipped: number;
}

serve(async (req) => {
  const preflight = handleCorsPreflightRequest(req);
  if (preflight) return preflight;

  if (req.method !== 'POST') {
    return errorResponse('Method not allowed', req, 405);
  }

  // Auth: service role only (called by orchestrator or cron)
  const authHeader = req.headers.get('Authorization');
  if (!isServiceRoleAuth(authHeader, SUPABASE_SERVICE_ROLE_KEY)) {
    return errorResponse('Unauthorized — service role required', req, 401);
  }

  const supabase = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY, {
    auth: { persistSession: false, autoRefreshToken: false },
  });

  try {
    const body = await req.json();
    const orgId = body.org_id;
    const dealId = body.deal_id; // Optional: re-score a single deal
    const staleHours = body.stale_hours ?? 24;
    const limit = body.limit ?? 50;

    if (!orgId) {
      return errorResponse('Missing required field: org_id', req, 400);
    }

    // Circuit breaker check
    if (!isCircuitAllowed('deal-risk-batch')) {
      console.warn('[agent-deal-risk-batch] Circuit breaker OPEN, skipping batch');
      return jsonResponse({ scored_deals: 0, alerts_flagged: 0, errors: ['circuit_breaker_open'], skipped: 0 }, req);
    }

    // Load org config
    let config: RiskScorerConfig;
    try {
      config = await loadRiskScorerConfig(supabase, orgId);
    } catch {
      config = {
        weights: { engagement: 0.25, champion: 0.25, momentum: 0.25, sentiment: 0.25 },
        thresholds: { alert_high: 61, alert_critical: 81 },
        signal_weights: {},
        stage_time_baselines: {},
        alert_settings: { delivery_channel: 'slack_dm', include_evidence: true, include_playbook: true },
        user_overrides: null,
      };
    }

    const result: BatchResult = { scored_deals: 0, alerts_flagged: 0, errors: [], skipped: 0 };

    // Get deals to score
    let dealsToScore: Array<{ deal_id: string; deal_name: string; deal_stage: string; last_scanned_at: string | null }>;

    if (dealId) {
      // Single deal re-score
      const { data: deal } = await supabase
        .from('deals')
        .select('id, name, stage')
        .eq('id', dealId)
        .maybeSingle();

      if (!deal) {
        return errorResponse('Deal not found', req, 404);
      }
      dealsToScore = [{ deal_id: deal.id, deal_name: deal.name, deal_stage: deal.stage, last_scanned_at: null }];
    } else {
      // Batch: get stale deals
      const { data, error } = await supabase.rpc('get_deals_needing_risk_scan', {
        p_org_id: orgId,
        p_stale_hours: staleHours,
        p_limit: limit,
      });

      if (error) {
        console.error('[agent-deal-risk-batch] get_deals_needing_risk_scan error:', error);
        recordFailure('deal-risk-batch');
        return errorResponse(error.message, req, 500);
      }

      dealsToScore = data ?? [];
    }

    console.log(`[agent-deal-risk-batch] Scoring ${dealsToScore.length} deals for org ${orgId}`);

    // Score each deal
    for (const deal of dealsToScore) {
      try {
        const score = await scoreDeal(supabase, deal.deal_id, orgId, config);

        // Upsert to deal_risk_scores
        await supabase.rpc('upsert_deal_risk_score', {
          p_org_id: orgId,
          p_deal_id: deal.deal_id,
          p_score: score.riskScore,
          p_signals: score.signals,
          p_score_breakdown: score.scoreBreakdown,
        });

        result.scored_deals++;

        // Check if alert should be flagged
        const alertThreshold = getEffectiveAlertThreshold(config);
        if (score.riskScore >= alertThreshold) {
          // Check 24-hour suppression
          const { data: existing } = await supabase
            .from('deal_risk_scores')
            .select('alert_sent_at')
            .eq('deal_id', deal.deal_id)
            .maybeSingle();

          const lastAlertAt = existing?.alert_sent_at;
          const hoursSinceAlert = lastAlertAt
            ? (Date.now() - new Date(lastAlertAt).getTime()) / (1000 * 60 * 60)
            : Infinity;

          if (hoursSinceAlert >= 24) {
            result.alerts_flagged++;
          }
        }
      } catch (err) {
        const errMsg = `Deal ${deal.deal_id}: ${(err as Error).message}`;
        console.error('[agent-deal-risk-batch]', errMsg);
        result.errors.push(errMsg);
      }
    }

    recordSuccess('deal-risk-batch');
    console.log(`[agent-deal-risk-batch] Complete: ${result.scored_deals} scored, ${result.alerts_flagged} flagged, ${result.errors.length} errors`);

    return jsonResponse(result, req);

  } catch (error) {
    console.error('[agent-deal-risk-batch] Error:', error);
    recordFailure('deal-risk-batch');
    return errorResponse((error as Error).message, req, 500);
  }
});

// =============================================================================
// Core Scoring Logic
// =============================================================================

interface DealScore {
  riskScore: number;
  scoreBreakdown: { engagement: number; champion: number; momentum: number; sentiment: number };
  signals: Array<{ type: string; weight: number; description: string }>;
  overallLevel: string;
}

async function scoreDeal(
  supabase: ReturnType<typeof createClient>,
  dealId: string,
  orgId: string,
  config: RiskScorerConfig,
): Promise<DealScore> {
  // Get active signals
  const { data: signals } = await supabase
    .from('deal_risk_signals')
    .select('id, signal_type, severity, title, description')
    .eq('deal_id', dealId)
    .eq('is_resolved', false)
    .eq('auto_dismissed', false);

  const activeSignals = signals || [];

  const severityPoints = (severity: string): number => {
    switch (severity) {
      case 'critical': return 40;
      case 'high': return 25;
      case 'medium': return 15;
      case 'low': return 5;
      default: return 0;
    }
  };

  const dimensionScore = (signalTypes: string[]): number => {
    const dimSignals = activeSignals.filter(s => signalTypes.includes(s.signal_type));
    return Math.min(100, dimSignals.reduce((sum, s) => sum + severityPoints(s.severity), 0));
  };

  const engagement = dimensionScore(ENGAGEMENT_SIGNALS);
  const champion = dimensionScore(CHAMPION_SIGNALS);
  const momentum = dimensionScore(MOMENTUM_SIGNALS);
  const sentiment = dimensionScore(SENTIMENT_SIGNALS);

  const w = config.weights;
  const riskScore = Math.min(100, Math.round(
    engagement * w.engagement +
    champion * w.champion +
    momentum * w.momentum +
    sentiment * w.sentiment,
  ));

  const criticalCount = activeSignals.filter(s => s.severity === 'critical').length;
  const highCount = activeSignals.filter(s => s.severity === 'high').length;

  let overallLevel: string;
  if (criticalCount > 0 || riskScore >= 80) overallLevel = 'critical';
  else if (highCount >= 2 || riskScore >= 50) overallLevel = 'high';
  else if (highCount >= 1 || riskScore >= 25) overallLevel = 'medium';
  else overallLevel = 'low';

  return {
    riskScore,
    scoreBreakdown: { engagement, champion, momentum, sentiment },
    signals: activeSignals.map(s => ({
      type: s.signal_type,
      weight: severityPoints(s.severity),
      description: s.title || s.description || s.signal_type,
    })),
    overallLevel,
  };
}
