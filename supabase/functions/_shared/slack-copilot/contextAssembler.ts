// supabase/functions/_shared/slack-copilot/contextAssembler.ts
// Assembles relevant data context based on classified intent (PRD-22, CONV-003)

import { SupabaseClient } from 'https://esm.sh/@supabase/supabase-js@2.43.4';
import type { ClassifiedIntent, QueryContext, CopilotIntentType } from './types.ts';

/**
 * Assemble query context based on the classified intent.
 * Loads only the data relevant to the query type to stay within token budgets.
 */
export async function assembleContext(
  supabase: SupabaseClient,
  userId: string,
  orgId: string,
  intent: ClassifiedIntent
): Promise<QueryContext> {
  const context: QueryContext = {};

  const loaders = getLoadersForIntent(intent.type);

  await Promise.all(
    loaders.map(async (loader) => {
      try {
        await loader(supabase, userId, orgId, intent, context);
      } catch (err) {
        console.error(`[contextAssembler] Loader failed for ${intent.type}:`, err);
      }
    })
  );

  return context;
}

type ContextLoader = (
  supabase: SupabaseClient,
  userId: string,
  orgId: string,
  intent: ClassifiedIntent,
  context: QueryContext
) => Promise<void>;

function getLoadersForIntent(intentType: CopilotIntentType): ContextLoader[] {
  switch (intentType) {
    case 'deal_query':
      return [loadDeals, loadRiskScores, loadRecentActivities];
    case 'pipeline_query':
      return [loadDeals, loadPipelineSnapshot, loadRiskScores];
    case 'history_query':
      return [loadMeetings, loadRecentActivities, loadContacts];
    case 'contact_query':
      return [loadContacts, loadRecentActivities, loadDeals];
    case 'action_request':
      return [loadDeals, loadContacts, loadMeetings];
    case 'competitive_query':
      return [loadCompetitiveIntel, loadDeals];
    case 'coaching_query':
      return [loadDeals, loadMeetings, loadPipelineSnapshot];
    case 'general_chat':
      return [loadPipelineSnapshot];
    default:
      return [];
  }
}

// --- Loaders ---

async function loadDeals(
  supabase: SupabaseClient,
  userId: string,
  _orgId: string,
  intent: ClassifiedIntent,
  context: QueryContext
): Promise<void> {
  let query = supabase
    .from('deals')
    .select('id, title, stage, value, health_status, close_date, owner_id')
    .eq('owner_id', userId)
    .order('updated_at', { ascending: false });

  // If a specific deal is mentioned, filter by name
  if (intent.entities.dealName) {
    query = query.ilike('title', `%${intent.entities.dealName}%`);
  }

  const { data } = await query.limit(intent.entities.dealName ? 5 : 20);
  context.deals = data || [];
}

async function loadContacts(
  supabase: SupabaseClient,
  userId: string,
  _orgId: string,
  intent: ClassifiedIntent,
  context: QueryContext
): Promise<void> {
  let query = supabase
    .from('contacts')
    .select('id, first_name, last_name, email, company, title')
    .eq('owner_id', userId)
    .order('updated_at', { ascending: false });

  if (intent.entities.contactName) {
    const name = intent.entities.contactName;
    query = query.or(`first_name.ilike.%${name}%,last_name.ilike.%${name}%,email.ilike.%${name}%`);
  }

  if (intent.entities.companyName) {
    query = query.ilike('company', `%${intent.entities.companyName}%`);
  }

  const { data } = await query.limit(10);
  context.contacts = data || [];
}

