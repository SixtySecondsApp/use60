/**
 * ConfigCompletenessWidget
 *
 * Compact, inline version of ConfigCompletenessCard for embedding at the top
 * of pages like Teach Sixty. Shows tier badge, progress bar, question count,
 * and optional mini category breakdown.
 */

import { useNavigate } from 'react-router-dom';
import {
  AlertCircle,
  ArrowRight,
  Settings2,
  Target,
  Clock,
  Shield,
  Zap,
} from 'lucide-react';
import { cn } from '@/lib/utils';
import { Badge } from '@/components/ui/badge';
import { Skeleton } from '@/components/ui/skeleton';
import { useConfigCompleteness, type ConfigTier } from '@/lib/hooks/useConfigCompleteness';

// ============================================================================
// Types
// ============================================================================

interface ConfigCompletenessWidgetProps {
  orgId: string;
  userId?: string;
  /** Show a mini per-category breakdown below the main bar */
  showCategories?: boolean;
  /** Show a CTA prompting the user to reach the next tier */
  showCTA?: boolean;
}

// ============================================================================
// Constants
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

const TIER_ORDER: ConfigTier[] = ['functional', 'tuned', 'optimised', 'learning'];

const CATEGORY_ICONS: Record<string, React.ElementType> = {
  'Pipeline & Targets': Target,
  'Daily Rhythm': Clock,
  'Security & Compliance': Shield,
  'AI & Automation': Zap,
};

// ============================================================================
// Helpers
// ============================================================================

/** Returns the next tier above `current`, or null if already at the top. */
function getNextTier(current: ConfigTier): ConfigTier | null {
  const idx = TIER_ORDER.indexOf(current);
  if (idx < 0 || idx >= TIER_ORDER.length - 1) return null;
  return TIER_ORDER[idx + 1];
}

// ============================================================================
// Loading skeleton
// ============================================================================

function WidgetSkeleton() {
  return (
    <div className="flex items-center gap-4">
      <Skeleton className="h-5 w-20 rounded-full" />
      <Skeleton className="h-2 flex-1 rounded-full" />
      <Skeleton className="h-4 w-12 rounded" />
    </div>
  );
}

// ============================================================================
// Main component
// ============================================================================

export function ConfigCompletenessWidget({
  orgId,
  userId,
  showCategories = false,
  showCTA = true,
}: ConfigCompletenessWidgetProps) {
  const navigate = useNavigate();
  const { data, isLoading, isError } = useConfigCompleteness(orgId, userId);

  // -- Loading ---
  if (isLoading) {
    return <WidgetSkeleton />;
  }

  // -- Error / no data ---
  if (isError || !data) {
    return (
      <div className="flex items-center gap-2 text-sm text-gray-500">
        <AlertCircle className="h-3.5 w-3.5 text-red-400 flex-shrink-0" />
        <span>Unable to load configuration status</span>
      </div>
    );
  }

  // -- Derived values ---
  const tier = data.tier;
  const tierCfg = TIER_CONFIG[tier] ?? TIER_CONFIG.functional;
  const pct = Math.round(data.percentage);
  const nextTier = getNextTier(tier);
  const categories = Object.entries(data.categories ?? {});

  return (
    <div className="space-y-3">
      {/* ---- Top row: badge + bar + count ---- */}
      <div className="flex items-center gap-3">
        {/* Tier badge */}
        <Badge
          variant="outline"
          className={cn(
            'text-xs px-2 py-0 border font-medium capitalize flex-shrink-0',
            tierCfg.badgeCls,
          )}
        >
          {tierCfg.label}
        </Badge>

        {/* Progress bar */}
        <div className="flex-1 h-2 rounded-full bg-gray-800 overflow-hidden">
          <div
            className={cn(
              'h-full rounded-full transition-all duration-700',
              tierCfg.barCls,
            )}
            style={{ width: `${Math.min(pct, 100)}%` }}
          />
        </div>

        {/* Percentage + count */}
        <div className="flex items-center gap-2 flex-shrink-0">
          <span className="text-sm font-semibold text-gray-100">{pct}%</span>
          <span className="text-xs text-gray-500">
            {data.answered_questions}/{data.total_questions}
          </span>
        </div>
      </div>

      {/* ---- Category mini breakdown ---- */}
      {showCategories && categories.length > 0 && (
        <div className="grid grid-cols-2 gap-x-4 gap-y-2">
          {categories.map(([name, cat]) => {
            const Icon = CATEGORY_ICONS[name] ?? Settings2;
            return (
              <div key={name} className="flex items-center gap-2 min-w-0">
                <Icon className="h-3 w-3 text-gray-500 flex-shrink-0" />
                <span className="text-xs text-gray-400 truncate">{name}</span>
                <div className="flex-1 h-1 rounded-full bg-gray-800 overflow-hidden min-w-[40px]">
                  <div
                    className={cn(
                      'h-full rounded-full transition-all duration-500',
                      tierCfg.barCls,
                    )}
                    style={{ width: `${Math.min(cat.percentage, 100)}%` }}
                  />
                </div>
                <span className="text-[10px] text-gray-600 flex-shrink-0 tabular-nums">
                  {cat.answered}/{cat.total}
                </span>
              </div>
            );
          })}
        </div>
      )}

      {/* ---- CTA ---- */}
      {showCTA && pct < 100 && nextTier && (
        <button
          onClick={() => navigate('/settings/ai-intelligence')}
          className={cn(
            'flex items-center gap-1.5 text-xs',
            'text-gray-500 hover:text-gray-300 transition-colors',
          )}
        >
          Answer more questions to reach{' '}
          <span className="font-medium text-gray-300">
            {TIER_CONFIG[nextTier].label}
          </span>
          <ArrowRight className="h-3 w-3" />
        </button>
      )}
    </div>
  );
}

export default ConfigCompletenessWidget;
