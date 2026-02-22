/**
 * ConfigCompletenessCard
 *
 * Displays the organization's configuration completeness as a tiered progress
 * indicator. Shows the overall tier, percentage filled, a summary line, and an
 * expandable per-category breakdown with mini progress bars.
 *
 * Tiers (lowest → highest):
 *   functional  – enough to run (blue)
 *   tuned       – personalised responses (violet)
 *   optimised   – high-quality AI output (emerald)
 *   learning    – continuous improvement (amber)
 */

import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import {
  ChevronDown,
  ChevronUp,
  Settings2,
  Target,
  Clock,
  Shield,
  Zap,
  AlertCircle,
  Loader2,
  ArrowRight,
} from 'lucide-react';
import { cn } from '@/lib/utils';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader } from '@/components/ui/card';
import { useConfigCompleteness, type ConfigTier } from '@/lib/hooks/useConfigCompleteness';

// ============================================================================
// Types
// ============================================================================

interface ConfigCompletenessCardProps {
  orgId: string;
  userId?: string;
}

// ============================================================================
// Constants
// ============================================================================

/** Visual tokens for each tier */
const TIER_CONFIG: Record<
  ConfigTier,
  {
    label: string;
    badgeCls: string;
    barCls: string;
    ringCls: string;
  }
> = {
  functional: {
    label: 'Functional',
    badgeCls:
      'bg-blue-500/15 text-blue-400 border-blue-500/30',
    barCls: 'bg-blue-500',
    ringCls: 'ring-blue-500/40',
  },
  tuned: {
    label: 'Tuned',
    badgeCls:
      'bg-violet-500/15 text-violet-400 border-violet-500/30',
    barCls: 'bg-violet-500',
    ringCls: 'ring-violet-500/40',
  },
  optimised: {
    label: 'Optimised',
    badgeCls:
      'bg-emerald-500/15 text-emerald-400 border-emerald-500/30',
    barCls: 'bg-emerald-500',
    ringCls: 'ring-emerald-500/40',
  },
  learning: {
    label: 'Learning',
    badgeCls:
      'bg-amber-500/15 text-amber-400 border-amber-500/30',
    barCls: 'bg-amber-500',
    ringCls: 'ring-amber-500/40',
  },
};

/**
 * Maps a category name to a Lucide icon and a settings path fragment.
 * Unknown categories fall back to Settings2 and the general ai-intelligence path.
 */
const CATEGORY_META: Record<
  string,
  { icon: React.ElementType; path: string }
> = {
  'Pipeline & Targets': { icon: Target, path: '/settings/pipeline' },
  'Daily Rhythm': { icon: Clock, path: '/settings/ai-intelligence' },
  'Security & Compliance': { icon: Shield, path: '/settings/security' },
  'AI & Automation': { icon: Zap, path: '/settings/ai-intelligence' },
};

const DEFAULT_CATEGORY_META = {
  icon: Settings2,
  path: '/settings/ai-intelligence',
};

// ============================================================================
// Helper: single-category row
// ============================================================================

interface CategoryRowProps {
  name: string;
  total: number;
  answered: number;
  percentage: number;
  barCls: string;
  onNavigate: (path: string) => void;
}

function CategoryRow({
  name,
  total,
  answered,
  percentage,
  barCls,
  onNavigate,
}: CategoryRowProps) {
  const meta = CATEGORY_META[name] ?? DEFAULT_CATEGORY_META;
  const Icon = meta.icon;
  const isComplete = answered >= total;

  return (
    <div className="group flex items-start gap-3 py-2.5">
      {/* Icon */}
      <div className="mt-0.5 flex-shrink-0 w-7 h-7 rounded-md bg-gray-800 flex items-center justify-center">
        <Icon className="h-3.5 w-3.5 text-gray-400" />
      </div>

      {/* Text + bar */}
      <div className="flex-1 min-w-0">
        <div className="flex items-center justify-between mb-1">
          <span className="text-sm text-gray-200 truncate">{name}</span>
          <span className="text-xs text-gray-500 ml-2 flex-shrink-0">
            {answered}/{total}
          </span>
        </div>
        {/* Mini progress track */}
        <div className="h-1.5 w-full rounded-full bg-gray-800 overflow-hidden">
          <div
            className={cn('h-full rounded-full transition-all duration-500', barCls)}
            style={{ width: `${Math.min(percentage, 100)}%` }}
          />
        </div>
      </div>

      {/* "Configure" link — only for incomplete categories */}
      {!isComplete && (
        <button
          onClick={() => onNavigate(meta.path)}
          className="mt-0.5 flex-shrink-0 opacity-0 group-hover:opacity-100 transition-opacity focus:opacity-100 rounded p-1 text-gray-500 hover:text-gray-300"
          aria-label={`Configure ${name}`}
        >
          <ArrowRight className="h-3.5 w-3.5" />
        </button>
      )}
    </div>
  );
}

// ============================================================================
// Main component
// ============================================================================

