/**
 * agent-pipeline-patterns (KNW-010)
 *
 * Weekly cross-deal pattern analysis that detects bottlenecks, velocity anomalies,
 * win/loss factors, and engagement correlations across the entire pipeline.
 * Generates actionable coaching insights using AI summarisation.
 *
 * Runs: weekly cron (Monday 6am UTC) or on-demand per org.
 *
 * Auth: accepts CRON_SECRET or service-role Bearer token.
 * Deploy: npx supabase functions deploy agent-pipeline-patterns --project-ref <ref> --no-verify-jwt
 */

import { serve } from 'https://deno.land/std@0.168.0/http/server.ts';
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2.43.4';
import { verifyCronSecret, isServiceRoleAuth } from '../_shared/edgeAuth.ts';
import {
  handleCorsPreflightRequest,
  errorResponse,
  jsonResponse,
} from '../_shared/corsHelper.ts';

// =============================================================================
// Config
// =============================================================================

const SUPABASE_URL = Deno.env.get('SUPABASE_URL')!;
const SUPABASE_SERVICE_ROLE_KEY = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;
const ANTHROPIC_API_KEY = Deno.env.get('ANTHROPIC_API_KEY') || '';
const MIN_DEALS_FOR_PATTERN = 5;
const BOTTLENECK_MULTIPLIER = 1.5; // 1.5x average = bottleneck
const VELOCITY_ANOMALY_MULTIPLIER = 2.0; // 2x deviation = anomaly

// =============================================================================
// Types
// =============================================================================

interface PatternPayload {
  org_id: string;
}

interface DetectedPattern {
  pattern_type: string;
  title: string;
  description: string;
  confidence: number;
  severity: 'info' | 'warning' | 'critical';
  supporting_evidence: Record<string, unknown>;
  affected_deal_ids: string[];
  actionable_deals: Array<{ deal_id: string; name: string; recommended_action: string }>;
}

interface BatchResult {
  orgs_processed: number;
  total_patterns: number;
  results: Array<{ org_id: string; patterns_detected: number; error?: string }>;
}

// =============================================================================
// Main handler
// =============================================================================

serve(async (req) => {
  const preflightResponse = handleCorsPreflightRequest(req);
  if (preflightResponse) return preflightResponse;

  if (req.method !== 'POST') {
    return errorResponse('Method not allowed', req, 405);
  }

  try {
    const cronSecret = Deno.env.get('CRON_SECRET');
    const authHeader = req.headers.get('Authorization');

    if (
      !verifyCronSecret(req, cronSecret) &&
      !isServiceRoleAuth(authHeader, SUPABASE_SERVICE_ROLE_KEY)
    ) {
      return errorResponse('Unauthorized', req, 401);
    }

    const supabase = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY, {
      auth: { persistSession: false, autoRefreshToken: false },
    });

    const body: PatternPayload = await req.json().catch(() => ({ org_id: '' }));

    if (body.org_id) {
      // Single org mode
      const patterns = await analyseOrg(supabase, body.org_id);
      return jsonResponse({ org_id: body.org_id, patterns_detected: patterns.length, patterns }, req);
    }

    // Batch mode: all orgs
    console.log('[agent-pipeline-patterns] Starting batch analysis...');
    const result = await batchAnalyse(supabase);
    console.log(`[agent-pipeline-patterns] Complete: ${result.total_patterns} patterns across ${result.orgs_processed} orgs`);
    return jsonResponse(result, req);

  } catch (error) {
    console.error('[agent-pipeline-patterns] Fatal error:', error);
    return errorResponse((error as Error).message, req, 500);
  }
});

// =============================================================================
// Batch: process all orgs
// =============================================================================

async function batchAnalyse(supabase: ReturnType<typeof createClient>): Promise<BatchResult> {
  const { data: orgs } = await supabase
    .from('organization_memberships')
    .select('org_id')
    .limit(500);

  const orgIds = [...new Set((orgs || []).map(o => o.org_id))];
  const result: BatchResult = { orgs_processed: 0, total_patterns: 0, results: [] };

  for (const orgId of orgIds) {
    try {
      const patterns = await analyseOrg(supabase, orgId);
      result.orgs_processed++;
      result.total_patterns += patterns.length;
      result.results.push({ org_id: orgId, patterns_detected: patterns.length });
    } catch (err) {
      result.orgs_processed++;
      result.results.push({ org_id: orgId, patterns_detected: 0, error: String(err) });
    }
  }

  return result;
}

// =============================================================================
// Core: analyse a single org
// =============================================================================

