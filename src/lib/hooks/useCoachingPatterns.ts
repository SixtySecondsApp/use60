/**
 * useCoachingPatterns — Aggregate talk time vs sentiment for coaching insights.
 *
 * BA-008a: Queries meetings with talk_time_rep_pct and sentiment_score,
 * buckets by talk time range, computes avg sentiment per bucket, and
 * extracts top coaching patterns from coach_summary JSON.
 */

import { useQuery } from '@tanstack/react-query';
import { supabase } from '@/lib/supabase/clientV2';
import { useOrgStore } from '@/lib/stores/orgStore';

// ============================================================================
// Types
// ============================================================================

export interface ScatterPoint {
  talkTime: number;
  sentiment: number;
  title: string;
  date: string;
}

export interface TalkTimeBucket {
  label: string;
  avgSentiment: number;
  count: number;
}

export interface PatternFrequency {
  pattern: string;
  count: number;
}

export interface CoachingPatterns {
  scatterData: ScatterPoint[];
  buckets: TalkTimeBucket[];
  topStrengths: PatternFrequency[];
  topImprovements: PatternFrequency[];
  totalMeetings: number;
}

// ============================================================================
// Helpers
// ============================================================================

/**
 * Parse coach_summary which may be a JSON string with { strengths, improvements }
 * or a plain text string. Returns extracted arrays or empty arrays on failure.
 */
function parseCoachSummary(raw: string | null): {
  strengths: string[];
  improvements: string[];
} {
  if (!raw) return { strengths: [], improvements: [] };

  try {
    const parsed = JSON.parse(raw);
    if (typeof parsed !== 'object' || parsed === null) {
      return { strengths: [], improvements: [] };
    }

    const strengths = Array.isArray(parsed.strengths) ? parsed.strengths : [];
    const improvements = Array.isArray(parsed.improvements)
      ? parsed.improvements
      : Array.isArray(parsed.areas_for_improvement)
        ? parsed.areas_for_improvement
        : [];

    return {
      strengths: strengths.filter((s: unknown): s is string => typeof s === 'string'),
      improvements: improvements.filter((s: unknown): s is string => typeof s === 'string'),
    };
  } catch {
    // Not valid JSON — plain text summary, nothing to extract
    return { strengths: [], improvements: [] };
  }
}

/**
 * Count pattern frequencies and return the top N.
 */
function topPatterns(items: string[], n: number): PatternFrequency[] {
  const freq = new Map<string, number>();
  for (const item of items) {
    const normalized = item.trim();
    if (!normalized) continue;
    freq.set(normalized, (freq.get(normalized) || 0) + 1);
  }

  return Array.from(freq.entries())
    .map(([pattern, count]) => ({ pattern, count }))
    .sort((a, b) => b.count - a.count)
    .slice(0, n);
}

/**
 * Determine the talk-time bucket label for a given rep talk-time percentage.
 */
function getBucketLabel(talkTimePct: number): string {
  if (talkTimePct < 45) return '<45%';
  if (talkTimePct <= 55) return '45-55%';
  return '>55%';
}

// ============================================================================
// Query key
// ============================================================================

export const COACHING_PATTERNS_KEY = {
  all: ['coaching-patterns'] as const,
  byOrg: (orgId: string | null) => ['coaching-patterns', orgId] as const,
};

// ============================================================================
// Hook
// ============================================================================

export function useCoachingPatterns() {
  const orgId = useOrgStore((s) => s.activeOrgId);

  return useQuery<CoachingPatterns>({
    queryKey: COACHING_PATTERNS_KEY.byOrg(orgId),
    queryFn: async (): Promise<CoachingPatterns> => {
      if (!orgId) {
        return {
          scatterData: [],
          buckets: [],
          topStrengths: [],
          topImprovements: [],
          totalMeetings: 0,
        };
      }

      const { data, error } = await supabase
        .from('meetings')
        .select('id, title, talk_time_rep_pct, sentiment_score, coach_summary, meeting_start, primary_contact_id')
        .eq('org_id', orgId)
        .not('talk_time_rep_pct', 'is', null)
        .not('sentiment_score', 'is', null)
        .order('meeting_start', { ascending: false })
        .limit(200);

      if (error) throw error;

      const meetings = data ?? [];

      // -- Scatter data --
      const scatterData: ScatterPoint[] = meetings.map((m) => ({
        talkTime: m.talk_time_rep_pct!,
        sentiment: m.sentiment_score!,
        title: m.title ?? 'Untitled Meeting',
        date: m.meeting_start ?? '',
      }));

      // -- Talk time buckets --
      const bucketMap = new Map<string, { totalSentiment: number; count: number }>();
      // Initialise in display order
      for (const label of ['<45%', '45-55%', '>55%']) {
        bucketMap.set(label, { totalSentiment: 0, count: 0 });
      }

      for (const m of meetings) {
        const label = getBucketLabel(m.talk_time_rep_pct!);
        const bucket = bucketMap.get(label)!;
        bucket.totalSentiment += m.sentiment_score!;
        bucket.count += 1;
      }

      const buckets: TalkTimeBucket[] = Array.from(bucketMap.entries()).map(
        ([label, { totalSentiment, count }]) => ({
          label,
          avgSentiment: count > 0 ? totalSentiment / count : 0,
          count,
        }),
      );

      // -- Coaching pattern extraction --
      const allStrengths: string[] = [];
      const allImprovements: string[] = [];

      for (const m of meetings) {
        const { strengths, improvements } = parseCoachSummary(m.coach_summary);
        allStrengths.push(...strengths);
        allImprovements.push(...improvements);
      }

      return {
        scatterData,
        buckets,
        topStrengths: topPatterns(allStrengths, 3),
        topImprovements: topPatterns(allImprovements, 3),
        totalMeetings: meetings.length,
      };
    },
    enabled: !!orgId,
    staleTime: 5 * 60 * 1000, // 5 minutes
    gcTime: 10 * 60 * 1000,
  });
}
