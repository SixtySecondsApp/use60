/**
 * OrgLearningInsightsPanel — COACH-UI-005
 *
 * Cards for each insight type from org_learning_insights.
 * Types: winning_talk_track, objection_handling, optimal_cadence, competitive_positioning,
 *        stage_best_practice, discovery_pattern
 */

import React from 'react';
import {
  Loader2,
  Lightbulb,
  MessageSquare,
  Clock,
  Swords,
  Layers,
  Search,
} from 'lucide-react';
import { formatDistanceToNow } from 'date-fns';
import { cn } from '@/lib/utils';
import { useOrgLearningInsights, type OrgLearningInsight } from '@/lib/services/coachingDashboardService';

const INSIGHT_CONFIG: Record<
  OrgLearningInsight['insight_type'],
  { label: string; Icon: React.ComponentType<{ className?: string }>; colour: string }
> = {
  winning_talk_track: {
    label: 'Winning Talk Track',
    Icon: MessageSquare,
    colour: 'text-indigo-400 bg-indigo-500/10 border-indigo-500/20',
  },
  objection_handling: {
    label: 'Objection Handling',
    Icon: Swords,
    colour: 'text-amber-400 bg-amber-500/10 border-amber-500/20',
  },
  optimal_cadence: {
    label: 'Optimal Cadence',
    Icon: Clock,
    colour: 'text-blue-400 bg-blue-500/10 border-blue-500/20',
  },
  competitive_positioning: {
    label: 'Competitive Positioning',
    Icon: Lightbulb,
    colour: 'text-red-400 bg-red-500/10 border-red-500/20',
  },
  stage_best_practice: {
    label: 'Stage Best Practice',
    Icon: Layers,
    colour: 'text-emerald-400 bg-emerald-500/10 border-emerald-500/20',
  },
  discovery_pattern: {
    label: 'Discovery Pattern',
    Icon: Search,
    colour: 'text-purple-400 bg-purple-500/10 border-purple-500/20',
  },
};

function InsightCard({ insight }: { insight: OrgLearningInsight }) {
  const config = INSIGHT_CONFIG[insight.insight_type] ?? {
    label: insight.insight_type,
    Icon: Lightbulb,
    colour: 'text-gray-400 bg-gray-500/10 border-gray-500/20',
  };
  const { Icon } = config;

  const confidencePct = Math.round((insight.confidence_score ?? 0) * 100);

  return (
    <div className="rounded-xl border border-gray-200 dark:border-gray-800 bg-white dark:bg-gray-900/50 p-4 space-y-3">
      {/* Type badge + icon */}
      <div className="flex items-start gap-3">
        <div className={cn('p-2 rounded-lg border flex-shrink-0', config.colour.split(' ').slice(1).join(' '))}>
          <Icon className={cn('h-4 w-4', config.colour.split(' ')[0])} />
        </div>
        <div className="flex-1 min-w-0">
          <span className={cn('text-xs font-medium', config.colour.split(' ')[0])}>
            {config.label}
          </span>
          <h4 className="text-sm font-semibold text-gray-900 dark:text-gray-100 mt-0.5 leading-snug">
            {insight.title}
          </h4>
        </div>
      </div>

      {/* Insight text */}
      <p className="text-sm text-gray-600 dark:text-gray-400 leading-relaxed">{insight.insight_text}</p>

      {/* Footer: evidence + confidence + updated */}
      <div className="flex items-center gap-3 text-xs text-gray-500 dark:text-gray-600">
        <span>{insight.evidence_count} evidence point{insight.evidence_count !== 1 ? 's' : ''}</span>
        <span>·</span>
        <span>{confidencePct}% confidence</span>
        <span>·</span>
        <span>{formatDistanceToNow(new Date(insight.updated_at), { addSuffix: true })}</span>
      </div>
    </div>
  );
}

interface OrgLearningInsightsPanelProps {
  orgId: string;
  className?: string;
}

export function OrgLearningInsightsPanel({ orgId, className }: OrgLearningInsightsPanelProps) {
  const { data: insights, isLoading, error } = useOrgLearningInsights(orgId);

  if (isLoading) {
    return (
      <div className={cn('flex items-center justify-center h-40', className)}>
        <Loader2 className="h-5 w-5 animate-spin text-gray-500" />
      </div>
    );
  }

  if (error) {
    return (
      <div className={cn('flex items-center justify-center h-40 text-red-400 text-sm', className)}>
        Failed to load insights
      </div>
    );
  }

  if (!insights || insights.length === 0) {
    return (
      <div className={cn('flex flex-col items-center justify-center h-40 text-gray-600 gap-2', className)}>
        <Lightbulb className="h-6 w-6" />
        <p className="text-sm">No org insights yet</p>
        <p className="text-xs text-gray-700 text-center max-w-xs">
          Insights are generated automatically after coaching analyses accumulate.
        </p>
      </div>
    );
  }

  return (
    <div className={cn('grid gap-4 sm:grid-cols-2', className)}>
      {insights.map((insight) => (
        <InsightCard key={insight.id} insight={insight} />
      ))}
    </div>
  );
}
