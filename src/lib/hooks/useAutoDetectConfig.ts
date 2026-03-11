/**
 * useAutoDetectConfig — Learn from Behaviour
 *
 * Runs once per session in the background to detect user behaviour
 * patterns and suggest answers to unanswered config questions.
 *
 * Analyses:
 * - Average follow-up time (from activities table — email/outbound type)
 * - Meeting frequency (from meetings table)
 * - Deal stage progression speed (from deals table)
 *
 * Returns an array of AutoDetectedSuggestion objects that the
 * ContextualQuestionToast can surface with a pre-filled answer.
 */

import { useRef } from 'react';
import { useQuery } from '@tanstack/react-query';
import { useAuth } from '@/lib/contexts/AuthContext';
import { useOrg } from '@/lib/contexts/OrgContext';
import { supabase } from '@/lib/supabase/clientV2';
import type { ConfigQuestion } from '@/lib/services/configQuestionService';
import type { AutoDetectedSuggestion } from './useContextualQuestions';

// ============================================================================
// Row mapper (same as configQuestionService)
// ============================================================================

function mapRow(row: Record<string, unknown>): ConfigQuestion {
  return {
    id: row.id as string,
    org_id: row.org_id as string,
    user_id: (row.user_id as string) ?? null,
    template_id: (row.template_id as string) ?? null,
    config_key: row.config_key as string,
    category: row.category as ConfigQuestion['category'],
    question: row.question_text as string,
    question_text: row.question_text as string,
    scope: row.scope as 'org' | 'user',
    options: row.options as ConfigQuestion['options'],
    priority: row.priority as number,
    status: row.status as ConfigQuestion['status'],
    answer_value: row.answer_value ?? null,
    answered_at: (row.answered_at as string) ?? null,
    created_at: row.created_at as string,
  };
}

// ============================================================================
// Pattern detection helpers
// ============================================================================

interface DetectedPattern {
  configKey: string;
  detectedValue: unknown;
  description: string;
  confidence: number; // 0-1
}

/**
 * Detect average email follow-up time from activities.
 * Looks at outbound activities to find typical response time.
 */
async function detectFollowUpPattern(
  userId: string
): Promise<DetectedPattern | null> {
  // Fetch recent outbound activities with dates
  const thirtyDaysAgo = new Date();
  thirtyDaysAgo.setDate(thirtyDaysAgo.getDate() - 30);

  const { data: outbounds, error } = await supabase
    .from('activities')
    .select('id, date, created_at, type, deal_id')
    .eq('user_id', userId)
    .eq('type', 'outbound')
    .gte('date', thirtyDaysAgo.toISOString())
    .order('date', { ascending: true })
    .limit(50);

  if (error || !outbounds || outbounds.length < 3) return null;

  // Group by deal_id and calculate time between outbounds on the same deal
  const dealOutbounds: Record<string, Date[]> = {};
  for (const a of outbounds) {
    if (!a.deal_id) continue;
    if (!dealOutbounds[a.deal_id]) dealOutbounds[a.deal_id] = [];
    dealOutbounds[a.deal_id].push(new Date(a.date));
  }

  const gaps: number[] = [];
  for (const dates of Object.values(dealOutbounds)) {
    if (dates.length < 2) continue;
    dates.sort((a, b) => a.getTime() - b.getTime());
    for (let i = 1; i < dates.length; i++) {
      const hoursGap = (dates[i].getTime() - dates[i - 1].getTime()) / (1000 * 60 * 60);
      if (hoursGap > 0.5 && hoursGap < 168) { // between 30min and 7 days
        gaps.push(hoursGap);
      }
    }
  }

  if (gaps.length < 2) return null;

  const avgHours = gaps.reduce((a, b) => a + b, 0) / gaps.length;
  const confidence = Math.min(gaps.length / 10, 1); // more data = higher confidence

  let description: string;
  let detectedValue: string;

  if (avgHours < 4) {
    description = `You typically follow up within ${Math.round(avgHours)} hours. Set this as your preferred follow-up window?`;
    detectedValue = Math.round(avgHours).toString();
  } else if (avgHours < 24) {
    description = `You usually follow up within the same day (about ${Math.round(avgHours)} hours). Make this your default?`;
    detectedValue = Math.round(avgHours).toString();
  } else {
    const days = Math.round(avgHours / 24);
    description = `You typically follow up within ${days} day${days > 1 ? 's' : ''}. Set this as your default follow-up cadence?`;
    detectedValue = (days * 24).toString();
  }

  return {
    configKey: 'signals.reengagement_cooldown',
    detectedValue: { value: detectedValue },
    description,
    confidence,
  };
}

/**
 * Detect meeting frequency to suggest briefing detail level.
 */
