/**
 * proactive-deal-heartbeat (PST-003)
 *
 * Event-driven deal observation engine. Scans deals for 8 risk categories
 * plus deal improvement suggestions (PST-011), classifies severity, stores
 * observations in deal_observations (with dedup), and routes via existing
 * triage infrastructure.
 *
 * Triggered by:
 *   1. Cron (nightly 2am) — scans all active deals per org
 *   2. Database trigger — deal stage change fires webhook
 *   3. Orchestrator — meeting_ended event calls for specific deal
 *
 * Auth: CRON_SECRET (x-cron-secret header) or service-role Bearer token.
 * Deploy: npx supabase functions deploy proactive-deal-heartbeat --project-ref <ref> --no-verify-jwt
 */

import { serve } from 'https://deno.land/std@0.168.0/http/server.ts';
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2.43.4';
import { verifyCronSecret, isServiceRoleAuth } from '../_shared/edgeAuth.ts';
import {
  handleCorsPreflightRequest,
  getCorsHeaders,
} from '../_shared/corsHelper.ts';
import { triageNotification } from '../_shared/proactive/triageRules.ts';
import { sendSlackDM } from '../_shared/proactive/deliverySlack.ts';
import { writeToCommandCentre } from '../_shared/commandCentre/writeAdapter.ts';
import { detectCrossDealConflicts } from '../_shared/orchestrator/crossDealConflictDetector.ts';
import { generateDealImprovementSuggestions } from '../_shared/orchestrator/dealImprovementSuggestions.ts';

// =============================================================================
// Config
// =============================================================================

const SUPABASE_URL = Deno.env.get('SUPABASE_URL')!;
const SUPABASE_SERVICE_ROLE_KEY = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;
const APP_URL = Deno.env.get('APP_URL') || 'https://app.use60.com';

/** Deals with no activity beyond this many days are flagged */
const STALE_DEAL_DAYS = 7;

/** Follow-ups should happen within this many hours of a meeting */
const FOLLOW_UP_WINDOW_HOURS = 24;

// =============================================================================
// Types
// =============================================================================

type ObservationCategory =
  | 'stale_deal'
  | 'missing_next_step'
  | 'follow_up_gap'
  | 'single_threaded'
  | 'proposal_delay'
  | 'engagement_drop'
  | 'competitor_mention'
  | 'stage_regression'
  | 'improvement_suggestion'
  | 'cross_deal_conflict';

type Severity = 'high' | 'medium' | 'low';

interface Observation {
  deal_id: string;
  user_id: string;
  org_id: string;
  category: ObservationCategory;
  severity: Severity;
  title: string;
  description: string;
  affected_contacts: string[];
  proposed_action: Record<string, unknown> | null;
}

interface DealRow {
  id: string;
  name: string;
  company: string | null;
  value: number | null;
  owner_id: string;
  org_id: string;
  stage_id: string | null;
  expected_close_date: string | null;
  created_at: string;
}

interface RequestBody {
  org_id?: string;
  deal_id?: string;
  user_id?: string;
  trigger_type?: 'cron' | 'stage_change' | 'meeting_ended' | 'manual';
  previous_stage_id?: string;
}

// =============================================================================
// Main Handler
// =============================================================================

