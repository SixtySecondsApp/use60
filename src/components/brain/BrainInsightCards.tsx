/**
 * BrainInsightCards — Proactive insight cards in the Brain page header
 *
 * Renders 2-3 cross-referenced insight cards from useBrainInsights.
 * Each card shows urgency via left border colour, an icon, title/body,
 * and an action button. Cards are dismissable per day (localStorage).
 *
 * NL-001b
 */

import { useState, useCallback, useMemo } from 'react';
import { useNavigate } from 'react-router-dom';
import { AlertTriangle, Clock, TrendingDown, Users, X } from 'lucide-react';
import { Card } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { useBrainInsights, type BrainInsight } from '@/lib/hooks/useBrainInsights';

// ============================================================================
// Constants
// ============================================================================

/** localStorage key includes today's date so dismissals reset daily */
function getDismissKey(): string {
  const today = new Date().toISOString().slice(0, 10);
  return `brain-dismissed-insights-${today}`;
}

// ============================================================================
// Styling maps
// ============================================================================

const URGENCY_BORDER: Record<BrainInsight['urgency'], string> = {
  high: 'border-l-red-500',
  medium: 'border-l-amber-500',
  low: 'border-l-blue-500',
};

const ICON_MAP: Record<BrainInsight['icon'], typeof AlertTriangle> = {
  alert: AlertTriangle,
  clock: Clock,
  'trending-down': TrendingDown,
  handshake: Users,
};

const ICON_COLOR: Record<BrainInsight['urgency'], string> = {
  high: 'text-red-500',
  medium: 'text-amber-500',
  low: 'text-blue-500',
};

const ACTION_LABEL: Record<BrainInsight['urgency'], string> = {
  high: 'Chase',
  medium: 'View',
  low: 'View',
};

// ============================================================================
// Helpers
// ============================================================================

function getDismissedIds(): Set<string> {
  try {
    const raw = localStorage.getItem(getDismissKey());
    if (!raw) return new Set();
    const parsed = JSON.parse(raw);
    return new Set(Array.isArray(parsed) ? parsed : []);
  } catch {
    return new Set();
  }
}

function persistDismissedIds(ids: Set<string>): void {
  try {
    localStorage.setItem(getDismissKey(), JSON.stringify([...ids]));
  } catch {
    // localStorage full or unavailable — silently ignore
  }
}

// ============================================================================
// Single insight card
// ============================================================================

function InsightCard({
  insight,
  onDismiss,
}: {
  insight: BrainInsight;
  onDismiss: (id: string) => void;
}) {
  const navigate = useNavigate();
  const IconComponent = ICON_MAP[insight.icon] ?? AlertTriangle;

  return (
    <Card
      className={`animate-in fade-in duration-300 border-l-4 ${URGENCY_BORDER[insight.urgency]} p-3`}
    >
      <div className="flex items-start gap-3">
        {/* Icon */}
        <div className="shrink-0 mt-0.5">
          <IconComponent className={`h-4 w-4 ${ICON_COLOR[insight.urgency]}`} />
        </div>

        {/* Content */}
        <div className="flex-1 min-w-0">
          <p className="text-sm font-bold text-slate-800 dark:text-gray-100 leading-tight">
            {insight.title}
          </p>
          <p className="text-xs text-muted-foreground mt-0.5 line-clamp-3">
            {insight.body}
          </p>
        </div>

        {/* Action + dismiss */}
        <div className="flex items-center gap-1 shrink-0">
          {insight.actionUrl && (
            <Button
              variant="ghost"
              size="sm"
              className="h-7 px-2 text-xs"
              onClick={() => navigate(insight.actionUrl!)}
            >
              {ACTION_LABEL[insight.urgency]}
            </Button>
          )}
          <Button
            variant="ghost"
            size="icon"
            className="h-6 w-6 text-slate-400 hover:text-slate-600 dark:text-gray-500 dark:hover:text-gray-300"
            onClick={() => onDismiss(insight.id)}
          >
            <X className="h-3.5 w-3.5" />
          </Button>
        </div>
      </div>
    </Card>
  );
}

// ============================================================================
// Main component
// ============================================================================

export default function BrainInsightCards() {
  const { data: insights } = useBrainInsights();
  const [dismissedIds, setDismissedIds] = useState<Set<string>>(getDismissedIds);

  const handleDismiss = useCallback((id: string) => {
    setDismissedIds((prev) => {
      const next = new Set(prev);
      next.add(id);
      persistDismissedIds(next);
      return next;
    });
  }, []);

  const visibleInsights = useMemo(
    () => (insights ?? []).filter((i) => !dismissedIds.has(i.id)),
    [insights, dismissedIds],
  );

  // Nothing to show — hide entirely
  if (visibleInsights.length === 0) return null;

  return (
    <div className="px-6 py-2 space-y-2 border-b border-slate-200 dark:border-gray-800/60 bg-white dark:bg-gray-900/80">
      {visibleInsights.map((insight) => (
        <InsightCard
          key={insight.id}
          insight={insight}
          onDismiss={handleDismiss}
        />
      ))}
    </div>
  );
}
