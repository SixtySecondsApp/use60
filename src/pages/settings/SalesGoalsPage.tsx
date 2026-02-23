/**
 * SalesGoalsPage — Set monthly/period targets for dashboard KPI cards.
 *
 * Each card explains what the metric tracks and lets users set a numeric goal.
 * Goals are stored in the `targets` table and surfaced on the Dashboard.
 *
 * URL params:
 *   ?metric=new-business|outbound|meetings|proposals  — scrolls to and highlights that card
 */

import { useState, useEffect, useRef } from 'react';
import { useSearchParams } from 'react-router-dom';
import SettingsPageWrapper from '@/components/SettingsPageWrapper';
import { useUser } from '@/lib/hooks/useUser';
import { useTargets } from '@/lib/hooks/useTargets';
import { supabase } from '@/lib/supabase/clientV2';
import { useQueryClient } from '@tanstack/react-query';
import { toast } from 'sonner';
import { Button } from '@/components/ui/button';
import { Skeleton } from '@/components/ui/skeleton';
import { cn } from '@/lib/utils';
import { useOrgMoney } from '@/lib/hooks/useOrgMoney';
import {
  PoundSterling,
  Phone,
  Users,
  FileText,
  Target,
  Info,
  Loader2,
  Save,
  TrendingUp,
} from 'lucide-react';

// ─── Metric definitions ────────────────────────────────────────────────────

interface MetricDefinition {
  key: string;
  dbField: 'revenue_target' | 'outbound_target' | 'meetings_target' | 'proposal_target';
  label: string;
  description: string;
  what: string;
  howTracked: string;
  unit: string;
  prefix?: string;
  icon: React.ElementType;
  color: string;
  bg: string;
}

const METRICS: MetricDefinition[] = [
  {
    key: 'new-business',
    dbField: 'revenue_target',
    label: 'New Business',
    description: 'Revenue from new deals closed in the current period.',
    what: 'Tracks the total value of deals marked as "Won" during the selected date range.',
    howTracked: 'Pulls from your pipeline — every deal moved to Won stage within the period contributes to this number.',
    unit: 'amount',
    icon: PoundSterling,
    color: 'text-emerald-600 dark:text-emerald-400',
    bg: 'bg-emerald-500/10 border-emerald-500/20',
  },
  {
    key: 'outbound',
    dbField: 'outbound_target',
    label: 'Outbound',
    description: 'Outbound activities logged (calls, emails, LinkedIn messages).',
    what: 'Counts all outbound activity records: calls made, emails sent, and LinkedIn messages logged in your activity feed.',
    howTracked: 'Each outbound activity you log — whether from the activity feed, a meeting, or a workflow — increments this counter.',
    unit: 'activities',
    icon: Phone,
    color: 'text-blue-600 dark:text-blue-400',
    bg: 'bg-blue-500/5 border-blue-500/20',
  },
  {
    key: 'meetings',
    dbField: 'meetings_target',
    label: 'Meetings',
    description: 'Meetings held with prospects and customers.',
    what: 'Counts meetings that occurred in the selected period — both recorded via Notetaker and manually logged.',
    howTracked: 'Synced from your calendar integrations and Notetaker recordings. Meetings must have at least one external attendee to count.',
    unit: 'meetings',
    icon: Users,
    color: 'text-violet-600 dark:text-violet-400',
    bg: 'bg-violet-500/10 border-violet-500/20',
  },
  {
    key: 'proposals',
    dbField: 'proposal_target',
    label: 'Proposals',
    description: 'Proposals generated and sent to prospects.',
    what: 'Counts proposals created via the Proposal feature or logged as proposal activities.',
    howTracked: 'Every proposal generated through the platform or logged as a "Proposal sent" activity in the current period.',
    unit: 'proposals',
    icon: FileText,
    color: 'text-orange-600 dark:text-orange-400',
    bg: 'bg-orange-500/10 border-orange-500/20',
  },
];

// ─── Goal card ─────────────────────────────────────────────────────────────

interface GoalCardProps {
  metric: MetricDefinition;
  currentValue: number;
  isHighlighted: boolean;
  cardRef: (el: HTMLDivElement | null) => void;
  onSave: (dbField: MetricDefinition['dbField'], value: number) => Promise<void>;
}