async function detectMeetingPattern(
  userId: string
): Promise<DetectedPattern | null> {
  const thirtyDaysAgo = new Date();
  thirtyDaysAgo.setDate(thirtyDaysAgo.getDate() - 30);

  const { data: meetings, error } = await supabase
    .from('meetings')
    .select('id, start_time')
    .eq('owner_user_id', userId)
    .gte('start_time', thirtyDaysAgo.toISOString())
    .limit(100);

  if (error || !meetings) return null;

  const count = meetings.length;
  if (count < 2) return null;

  const meetingsPerWeek = Math.round((count / 30) * 7);
  const confidence = Math.min(count / 20, 1);

  if (meetingsPerWeek >= 10) {
    return {
      configKey: 'daily_rhythm.briefing_detail',
      detectedValue: { value: 'summary' },
      description: `You average ${meetingsPerWeek} meetings per week. A summary briefing format might save you time.`,
      confidence,
    };
  } else if (meetingsPerWeek >= 3) {
    return {
      configKey: 'agent.pre_meeting_lead_time',
      detectedValue: { value: '60' },
      description: `With ${meetingsPerWeek} meetings per week, 60-minute lead time for prep briefs could work well.`,
      confidence,
    };
  }

  return null;
}

/**
 * Detect deal stage progression speed to suggest pipeline coverage.
 */
async function detectDealPattern(
  orgId: string,
  userId: string
): Promise<DetectedPattern | null> {
  const ninetyDaysAgo = new Date();
  ninetyDaysAgo.setDate(ninetyDaysAgo.getDate() - 90);

  // Count deals closed in the last 90 days
  const { data: closedDeals, error } = await supabase
    .from('deals')
    .select('id, value, created_at')
    .eq('owner_id', userId)
    .eq('probability', 100)
    .gte('created_at', ninetyDaysAgo.toISOString())
    .limit(50);

  if (error || !closedDeals) return null;

  const closedCount = closedDeals.length;
  if (closedCount < 2) return null;

  // Count total open deals
  const { count: openCount, error: openErr } = await supabase
    .from('deals')
    .select('id', { count: 'exact', head: true })
    .eq('owner_id', userId)
    .neq('probability', 100)
    .eq('status', 'active');

  if (openErr || openCount === null) return null;

  // Calculate implied coverage ratio
  const totalPipeline = openCount + closedCount;
  const impliedRatio = totalPipeline > 0 ? Math.round(totalPipeline / Math.max(closedCount, 1)) : 3;
  const confidence = Math.min(closedCount / 5, 1);

  if (impliedRatio >= 2 && impliedRatio <= 5) {
    const nearestOption = [2, 3, 4, 5].reduce((prev, curr) =>
      Math.abs(curr - impliedRatio) < Math.abs(prev - impliedRatio) ? curr : prev
    );

    return {
      configKey: 'pipeline.targets.coverage_ratio',
      detectedValue: { value: String(nearestOption) },
      description: `Based on your close rate, a ${nearestOption}x pipeline coverage ratio matches your pattern.`,
      confidence,
    };
  }

  return null;
}

// ============================================================================
// Hook
// ============================================================================

export function useAutoDetectConfig(): AutoDetectedSuggestion[] {
  const { user } = useAuth();
  const { activeOrgId } = useOrg();
  const hasRunRef = useRef(false);

  const { data: suggestions = [] } = useQuery<AutoDetectedSuggestion[]>({
    queryKey: ['auto-detect-config', activeOrgId, user?.id],
    queryFn: async () => {
      if (!activeOrgId || !user?.id) return [];

      // Only run once per session
      if (hasRunRef.current) return [];
      hasRunRef.current = true;

      // Run pattern detection in parallel
      const [followUp, meeting, deal] = await Promise.all([
        detectFollowUpPattern(user.id).catch(() => null),
        detectMeetingPattern(user.id).catch(() => null),
        detectDealPattern(activeOrgId, user.id).catch(() => null),
      ]);

      const patterns = [followUp, meeting, deal].filter(
        (p): p is DetectedPattern => p !== null && p.confidence >= 0.3
      );

      if (patterns.length === 0) return [];

      // For each detected pattern, find the matching unanswered question
      const configKeys = patterns.map((p) => p.configKey);

      let query = supabase
        .from('agent_config_questions')
        .select(
          'id, org_id, user_id, template_id, config_key, question_text, category, scope, options, priority, status, answer_value, answered_at, created_at'
        )
        .eq('org_id', activeOrgId)
        .eq('status', 'pending')
        .in('config_key', configKeys);

      if (user.id) {
        query = query.or(`user_id.eq.${user.id},user_id.is.null`);
      }

      const { data: questions, error } = await query;
      if (error || !questions || questions.length === 0) return [];

      // Build a map from config_key to question
      const questionMap = new Map<string, ConfigQuestion>();
      for (const row of questions) {
        const q = mapRow(row as Record<string, unknown>);
        // Keep the first (highest priority) match per config_key
        if (!questionMap.has(q.config_key)) {
          questionMap.set(q.config_key, q);
        }
      }

      // Build suggestions
      const results: AutoDetectedSuggestion[] = [];
      for (const pattern of patterns) {
        const question = questionMap.get(pattern.configKey);
        if (!question) continue;

        results.push({
          questionId: question.id,
          question,
          detectedValue: pattern.detectedValue,
          description: pattern.description,
          confidence: pattern.confidence,
        });
      }

      // Sort by confidence DESC
      results.sort((a, b) => b.confidence - a.confidence);

      return results;
    },
    enabled: !!activeOrgId && !!user?.id,
    staleTime: 30 * 60 * 1000, // 30 minutes
    refetchOnWindowFocus: false,
    refetchOnMount: false,
  });

  return suggestions;
}

export default useAutoDetectConfig;