async function loadMeetings(
  supabase: SupabaseClient,
  userId: string,
  _orgId: string,
  _intent: ClassifiedIntent,
  context: QueryContext
): Promise<void> {
  // Load recent and upcoming meetings
  const now = new Date().toISOString();
  const oneWeekAgo = new Date(Date.now() - 7 * 24 * 60 * 60 * 1000).toISOString();
  const oneWeekAhead = new Date(Date.now() + 7 * 24 * 60 * 60 * 1000).toISOString();

  const { data } = await supabase
    .from('meetings')
    .select('id, title, start_time, end_time, attendees_count, summary')
    .eq('owner_user_id', userId)
    .gte('start_time', oneWeekAgo)
    .lte('start_time', oneWeekAhead)
    .gt('attendees_count', 1)
    .order('start_time', { ascending: false })
    .limit(15);

  context.meetings = data || [];
}

async function loadRecentActivities(
  supabase: SupabaseClient,
  userId: string,
  _orgId: string,
  _intent: ClassifiedIntent,
  context: QueryContext
): Promise<void> {
  const oneWeekAgo = new Date(Date.now() - 7 * 24 * 60 * 60 * 1000).toISOString();

  const { data } = await supabase
    .from('activities')
    .select('id, type, subject, created_at, metadata')
    .eq('user_id', userId)
    .gte('created_at', oneWeekAgo)
    .order('created_at', { ascending: false })
    .limit(20);

  context.activities = data || [];
}

async function loadRiskScores(
  supabase: SupabaseClient,
  userId: string,
  orgId: string,
  _intent: ClassifiedIntent,
  context: QueryContext
): Promise<void> {
  // Join deal_risk_scores with deals to filter by owner
  const { data } = await supabase
    .from('deal_risk_scores')
    .select('deal_id, score, risk_level, top_signals')
    .in(
      'deal_id',
      (context.deals || []).map((d) => d.id)
    )
    .order('score', { ascending: false })
    .limit(20);

  context.riskScores = (data || []).map((r) => ({
    deal_id: r.deal_id,
    score: r.score,
    risk_level: r.risk_level,
    top_signals: r.top_signals || [],
  }));
}

async function loadPipelineSnapshot(
  supabase: SupabaseClient,
  userId: string,
  _orgId: string,
  _intent: ClassifiedIntent,
  context: QueryContext
): Promise<void> {
  // Calculate pipeline metrics from deals
  const { data: deals } = await supabase
    .from('deals')
    .select('id, value, stage')
    .eq('owner_id', userId)
    .not('stage', 'in', '("Closed Won","Closed Lost","closed_won","closed_lost")');

  if (!deals || deals.length === 0) {
    context.pipelineSnapshot = {
      total_value: 0,
      deal_count: 0,
      weighted_value: 0,
      target: null,
      gap: null,
    };
    return;
  }

  const totalValue = deals.reduce((sum, d) => sum + (d.value || 0), 0);
  // Simple weighting by stage (rough approximation)
  const stageWeights: Record<string, number> = {
    'Discovery': 0.1, 'Qualification': 0.2, 'Proposal': 0.5,
    'Negotiation': 0.7, 'Verbal Commit': 0.9,
    'discovery': 0.1, 'qualification': 0.2, 'proposal': 0.5,
    'negotiation': 0.7, 'verbal_commit': 0.9,
  };

  const weightedValue = deals.reduce((sum, d) => {
    const weight = stageWeights[d.stage] || 0.3;
    return sum + (d.value || 0) * weight;
  }, 0);

  context.pipelineSnapshot = {
    total_value: totalValue,
    deal_count: deals.length,
    weighted_value: Math.round(weightedValue),
    target: null, // Would come from agent config
    gap: null,
  };
}

async function loadCompetitiveIntel(
  supabase: SupabaseClient,
  _userId: string,
  orgId: string,
  intent: ClassifiedIntent,
  context: QueryContext
): Promise<void> {
  let query = supabase
    .from('competitive_intelligence')
    .select('competitor_name, mention_count, win_rate, strengths, weaknesses')
    .eq('org_id', orgId);

  if (intent.entities.competitorName) {
    query = query.ilike('competitor_name', `%${intent.entities.competitorName}%`);
  }

  const { data } = await query.order('mention_count', { ascending: false }).limit(5);
  context.competitive = data || [];
}