async function analyseOrg(
  supabase: ReturnType<typeof createClient>,
  orgId: string
): Promise<DetectedPattern[]> {
  console.log(`[agent-pipeline-patterns] Analysing org ${orgId}`);

  // Expire stale patterns first
  try { await supabase.rpc('expire_stale_pipeline_patterns'); } catch { /* ignore */ }

  // Load deals from last 90 days (active + recently closed)
  const cutoff = new Date(Date.now() - 90 * 24 * 60 * 60 * 1000).toISOString();

  const { data: deals } = await supabase
    .from('deals')
    .select('id, name, stage, value, status, created_at, updated_at, owner_id, expected_close_date, primary_contact_id')
    .eq('org_id', orgId)
    .gte('updated_at', cutoff)
    .limit(200);

  if (!deals || deals.length < MIN_DEALS_FOR_PATTERN) {
    console.log(`[agent-pipeline-patterns] Org ${orgId}: <${MIN_DEALS_FOR_PATTERN} deals, skipping`);
    return [];
  }

  // Load deal health scores
  const dealIds = deals.map(d => d.id);
  const { data: healthScores } = await supabase
    .from('deal_health_scores')
    .select('deal_id, overall_health_score, days_in_current_stage, meeting_count_last_30_days, activity_count_last_30_days, days_since_last_activity, health_status')
    .in('deal_id', dealIds);

  const healthMap = new Map((healthScores || []).map(h => [h.deal_id, h]));

  // Run all pattern detectors
  const allPatterns: DetectedPattern[] = [];

  const stageBottlenecks = detectStageBottlenecks(deals, healthMap);
  allPatterns.push(...stageBottlenecks);

  const velocityAnomalies = detectVelocityAnomalies(deals, healthMap);
  allPatterns.push(...velocityAnomalies);

  const engagementPatterns = detectEngagementCorrelation(deals, healthMap);
  allPatterns.push(...engagementPatterns);

  // Generate AI insights for each pattern
  for (const pattern of allPatterns) {
    if (ANTHROPIC_API_KEY && !pattern.description) {
      const insight = await generateInsight(pattern);
      if (insight) pattern.description = insight;
    }
  }

  // Mark previous active patterns of same types as expired
  const patternTypes = [...new Set(allPatterns.map(p => p.pattern_type))];
  if (patternTypes.length > 0) {
    await supabase
      .from('pipeline_patterns')
      .update({ status: 'expired', updated_at: new Date().toISOString() })
      .eq('org_id', orgId)
      .eq('status', 'active')
      .in('pattern_type', patternTypes);
  }

  // Insert new patterns
  for (const pattern of allPatterns) {
    await supabase
      .from('pipeline_patterns')
      .insert({
        org_id: orgId,
        pattern_type: pattern.pattern_type,
        title: pattern.title,
        description: pattern.description,
        confidence: pattern.confidence,
        severity: pattern.severity,
        supporting_evidence: pattern.supporting_evidence,
        affected_deal_ids: pattern.affected_deal_ids,
        actionable_deals: pattern.actionable_deals,
      });
  }

  console.log(`[agent-pipeline-patterns] Org ${orgId}: ${allPatterns.length} patterns detected`);
  return allPatterns;
}

// =============================================================================
// Pattern: Stage Bottleneck
// =============================================================================

