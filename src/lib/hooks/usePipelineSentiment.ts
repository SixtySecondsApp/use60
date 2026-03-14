/**
 * usePipelineSentiment — Latest sentiment per deal across the pipeline
 *
 * Queries recent meetings (last 30 days) with sentiment scores and active deals,
 * then aggregates client-side: most recent sentiment per company, 7-day trend,
 * and count of deals trending negative.
 *
 * BA-009a
 */

import { useQuery } from '@tanstack/react-query';
import { supabase } from '@/lib/supabase/clientV2';
import { useOrgStore } from '@/lib/stores/orgStore';

// ============================================================================
// Types
// ============================================================================

export interface DealSentimentEntry {
  dealId: string;
  dealName: string;
  company: string;
  sentiment: number;
  trend: 'up' | 'down' | 'stable';
  lastMeetingDate: string;
}

export interface PipelineSentiment {
  overallAvg: number;
  trend: 'up' | 'down' | 'stable';
  trendDelta: number; // percentage change
  negativeDealCount: number;
  totalDealsWithSentiment: number;
  dealSentiments: DealSentimentEntry[];
}

// ============================================================================
// Cache key
// ============================================================================

export const PIPELINE_SENTIMENT_KEY = 'pipeline-sentiment' as const;

// ============================================================================
// Helpers
// ============================================================================

interface MeetingRow {
  id: string;
  title: string;
  sentiment_score: number;
  meeting_start: string;
  company_id: string | null;
}

interface DealRow {
  id: string;
  name: string;
  company: string | null;
}

/**
 * Compute the 7-day trend: compare avg sentiment of last 7 days vs prior 7 days.
 * Returns { direction, delta (percentage change) }.
 */
function compute7DayTrend(meetings: MeetingRow[]): { direction: 'up' | 'down' | 'stable'; delta: number } {
  const now = new Date();
  const sevenDaysAgo = new Date(now.getTime() - 7 * 24 * 60 * 60 * 1000);
  const fourteenDaysAgo = new Date(now.getTime() - 14 * 24 * 60 * 60 * 1000);

  const recent: number[] = [];
  const prior: number[] = [];

  for (const m of meetings) {
    const d = new Date(m.meeting_start);
    if (d >= sevenDaysAgo) {
      recent.push(m.sentiment_score);
    } else if (d >= fourteenDaysAgo) {
      prior.push(m.sentiment_score);
    }
  }

  const recentAvg = recent.length > 0 ? recent.reduce((a, b) => a + b, 0) / recent.length : null;
  const priorAvg = prior.length > 0 ? prior.reduce((a, b) => a + b, 0) / prior.length : null;

  if (recentAvg === null || priorAvg === null) {
    return { direction: 'stable', delta: 0 };
  }

  if (priorAvg === 0) {
    // Avoid division by zero
    return { direction: recentAvg > 0 ? 'up' : recentAvg < 0 ? 'down' : 'stable', delta: 0 };
  }

  const delta = ((recentAvg - priorAvg) / Math.abs(priorAvg)) * 100;
  const direction: 'up' | 'down' | 'stable' =
    delta > 5 ? 'up' : delta < -5 ? 'down' : 'stable';

  return { direction, delta: Math.round(delta * 10) / 10 };
}

/**
 * For a single company's meetings, determine trend by comparing the two most
 * recent meetings' sentiment scores.
 */
function companyTrend(companyMeetings: MeetingRow[]): 'up' | 'down' | 'stable' {
  if (companyMeetings.length < 2) return 'stable';
  // Meetings are already sorted desc by meeting_start
  const latest = companyMeetings[0].sentiment_score;
  const previous = companyMeetings[1].sentiment_score;
  const diff = latest - previous;
  if (diff > 0.05) return 'up';
  if (diff < -0.05) return 'down';
  return 'stable';
}

// ============================================================================
// Hook
// ============================================================================

