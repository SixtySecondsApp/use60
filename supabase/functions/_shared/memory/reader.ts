/**
 * DealMemoryReader — hybrid context loading interface for deal intelligence.
 *
 * Combines structured DB queries (fast, free) with optional RAG depth
 * (slower, costs credits). Agents call getDealContext() for a complete
 * picture of a deal; individual methods are available for targeted reads.
 *
 * Rules:
 *   - Never select('*') — always explicit columns
 *   - Always filter by org_id (belt-and-suspenders on top of RLS)
 *   - Return empty arrays / null for missing data — never throw
 *   - maybeSingle() for queries that might return no rows
 */

import { createClient } from 'https://esm.sh/@supabase/supabase-js@2.43.4';
import type {
  Commitment,
  ContactMemory,
  ContextOptions,
  DealContext,
  DealMemoryEvent,
  DealMemorySnapshot,
  EventFilters,
  RAGResult,
  RiskFactor,
  Stakeholder,
} from './types.ts';
import { RAGClient } from './ragClient.ts';
import {
  getOpenCommitments as getOpenCommitmentsFromDb,
  getOverdueCommitments as getOverdueCommitmentsFromDb,
} from './commitments.ts';

// ---- Private helpers --------------------------------------------------------

function estimateStructuredTokens(
  snapshot: DealMemorySnapshot | null,
  events: DealMemoryEvent[],
): number {
  let tokens = 0;
  if (snapshot) {
    tokens += RAGClient.estimateTokens(snapshot.narrative) + 200; // key_facts, stakeholders
  }
  tokens += events.reduce(
    (sum, e) => sum + RAGClient.estimateTokens(e.summary) + 50,
    0,
  );
  return tokens;
}

function ninetyDaysAgo(): string {
  const d = new Date();
  d.setDate(d.getDate() - 90);
  return d.toISOString();
}

// ---- Factory ----------------------------------------------------------------