function detectStageBottlenecks(
  deals: Array<Record<string, unknown>>,
  healthMap: Map<string, Record<string, unknown>>
): DetectedPattern[] {
  const patterns: DetectedPattern[] = [];

  // Group active deals by stage
  const activeDeals = deals.filter(d => d.status !== 'closed_won' && d.status !== 'closed_lost');
  const stageGroups = new Map<string, typeof activeDeals>();

  for (const deal of activeDeals) {
    const stage = (deal.stage as string) || 'unknown';
    if (!stageGroups.has(stage)) stageGroups.set(stage, []);
    stageGroups.get(stage)!.push(deal);
  }

  // Calculate average days per stage across all deals
  const stageDaysAll = new Map<string, number[]>();
  for (const deal of activeDeals) {
    const health = healthMap.get(deal.id as string);
    if (!health?.days_in_current_stage) continue;
    const stage = (deal.stage as string) || 'unknown';
    if (!stageDaysAll.has(stage)) stageDaysAll.set(stage, []);
    stageDaysAll.get(stage)!.push(health.days_in_current_stage as number);
  }

  for (const [stage, daysArr] of stageDaysAll) {
    if (daysArr.length < MIN_DEALS_FOR_PATTERN) continue;

    const avg = daysArr.reduce((s, d) => s + d, 0) / daysArr.length;
    const threshold = avg * BOTTLENECK_MULTIPLIER;

    // Find deals stuck beyond threshold
    const stuckDeals = (stageGroups.get(stage) || []).filter(d => {
      const health = healthMap.get(d.id as string);
      return health && (health.days_in_current_stage as number) > threshold;
    });

    if (stuckDeals.length < 2) continue;

    const confidence = Math.min(0.95, 0.5 + (stuckDeals.length / daysArr.length) * 0.5);
    const severity = stuckDeals.length >= 4 ? 'critical' : stuckDeals.length >= 2 ? 'warning' : 'info';

    patterns.push({
      pattern_type: 'stage_bottleneck',
      title: `${stuckDeals.length} deals stuck in ${stage}`,
      description: `${stuckDeals.length} deals have been in ${stage} for ${Math.round(threshold)}+ days (org average: ${Math.round(avg)} days). This stage may need attention.`,
      confidence,
      severity,
      supporting_evidence: {
        stage,
        avg_days: Math.round(avg),
        threshold_days: Math.round(threshold),
        stuck_count: stuckDeals.length,
        total_at_stage: stageGroups.get(stage)?.length || 0,
        deals: stuckDeals.slice(0, 5).map(d => ({
          deal_id: d.id,
          name: d.name,
          days: (healthMap.get(d.id as string)?.days_in_current_stage as number) || 0,
          value: d.value,
        })),
      },
      affected_deal_ids: stuckDeals.map(d => d.id as string),
      actionable_deals: stuckDeals.slice(0, 5).map(d => ({
        deal_id: d.id as string,
        name: (d.name as string) || 'Unknown',
        recommended_action: `${Math.round((healthMap.get(d.id as string)?.days_in_current_stage as number) || 0)} days in ${stage} — schedule next step or re-qualify`,
      })),
    });
  }

  return patterns;
}

// =============================================================================
// Pattern: Velocity Anomaly
// =============================================================================

function detectVelocityAnomalies(
  deals: Array<Record<string, unknown>>,
  healthMap: Map<string, Record<string, unknown>>
): DetectedPattern[] {
  const patterns: DetectedPattern[] = [];
  const activeDeals = deals.filter(d => d.status !== 'closed_won' && d.status !== 'closed_lost');

  if (activeDeals.length < MIN_DEALS_FOR_PATTERN) return patterns;

  // Calculate overall velocity stats
  const daysActive: number[] = [];
  for (const deal of activeDeals) {
    const created = new Date(deal.created_at as string).getTime();
    const days = (Date.now() - created) / (1000 * 60 * 60 * 24);
    daysActive.push(days);
  }

  const avgDays = daysActive.reduce((s, d) => s + d, 0) / daysActive.length;
  const stdDev = Math.sqrt(daysActive.reduce((s, d) => s + (d - avgDays) ** 2, 0) / daysActive.length);

  // Find slow-moving deals (> 2x stdDev above mean)
  const slowThreshold = avgDays + stdDev * VELOCITY_ANOMALY_MULTIPLIER;
  const slowDeals = activeDeals.filter(d => {
    const created = new Date(d.created_at as string).getTime();
    const days = (Date.now() - created) / (1000 * 60 * 60 * 24);
    return days > slowThreshold;
  });

  if (slowDeals.length >= 2) {
    patterns.push({
      pattern_type: 'velocity_anomaly',
      title: `${slowDeals.length} deals moving significantly slower than average`,
      description: `These deals have been open ${Math.round(slowThreshold)}+ days vs org average of ${Math.round(avgDays)} days. Consider whether they should be accelerated or disqualified.`,
      confidence: Math.min(0.9, 0.5 + (slowDeals.length / activeDeals.length) * 0.4),
      severity: slowDeals.length >= 5 ? 'critical' : 'warning',
      supporting_evidence: {
        avg_days_active: Math.round(avgDays),
        std_dev: Math.round(stdDev),
        slow_threshold: Math.round(slowThreshold),
        slow_count: slowDeals.length,
      },
      affected_deal_ids: slowDeals.map(d => d.id as string),
      actionable_deals: slowDeals.slice(0, 5).map(d => {
        const days = Math.round((Date.now() - new Date(d.created_at as string).getTime()) / (1000 * 60 * 60 * 24));
        return {
          deal_id: d.id as string,
          name: (d.name as string) || 'Unknown',
          recommended_action: `Open ${days} days — review for acceleration or disqualification`,
        };
      }),
    });
  }

  return patterns;
}

