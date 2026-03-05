/**
 * pipelineInsightsService.ts — PIP-006
 *
 * Service layer wrapping the calculate_pipeline_math and get_weighted_pipeline RPCs,
 * plus direct queries for stage bottleneck and velocity anomaly analysis.
 */

import { supabase } from '@/lib/supabase/clientV2';

// =============================================================================
// Types
// =============================================================================

export interface PipelineMathResult {
  stage_id: string;
  stage_name: string;
  stage_order: number;
  deal_count: number;
  total_value: number;
  weighted_value: number;
  avg_days_in_stage: number;
  conversion_rate: number;
  avg_deal_size: number;
}

export interface WeightedPipelineResult {
  stage_id: string;
  stage_name: string;
  probability: number;
  deal_count: number;
  total_value: number;
  weighted_value: number;
}

export interface StageBottleneck {
  stage_id: string;
  stage_name: string;
  avg_days: number;
  threshold_days: number;
  lingering_count: number;
  total_count: number;
  lingering_deals: Array<{ id: string; name: string; days_in_stage: number; value: number | null }>;
}

export interface VelocityAnomaly {
  deal_id: string;
  deal_name: string;
  company: string | null;
  stage_name: string;
  days_in_stage: number;
  expected_days: number;
  sigma_deviation: number;
  value: number | null;
}

export interface PipelineSnapshot {
  snapshot_date: string;
  weighted_pipeline_value: number | null;
  closed_this_period: number | null;
  total_pipeline_value: number | null;
  deals_at_risk: number | null;
  target: number | null;
  coverage_ratio: number | null;
}

export interface EngagementCorrelation {
  stage_id: string;
  stage_name: string;
  avg_activities_moved: number;
  avg_activities_stalled: number;
  avg_meetings_moved: number;
  avg_meetings_stalled: number;
  sample_size: number;
}

// =============================================================================
// RPC Wrappers
// =============================================================================

export async function getPipelineMath(
  orgId: string,
  userId: string,
  period: 'month' | 'quarter' = 'month'
): Promise<PipelineMathResult[]> {
  const { data, error } = await supabase.rpc('calculate_pipeline_math', {
    p_org_id: orgId,
    p_user_id: userId,
    p_period: period,
  });
  if (error) throw error;
  return (data as PipelineMathResult[]) ?? [];
}

export async function getWeightedPipeline(
  userId: string,
  orgId: string
): Promise<WeightedPipelineResult[]> {
  const { data, error } = await supabase.rpc('get_weighted_pipeline', {
    p_user_id: userId,
    p_org_id: orgId,
  });
  if (error) throw error;
  return (data as WeightedPipelineResult[]) ?? [];
}

// =============================================================================
// Stage Bottleneck Analysis
// =============================================================================

/**
 * Identifies stages where deals are lingering > 1.5x the average time for that stage.
 */
export async function getStageBottlenecks(orgId: string): Promise<StageBottleneck[]> {
  // Pull all open deals with stage info and time in stage
  const { data: deals, error } = await supabase
    .from('deals')
    .select(`
      id,
      name,
      value,
      stage_id,
      stage_changed_at,
      deal_stages(name, stage_order)
    `)
    .eq('clerk_org_id', orgId)
    .eq('status', 'open')
    .not('stage_id', 'is', null)
    .not('stage_changed_at', 'is', null);

  if (error) throw error;
  if (!deals || deals.length === 0) return [];

  const now = Date.now();

  // Compute days in stage per deal
  const dealsWithDays = deals.map((d: any) => ({
    id: d.id,
    name: d.name,
    value: d.value,
    stage_id: d.stage_id,
    stage_name: d.deal_stages?.name ?? 'Unknown',
    stage_order: d.deal_stages?.stage_order ?? 0,
    days_in_stage: Math.floor((now - new Date(d.stage_changed_at).getTime()) / 86_400_000),
  }));

  // Group by stage and compute averages
  const byStage: Record<string, typeof dealsWithDays> = {};
  for (const d of dealsWithDays) {
    if (!byStage[d.stage_id]) byStage[d.stage_id] = [];
    byStage[d.stage_id].push(d);
  }

  const bottlenecks: StageBottleneck[] = [];
  for (const [stageId, stageDeals] of Object.entries(byStage)) {
    if (stageDeals.length < 2) continue; // Need at least 2 deals for meaningful stats

    const avgDays = stageDeals.reduce((s, d) => s + d.days_in_stage, 0) / stageDeals.length;
    const threshold = avgDays * 1.5;

    const lingering = stageDeals
      .filter((d) => d.days_in_stage > threshold)
      .sort((a, b) => b.days_in_stage - a.days_in_stage)
      .slice(0, 5); // Top 5 worst offenders

    if (lingering.length > 0) {
      bottlenecks.push({
        stage_id: stageId,
        stage_name: stageDeals[0].stage_name,
        avg_days: Math.round(avgDays),
        threshold_days: Math.round(threshold),
        lingering_count: lingering.length,
        total_count: stageDeals.length,
        lingering_deals: lingering.map((d) => ({
          id: d.id,
          name: d.name,
          days_in_stage: d.days_in_stage,
          value: d.value,
        })),
      });
    }
  }

  return bottlenecks.sort((a, b) => b.lingering_count - a.lingering_count);
}