export function createDealMemoryReader(
  supabase: ReturnType<typeof createClient>,
  ragClient: RAGClient,
) {
  // ---- getLatestSnapshot ---------------------------------------------------

  async function getLatestSnapshot(
    dealId: string,
    orgId: string,
  ): Promise<DealMemorySnapshot | null> {
    const { data, error } = await supabase
      .from('deal_memory_snapshots')
      .select(
        'id, deal_id, narrative, key_facts, stakeholder_map, risk_assessment, sentiment_trajectory, open_commitments, events_included_through, event_count, generated_by, model_used, created_at',
      )
      .eq('org_id', orgId)
      .eq('deal_id', dealId)
      .order('created_at', { ascending: false })
      .limit(1)
      .maybeSingle();

    if (error) {
      console.error('[DealMemoryReader] getLatestSnapshot error:', error.message);
      return null;
    }

    return data as DealMemorySnapshot | null;
  }

  // ---- getEvents -----------------------------------------------------------

  async function getEvents(
    dealId: string,
    orgId: string,
    filters?: EventFilters,
  ): Promise<DealMemoryEvent[]> {
    let query = supabase
      .from('deal_memory_events')
      .select(
        'id, event_type, event_category, source_type, source_id, source_timestamp, summary, detail, verbatim_quote, speaker, confidence, salience, contact_ids, extracted_by, is_active',
      )
      .eq('org_id', orgId)
      .eq('deal_id', dealId)
      .eq('is_active', true)
      .order('source_timestamp', { ascending: false });

    if (filters?.event_types) query = query.in('event_type', filters.event_types);
    if (filters?.event_categories) query = query.in('event_category', filters.event_categories);
    if (filters?.source_types) query = query.in('source_type', filters.source_types);
    if (filters?.since) query = query.gte('source_timestamp', filters.since);
    if (filters?.until) query = query.lte('source_timestamp', filters.until);
    if (filters?.min_confidence) query = query.gte('confidence', filters.min_confidence);
    if (filters?.salience) query = query.in('salience', filters.salience);
    if (filters?.limit) query = query.limit(filters.limit);
    else query = query.limit(100);

    const { data, error } = await query;

    if (error) {
      console.error('[DealMemoryReader] getEvents error:', error.message);
      return [];
    }

    return (data ?? []) as DealMemoryEvent[];
  }

  // ---- getOpenCommitments (delegates to commitments.ts) --------------------

  async function getOpenCommitments(
    dealId: string,
    orgId: string,
  ): Promise<Commitment[]> {
    return getOpenCommitmentsFromDb(dealId, orgId, supabase);
  }

  // ---- getOverdueCommitments (delegates to commitments.ts) -----------------

  async function getOverdueCommitments(orgId: string): Promise<Commitment[]> {
    return getOverdueCommitmentsFromDb(orgId, supabase);
  }

  // ---- getStakeholderMap ---------------------------------------------------

  async function getStakeholderMap(
    dealId: string,
    orgId: string,
  ): Promise<Stakeholder[]> {
    // Prefer snapshot — it has a fully-resolved stakeholder_map
    const snapshot = await getLatestSnapshot(dealId, orgId);
    if (snapshot?.stakeholder_map?.length) {
      return snapshot.stakeholder_map;
    }

    // Fall back to individual events
    const { data, error } = await supabase
      .from('deal_memory_events')
      .select('detail')
      .eq('org_id', orgId)
      .eq('deal_id', dealId)
      .eq('is_active', true)
      .in('event_type', ['stakeholder_identified', 'stakeholder_change'])
      .order('source_timestamp', { ascending: false });

    if (error) {
      console.error('[DealMemoryReader] getStakeholderMap error:', error.message);
      return [];
    }

    return ((data ?? []) as Array<{ detail: Record<string, unknown> }>).map((row) => ({
      contact_id: (row.detail.contact_id as string) ?? '',
      name: (row.detail.name as string) ?? '',
      role: (row.detail.role as Stakeholder['role']) ?? 'unknown',
      engagement_level:
        (row.detail.engagement_level as Stakeholder['engagement_level']) ?? 'passive',
      last_active: (row.detail.last_active as string) ?? null,
    }));
  }

  // ---- getRiskFactors ------------------------------------------------------

  async function getRiskFactors(
    dealId: string,
    orgId: string,
  ): Promise<RiskFactor[]> {
    const { data, error } = await supabase
      .from('deal_memory_events')
      .select('id, detail, source_timestamp')
      .eq('org_id', orgId)
      .eq('deal_id', dealId)
      .eq('is_active', true)
      .eq('event_type', 'risk_flag')
      .order('source_timestamp', { ascending: false })
      .limit(20);

    if (error) {
      console.error('[DealMemoryReader] getRiskFactors error:', error.message);
      return [];
    }

    return ((data ?? []) as Array<{
      id: string;
      detail: Record<string, unknown>;
      source_timestamp: string;
    }>).map((row) => ({
      type: (row.detail.type as string) ?? 'unknown',
      severity: (row.detail.severity as RiskFactor['severity']) ?? 'medium',
      detail: (row.detail.detail as string) ?? '',
      contributing_event_ids: row.detail.contributing_event_ids as string[] | undefined,
    }));
  }

  // ---- getContactHistory ---------------------------------------------------

  async function getContactHistory(
    contactId: string,
    orgId: string,
  ): Promise<{ events: DealMemoryEvent[]; profile: ContactMemory | null }> {
    // Events across all deals where this contact appears
    const [eventsResult, profileResult] = await Promise.all([
      supabase
        .from('deal_memory_events')
        .select(
          'id, event_type, event_category, source_type, source_id, source_timestamp, summary, detail, verbatim_quote, speaker, confidence, salience, contact_ids, extracted_by, is_active',
        )
        .eq('org_id', orgId)
        .eq('is_active', true)
        .contains('contact_ids', [contactId])
        .order('source_timestamp', { ascending: false })
        .limit(100),

      supabase
        .from('contact_memory')
        .select(
          'id, contact_id, communication_style, decision_style, relationship_strength, last_interaction_at, summary',
        )
        .eq('org_id', orgId)
        .eq('contact_id', contactId)
        .maybeSingle(),
    ]);

    if (eventsResult.error) {
      console.error('[DealMemoryReader] getContactHistory events error:', eventsResult.error.message);
    }
    if (profileResult.error) {
      console.error('[DealMemoryReader] getContactHistory profile error:', profileResult.error.message);
    }

    return {
      events: (eventsResult.data ?? []) as DealMemoryEvent[],
      profile: profileResult.data as ContactMemory | null,
    };
  }

  // ---- getDealContext (primary agent method) --------------------------------

  async function getDealContext(
    dealId: string,
    orgId: string,
    opts?: ContextOptions,
  ): Promise<DealContext> {
    // 1. Latest snapshot
    const snapshot = await getLatestSnapshot(dealId, orgId);

    // 2. Recent events since snapshot (or last 90 days)
    const since = snapshot?.events_included_through ?? ninetyDaysAgo();

    let eventsQuery = supabase
      .from('deal_memory_events')
      .select(
        'id, event_type, event_category, source_type, source_id, source_timestamp, summary, detail, verbatim_quote, speaker, confidence, salience, contact_ids, extracted_by',
      )
      .eq('org_id', orgId)
      .eq('deal_id', dealId)
      .eq('is_active', true)
      .gte('source_timestamp', since)
      .order('source_timestamp', { ascending: false });

    if (opts?.eventCategories?.length) {
      eventsQuery = eventsQuery.in('event_category', opts.eventCategories);
    }

    eventsQuery = eventsQuery.limit(50);

    const { data: eventsData, error: eventsError } = await eventsQuery;

    if (eventsError) {
      console.error('[DealMemoryReader] getDealContext events error:', eventsError.message);
    }

    const recentEvents = (eventsData ?? []) as DealMemoryEvent[];

    // 3. Open commitments — merge from events and snapshot
    const eventCommitments: Commitment[] = recentEvents
      .filter(
        (e) =>
          e.event_type === 'commitment_made' &&
          (e.detail as Record<string, unknown>).status === 'pending',
      )
      .map((e) => ({
        event_id: e.id,
        owner: ((e.detail as Record<string, unknown>).owner ?? 'rep') as 'rep' | 'prospect',
        action: e.summary,
        deadline: ((e.detail as Record<string, unknown>).deadline as string) ?? null,
        status: 'pending' as const,
        created_at: e.source_timestamp,
      }));

    const snapshotCommitments: Commitment[] = snapshot?.open_commitments ?? [];

    // De-duplicate by event_id, preferring fresh event data
    const commitmentMap = new Map<string, Commitment>();
    for (const c of snapshotCommitments) commitmentMap.set(c.event_id, c);
    for (const c of eventCommitments) commitmentMap.set(c.event_id, c);
    const openCommitments = Array.from(commitmentMap.values());

    // 4. Stakeholder map — prefer snapshot, fall back to events
    let stakeholderMap: Stakeholder[] = snapshot?.stakeholder_map ?? [];
    if (!stakeholderMap.length) {
      const stakeholderEvents = recentEvents.filter((e) =>
        e.event_type === 'stakeholder_identified' || e.event_type === 'stakeholder_change',
      );
      stakeholderMap = stakeholderEvents.map((e) => ({
        contact_id: ((e.detail as Record<string, unknown>).contact_id as string) ?? '',
        name: ((e.detail as Record<string, unknown>).name as string) ?? '',
        role:
          ((e.detail as Record<string, unknown>).role as Stakeholder['role']) ?? 'unknown',
        engagement_level:
          ((e.detail as Record<string, unknown>)
            .engagement_level as Stakeholder['engagement_level']) ?? 'passive',
        last_active: ((e.detail as Record<string, unknown>).last_active as string) ?? null,
      }));
    }

    // 5. Risk factors from active risk_flag events
    const riskFactors: RiskFactor[] = recentEvents
      .filter((e) => e.event_type === 'risk_flag')
      .map((e) => ({
        type: ((e.detail as Record<string, unknown>).risk_type as string) ?? 'unknown',
        severity:
          ((e.detail as Record<string, unknown>).severity as RiskFactor['severity']) ??
          'medium',
        detail: ((e.detail as Record<string, unknown>).detail as string) ?? '',
        contributing_event_ids: (e.detail as Record<string, unknown>)
          .contributing_event_ids as string[] | undefined,
      }));

    // 6. Contact profiles for distinct contact_ids found in events
    const distinctContactIds = [
      ...new Set(recentEvents.flatMap((e) => e.contact_ids ?? [])),
    ];

    let contactProfiles: ContactMemory[] = [];
    if (distinctContactIds.length > 0) {
      const { data: profilesData, error: profilesError } = await supabase
        .from('contact_memory')
        .select(
          'id, contact_id, communication_style, decision_style, relationship_strength, last_interaction_at, summary',
        )
        .eq('org_id', orgId)
        .in('contact_id', distinctContactIds);

      if (profilesError) {
        console.error(
          '[DealMemoryReader] getDealContext contact profiles error:',
          profilesError.message,
        );
      }

      contactProfiles = (profilesData ?? []) as ContactMemory[];
    }

    // 7. Optional RAG depth
    let ragContext: RAGResult[] | undefined;
    let ragQueryCost = 0;

    if (opts?.includeRAGDepth === true) {
      const estimatedStructuredTokens = estimateStructuredTokens(snapshot, recentEvents);
      const tokenBudget = opts.tokenBudget ?? 2000;
      const remainingBudget = tokenBudget - estimatedStructuredTokens;

      if (remainingBudget > 500) {
        const questions =
          opts.ragQuestions && opts.ragQuestions.length > 0
            ? opts.ragQuestions
            : [
                'Key discussion points from the latest meeting on this deal',
                'Any unresolved questions or concerns from recent meetings',
              ];

        const ragFilters = { deal_id: dealId };
        const rawResults = await ragClient.queryBatch(
          questions.map((q) => ({ question: q, filters: ragFilters })),
        );

        ragContext = RAGClient.truncateToTokenBudget(rawResults, remainingBudget);
        ragQueryCost = ragContext.length; // 1 credit unit per query (callers can override)
      }
    }

    // 8. Derive metadata
    const lastMeetingEvent = recentEvents.find((e) => e.source_type === 'transcript');
    const lastMeetingDate = lastMeetingEvent?.source_timestamp ?? null;

    const totalEventCount =
      (snapshot?.event_count ?? 0) + recentEvents.length;

    return {
      snapshot,
      recentEvents,
      openCommitments,
      stakeholderMap,
      riskFactors,
      contactProfiles,
      ragContext,
      eventCount: totalEventCount,
      lastMeetingDate,
      ragQueryCost,
    };
  }

  // ---- Public interface ----------------------------------------------------

  return {
    getDealContext,
    getEvents,
    getOpenCommitments,
    getOverdueCommitments,
    getStakeholderMap,
    getRiskFactors,
    getLatestSnapshot,
    getContactHistory,
  };
}