serve(async (req) => {
  const corsPreflightResponse = handleCorsPreflightRequest(req);
  if (corsPreflightResponse) return corsPreflightResponse;
  const corsHeaders = getCorsHeaders(req);

  // Auth: cron secret or service role
  const cronSecret = Deno.env.get('CRON_SECRET');
  if (!verifyCronSecret(req, cronSecret) && !isServiceRoleAuth(req)) {
    return new Response(JSON.stringify({ error: 'Unauthorized' }), {
      status: 401,
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });
  }

  const supabase = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY, {
    auth: { persistSession: false, autoRefreshToken: false },
  });

  try {
    const body: RequestBody = req.method === 'POST' ? await req.json() : {};
    const triggerType = body.trigger_type || 'manual';

    let orgIds: string[] = [];
    let dealFilter: string | undefined;

    if (body.deal_id) {
      // Single-deal mode (stage change trigger or orchestrator call)
      dealFilter = body.deal_id;
      if (body.org_id) orgIds = [body.org_id];
    } else if (body.org_id) {
      // Single-org mode
      orgIds = [body.org_id];
    } else {
      // Cron mode: scan all orgs with active deals
      const { data: orgs } = await supabase
        .from('organization_memberships')
        .select('org_id')
        .limit(500);
      orgIds = [...new Set((orgs || []).map((o: { org_id: string }) => o.org_id))];
    }

    let totalObservations = 0;
    let totalDealsScanned = 0;
    const errors: string[] = [];

    for (const orgId of orgIds) {
      try {
        const result = await scanOrgDeals(supabase, orgId, dealFilter, body.previous_stage_id);
        totalObservations += result.observationsCreated;
        totalDealsScanned += result.dealsScanned;
        if (result.errors.length) errors.push(...result.errors);

        // Cross-deal conflict detection runs at org level, not per-deal.
        // Skip when scanning a single deal (stage_change / meeting_ended triggers).
        if (!dealFilter) {
          try {
            const conflictResult = await detectCrossDealConflicts(supabase, orgId);
            totalObservations += conflictResult.observationsCreated;
            if (conflictResult.errors.length) errors.push(...conflictResult.errors);
          } catch (conflictErr) {
            errors.push(`org ${orgId} cross-deal-conflict: ${(conflictErr as Error).message}`);
          }
        }
      } catch (err) {
        errors.push(`org ${orgId}: ${(err as Error).message}`);
      }
    }

    return new Response(
      JSON.stringify({
        success: true,
        trigger_type: triggerType,
        orgs_scanned: orgIds.length,
        deals_scanned: totalDealsScanned,
        observations_created: totalObservations,
        errors,
      }),
      {
        status: 200,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      }
    );
  } catch (err) {
    console.error('[proactive-deal-heartbeat] Fatal:', err);
    return new Response(
      JSON.stringify({ error: (err as Error).message }),
      {
        status: 500,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      }
    );
  }
});

// =============================================================================
// Core Scanner
// =============================================================================

async function scanOrgDeals(
  supabase: ReturnType<typeof createClient>,
  orgId: string,
  dealFilter?: string,
  previousStageId?: string
): Promise<{ observationsCreated: number; dealsScanned: number; errors: string[] }> {
  // Fetch active deals (exclude Closed Won / Closed Lost)
  let query = supabase
    .from('deals')
    .select('id, name, company, value, owner_id, org_id, stage_id, expected_close_date, created_at')
    .eq('org_id', orgId);

  if (dealFilter) {
    query = query.eq('id', dealFilter);
  }

  const { data: deals, error: dealsErr } = await query;
  if (dealsErr) return { observationsCreated: 0, dealsScanned: 0, errors: [dealsErr.message] };
  if (!deals?.length) return { observationsCreated: 0, dealsScanned: 0, errors: [] };

  // Fetch closed stage IDs to exclude
  const { data: closedStages } = await supabase
    .from('deal_stages')
    .select('id, name, position')
    .eq('org_id', orgId);

  const closedStageIds = new Set(
    (closedStages || [])
      .filter((s: { name: string }) => /closed/i.test(s.name))
      .map((s: { id: string }) => s.id)
  );

  // Build stage position map for regression detection
  const stagePositionMap = new Map(
    (closedStages || []).map((s: { id: string; position: number }) => [s.id, s.position])
  );

  const activeDeals = (deals as DealRow[]).filter(
    (d) => d.stage_id && !closedStageIds.has(d.stage_id)
  );

  // Batch-fetch supporting data for all active deals
  const dealIds = activeDeals.map((d) => d.id);

  const [healthScores, nextMeetings, pendingTasks, contactCounts, recentMeetings] =
    await Promise.all([
      fetchDealHealthScores(supabase, dealIds),
      fetchNextMeetings(supabase, dealIds),
      fetchPendingTasks(supabase, dealIds),
      fetchContactCounts(supabase, dealIds),
      fetchRecentMeetings(supabase, dealIds),
    ]);

  const observations: Observation[] = [];
  const errors: string[] = [];

  for (const deal of activeDeals) {
    try {
      const dealObs = detectObservations(
        deal,
        healthScores.get(deal.id),
        nextMeetings.has(deal.id),
        pendingTasks.has(deal.id),
        contactCounts.get(deal.id) || 0,
        recentMeetings.get(deal.id),
        previousStageId && deal.id === dealFilter ? previousStageId : undefined,
        stagePositionMap
      );
      observations.push(...dealObs);
    } catch (err) {
      errors.push(`deal ${deal.id}: ${(err as Error).message}`);
    }
  }

  // Upsert observations (dedup on org_id + deal_id + category WHERE open)
  let created = 0;
  for (const obs of observations) {
    try {
      const saved = await upsertObservation(supabase, obs);
      if (saved) created++;
    } catch (err) {
      errors.push(`upsert ${obs.category} for ${obs.deal_id}: ${(err as Error).message}`);
    }
  }

  // Generate deal improvement suggestions (PST-011)
  for (const deal of activeDeals) {
    try {
      const suggestionsCreated = await generateDealImprovementSuggestions(
        supabase,
        deal,
        orgId,
        deal.owner_id
      );
      created += suggestionsCreated;
    } catch (err) {
      errors.push(`improvement_suggestion ${deal.id}: ${(err as Error).message}`);
    }
  }

  // Auto-resolve observations where the condition has cleared
  await autoResolveCleared(supabase, orgId, activeDeals, healthScores, nextMeetings, pendingTasks, contactCounts);

  return { observationsCreated: created, dealsScanned: activeDeals.length, errors };
}

