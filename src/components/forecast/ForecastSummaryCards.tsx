/**
 * ForecastSummaryCards (FORE-001)
 * Summary cards: Commit, Best Case, Pipeline totals from forecast aggregation RPC.
 */

import React from 'react';
import { TrendingUp, Star, Layers } from 'lucide-react';
import { Card, CardContent } from '@/components/ui/card';
import { formatCurrencyCompact } from '@/lib/utils/formatters';

interface ForecastTotals {
  commit_total: number;
  best_case_total: number;
  pipeline_total: number;
  period: string;
}

interface ForecastSummaryCardsProps {
  data?: ForecastTotals | null;
  isLoading: boolean;
  currency?: string;
}

const CARDS = [
  {
    key: 'commit_total' as const,
    label: 'Commit',
    description: 'Deals rep has committed to closing',
    icon: TrendingUp,
    iconColor: 'text-emerald-500',
    bgColor: 'bg-emerald-500/10',
  },
  {
    key: 'best_case_total' as const,
    label: 'Best Case',
    description: 'Likely if everything goes well',
    icon: Star,
    iconColor: 'text-blue-500',
    bgColor: 'bg-blue-500/10',
  },
  {
    key: 'pipeline_total' as const,
    label: 'Pipeline',
    description: 'Total active pipeline value',
    icon: Layers,
    iconColor: 'text-purple-500',
    bgColor: 'bg-purple-500/10',
  },
];

function SummaryCardSkeleton(): React.ReactElement {
  return (
    <Card className="bg-white/80 dark:bg-gray-900/40 backdrop-blur-xl border-white/20 dark:border-white/10">
      <CardContent className="p-5">
        <div className="flex items-start gap-3">
          <div className="h-9 w-9 rounded-lg bg-muted animate-pulse shrink-0" />
          <div className="flex-1 space-y-2">
            <div className="h-3 w-16 bg-muted animate-pulse rounded" />
            <div className="h-7 w-24 bg-muted animate-pulse rounded" />
            <div className="h-3 w-32 bg-muted animate-pulse rounded" />
          </div>
        </div>
      </CardContent>
    </Card>
  );
}

export function ForecastSummaryCards({ data, isLoading, currency = 'USD' }: ForecastSummaryCardsProps): React.ReactElement {
  if (isLoading) {
    return (
      <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
        {CARDS.map((c) => (
          <SummaryCardSkeleton key={c.key} />
        ))}
      </div>
    );
  }

  return (
    <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
      {CARDS.map(({ key, label, description, icon: Icon, iconColor, bgColor }) => {
        const value = data?.[key] ?? 0;

        return (
          <Card
            key={key}
            className="bg-white/80 dark:bg-gray-900/40 backdrop-blur-xl border-white/20 dark:border-white/10"
          >
            <CardContent className="p-5">
              <div className="flex items-start gap-3">
                <div className={`h-9 w-9 rounded-lg ${bgColor} flex items-center justify-center shrink-0`}>
                  <Icon className={`h-4.5 w-4.5 ${iconColor}`} />
                </div>
                <div className="flex-1 min-w-0">
                  <p className="text-xs font-medium text-muted-foreground uppercase tracking-wide">
                    {label}
                  </p>
                  <p className="text-2xl font-bold tabular-nums mt-0.5">
                    {formatCurrencyCompact(value, currency)}
                  </p>
                  <p className="text-xs text-muted-foreground mt-0.5 truncate">{description}</p>
                </div>
              </div>
            </CardContent>
          </Card>
        );
      })}
    </div>
  );
}
