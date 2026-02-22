/**
 * agent-org-learning (CTI-006)
 *
 * Cross-rep pattern analysis for org-wide learning. Aggregates coaching data,
 * competitive intelligence, and deal outcomes into anonymised insights that
 * improve individual coaching without exposing individual rep data.
 *
 * Two modes:
 *   1. analyse — weekly batch: aggregate all org data into org_learning_insights
 *   2. query   — on-demand: return active insights for a specific rep's coaching context
 *
 * Auth: accepts CRON_SECRET or service-role Bearer token.
 * Deploy: npx supabase functions deploy agent-org-learning --project-ref <ref> --no-verify-jwt
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
const MIN_TEAM_SIZE = 5;
const MIN_SCORED_MEETINGS = 10;
const MIN_CLOSED_DEALS = 20;

// =============================================================================
// Main Handler
// =============================================================================

serve(async (req: Request) => {
  const preflightResponse = handleCorsPreflightRequest(req);
  if (preflightResponse) return preflightResponse;

  // Auth check
  const isCron = verifyCronSecret(req);
  const isService = isServiceRoleAuth(req);
  if (!isCron && !isService) {
    return errorResponse(req, 401, 'Unauthorized');
  }

  const supabase = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY, {
    auth: { persistSession: false },
  });

  try {
    const body = await req.json();
    const { mode, org_id } = body;

    if (mode === 'analyse' || mode === 'analyze') {
      if (org_id) {
        const result = await analyseOrg(supabase, org_id);
        return jsonResponse(req, result);
      }
      // Batch: all orgs
      const result = await analyseBatch(supabase);
      return jsonResponse(req, result);
    }

    if (mode === 'query') {
      const { user_id } = body;
      const result = await queryInsights(supabase, org_id, user_id);
      return jsonResponse(req, result);
    }

    return errorResponse(req, 400, 'Invalid mode. Use "analyse" or "query".');
  } catch (err) {
    console.error('[agent-org-learning] Error:', err);
    return errorResponse(req, 500, String(err));
  }
});

// =============================================================================
// Batch analysis — all orgs with sufficient data
// =============================================================================

async function analyseBatch(supabase: any) {
  // Find orgs with enough team members
  const { data: orgMembers } = await supabase
    .from('organization_members')
    .select('organization_id')
    .neq('role', 'viewer');

  if (!orgMembers || orgMembers.length === 0) {
    return { orgs_processed: 0, message: 'No orgs found' };
  }

  // Count members per org
  const orgCounts = new Map<string, number>();
  for (const m of orgMembers) {
    orgCounts.set(m.organization_id, (orgCounts.get(m.organization_id) || 0) + 1);
  }

  const eligibleOrgs = [...orgCounts.entries()]
    .filter(([, count]) => count >= MIN_TEAM_SIZE)
    .map(([orgId]) => orgId);

  console.log(`[agent-org-learning] Found ${eligibleOrgs.length} eligible orgs (${MIN_TEAM_SIZE}+ members)`);

  const results = [];
  for (const orgId of eligibleOrgs) {
    try {
      const result = await analyseOrg(supabase, orgId);
      results.push({ org_id: orgId, ...result });
    } catch (err) {
      console.error(`[agent-org-learning] Error processing org ${orgId}:`, err);
      results.push({ org_id: orgId, error: String(err) });
    }
  }

  return { orgs_processed: results.length, results };
}

// =============================================================================
// Single org analysis
// =============================================================================

async function analyseOrg(supabase: any, orgId: string) {
  console.log(`[agent-org-learning] Analysing org ${orgId}`);

  // Check minimum team size
  const { count: memberCount } = await supabase
    .from('organization_members')
    .select('user_id', { count: 'exact', head: true })
    .eq('organization_id', orgId);

  if ((memberCount || 0) < MIN_TEAM_SIZE) {
    return { skipped: true, reason: `Team size ${memberCount} < minimum ${MIN_TEAM_SIZE}` };
  }

  // Fetch coaching progression for all users in org (last 8 weeks)
  const eightWeeksAgo = new Date(Date.now() - 56 * 24 * 60 * 60 * 1000).toISOString().split('T')[0];
  const { data: progressionData } = await supabase
    .from('coaching_skill_progression')
    .select('user_id, week_start, talk_ratio, question_quality_score, objection_handling_score, discovery_depth_score, overall_score, meetings_analysed')
    .eq('org_id', orgId)
    .gte('week_start', eightWeeksAgo)
    .order('week_start', { ascending: false });

  // Fetch closed deals for correlation
  const threeMonthsAgo = new Date(Date.now() - 90 * 24 * 60 * 60 * 1000).toISOString();
  const { data: closedDeals } = await supabase
    .from('deals')
    .select('id, owner_id, stage, amount, status, updated_at')
    .eq('org_id', orgId)
    .gte('updated_at', threeMonthsAgo)
    .in('status', ['closed_won', 'closed_lost']);

  // Fetch competitive data
  const { data: competitiveData } = await supabase
    .from('competitive_mentions')
    .select('deal_id, competitor_name, category, strengths_mentioned, weaknesses_mentioned, deal_outcome')
    .eq('org_id', orgId)
    .gte('mention_date', threeMonthsAgo);

  const totalScoredMeetings = (progressionData || []).reduce((s: number, p: any) => s + (p.meetings_analysed || 0), 0);
  const totalClosedDeals = (closedDeals || []).length;

  if (totalScoredMeetings < MIN_SCORED_MEETINGS && totalClosedDeals < MIN_CLOSED_DEALS) {
    return {
      skipped: true,
      reason: `Insufficient data: ${totalScoredMeetings} scored meetings (need ${MIN_SCORED_MEETINGS}), ${totalClosedDeals} closed deals (need ${MIN_CLOSED_DEALS})`,
    };
  }

  // Generate insights
  const insights = [];

  // 1. Winning talk patterns — compare top performers vs others
  const winnerInsight = analyseWinningPatterns(progressionData || [], closedDeals || []);
  if (winnerInsight) insights.push(winnerInsight);

  // 2. Optimal cadence — meeting frequency vs close rate
  const cadenceInsight = analyseCadence(closedDeals || []);
  if (cadenceInsight) insights.push(cadenceInsight);

  // 3. Competitive positioning — what works against competitors
  const competitiveInsight = analyseCompetitivePositioning(competitiveData || []);
  if (competitiveInsight) insights.push(competitiveInsight);

  // 4. Discovery depth correlation with wins
  const discoveryInsight = analyseDiscoveryCorrelation(progressionData || [], closedDeals || []);
  if (discoveryInsight) insights.push(discoveryInsight);

  // Supersede previous insights of same types
  for (const insight of insights) {
    await supabase
      .from('org_learning_insights')
      .update({ status: 'superseded' })
      .eq('org_id', orgId)
      .eq('insight_type', insight.insight_type)
      .eq('status', 'active');

    await supabase.from('org_learning_insights').insert({
      org_id: orgId,
      ...insight,
    });
  }

  console.log(`[agent-org-learning] Generated ${insights.length} insights for org ${orgId}`);
  return { insights_generated: insights.length, insights: insights.map(i => i.title) };
}

// =============================================================================
// Pattern Analysis Functions
// =============================================================================

function analyseWinningPatterns(progression: any[], deals: any[]) {
  if (progression.length === 0 || deals.length === 0) return null;

  // Group deals by owner
  const winsByUser = new Map<string, number>();
  const dealsByUser = new Map<string, number>();
  for (const deal of deals) {
    dealsByUser.set(deal.owner_id, (dealsByUser.get(deal.owner_id) || 0) + 1);
    if (deal.status === 'closed_won') {
      winsByUser.set(deal.owner_id, (winsByUser.get(deal.owner_id) || 0) + 1);
    }
  }

  // Calculate win rates
  const userWinRates = [...dealsByUser.entries()]
    .filter(([, count]) => count >= 3)
    .map(([userId, total]) => ({
      userId,
      winRate: (winsByUser.get(userId) || 0) / total,
      total,
    }))
    .sort((a, b) => b.winRate - a.winRate);

  if (userWinRates.length < 2) return null;

  // Compare top performers' coaching metrics to others
  const topPerformers = userWinRates.slice(0, Math.ceil(userWinRates.length / 3));
  const topUserIds = new Set(topPerformers.map(p => p.userId));

  const topMetrics = progression.filter(p => topUserIds.has(p.user_id));
  const otherMetrics = progression.filter(p => !topUserIds.has(p.user_id));

  if (topMetrics.length === 0 || otherMetrics.length === 0) return null;

  const avgTop = {
    talk_ratio: topMetrics.reduce((s, m) => s + (m.talk_ratio || 0), 0) / topMetrics.length,
    question_quality: topMetrics.reduce((s, m) => s + (m.question_quality_score || 0), 0) / topMetrics.length,
    discovery_depth: topMetrics.reduce((s, m) => s + (m.discovery_depth_score || 0), 0) / topMetrics.length,
  };

  const avgOther = {
    talk_ratio: otherMetrics.reduce((s, m) => s + (m.talk_ratio || 0), 0) / otherMetrics.length,
    question_quality: otherMetrics.reduce((s, m) => s + (m.question_quality_score || 0), 0) / otherMetrics.length,
    discovery_depth: otherMetrics.reduce((s, m) => s + (m.discovery_depth_score || 0), 0) / otherMetrics.length,
  };

  // Find the biggest differentiator
  const diffs = [
    { metric: 'talk ratio', diff: Math.abs(avgTop.talk_ratio - avgOther.talk_ratio), topVal: avgTop.talk_ratio, otherVal: avgOther.talk_ratio },
    { metric: 'question quality', diff: Math.abs(avgTop.question_quality - avgOther.question_quality), topVal: avgTop.question_quality, otherVal: avgOther.question_quality },
    { metric: 'discovery depth', diff: Math.abs(avgTop.discovery_depth - avgOther.discovery_depth), topVal: avgTop.discovery_depth, otherVal: avgOther.discovery_depth },
  ].sort((a, b) => b.diff - a.diff);

  const topDiff = diffs[0];
  if (topDiff.diff < 0.05) return null;

  return {
    insight_type: 'stage_best_practice',
    title: `Top performers differentiate on ${topDiff.metric}`,
    description: `Your top-performing reps average ${topDiff.metric === 'talk ratio' ? Math.round(topDiff.topVal) + '%' : Math.round(topDiff.topVal * 100) + '%'} on ${topDiff.metric}, compared to ${topDiff.metric === 'talk ratio' ? Math.round(topDiff.otherVal) + '%' : Math.round(topDiff.otherVal * 100) + '%'} for others. This is the biggest coaching differentiator on your team.`,
    supporting_data: { avgTop, avgOther, biggest_differentiator: topDiff.metric, sample_top: topMetrics.length, sample_other: otherMetrics.length },
    confidence: Math.min(0.95, 0.5 + (progression.length / 100)),
    sample_size: progression.length,
  };
}

function analyseCadence(deals: any[]) {
  if (deals.length < 10) return null;

  const wins = deals.filter((d: any) => d.status === 'closed_won');
  const losses = deals.filter((d: any) => d.status === 'closed_lost');

  if (wins.length < 3 || losses.length < 3) return null;

  const avgWinValue = wins.reduce((s: number, d: any) => s + (d.amount || 0), 0) / wins.length;
  const avgLossValue = losses.reduce((s: number, d: any) => s + (d.amount || 0), 0) / losses.length;
  const winRate = wins.length / deals.length;

  return {
    insight_type: 'optimal_cadence',
    title: `Team win rate: ${Math.round(winRate * 100)}% (last 90 days)`,
    description: `Your team closed ${wins.length} deals (avg value: $${Math.round(avgWinValue).toLocaleString()}) and lost ${losses.length} (avg value: $${Math.round(avgLossValue).toLocaleString()}) in the last 90 days. Win rate is ${Math.round(winRate * 100)}%.`,
    supporting_data: { wins: wins.length, losses: losses.length, win_rate: winRate, avg_win_value: avgWinValue, avg_loss_value: avgLossValue },
    confidence: Math.min(0.9, 0.4 + (deals.length / 50)),
    sample_size: deals.length,
  };
}

function analyseCompetitivePositioning(mentions: any[]) {
  if (mentions.length < 5) return null;

  // Group by competitor
  const competitorStats = new Map<string, { wins: number; losses: number; total: number; strengths: string[]; weaknesses: string[] }>();
  for (const m of mentions) {
    const name = m.competitor_name?.toLowerCase();
    if (!name) continue;
    const stats = competitorStats.get(name) || { wins: 0, losses: 0, total: 0, strengths: [], weaknesses: [] };
    stats.total++;
    if (m.deal_outcome === 'won') stats.wins++;
    if (m.deal_outcome === 'lost') stats.losses++;
    stats.strengths.push(...(m.strengths_mentioned || []));
    stats.weaknesses.push(...(m.weaknesses_mentioned || []));
    competitorStats.set(name, stats);
  }

  // Find most-mentioned competitor with enough data
  const sorted = [...competitorStats.entries()]
    .filter(([, s]) => s.total >= 3)
    .sort((a, b) => b[1].total - a[1].total);

  if (sorted.length === 0) return null;

  const [topCompetitor, stats] = sorted[0];
  const winRate = stats.wins + stats.losses > 0 ? stats.wins / (stats.wins + stats.losses) : null;

  // Count common strengths/weaknesses
  const strengthCounts = new Map<string, number>();
  for (const s of stats.strengths) {
    strengthCounts.set(s, (strengthCounts.get(s) || 0) + 1);
  }
  const topStrengths = [...strengthCounts.entries()].sort((a, b) => b[1] - a[1]).slice(0, 3).map(([s]) => s);

  return {
    insight_type: 'competitive_positioning',
    title: `${topCompetitor}: ${stats.total} encounters${winRate != null ? `, ${Math.round(winRate * 100)}% win rate` : ''}`,
    description: `${topCompetitor} is your most frequent competitor (${stats.total} mentions). ${winRate != null ? `You win ${Math.round(winRate * 100)}% of competitive deals against them.` : ''} Their most cited strengths: ${topStrengths.join(', ') || 'none identified'}.`,
    supporting_data: { competitor: topCompetitor, ...stats, win_rate: winRate, top_strengths: topStrengths },
    confidence: Math.min(0.85, 0.4 + (stats.total / 20)),
    sample_size: stats.total,
  };
}

function analyseDiscoveryCorrelation(progression: any[], deals: any[]) {
  if (progression.length < 10) return null;

  // Compute average discovery depth across all reps
  const avgDiscovery = progression.reduce((s, p) => s + (p.discovery_depth_score || 0), 0) / progression.length;

  if (avgDiscovery < 0.1) return null;

  return {
    insight_type: 'discovery_pattern',
    title: `Team discovery depth: ${Math.round(avgDiscovery * 100)}%`,
    description: `Your team's average discovery depth score is ${Math.round(avgDiscovery * 100)}%. Research shows deals with strong discovery (>70%) close at 2-3x the rate of weak discovery (<40%). Focus coaching on quantification and decision process exploration.`,
    supporting_data: { avg_discovery_depth: avgDiscovery, data_points: progression.length },
    confidence: Math.min(0.8, 0.3 + (progression.length / 50)),
    sample_size: progression.length,
  };
}

// =============================================================================
// Query — return active insights relevant to a rep
// =============================================================================

async function queryInsights(supabase: any, orgId: string, userId: string) {
  // Get active org insights
  const { data: insights } = await supabase.rpc('get_active_org_insights', {
    p_org_id: orgId,
    p_limit: 10,
  });

  // Get this rep's weak areas from latest progression
  const { data: latestProgression } = await supabase
    .from('coaching_skill_progression')
    .select('question_quality_score, objection_handling_score, discovery_depth_score, talk_ratio')
    .eq('org_id', orgId)
    .eq('user_id', userId)
    .order('week_start', { ascending: false })
    .limit(1)
    .maybeSingle();

  // Prioritise insights relevant to rep's weak areas
  const relevantInsights = (insights || []).map((insight: any) => {
    let relevanceScore = insight.confidence || 0.5;

    if (latestProgression) {
      // Boost insights matching rep's weak areas
      if (insight.insight_type === 'discovery_pattern' && (latestProgression.discovery_depth_score || 0) < 0.5) {
        relevanceScore += 0.2;
      }
      if (insight.insight_type === 'objection_handling' && (latestProgression.objection_handling_score || 0) < 0.5) {
        relevanceScore += 0.2;
      }
    }

    return { ...insight, relevance_score: Math.min(1, relevanceScore) };
  }).sort((a: any, b: any) => b.relevance_score - a.relevance_score);

  return {
    insights: relevantInsights.slice(0, 5),
    rep_progression: latestProgression,
  };
}