// =============================================================================
// Velocity Anomaly Detection (2-sigma)
// =============================================================================

/**
 * Finds deals that are 2+ standard deviations above normal time in their stage.
 */
export async function getVelocityAnomalies(orgId: string): Promise<VelocityAnomaly[]> {
  const { data: deals, error } = await supabase
    .from('deals')
    .select(`
      id,
      name,
      company,
      value,
      stage_id,
      stage_changed_at,
      deal_stages(name)
    `)
    .eq('clerk_org_id', orgId)
    .eq('status', 'open')
    .not('stage_id', 'is', null)
    .not('stage_changed_at', 'is', null);

  if (error) throw error;
  if (!deals || deals.length === 0) return [];

  const now = Date.now();

  const dealsWithDays = deals.map((d: any) => ({
    id: d.id,
    name: d.name,
    company: d.company,
    value: d.value,
    stage_id: d.stage_id,
    stage_name: d.deal_stages?.name ?? 'Unknown',
    days_in_stage: Math.floor((now - new Date(d.stage_changed_at).getTime()) / 86_400_000),
  }));

  // Group by stage, compute mean + stddev
  const byStage: Record<string, typeof dealsWithDays> = {};
  for (const d of dealsWithDays) {
    if (!byStage[d.stage_id]) byStage[d.stage_id] = [];
    byStage[d.stage_id].push(d);
  }

  const anomalies: VelocityAnomaly[] = [];

  for (const stageDeals of Object.values(byStage)) {
    if (stageDeals.length < 3) continue; // Need enough data for sigma

    const mean = stageDeals.reduce((s, d) => s + d.days_in_stage, 0) / stageDeals.length;
    const variance = stageDeals.reduce((s, d) => s + Math.pow(d.days_in_stage - mean, 2), 0) / stageDeals.length;
    const stddev = Math.sqrt(variance);

    if (stddev < 1) continue; // No meaningful variation

    for (const deal of stageDeals) {
      const sigma = (deal.days_in_stage - mean) / stddev;
      if (sigma >= 2) {
        anomalies.push({
          deal_id: deal.id,
          deal_name: deal.name,
          company: deal.company,
          stage_name: deal.stage_name,
          days_in_stage: deal.days_in_stage,
          expected_days: Math.round(mean),
          sigma_deviation: Math.round(sigma * 10) / 10,
          value: deal.value,
        });
      }
    }
  }

  return anomalies.sort((a, b) => b.sigma_deviation - a.sigma_deviation);
}

// =============================================================================
// Pipeline Health Snapshots
// =============================================================================

export async function getPipelineHealthSnapshots(
  orgId: string,
  weeks = 8
): Promise<PipelineSnapshot[]> {
  const cutoff = new Date();
  cutoff.setDate(cutoff.getDate() - weeks * 7);

  const { data, error } = await supabase
    .from('pipeline_snapshots')
    .select('snapshot_date, weighted_pipeline_value, closed_this_period, total_pipeline_value, deals_at_risk, target, coverage_ratio')
    .eq('org_id', orgId)
    .gte('snapshot_date', cutoff.toISOString().slice(0, 10))
    .order('snapshot_date', { ascending: true });

  if (error) throw error;
  return (data as PipelineSnapshot[]) ?? [];
}

// =============================================================================
// Engagement Correlation
// =============================================================================

/**
 * Correlates activity count with stage advancement vs stalled deals.
 */
