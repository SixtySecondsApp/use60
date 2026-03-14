/**
 * useDealMomentum — Composite momentum score per active deal (NL-004a)
 *
 * Computes a momentum score from 4 SQL-derived signals (no LLM needed):
 *   1. Meeting Frequency  — recent vs prior 14-day window
 *   2. Sentiment Trajectory — avg sentiment of last 2 vs prior 2 meetings
 *   3. Commitment Health   — fulfilled / total commitments ratio
 *   4. Recency             — days since most recent meeting
 *
 * Weighted average: frequency(0.3) + sentiment(0.3) + commitment(0.2) + recency(0.2)
 */

import { useQuery } from '@tanstack/react-query';
import { supabase } from '@/lib/supabase/clientV2';
import { useOrgStore } from '@/lib/stores/orgStore';

// ============================================================================
// Types
// ============================================================================

export type MomentumStatus = 'accelerating' | 'steady' | 'decelerating' | 'stalled';

export interface DealMomentum {
  dealId: string;
  dealName: string;
  company: string;
  momentum: number;
  status: MomentumStatus;
  signals: {
    meetingFrequency: number;
    sentimentTrajectory: number;
    commitmentHealth: number;
    recency: number;
  };
}

// ============================================================================
// Internal row types
// ============================================================================

interface DealRow {
  id: string;
  name: string;
  company: string | null;
  company_id: string | null;
  primary_contact_id: string | null;
}

interface MeetingRow {
  id: string;
  meeting_start: string;
  sentiment_score: number | null;
  company_id: string | null;
}

interface CommitmentEventRow {
  deal_id: string;
  event_type: string;
}

interface ContactMemoryRow {
  contact_id: string;
  last_interaction_at: string | null;
}

// ============================================================================
// Cache key
// ============================================================================

export const DEAL_MOMENTUM_KEY = 'deal-momentum' as const;

// ============================================================================
// Signal computation helpers
// ============================================================================

/**
 * Signal 1 — Meeting Frequency (-1 to +1)
 * Count meetings in last 14 days vs prior 14 days.
 * More recent = positive, fewer = negative, same = 0.
 */
function computeMeetingFrequency(companyMeetings: MeetingRow[]): number {
  const now = Date.now();
  const fourteenDaysMs = 14 * 24 * 60 * 60 * 1000;
  const cutoffRecent = now - fourteenDaysMs;
  const cutoffPrior = now - 2 * fourteenDaysMs;

  let recentCount = 0;
  let priorCount = 0;

  for (const m of companyMeetings) {
    const ts = new Date(m.meeting_start).getTime();
    if (ts >= cutoffRecent) {
      recentCount++;
    } else if (ts >= cutoffPrior) {
      priorCount++;
    }
  }

  if (recentCount === 0 && priorCount === 0) return 0;
  if (priorCount === 0) return 1; // had no meetings before, now we do
  if (recentCount === 0) return -1; // had meetings before, none recently

  const ratio = recentCount / priorCount;
  if (ratio > 1) return Math.min((ratio - 1), 1); // cap at +1
  if (ratio < 1) return Math.max(-(1 - ratio), -1); // cap at -1
  return 0;
}

/**
 * Signal 2 — Sentiment Trajectory (-1 to +1)
 * Avg sentiment of last 2 meetings vs prior 2.
 * Improving = positive, declining = negative.
 */
function computeSentimentTrajectory(companyMeetings: MeetingRow[]): number {
  // Filter to meetings with sentiment, sorted most recent first
  const withSentiment = companyMeetings
    .filter((m) => m.sentiment_score !== null)
    .sort((a, b) => new Date(b.meeting_start).getTime() - new Date(a.meeting_start).getTime());

  if (withSentiment.length < 2) return 0; // insufficient data

  const recentSlice = withSentiment.slice(0, 2);
  const priorSlice = withSentiment.slice(2, 4);

  const recentAvg =
    recentSlice.reduce((sum, m) => sum + (m.sentiment_score ?? 0), 0) / recentSlice.length;

  if (priorSlice.length === 0) return 0; // only 2 meetings total, no prior to compare

  const priorAvg =
    priorSlice.reduce((sum, m) => sum + (m.sentiment_score ?? 0), 0) / priorSlice.length;

  // Clamp to [-1, +1]
  const delta = recentAvg - priorAvg;
  return Math.max(-1, Math.min(1, delta));
}

/**
 * Signal 3 — Commitment Health (-1 to +1)
 * >80% fulfilled = +1, 50-80% = 0, <50% = -1.
 * No commitments = neutral (0).
 */
function computeCommitmentHealth(dealCommitments: CommitmentEventRow[]): number {
  const made = dealCommitments.filter((e) => e.event_type === 'commitment_made').length;
  const fulfilled = dealCommitments.filter((e) => e.event_type === 'commitment_fulfilled').length;

  if (made === 0) return 0; // no commitments, neutral

  const ratio = fulfilled / made;
  if (ratio > 0.8) return 1;
  if (ratio >= 0.5) return 0;
  return -1;
}

/**
 * Signal 4 — Recency (-1 to +1)
 * Days since last meeting: <7 = +1, 7-14 = 0, 14-30 = -0.5, >30 = -1.
 */
function computeRecency(companyMeetings: MeetingRow[]): number {
  if (companyMeetings.length === 0) return -1; // no meetings at all

  // Find most recent meeting
  let latestTs = 0;
  for (const m of companyMeetings) {
    const ts = new Date(m.meeting_start).getTime();
    if (ts > latestTs) latestTs = ts;
  }

  const daysSince = (Date.now() - latestTs) / (24 * 60 * 60 * 1000);
  if (daysSince < 7) return 1;
  if (daysSince <= 14) return 0;
  if (daysSince <= 30) return -0.5;
  return -1;
}