export function usePipelineSentiment() {
  const activeOrgId = useOrgStore((s) => s.activeOrgId);

  return useQuery<PipelineSentiment>({
    queryKey: [PIPELINE_SENTIMENT_KEY, activeOrgId],
    queryFn: async (): Promise<PipelineSentiment> => {
      if (!activeOrgId) {
        return {
          overallAvg: 0,
          trend: 'stable',
          trendDelta: 0,
          negativeDealCount: 0,
          totalDealsWithSentiment: 0,
          dealSentiments: [],
        };
      }

      // 1. Fetch meetings with sentiment in last 30 days
      const thirtyDaysAgo = new Date(Date.now() - 30 * 24 * 60 * 60 * 1000).toISOString();

      const { data: meetings, error: meetingsError } = await supabase
        .from('meetings')
        .select('id, title, sentiment_score, meeting_start, company_id')
        .eq('org_id', activeOrgId)
        .not('sentiment_score', 'is', null)
        .gte('meeting_start', thirtyDaysAgo)
        .order('meeting_start', { ascending: false });

      if (meetingsError) throw meetingsError;

      // 2. Fetch active deals for this org
      const { data: deals, error: dealsError } = await supabase
        .from('deals')
        .select('id, name, company')
        .eq('clerk_org_id', activeOrgId)
        .eq('status', 'active');

      if (dealsError) throw dealsError;

      const typedMeetings = (meetings ?? []) as MeetingRow[];
      const typedDeals = (deals ?? []) as DealRow[];

      if (typedMeetings.length === 0 || typedDeals.length === 0) {
        return {
          overallAvg: 0,
          trend: 'stable',
          trendDelta: 0,
          negativeDealCount: 0,
          totalDealsWithSentiment: 0,
          dealSentiments: [],
        };
      }

      // 3. Group meetings by company_id
      const meetingsByCompany = new Map<string, MeetingRow[]>();
      for (const m of typedMeetings) {
        if (!m.company_id) continue;
        const existing = meetingsByCompany.get(m.company_id) ?? [];
        existing.push(m);
        meetingsByCompany.set(m.company_id, existing);
      }

      // 4. Build company name -> company_id lookup from meetings (for matching)
      //    and also a deal company name -> deal lookup
      //    Match deals to companies by company name (case-insensitive)
      const dealsByCompanyLower = new Map<string, DealRow[]>();
      for (const deal of typedDeals) {
        if (!deal.company) continue;
        const key = deal.company.toLowerCase().trim();
        const existing = dealsByCompanyLower.get(key) ?? [];
        existing.push(deal);
        dealsByCompanyLower.set(key, existing);
      }

      // We also need company_id -> company name mapping. Get unique company_ids
      // from meetings and fetch their names.
      const companyIds = [...meetingsByCompany.keys()];
      let companyNames = new Map<string, string>();

      if (companyIds.length > 0) {
        const { data: companies, error: companiesError } = await supabase
          .from('companies')
          .select('id, name')
          .in('id', companyIds);

        if (!companiesError && companies) {
          for (const c of companies) {
            companyNames.set(c.id, c.name);
          }
        }
      }

      // 5. For each company with meetings, get most recent sentiment and match to deals
      const dealSentiments: DealSentimentEntry[] = [];
      const matchedSentiments: number[] = [];

      for (const [companyId, companyMeetings] of meetingsByCompany) {
        const companyName = companyNames.get(companyId);
        if (!companyName) continue;

        // Most recent meeting (already sorted desc)
        const latestMeeting = companyMeetings[0];
        const latestSentiment = latestMeeting.sentiment_score;
        const trend = companyTrend(companyMeetings);

        // Find matching deals by company name
        const matchingDeals = dealsByCompanyLower.get(companyName.toLowerCase().trim()) ?? [];

        for (const deal of matchingDeals) {
          dealSentiments.push({
            dealId: deal.id,
            dealName: deal.name ?? 'Unnamed Deal',
            company: companyName,
            sentiment: latestSentiment,
            trend,
            lastMeetingDate: latestMeeting.meeting_start,
          });
          matchedSentiments.push(latestSentiment);
        }
      }

      // 6. Calculate overall avg sentiment
      const overallAvg =
        matchedSentiments.length > 0
          ? Math.round((matchedSentiments.reduce((a, b) => a + b, 0) / matchedSentiments.length) * 100) / 100
          : 0;

      // 7. Calculate 7-day trend
      const { direction: trendDirection, delta: trendDelta } = compute7DayTrend(typedMeetings);

      // 8. Count deals trending negative (sentiment < 0.5)
      const negativeDealCount = dealSentiments.filter((d) => d.sentiment < 0.5).length;

      return {
        overallAvg,
        trend: trendDirection,
        trendDelta,
        negativeDealCount,
        totalDealsWithSentiment: dealSentiments.length,
        dealSentiments,
      };
    },
    enabled: !!activeOrgId,
    staleTime: 5 * 60 * 1000, // 5 minutes
    gcTime: 10 * 60 * 1000,
  });
}
