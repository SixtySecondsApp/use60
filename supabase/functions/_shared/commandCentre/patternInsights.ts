/**
 * Pattern Insights CC Writer (US-032)
 *
 * Shared helper for pipeline-patterns and engagement-patterns agents to
 * surface detected patterns as Command Centre insight items.
 *
 * Rate limited: max 2 pattern insights per user per 7 days.
 */

import { createClient } from 'https://esm.sh/@supabase/supabase-js@2.43.4';
import { writeToCommandCentre } from './writeAdapter.ts';
import type { SourceAgent } from './types.ts';

const SUPABASE_URL = Deno.env.get('SUPABASE_URL')!;
const SUPABASE_SERVICE_ROLE_KEY = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;

const MAX_INSIGHTS_PER_WEEK = 2;

interface PatternInsight {
  title: string;
  description: string;
  evidence: Record<string, unknown>;
  suggested_action?: string;
  confidence: number;
  severity: 'info' | 'warning' | 'critical';
  affected_deal_ids?: string[];
}

/**
 * Write pattern insights to the Command Centre as CC items.
 *
 * Checks the rate limit (max 2 per user per 7 days) before writing.
 * Errors are logged but never thrown — CC failures must not break the
 * calling agent's primary flow.
 *
 * @param orgId      Organization ID
 * @param sourceAgent  'pipeline-patterns' or 'engagement-patterns'
 * @param patterns   Array of detected patterns to potentially surface
 * @returns Number of insights actually written
 */
export async function writePatternInsightsToCC(
  orgId: string,
  sourceAgent: SourceAgent,
  patterns: PatternInsight[],
): Promise<number> {
  if (!patterns || patterns.length === 0) return 0;

  try {
    const supabase = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY, {
      auth: { persistSession: false, autoRefreshToken: false },
    });

    // Get all users in the org to write insights per user
    const { data: members } = await supabase
      .from('organization_memberships')
      .select('user_id')
      .eq('org_id', orgId);

    if (!members || members.length === 0) {
      console.log(`[patternInsights] No members found for org ${orgId}`);
      return 0;
    }

    let totalWritten = 0;

    for (const member of members) {
      const userId = member.user_id;

      // Rate limit check: max 2 pattern insights per user per 7 days
      const sevenDaysAgo = new Date(Date.now() - 7 * 24 * 60 * 60 * 1000).toISOString();

      const { count: recentInsightCount } = await supabase
        .from('command_centre_items')
        .select('id', { count: 'exact', head: true })
        .eq('user_id', userId)
        .eq('item_type', 'insight')
        .in('source_agent', ['pipeline-patterns', 'engagement-patterns'])
        .gte('created_at', sevenDaysAgo);

      const remaining = MAX_INSIGHTS_PER_WEEK - (recentInsightCount || 0);
      if (remaining <= 0) {
        console.log(`[patternInsights] Rate limit reached for user ${userId} (${recentInsightCount}/${MAX_INSIGHTS_PER_WEEK} this week)`);
        continue;
      }

      // Pick the top patterns by severity and confidence
      const sorted = [...patterns].sort((a, b) => {
        const severityOrder = { critical: 3, warning: 2, info: 1 };
        const aDelta = severityOrder[a.severity] * a.confidence;
        const bDelta = severityOrder[b.severity] * b.confidence;
        return bDelta - aDelta;
      });

      const toWrite = sorted.slice(0, remaining);

      for (const pattern of toWrite) {
        const itemId = await writeToCommandCentre({
          org_id: orgId,
          user_id: userId,
          source_agent: sourceAgent,
          item_type: 'insight',
          title: pattern.title,
          summary: pattern.description,
          context: {
            evidence: pattern.evidence,
            suggested_action: pattern.suggested_action,
            confidence: pattern.confidence,
            severity: pattern.severity,
            affected_deal_ids: pattern.affected_deal_ids,
          },
          urgency: 'normal',
        });

        if (itemId) {
          totalWritten++;
          console.log(`[patternInsights] Wrote insight "${pattern.title}" for user ${userId} (item ${itemId})`);
        }
      }
    }

    return totalWritten;
  } catch (err) {
    console.error('[patternInsights] Error writing pattern insights to CC:', err);
    return 0;
  }
}