/**
 * Derive momentum status label from score.
 */
function momentumStatus(score: number): MomentumStatus {
  if (score > 0.3) return 'accelerating';
  if (score >= -0.3) return 'steady';
  if (score >= -0.6) return 'decelerating';
  return 'stalled';
}

// ============================================================================
// Hook
// ============================================================================

export function useDealMomentum() {
  const activeOrgId = useOrgStore((s) => s.activeOrgId);

  return useQuery<DealMomentum[]>({
    queryKey: [DEAL_MOMENTUM_KEY, activeOrgId],
    queryFn: async (): Promise<DealMomentum[]> => {
      if (!activeOrgId) return [];

      // 1. Active deals for this org
      const { data: deals, error: dealsError } = await supabase
        .from('deals')
        .select('id, name, company, company_id, primary_contact_id')
        .eq('clerk_org_id', activeOrgId)
        .eq('status', 'active');

      if (dealsError) throw dealsError;

      const typedDeals = (deals ?? []) as DealRow[];
      if (typedDeals.length === 0) return [];

      // 2. Meetings in last 28 days for the org
      const twentyEightDaysAgo = new Date(
        Date.now() - 28 * 24 * 60 * 60 * 1000
      ).toISOString();

      const { data: meetings, error: meetingsError } = await supabase
        .from('meetings')
        .select('id, meeting_start, sentiment_score, company_id')
        .eq('org_id', activeOrgId)
        .gte('meeting_start', twentyEightDaysAgo)
        .order('meeting_start', { ascending: false });

      if (meetingsError) throw meetingsError;

      const typedMeetings = (meetings ?? []) as MeetingRow[];

      // 3. Commitment events for these deals
      const dealIds = typedDeals.map((d) => d.id);

      const { data: commitmentEvents, error: commitmentsError } = await supabase
        .from('deal_memory_events')
        .select('deal_id, event_type')
        .eq('org_id', activeOrgId)
        .eq('event_category', 'commitment')
        .eq('is_active', true)
        .in('deal_id', dealIds);

      if (commitmentsError) throw commitmentsError;

      const typedCommitments = (commitmentEvents ?? []) as CommitmentEventRow[];

      // 4. Contact memory for contacts linked to deals
      const contactIds = typedDeals
        .map((d) => d.primary_contact_id)
        .filter((id): id is string => id !== null);

      let contactMemoryMap = new Map<string, string | null>();

      if (contactIds.length > 0) {
        const { data: contactMemory, error: contactMemoryError } = await supabase
          .from('contact_memory')
          .select('contact_id, last_interaction_at')
          .eq('org_id', activeOrgId)
          .in('contact_id', contactIds);

        if (!contactMemoryError && contactMemory) {
          for (const cm of contactMemory as ContactMemoryRow[]) {
            contactMemoryMap.set(cm.contact_id, cm.last_interaction_at);
          }
        }
      }

      // 5. Group meetings by company_id
      const meetingsByCompanyId = new Map<string, MeetingRow[]>();
      for (const m of typedMeetings) {
        if (!m.company_id) continue;
        const existing = meetingsByCompanyId.get(m.company_id) ?? [];
        existing.push(m);
        meetingsByCompanyId.set(m.company_id, existing);
      }

      // Group commitments by deal_id
      const commitmentsByDealId = new Map<string, CommitmentEventRow[]>();
      for (const c of typedCommitments) {
        const existing = commitmentsByDealId.get(c.deal_id) ?? [];
        existing.push(c);
        commitmentsByDealId.set(c.deal_id, existing);
      }

      // 6. Compute momentum per deal
      const results: DealMomentum[] = [];

      for (const deal of typedDeals) {
        const companyMeetings = deal.company_id
          ? meetingsByCompanyId.get(deal.company_id) ?? []
          : [];
        const dealCommitments = commitmentsByDealId.get(deal.id) ?? [];

        const meetingFrequency = computeMeetingFrequency(companyMeetings);
        const sentimentTrajectory = computeSentimentTrajectory(companyMeetings);
        const commitmentHealth = computeCommitmentHealth(dealCommitments);
        const recency = computeRecency(companyMeetings);

        // Weighted average
        const momentum =
          meetingFrequency * 0.3 +
          sentimentTrajectory * 0.3 +
          commitmentHealth * 0.2 +
          recency * 0.2;

        // Round to 2 decimal places
        const roundedMomentum = Math.round(momentum * 100) / 100;

        results.push({
          dealId: deal.id,
          dealName: deal.name ?? 'Unnamed Deal',
          company: deal.company ?? 'Unknown Company',
          momentum: roundedMomentum,
          status: momentumStatus(roundedMomentum),
          signals: {
            meetingFrequency: Math.round(meetingFrequency * 100) / 100,
            sentimentTrajectory: Math.round(sentimentTrajectory * 100) / 100,
            commitmentHealth: Math.round(commitmentHealth * 100) / 100,
            recency: Math.round(recency * 100) / 100,
          },
        });
      }

      // Sort by momentum descending
      results.sort((a, b) => b.momentum - a.momentum);

      return results;
    },
    enabled: !!activeOrgId,
    staleTime: 5 * 60 * 1000, // 5 minutes
    gcTime: 10 * 60 * 1000,
  });
}