// =============================================================================
// Pattern: Engagement Correlation
// =============================================================================

function detectEngagementCorrelation(
  deals: Array<Record<string, unknown>>,
  healthMap: Map<string, Record<string, unknown>>
): DetectedPattern[] {
  const patterns: DetectedPattern[] = [];

  // Compare meeting/activity counts between progressing and stalling deals
  const progressing: Array<Record<string, unknown>> = [];
  const stalling: Array<Record<string, unknown>> = [];

  for (const deal of deals) {
    const health = healthMap.get(deal.id as string);
    if (!health) continue;

    const status = health.health_status as string;
    if (status === 'healthy') progressing.push(deal);
    else if (status === 'critical' || status === 'stalled') stalling.push(deal);
  }

  if (progressing.length < 3 || stalling.length < 3) return patterns;

  const avgMeetingsProgressing = progressing.reduce((s, d) => {
    const h = healthMap.get(d.id as string);
    return s + ((h?.meeting_count_last_30_days as number) || 0);
  }, 0) / progressing.length;

  const avgMeetingsStalling = stalling.reduce((s, d) => {
    const h = healthMap.get(d.id as string);
    return s + ((h?.meeting_count_last_30_days as number) || 0);
  }, 0) / stalling.length;

  // If progressing deals have 2x+ meetings vs stalling, that's a pattern
  if (avgMeetingsProgressing > 0 && avgMeetingsStalling >= 0 &&
      avgMeetingsProgressing >= avgMeetingsStalling * 2) {

    const lowEngagementDeals = stalling.filter(d => {
      const h = healthMap.get(d.id as string);
      return ((h?.meeting_count_last_30_days as number) || 0) < avgMeetingsProgressing * 0.5;
    });

    if (lowEngagementDeals.length >= 2) {
      patterns.push({
        pattern_type: 'engagement_correlation',
        title: `Low meeting frequency correlates with stalling deals`,
        description: `Progressing deals average ${avgMeetingsProgressing.toFixed(1)} meetings/30d vs ${avgMeetingsStalling.toFixed(1)} for stalling deals. ${lowEngagementDeals.length} deals may need more engagement.`,
        confidence: Math.min(0.85, 0.5 + (avgMeetingsProgressing / Math.max(1, avgMeetingsStalling)) * 0.1),
        severity: lowEngagementDeals.length >= 4 ? 'warning' : 'info',
        supporting_evidence: {
          avg_meetings_progressing: Math.round(avgMeetingsProgressing * 10) / 10,
          avg_meetings_stalling: Math.round(avgMeetingsStalling * 10) / 10,
          progressing_count: progressing.length,
          stalling_count: stalling.length,
        },
        affected_deal_ids: lowEngagementDeals.map(d => d.id as string),
        actionable_deals: lowEngagementDeals.slice(0, 5).map(d => {
          const h = healthMap.get(d.id as string);
          return {
            deal_id: d.id as string,
            name: (d.name as string) || 'Unknown',
            recommended_action: `Only ${(h?.meeting_count_last_30_days as number) || 0} meetings in 30d — schedule touchpoint`,
          };
        }),
      });
    }
  }

  return patterns;
}

// =============================================================================
// AI: Generate human-readable insight for a pattern
// =============================================================================

async function generateInsight(pattern: DetectedPattern): Promise<string | null> {
  if (!ANTHROPIC_API_KEY) return null;

  try {
    const resp = await fetch('https://api.anthropic.com/v1/messages', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'x-api-key': ANTHROPIC_API_KEY,
        'anthropic-version': '2023-06-01',
      },
      body: JSON.stringify({
        model: 'claude-haiku-4-5-20251001',
        max_tokens: 200,
        messages: [{
          role: 'user',
          content: `Summarise this pipeline pattern into a 1-2 sentence actionable coaching insight for a sales rep.

Pattern type: ${pattern.pattern_type}
Title: ${pattern.title}
Evidence: ${JSON.stringify(pattern.supporting_evidence)}
Affected deals: ${pattern.actionable_deals.map(d => d.name).join(', ')}

Write as a direct, specific insight. Reference deal names and numbers. Example: "Your deals that progress past Discovery within 10 days close at 3x the rate. Acme Corp and TechFlow are approaching day 15 — schedule next steps this week."

Return ONLY the insight text, no other formatting.`,
        }],
      }),
    });

    if (!resp.ok) return null;
    const data = await resp.json();
    return data?.content?.[0]?.text?.trim() || null;
  } catch {
    return null;
  }
}