// =============================================================================
// Observation Detection
// =============================================================================

function detectObservations(
  deal: DealRow,
  healthScore: { days_since_last_activity: number; ghost_probability: number } | undefined,
  hasNextMeeting: boolean,
  hasPendingTask: boolean,
  contactCount: number,
  recentMeeting: { id: string; ended_at: string; has_follow_up: boolean } | undefined,
  previousStageId: string | undefined,
  stagePositionMap: Map<string, number>
): Observation[] {
  const obs: Observation[] = [];
  const base = { deal_id: deal.id, user_id: deal.owner_id, org_id: deal.org_id };

  // 1. Stale deal (no activity in 7+ days)
  const daysSinceActivity = healthScore?.days_since_last_activity ?? 999;
  if (daysSinceActivity >= STALE_DEAL_DAYS) {
    obs.push({
      ...base,
      category: 'stale_deal',
      severity: daysSinceActivity >= 14 ? 'high' : 'medium',
      title: `${deal.name} has had no activity for ${daysSinceActivity} days`,
      description: `Deal value: ${deal.value ? `$${deal.value.toLocaleString()}` : 'unknown'}. Consider re-engaging or archiving.`,
      affected_contacts: [],
      proposed_action: { type: 'reengage', template: 'stale_deal_reengagement' },
    });
  }

  // 2. Missing next step (no scheduled meeting AND no pending task)
  if (!hasNextMeeting && !hasPendingTask) {
    obs.push({
      ...base,
      category: 'missing_next_step',
      severity: 'high',
      title: `${deal.name} has no next step scheduled`,
      description: 'No upcoming meeting or pending task. Deals without next steps are 3x more likely to stall.',
      affected_contacts: [],
      proposed_action: { type: 'create_task', suggestion: 'Schedule a follow-up call' },
    });
  }

  // 3. Follow-up gap (meeting happened 24h+ ago, no follow-up sent)
  if (recentMeeting && !recentMeeting.has_follow_up) {
    const meetingEndedAt = new Date(recentMeeting.ended_at);
    const hoursSince = (Date.now() - meetingEndedAt.getTime()) / 3_600_000;
    if (hoursSince >= FOLLOW_UP_WINDOW_HOURS) {
      obs.push({
        ...base,
        category: 'follow_up_gap',
        severity: 'high',
        title: `No follow-up sent after meeting on ${deal.name}`,
        description: `Meeting ended ${Math.round(hoursSince)}h ago. Prompt follow-ups increase close rates by 20%.`,
        affected_contacts: [],
        proposed_action: { type: 'draft_email', template: 'post_meeting_follow_up', meeting_id: recentMeeting.id },
      });
    }
  }

  // 4. Single-threaded (only one contact)
  if (contactCount <= 1) {
    obs.push({
      ...base,
      category: 'single_threaded',
      severity: 'medium',
      title: `${deal.name} is single-threaded`,
      description: `Only ${contactCount} contact linked. Multi-threaded deals close 2x more often.`,
      affected_contacts: [],
      proposed_action: { type: 'suggest_contacts', template: 'multi_thread_suggestion' },
    });
  }

  // 5. Stage regression (deal moved backwards)
  if (previousStageId && deal.stage_id) {
    const prevPos = stagePositionMap.get(previousStageId);
    const currPos = stagePositionMap.get(deal.stage_id);
    if (prevPos !== undefined && currPos !== undefined && currPos < prevPos) {
      obs.push({
        ...base,
        category: 'stage_regression',
        severity: 'high',
        title: `${deal.name} moved backwards in pipeline`,
        description: 'Deal stage regressed. Investigate what changed.',
        affected_contacts: [],
        proposed_action: null,
      });
    }
  }

  return obs;
}

