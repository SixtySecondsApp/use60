/**
 * useDealCoachingSignals — Live Deal Coaching Signals
 *
 * Surfaces real-time coaching moments tied to active deals that are stalling.
 * For each stalled deal, cross-references the deal owner's weakest coaching
 * skill to generate actionable coaching suggestions.
 */

import { useQuery } from '@tanstack/react-query';
import { supabase } from '@/lib/supabase/clientV2';

// ============================================================================
// Types
// ============================================================================

export interface DealCoachingSignal {
  deal: {
    id: string;
    name: string;
    company: string;
    value: number;
    stage_name: string;
    stage_id: string;
    owner_id: string;
    owner_name: string;
  };
  stallDays: number;
  avgDays: number;
  repWeakSkill: {
    name: string;
    score: number;
    label: string;
  } | null;
  suggestion: string;
  severity: 'amber' | 'red';
}

interface RawDeal {
  id: string;
  name: string;
  company: string;
  value: number;
  stage_id: string;
  owner_id: string;
  status: string;
  stage_changed_at: string;
  deal_stages: {
    id: string;
    name: string;
  } | null;
}

interface SkillRow {
  user_id: string;
  talk_ratio: number | null;
  question_quality_score: number | null;
  objection_handling_score: number | null;
  discovery_depth_score: number | null;
  overall_score: number | null;
}

interface ProfileRow {
  id: string;
  first_name: string | null;
  last_name: string | null;
}

// ============================================================================
// Skill metadata
// ============================================================================

const SKILL_FIELDS: {
  key: keyof Pick<SkillRow, 'talk_ratio' | 'question_quality_score' | 'objection_handling_score' | 'discovery_depth_score'>;
  label: string;
}[] = [
  { key: 'question_quality_score', label: 'Question Quality' },
  { key: 'objection_handling_score', label: 'Objection Handling' },
  { key: 'discovery_depth_score', label: 'Discovery Depth' },
  { key: 'talk_ratio', label: 'Talk Ratio' },
];

// ============================================================================
// Suggestion generator
// ============================================================================

function generateSuggestion(
  skillLabel: string | null,
  stageName: string,
  stallDays: number
): string {
  if (!skillLabel) {
    return `Deal stalled at ${stageName} for ${stallDays} days. Review deal progress with the rep.`;
  }

  const stageLC = stageName.toLowerCase();
  const skillLC = skillLabel.toLowerCase();

  // Stage + skill specific suggestions
  if (skillLC.includes('objection') && (stageLC.includes('proposal') || stageLC.includes('negotiat'))) {
    return `Consider reviewing objection handling techniques — deal stalled at ${stageName} may indicate unresolved buyer concerns.`;
  }
  if (skillLC.includes('discovery') && (stageLC.includes('qualif') || stageLC.includes('discovery') || stageLC.includes('lead'))) {
    return `Discovery depth is low — the deal may lack the depth of qualification needed to advance from ${stageName}.`;
  }
  if (skillLC.includes('question') && (stageLC.includes('qualif') || stageLC.includes('discovery'))) {
    return `Question quality needs work — stronger qualifying questions could help move this deal past ${stageName}.`;
  }
  if (skillLC.includes('talk ratio')) {
    return `Talk ratio is high — the rep may be dominating conversations instead of listening. Coach on active listening to unstick the deal at ${stageName}.`;
  }

  // Generic fallback
  return `${skillLabel} is the weakest skill area — consider targeted coaching to help move this deal past ${stageName}.`;
}

// ============================================================================
// Hook
// ============================================================================