function GoalCard({ metric, currentValue, isHighlighted, cardRef, onSave }: GoalCardProps) {
  const [value, setValue] = useState(currentValue > 0 ? String(currentValue) : '');
  const [saving, setSaving] = useState(false);
  const [showInfo, setShowInfo] = useState(false);
  const Icon = metric.icon;

  // Sync when parent data loads
  useEffect(() => {
    setValue(currentValue > 0 ? String(currentValue) : '');
  }, [currentValue]);

  const handleSave = async () => {
    const num = parseFloat(value);
    if (!value || isNaN(num) || num < 0) {
      toast.error('Please enter a valid number');
      return;
    }
    setSaving(true);
    try {
      await onSave(metric.dbField, num);
      toast.success(`${metric.label} goal saved`);
    } finally {
      setSaving(false);
    }
  };

  return (
    <div
      ref={cardRef}
      className={cn(
        'border rounded-xl p-5 transition-all duration-300',
        isHighlighted
          ? 'ring-2 ring-blue-500/40 border-blue-400 dark:border-blue-500 shadow-md'
          : 'border-gray-200 dark:border-gray-800'
      )}
    >
      {/* Header */}
      <div className="flex items-start justify-between mb-4">
        <div className="flex items-center gap-3">
          <div className={cn('p-2.5 rounded-xl border', metric.bg)}>
            <Icon className={cn('w-5 h-5', metric.color)} />
          </div>
          <div>
            <h3 className="font-semibold text-gray-900 dark:text-white">{metric.label}</h3>
            <p className="text-xs text-gray-500 dark:text-gray-400 mt-0.5">{metric.description}</p>
          </div>
        </div>
        <button
          type="button"
          onClick={() => setShowInfo((v) => !v)}
          className="text-gray-400 hover:text-gray-600 dark:hover:text-gray-300 transition-colors"
          title="How is this tracked?"
        >
          <Info className="w-4 h-4" />
        </button>
      </div>

      {/* Info panel */}
      {showInfo && (
        <div className="mb-4 rounded-lg bg-gray-50 dark:bg-gray-800/60 border border-gray-200 dark:border-gray-700 p-3 space-y-2">
          <div>
            <p className="text-xs font-medium text-gray-700 dark:text-gray-300">What it tracks</p>
            <p className="text-xs text-gray-500 dark:text-gray-400 mt-0.5">{metric.what}</p>
          </div>
          <div>
            <p className="text-xs font-medium text-gray-700 dark:text-gray-300">How it's counted</p>
            <p className="text-xs text-gray-500 dark:text-gray-400 mt-0.5">{metric.howTracked}</p>
          </div>
        </div>
      )}

      {/* Goal input */}
      <div className="flex items-end gap-3">
        <div className="flex-1">
          <label className="block text-xs font-medium text-gray-600 dark:text-gray-400 mb-1">
            Monthly goal ({metric.unit})
          </label>
          <div className="relative">
            {metric.prefix && (
              <span className="absolute left-3 top-1/2 -translate-y-1/2 text-sm text-gray-400">
                {metric.prefix}
              </span>
            )}
            <input
              type="number"
              min="0"
              step={metric.unit === 'amount' ? '100' : '1'}
              placeholder={metric.unit === 'amount' ? '10000' : '20'}
              value={value}
              onChange={(e) => setValue(e.target.value)}
              onKeyDown={(e) => e.key === 'Enter' && handleSave()}
              className={cn(
                'w-full py-2 text-sm border rounded-lg bg-white dark:bg-gray-900 text-gray-900 dark:text-gray-100 focus:outline-none focus:ring-2 focus:ring-blue-500/30',
                'border-gray-300 dark:border-gray-700',
                metric.prefix ? 'pl-7 pr-3' : 'px-3'
              )}
            />
          </div>
        </div>
        <Button
          onClick={handleSave}
          disabled={saving || !value}
          size="sm"
          className="bg-[#37bd7e] hover:bg-[#2da76c] text-white shrink-0"
        >
          {saving ? (
            <Loader2 className="w-4 h-4 animate-spin" />
          ) : (
            <Save className="w-4 h-4" />
          )}
          <span className="ml-1.5">Save</span>
        </Button>
      </div>

      {currentValue > 0 && (
        <p className="text-xs text-gray-400 dark:text-gray-500 mt-2">
          Current goal: {metric.prefix ?? ''}{currentValue.toLocaleString()} {metric.unit}
        </p>
      )}
    </div>
  );
}

// ─── Page ──────────────────────────────────────────────────────────────────

