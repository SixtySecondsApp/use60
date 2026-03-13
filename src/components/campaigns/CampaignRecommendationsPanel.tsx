import React, { useState, useCallback } from 'react';
import { Loader2, AlertTriangle, TrendingUp, X, Lightbulb } from 'lucide-react';
import type { CampaignRecommendation } from '@/lib/types/campaign';

interface Props {
  recommendations: CampaignRecommendation[];
  campaignId: string;
  isLoading: boolean;
}

const DISMISSED_KEY = 'campaign_rec_dismissed';

function getDismissed(): Record<string, boolean> {
  try {
    return JSON.parse(localStorage.getItem(DISMISSED_KEY) || '{}');
  } catch {
    return {};
  }
}

function setDismissed(id: string) {
  const current = getDismissed();
  current[id] = true;
  localStorage.setItem(DISMISSED_KEY, JSON.stringify(current));
}

function severityConfig(severity: CampaignRecommendation['severity']) {
  switch (severity) {
    case 'critical':
      return {
        icon: AlertTriangle,
        border: 'border-red-200 dark:border-red-500/30',
        bg: 'bg-red-50 dark:bg-red-500/5',
        iconColor: 'text-red-600 dark:text-red-400',
        badgeColor: 'text-red-700 dark:text-red-400 bg-red-50 dark:bg-red-400/10 border-red-200 dark:border-red-400/20',
        label: 'Critical',
      };
    case 'positive':
      return {
        icon: TrendingUp,
        border: 'border-emerald-200 dark:border-emerald-500/30',
        bg: 'bg-emerald-50 dark:bg-emerald-500/5',
        iconColor: 'text-emerald-600 dark:text-emerald-400',
        badgeColor: 'text-emerald-700 dark:text-emerald-400 bg-emerald-50 dark:bg-emerald-400/10 border-emerald-200 dark:border-emerald-400/20',
        label: 'Positive',
      };
    default:
      return {
        icon: Lightbulb,
        border: 'border-amber-200 dark:border-amber-500/30',
        bg: 'bg-amber-50 dark:bg-amber-500/5',
        iconColor: 'text-amber-600 dark:text-amber-400',
        badgeColor: 'text-amber-700 dark:text-amber-400 bg-amber-50 dark:bg-amber-400/10 border-amber-200 dark:border-amber-400/20',
        label: 'Warning',
      };
  }
}

export function CampaignRecommendationsPanel({ recommendations, campaignId, isLoading }: Props) {
  const [localDismissed, setLocalDismissed] = useState<Record<string, boolean>>(getDismissed);

  const handleDismiss = useCallback(
    (id: string) => {
      const key = `${campaignId}_${id}`;
      setDismissed(key);
      setLocalDismissed((prev) => ({ ...prev, [key]: true }));
    },
    [campaignId]
  );

  if (isLoading) {
    return (
      <div className="flex justify-center py-12">
        <Loader2 className="h-5 w-5 animate-spin text-gray-400" />
      </div>
    );
  }

  const visible = recommendations.filter((r) => !localDismissed[`${campaignId}_${r.id}`]);

  if (visible.length === 0) {
    return (
      <div className="flex flex-col items-center py-12 gap-3 text-gray-400 dark:text-gray-500">
        <TrendingUp className="h-8 w-8 opacity-30" />
        <p className="text-sm">No recommendations right now</p>
      </div>
    );
  }

  return (
    <div className="space-y-2">
      {visible.map((rec) => {
        const config = severityConfig(rec.severity);
        const Icon = config.icon;
        return (
          <div
            key={rec.id}
            className={`rounded-lg border ${config.border} ${config.bg} p-3`}
          >
            <div className="flex items-start gap-2">
              <Icon className={`h-4 w-4 mt-0.5 shrink-0 ${config.iconColor}`} />
              <div className="min-w-0 flex-1 space-y-1">
                <div className="flex items-center gap-2">
                  <p className="text-sm font-medium text-gray-900 dark:text-white">{rec.title}</p>
                  <span className={`inline-flex rounded border px-1.5 py-0.5 text-[10px] font-medium ${config.badgeColor}`}>
                    {config.label}
                  </span>
                </div>
                <p className="text-xs text-gray-500 dark:text-gray-400">{rec.description}</p>
                {rec.action && (
                  <p className="text-xs text-gray-400 dark:text-gray-500 italic">{rec.action}</p>
                )}
              </div>
              <button
                onClick={() => handleDismiss(rec.id)}
                className="shrink-0 text-gray-400 dark:text-gray-600 hover:text-gray-600 dark:hover:text-gray-400 transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-blue-500 rounded"
                aria-label={`Dismiss recommendation: ${rec.title}`}
              >
                <X className="h-3.5 w-3.5" />
                <span className="sr-only">Dismiss</span>
              </button>
            </div>
          </div>
        );
      })}
    </div>
  );
}