export function useDealCoachingSignals(orgId: string | null) {
  return useQuery<DealCoachingSignal[]>({
    queryKey: ['deal-coaching-signals', orgId],
    queryFn: async () => {
      if (!orgId) return [];

      // 1. Fetch all active deals for the org with their stage info
      const { data: deals, error: dealsError } = await supabase
        .from('deals')
        .select('id, name, company, value, stage_id, owner_id, status, stage_changed_at, deal_stages:stage_id(id, name)')
        .eq('clerk_org_id', orgId)
        .eq('status', 'active')
        .not('stage_changed_at', 'is', null);

      if (dealsError) throw dealsError;
      if (!deals || deals.length === 0) return [];

      const typedDeals = deals as unknown as RawDeal[];

      // 2. Calculate days in current stage for each deal
      const now = Date.now();
      const dealsWithDays = typedDeals.map((d) => ({
        ...d,
        daysInStage: Math.floor((now - new Date(d.stage_changed_at).getTime()) / (1000 * 60 * 60 * 24)),
      }));

      // 3. Calculate average days per stage across all org deals
      const stageGroups: Record<string, number[]> = {};
      for (const d of dealsWithDays) {
        const stageId = d.stage_id;
        if (!stageGroups[stageId]) stageGroups[stageId] = [];
        stageGroups[stageId].push(d.daysInStage);
      }

      const stageAvgDays: Record<string, number> = {};
      for (const [stageId, days] of Object.entries(stageGroups)) {
        stageAvgDays[stageId] = days.reduce((s, v) => s + v, 0) / days.length;
      }

      // 4. Find deals stalled > 2x the average for their stage
      const stalledDeals = dealsWithDays
        .filter((d) => {
          const avg = stageAvgDays[d.stage_id] || 0;
          return avg > 0 && d.daysInStage > avg * 2;
        })
        .sort((a, b) => {
          // Sort by severity: how many multiples of avg
          const aRatio = stageAvgDays[a.stage_id] ? a.daysInStage / stageAvgDays[a.stage_id] : 0;
          const bRatio = stageAvgDays[b.stage_id] ? b.daysInStage / stageAvgDays[b.stage_id] : 0;
          return bRatio - aRatio;
        })
        .slice(0, 5);

      if (stalledDeals.length === 0) return [];

      // 5. Get unique owner IDs for profile lookup and skill lookup
      const ownerIds = [...new Set(stalledDeals.map((d) => d.owner_id))];

      // 6. Fetch profiles for rep names
      const { data: profiles } = await supabase
        .from('profiles')
        .select('id, first_name, last_name')
        .in('id', ownerIds);

      const profileMap: Record<string, string> = {};
      if (profiles) {
        for (const p of profiles as ProfileRow[]) {
          const name = [p.first_name, p.last_name].filter(Boolean).join(' ') || 'Unknown Rep';
          profileMap[p.id] = name;
        }
      }

      // 7. Fetch latest coaching skill progression for each owner
      //    Get the most recent week's data per user
      const { data: skillRows } = await supabase
        .from('coaching_skill_progression')
        .select('user_id, talk_ratio, question_quality_score, objection_handling_score, discovery_depth_score, overall_score')
        .eq('org_id', orgId)
        .in('user_id', ownerIds)
        .order('week_start', { ascending: false });

      // Take only the latest entry per user
      const latestSkills: Record<string, SkillRow> = {};
      if (skillRows) {
        for (const row of skillRows as SkillRow[]) {
          if (!latestSkills[row.user_id]) {
            latestSkills[row.user_id] = row;
          }
        }
      }

      // 8. Build signal objects
      const signals: DealCoachingSignal[] = stalledDeals.map((d) => {
        const avgDays = Math.round(stageAvgDays[d.stage_id] || 0);
        const ratio = avgDays > 0 ? d.daysInStage / avgDays : 0;
        const severity: 'amber' | 'red' = ratio > 3 ? 'red' : 'amber';
        const stageName = d.deal_stages?.name || 'Unknown Stage';

        // Find weakest skill for the rep
        let repWeakSkill: DealCoachingSignal['repWeakSkill'] = null;
        const skills = latestSkills[d.owner_id];
        if (skills) {
          let weakest: { key: string; score: number; label: string } | null = null;
          for (const sf of SKILL_FIELDS) {
            const score = skills[sf.key];
            if (score != null && (weakest === null || score < weakest.score)) {
              weakest = { key: sf.key, score: Number(score), label: sf.label };
            }
          }
          if (weakest) {
            repWeakSkill = { name: weakest.key, score: weakest.score, label: weakest.label };
          }
        }

        const suggestion = generateSuggestion(
          repWeakSkill?.label ?? null,
          stageName,
          d.daysInStage
        );

        return {
          deal: {
            id: d.id,
            name: d.name,
            company: d.company,
            value: d.value,
            stage_name: stageName,
            stage_id: d.stage_id,
            owner_id: d.owner_id,
            owner_name: profileMap[d.owner_id] || 'Unknown Rep',
          },
          stallDays: d.daysInStage,
          avgDays,
          repWeakSkill,
          suggestion,
          severity,
        };
      });

      return signals;
    },
    enabled: !!orgId,
    staleTime: 10 * 60 * 1000,
  });
}