export default function SalesGoalsPage() {
  const { userData } = useUser();
  const { symbol } = useOrgMoney();
  const userId = userData?.id;
  const { data: targets, isLoading: targetsLoading, refetch } = useTargets(userId);
  const queryClient = useQueryClient();
  const [searchParams] = useSearchParams();
  const highlightedMetric = searchParams.get('metric');

  // Refs for scrolling
  const cardRefs = useRef<Record<string, HTMLDivElement | null>>({});

  // Scroll to highlighted card on mount
  useEffect(() => {
    if (!highlightedMetric) return;
    const timer = setTimeout(() => {
      cardRefs.current[highlightedMetric]?.scrollIntoView({ behavior: 'smooth', block: 'center' });
    }, 200);
    return () => clearTimeout(timer);
  }, [highlightedMetric]);

  const handleSave = async (dbField: MetricDefinition['dbField'], value: number) => {
    if (!userId) return;

    const today = new Date().toISOString().split('T')[0];
    const startOfMonth = today.slice(0, 8) + '01';
    const endDate = new Date(new Date().getFullYear(), new Date().getMonth() + 1, 0)
      .toISOString().split('T')[0];

    if (targets?.id) {
      // Update existing target
      const { error } = await supabase
        .from('targets')
        .update({ [dbField]: value })
        .eq('id', targets.id);
      if (error) throw new Error(error.message);
    } else {
      // Create new target for current month
      const { error } = await supabase
        .from('targets')
        .insert({
          user_id: userId,
          revenue_target: 0,
          outbound_target: 0,
          meetings_target: 0,
          proposal_target: 0,
          start_date: startOfMonth,
          end_date: endDate,
          [dbField]: value,
        });
      if (error) throw new Error(error.message);
    }

    await refetch();
    queryClient.invalidateQueries({ queryKey: ['targets', userId] });
  };

  return (
    <SettingsPageWrapper
      title="Sales Goals"
      description="Set monthly targets for your KPIs — tracked live on your dashboard."
      icon={Target}
      iconClassName="h-7 w-7 text-emerald-500 dark:text-emerald-400"
      iconContainerClassName="bg-emerald-500/10 dark:bg-emerald-500/20 border-emerald-500/20 dark:border-emerald-500/30"
      dotClassName="bg-emerald-500"
      accentGradient="from-emerald-500 via-teal-500 to-cyan-500"
    >
      <div className="space-y-4 max-w-2xl mx-auto">
        {/* Tip banner */}
        <div className="flex items-start gap-3 rounded-xl bg-blue-50 dark:bg-blue-900/20 border border-blue-200 dark:border-blue-800 px-4 py-3">
          <TrendingUp className="w-4 h-4 text-blue-500 mt-0.5 shrink-0" />
          <div className="text-xs text-blue-700 dark:text-blue-300">
            <span className="font-medium">Goals reset monthly.</span> Set a target for each metric and track your progress in real-time on the Dashboard. Click the <Info className="inline w-3 h-3 mx-0.5" /> icon on any card to learn exactly what it measures.
          </div>
        </div>

        {/* Goal cards */}
        {targetsLoading
          ? METRICS.map((metric) => (
              <div
                key={metric.key}
                className="border border-gray-200 dark:border-gray-800 rounded-xl p-5 space-y-4"
              >
                {/* Header: icon + label */}
                <div className="flex items-start justify-between">
                  <div className="flex items-center gap-3">
                    <Skeleton className="h-10 w-10 rounded-xl" />
                    <div className="space-y-1.5">
                      <Skeleton className="h-4 w-28" />
                      <Skeleton className="h-3 w-48" />
                    </div>
                  </div>
                  <Skeleton className="h-5 w-5 rounded" />
                </div>
                {/* Input row */}
                <div className="flex items-end gap-3">
                  <div className="flex-1 space-y-1.5">
                    <Skeleton className="h-3 w-32" />
                    <Skeleton className="h-9 w-full rounded-lg" />
                  </div>
                  <Skeleton className="h-9 w-20 rounded-md shrink-0" />
                </div>
              </div>
            ))
          : METRICS.map((metric) => (
              <GoalCard
                key={metric.key}
                metric={metric.unit === 'amount' ? { ...metric, prefix: symbol } : metric}
                currentValue={targets?.[metric.dbField] ?? 0}
                isHighlighted={highlightedMetric === metric.key}
                cardRef={(el: HTMLDivElement | null) => { cardRefs.current[metric.key] = el; }}
                onSave={handleSave}
              />
            ))
        }
      </div>
    </SettingsPageWrapper>
  );
}