export function ConfigCompletenessCard({ orgId, userId }: ConfigCompletenessCardProps) {
  const navigate = useNavigate();
  const [expanded, setExpanded] = useState(false);

  const { data, isLoading, isError, error, refetch } = useConfigCompleteness(orgId, userId);

  // ---- Loading state -------------------------------------------------------
  if (isLoading) {
    return (
      <Card className="border border-gray-800 bg-gray-900/60">
        <CardContent className="flex items-center justify-center py-8 gap-2 text-gray-500">
          <Loader2 className="h-4 w-4 animate-spin" />
          <span className="text-sm">Loading configuration status…</span>
        </CardContent>
      </Card>
    );
  }

  // ---- Error state ---------------------------------------------------------
  if (isError || !data) {
    return (
      <Card className="border border-gray-800 bg-gray-900/60">
        <CardContent className="flex items-center gap-3 py-5">
          <AlertCircle className="h-4 w-4 text-red-400 flex-shrink-0" />
          <p className="text-sm text-gray-400">
            {isError
              ? `Could not load configuration status: ${(error as Error)?.message ?? 'Unknown error'}`
              : 'No configuration data available.'}
          </p>
          <Button
            variant="ghost"
            size="sm"
            className="ml-auto text-xs text-gray-500 hover:text-gray-300"
            onClick={() => refetch()}
          >
            Retry
          </Button>
        </CardContent>
      </Card>
    );
  }

  // ---- Derived values ------------------------------------------------------
  const tier = data.tier;
  const tierCfg = TIER_CONFIG[tier] ?? TIER_CONFIG.functional;
  const pct = Math.round(data.percentage);
  const categories = Object.entries(data.categories ?? {});

  return (
    <Card
      className={cn(
        'border bg-gray-900/60 transition-shadow',
        'border-gray-800',
      )}
    >
      {/* ------------------------------------------------------------------ */}
      {/* Header row                                                          */}
      {/* ------------------------------------------------------------------ */}
      <CardHeader className="pb-3 pt-4 px-5">
        <div className="flex items-center justify-between gap-3">
          {/* Title + tier badge */}
          <div className="flex items-center gap-2.5 min-w-0">
            <Settings2 className="h-4 w-4 text-gray-400 flex-shrink-0" />
            <span className="text-sm font-medium text-gray-100">
              Configuration Completeness
            </span>
            <Badge
              variant="outline"
              className={cn(
                'text-xs px-2 py-0 border font-medium capitalize',
                tierCfg.badgeCls,
              )}
            >
              {tierCfg.label}
            </Badge>
          </div>

          {/* Percentage label */}
          <span className="text-lg font-bold text-gray-100 flex-shrink-0">
            {pct}%
          </span>
        </div>
      </CardHeader>

      {/* ------------------------------------------------------------------ */}
      {/* Progress bar                                                        */}
      {/* ------------------------------------------------------------------ */}
      <CardContent className="px-5 pb-4 space-y-3">
        <div className="h-2 w-full rounded-full bg-gray-800 overflow-hidden">
          <div
            className={cn(
              'h-full rounded-full transition-all duration-700',
              tierCfg.barCls,
            )}
            style={{ width: `${Math.min(pct, 100)}%` }}
          />
        </div>

        {/* Summary line */}
        <div className="flex items-center justify-between text-xs text-gray-500">
          <span>
            {data.answered_questions} of {data.total_questions} configuration items set
          </span>
          {data.auto_detected_configs > 0 && (
            <span className="text-gray-600">
              {data.auto_detected_configs} auto-detected
            </span>
          )}
        </div>

        {/* ---------------------------------------------------------------- */}
        {/* Expandable category breakdown                                    */}
        {/* ---------------------------------------------------------------- */}
        {categories.length > 0 && (
          <>
            <button
              onClick={() => setExpanded((v) => !v)}
              className={cn(
                'w-full flex items-center justify-between',
                'rounded-md px-3 py-2 text-xs font-medium',
                'bg-gray-800/60 hover:bg-gray-800 transition-colors',
                'text-gray-400 hover:text-gray-300',
              )}
              aria-expanded={expanded}
            >
              <span>
                {expanded ? 'Hide' : 'Show'} category breakdown
              </span>
              {expanded ? (
                <ChevronUp className="h-3.5 w-3.5" />
              ) : (
                <ChevronDown className="h-3.5 w-3.5" />
              )}
            </button>

            {expanded && (
              <div className="divide-y divide-gray-800/60 -mx-1 px-1">
                {categories.map(([name, cat]) => (
                  <CategoryRow
                    key={name}
                    name={name}
                    total={cat.total}
                    answered={cat.answered}
                    percentage={cat.percentage}
                    barCls={tierCfg.barCls}
                    onNavigate={(path) => navigate(path)}
                  />
                ))}
              </div>
            )}
          </>
        )}

        {/* CTA for incomplete configs */}
        {pct < 100 && (
          <Button
            variant="outline"
            size="sm"
            className={cn(
              'w-full mt-1 text-xs border-gray-700 bg-transparent',
              'text-gray-300 hover:text-white hover:bg-gray-800',
            )}
            onClick={() => navigate('/settings/ai-intelligence')}
          >
            Configure now
            <ArrowRight className="h-3.5 w-3.5 ml-1.5" />
          </Button>
        )}
      </CardContent>
    </Card>
  );
}

export default ConfigCompletenessCard;