// =============================================================================
// Data Fetching Helpers
// =============================================================================

async function fetchDealHealthScores(
  supabase: ReturnType<typeof createClient>,
  dealIds: string[]
): Promise<Map<string, { days_since_last_activity: number; ghost_probability: number }>> {
  if (!dealIds.length) return new Map();
  const { data } = await supabase
    .from('deal_health_scores')
    .select('deal_id, days_since_last_activity, ghost_probability')
    .in('deal_id', dealIds);

  const map = new Map<string, { days_since_last_activity: number; ghost_probability: number }>();
  for (const row of data || []) {
    map.set(row.deal_id, {
      days_since_last_activity: row.days_since_last_activity ?? 0,
      ghost_probability: row.ghost_probability ?? 0,
    });
  }
  return map;
}

async function fetchNextMeetings(
  supabase: ReturnType<typeof createClient>,
  dealIds: string[]
): Promise<Set<string>> {
  if (!dealIds.length) return new Set();
  const now = new Date().toISOString();
  const { data } = await supabase
    .from('calendar_events')
    .select('deal_id')
    .in('deal_id', dealIds)
    .gte('start_time', now)
    .limit(500);

  return new Set((data || []).map((r: { deal_id: string }) => r.deal_id));
}

async function fetchPendingTasks(
  supabase: ReturnType<typeof createClient>,
  dealIds: string[]
): Promise<Set<string>> {
  if (!dealIds.length) return new Set();
  const { data } = await supabase
    .from('tasks')
    .select('deal_id')
    .in('deal_id', dealIds)
    .neq('status', 'completed')
    .not('deal_id', 'is', null)
    .limit(500);

  return new Set((data || []).map((r: { deal_id: string }) => r.deal_id));
}

async function fetchContactCounts(
  supabase: ReturnType<typeof createClient>,
  dealIds: string[]
): Promise<Map<string, number>> {
  if (!dealIds.length) return new Map();
  // Use a raw query since we need COUNT grouped by deal
  const { data } = await supabase
    .from('deal_contacts')
    .select('deal_id')
    .in('deal_id', dealIds);

  const counts = new Map<string, number>();
  for (const row of data || []) {
    counts.set(row.deal_id, (counts.get(row.deal_id) || 0) + 1);
  }
  return counts;
}

