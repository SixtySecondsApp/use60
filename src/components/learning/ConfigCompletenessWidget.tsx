/**
 * ConfigCompletenessWidget — LEARN-UI-001
 *
 * Compact version of ConfigCompletenessCard for dashboard and settings mounting.
 * Shows: tier badge, progress bar, percentage, category breakdown.
 * Tiers: functional → tuned → optimised → learning
 */

import React, { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import {
  Loader2,
  ChevronDown,
  ChevronUp,
  Brain,
  Target,
  Clock,
  Bot,
  BookOpen,
} from 'lucide-react';
import { cn } from '@/lib/utils';
import { useConfigCompleteness, type ConfigTier } from '@/lib/hooks/useConfigCompleteness';

// ============================================================================
// Config
// ============================================================================

const TIER_CONFIG: Record<
  ConfigTier,
  { label: string; badgeCls: string; barCls: string }
> = {
  functional: {
    label: 'Functional',
    badgeCls: 'bg-blue-500/15 text-blue-400 border-blue-500/30',
    barCls: 'bg-blue-500',
  },
  tuned: {
    label: 'Tuned',
    badgeCls: 'bg-violet-500/15 text-violet-400 border-violet-500/30',
    barCls: 'bg-violet-500',
  },
  optimised: {
    label: 'Optimised',
    badgeCls: 'bg-emerald-500/15 text-emerald-400 border-emerald-500/30',
    barCls: 'bg-emerald-500',
  },
  learning: {
    label: 'Learning',
    badgeCls: 'bg-amber-500/15 text-amber-400 border-amber-500/30',
    barCls: 'bg-amber-500',
  },
};

const CATEGORY_META: Record<string, { Icon: React.ComponentType<{ className?: string }>; label: string }> = {
  revenue_pipeline: { Icon: Target, label: 'Revenue & Pipeline' },
  daily_rhythm: { Icon: Clock, label: 'Daily Rhythm' },
  agent_behaviour: { Icon: Bot, label: 'Agent Behaviour' },
  methodology: { Icon: BookOpen, label: 'Methodology' },
};

// ============================================================================
// Props
// ============================================================================

interface ConfigCompletenessWidgetProps {
  orgId: string;
  userId?: string;
  /** Whether to show category breakdown toggle */
  showCategories?: boolean;
  /** Whether to show link to Teach 60 section */
  showCTA?: boolean;
  className?: string;
}

// ============================================================================
// Component
// ============================================================================

export function ConfigCompletenessWidget({
  orgId,
  userId,
  showCategories = true,
  showCTA = true,
  className,
}: ConfigCompletenessWidgetProps) {
  const navigate = useNavigate();
  const [expanded, setExpanded] = useState(false);
  const { data, isLoading, error } = useConfigCompleteness(orgId, userId);

  if (isLoading) {
    return (
      <div className={cn('flex items-center gap-2 py-3', className)}>
        <Loader2 className="h-4 w-4 animate-spin text-gray-500" />
        <span className="text-xs text-gray-500">Loading…</span>
      </div>
    );
  }

  if (error || !data) {
    return null;
  }

  const tierCfg = TIER_CONFIG[data.tier] ?? TIER_CONFIG.functional;
  const pct = Math.round(data.percentage);
  const categories = Object.entries(data.categories ?? {});

  return (
    <div className={cn('space-y-2', className)}>
      {/* Header: icon + tier badge + percentage */}
      <div className="flex items-center gap-2">
        <Brain className="h-3.5 w-3.5 text-gray-500 flex-shrink-0" />
        <span className="text-xs font-medium text-gray-400">Agent Config</span>
        <span
          className={cn(
            'text-[10px] font-semibold px-1.5 py-0.5 rounded-full border',
            tierCfg.badgeCls
          )}
        >
          {tierCfg.label}
        </span>
        <span className="ml-auto text-xs font-bold text-gray-300">{pct}%</span>
      </div>

      {/* Progress bar */}
      <div className="h-1.5 w-full rounded-full bg-gray-800 overflow-hidden">
        <div
          className={cn('h-full rounded-full transition-all duration-700', tierCfg.barCls)}
          style={{ width: `${Math.min(pct, 100)}%` }}
        />
      </div>

      {/* Summary */}
      <p className="text-[10px] text-gray-600">
        {data.answered_questions} of {data.total_questions} config items answered
      </p>

      {/* Category breakdown */}
      {showCategories && categories.length > 0 && (
        <>
          <button
            onClick={() => setExpanded((v) => !v)}
            className="flex items-center gap-1 text-[10px] text-gray-600 hover:text-gray-400 transition-colors"
          >
            {expanded ? <ChevronUp className="h-3 w-3" /> : <ChevronDown className="h-3 w-3" />}
            {expanded ? 'Hide' : 'Show'} breakdown
          </button>

          {expanded && (
            <div className="space-y-1.5 pt-1">
              {categories.map(([key, cat]) => {
                const meta = CATEGORY_META[key];
                const Icon = meta?.Icon ?? Brain;
                const label = meta?.label ?? key;
                return (
                  <div key={key} className="flex items-center gap-2">
                    <Icon className="h-3 w-3 text-gray-600 flex-shrink-0" />
                    <span className="text-[10px] text-gray-500 w-28 truncate">{label}</span>
                    <div className="flex-1 h-1 rounded-full bg-gray-800 overflow-hidden">
                      <div
                        className={cn('h-full rounded-full', tierCfg.barCls)}
                        style={{ width: `${Math.min(cat.percentage, 100)}%` }}
                      />
                    </div>
                    <span className="text-[10px] text-gray-600 w-8 text-right">
                      {cat.answered}/{cat.total}
                    </span>
                  </div>
                );
              })}
            </div>
          )}
        </>
      )}

      {/* CTA */}
      {showCTA && pct < 100 && (
        <button
          onClick={() => navigate('/settings/teach-sixty')}
          className="text-[10px] text-indigo-400 hover:text-indigo-300 transition-colors focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-indigo-500 rounded"
        >
          Answer pending questions
        </button>
      )}
    </div>
  );
}