export async function getEngagementCorrelation(orgId: string): Promise<EngagementCorrelation[]> {
  // Get closed-won deals from last 90 days (moved forward) vs open stalled deals
  const cutoff = new Date();
  cutoff.setDate(cutoff.getDate() - 90);

  const { data: closedDeals, error: err1 } = await supabase
    .from('deals')
    .select('id, stage_id, deal_stages(name, stage_order)')
    .eq('clerk_org_id', orgId)
    .eq('status', 'closed_won')
    .gte('updated_at', cutoff.toISOString());

  const { data: stalledDeals, error: err2 } = await supabase
    .from('deals')
    .select('id, stage_id, stage_changed_at, deal_stages(name, stage_order)')
    .eq('clerk_org_id', orgId)
    .eq('status', 'open')
    .not('stage_changed_at', 'is', null);

  if (err1 || err2) throw err1 ?? err2;
  if (!closedDeals && !stalledDeals) return [];

  const allDealIds = [
    ...(closedDeals ?? []).map((d: any) => d.id),
    ...(stalledDeals ?? []).map((d: any) => d.id),
  ];

  if (allDealIds.length === 0) return [];

  // Count activities per deal
  const { data: activities, error: err3 } = await supabase
    .from('activities')
    .select('deal_id, activity_type')
    .in('deal_id', allDealIds)
    .gte('created_at', cutoff.toISOString());

  if (err3) throw err3;

  const activityCountByDeal: Record<string, number> = {};
  const meetingCountByDeal: Record<string, number> = {};
  for (const act of activities ?? []) {
    if (!act.deal_id) continue;
    activityCountByDeal[act.deal_id] = (activityCountByDeal[act.deal_id] ?? 0) + 1;
    if (act.activity_type === 'meeting' || act.activity_type === 'call') {
      meetingCountByDeal[act.deal_id] = (meetingCountByDeal[act.deal_id] ?? 0) + 1;
    }
  }

  // Group by stage and compute averages for moved vs stalled
  const stageMap: Record<string, { name: string; movedActivities: number[]; movedMeetings: number[]; stalledActivities: number[]; stalledMeetings: number[] }> = {};

  for (const deal of (closedDeals ?? []) as any[]) {
    const stageId = deal.stage_id;
    if (!stageId) continue;
    if (!stageMap[stageId]) stageMap[stageId] = { name: deal.deal_stages?.name ?? 'Unknown', movedActivities: [], movedMeetings: [], stalledActivities: [], stalledMeetings: [] };
    stageMap[stageId].movedActivities.push(activityCountByDeal[deal.id] ?? 0);
    stageMap[stageId].movedMeetings.push(meetingCountByDeal[deal.id] ?? 0);
  }

  const now = Date.now();
  for (const deal of (stalledDeals ?? []) as any[]) {
    const stageId = deal.stage_id;
    if (!stageId) continue;
    const daysStalled = deal.stage_changed_at
      ? Math.floor((now - new Date(deal.stage_changed_at).getTime()) / 86_400_000)
      : 0;
    if (daysStalled < 14) continue; // Only include deals stalled 2+ weeks

    if (!stageMap[stageId]) stageMap[stageId] = { name: deal.deal_stages?.name ?? 'Unknown', movedActivities: [], movedMeetings: [], stalledActivities: [], stalledMeetings: [] };
    stageMap[stageId].stalledActivities.push(activityCountByDeal[deal.id] ?? 0);
    stageMap[stageId].stalledMeetings.push(meetingCountByDeal[deal.id] ?? 0);
  }

  const avg = (arr: number[]) => arr.length ? arr.reduce((s, n) => s + n, 0) / arr.length : 0;

  return Object.entries(stageMap)
    .filter(([, s]) => s.movedActivities.length + s.stalledActivities.length >= 3)
    .map(([stageId, s]) => ({
      stage_id: stageId,
      stage_name: s.name,
      avg_activities_moved: Math.round(avg(s.movedActivities) * 10) / 10,
      avg_activities_stalled: Math.round(avg(s.stalledActivities) * 10) / 10,
      avg_meetings_moved: Math.round(avg(s.movedMeetings) * 10) / 10,
      avg_meetings_stalled: Math.round(avg(s.stalledMeetings) * 10) / 10,
      sample_size: s.movedActivities.length + s.stalledActivities.length,
    }))
    .sort((a, b) => b.sample_size - a.sample_size);
}