async function fetchRecentMeetings(
  supabase: ReturnType<typeof createClient>,
  dealIds: string[]
): Promise<Map<string, { id: string; ended_at: string; has_follow_up: boolean }>> {
  if (!dealIds.length) return new Map();
  const cutoff = new Date(Date.now() - 48 * 3_600_000).toISOString(); // Look back 48h
  const { data } = await supabase
    .from('meetings')
    .select('id, deal_id, ended_at, has_follow_up')
    .in('deal_id', dealIds)
    .not('ended_at', 'is', null)
    .gte('ended_at', cutoff)
    .order('ended_at', { ascending: false });

  const map = new Map<string, { id: string; ended_at: string; has_follow_up: boolean }>();
  for (const row of data || []) {
    // Keep only the most recent meeting per deal
    if (!map.has(row.deal_id)) {
      map.set(row.deal_id, {
        id: row.id,
        ended_at: row.ended_at,
        has_follow_up: row.has_follow_up ?? false,
      });
    }
  }
  return map;
}

// =============================================================================
// Observation Persistence
// =============================================================================

async function upsertObservation(
  supabase: ReturnType<typeof createClient>,
  obs: Observation
): Promise<boolean> {
  // Check for existing open observation (dedup)
  const { data: existing } = await supabase
    .from('deal_observations')
    .select('id, last_observed_at')
    .eq('org_id', obs.org_id)
    .eq('deal_id', obs.deal_id)
    .eq('category', obs.category)
    .eq('status', 'open')
    .maybeSingle();

  if (existing) {
    // Update last_observed_at (observation still active)
    await supabase
      .from('deal_observations')
      .update({ last_observed_at: new Date().toISOString(), severity: obs.severity })
      .eq('id', existing.id);
    return false; // Not a new observation
  }

  // Also skip if snoozed and not yet expired
  const { data: snoozed } = await supabase
    .from('deal_observations')
    .select('id')
    .eq('org_id', obs.org_id)
    .eq('deal_id', obs.deal_id)
    .eq('category', obs.category)
    .eq('status', 'snoozed')
    .gt('snooze_until', new Date().toISOString())
    .maybeSingle();

  if (snoozed) return false;

  // Insert new observation
  const { error } = await supabase.from('deal_observations').insert({
    org_id: obs.org_id,
    user_id: obs.user_id,
    deal_id: obs.deal_id,
    category: obs.category,
    severity: obs.severity,
    title: obs.title,
    description: obs.description,
    affected_contacts: obs.affected_contacts,
    proposed_action: obs.proposed_action,
    status: 'open',
    first_observed_at: new Date().toISOString(),
    last_observed_at: new Date().toISOString(),
  });

  if (error) {
    // Unique constraint violation means race condition — not an error
    if (error.code === '23505') return false;
    throw error;
  }

  return true;
}

// =============================================================================
// Auto-Resolve
// =============================================================================

async function autoResolveCleared(
  supabase: ReturnType<typeof createClient>,
  orgId: string,
  activeDeals: DealRow[],
  healthScores: Map<string, { days_since_last_activity: number; ghost_probability: number }>,
  nextMeetings: Set<string>,
  pendingTasks: Set<string>,
  contactCounts: Map<string, number>
): Promise<void> {
  // Fetch open observations for this org
  const { data: openObs } = await supabase
    .from('deal_observations')
    .select('id, deal_id, category')
    .eq('org_id', orgId)
    .eq('status', 'open');

  if (!openObs?.length) return;

  const dealIdSet = new Set(activeDeals.map((d) => d.id));
  const toResolve: string[] = [];

  for (const obs of openObs) {
    // Skip observations for deals no longer active
    if (!dealIdSet.has(obs.deal_id)) {
      toResolve.push(obs.id);
      continue;
    }

    const health = healthScores.get(obs.deal_id);

    switch (obs.category) {
      case 'stale_deal':
        if (health && health.days_since_last_activity < STALE_DEAL_DAYS) toResolve.push(obs.id);
        break;
      case 'missing_next_step':
        if (nextMeetings.has(obs.deal_id) || pendingTasks.has(obs.deal_id)) toResolve.push(obs.id);
        break;
      case 'single_threaded':
        if ((contactCounts.get(obs.deal_id) || 0) > 1) toResolve.push(obs.id);
        break;
    }
  }

  if (toResolve.length) {
    await supabase
      .from('deal_observations')
      .update({
        status: 'auto_resolved',
        resolved_at: new Date().toISOString(),
        resolution_type: 'auto_resolved',
      })
      .in('id', toResolve);
  }
}
