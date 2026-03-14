/**
 * BrainCoaching — Coaching tab content for the Brain page
 *
 * Scatter chart of talk time vs sentiment, summary insight card with
 * talk-time buckets, and top coaching patterns (strengths + improvements).
 * Win/Loss Patterns section (BA-010b) below existing coaching content.
 *
 * BA-008b, BA-010b
 */

import { useMemo, useState } from 'react';
import { TrendingUp, MessageSquare, Target, Loader2, Trophy, AlertTriangle, Sparkles } from 'lucide-react';
import { format } from 'date-fns';
import {
  ScatterChart,
  Scatter,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  ResponsiveContainer,
  Cell,
} from 'recharts';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Skeleton } from '@/components/ui/skeleton';
import { toast } from 'sonner';
import { supabase } from '@/lib/supabase/clientV2';
import { useAuth } from '@/lib/contexts/AuthContext';
import { useOrgStore } from '@/lib/stores/orgStore';
import {
  useCoachingPatterns,
  type ScatterPoint,
  type TalkTimeBucket,
  type PatternFrequency,
} from '@/lib/hooks/useCoachingPatterns';

// ============================================================================
// Helpers
// ============================================================================

function sentimentColor(sentiment: number): string {
  if (sentiment > 0.7) return '#10b981'; // emerald-500 (green)
  if (sentiment >= 0.5) return '#f59e0b'; // amber-500
  return '#ef4444'; // red-500
}

function sentimentLabel(sentiment: number): string {
  if (sentiment > 0.7) return 'Positive';
  if (sentiment >= 0.5) return 'Neutral';
  return 'Negative';
}

function bucketIndicatorClass(avgSentiment: number): string {
  if (avgSentiment > 0.7)
    return 'bg-emerald-400 dark:bg-emerald-500';
  if (avgSentiment >= 0.5)
    return 'bg-amber-400 dark:bg-amber-500';
  return 'bg-red-400 dark:bg-red-500';
}

// ============================================================================
// Custom tooltip for scatter chart
// ============================================================================

interface TooltipPayloadEntry {
  payload: ScatterPoint;
}

function ScatterTooltip({
  active,
  payload,
}: {
  active?: boolean;
  payload?: TooltipPayloadEntry[];
}) {
  if (!active || !payload?.length) return null;

  const point = payload[0].payload;
  const dateStr = point.date
    ? format(new Date(point.date), 'MMM d, yyyy')
    : '';

  return (
    <div className="rounded-lg border border-slate-200 dark:border-gray-700 bg-white dark:bg-gray-900 px-3 py-2 shadow-lg text-sm">
      <p className="font-medium text-slate-700 dark:text-gray-200 mb-0.5">
        {point.title}
      </p>
      {dateStr && (
        <p className="text-xs text-slate-400 dark:text-gray-500 mb-1">
          {dateStr}
        </p>
      )}
      <div className="flex items-center gap-3 text-xs text-slate-500 dark:text-gray-400">
        <span>Talk: {point.talkTime.toFixed(0)}%</span>
        <span
          className="font-medium"
          style={{ color: sentimentColor(point.sentiment) }}
        >
          Sentiment: {point.sentiment.toFixed(2)}
        </span>
      </div>
    </div>
  );
}

// ============================================================================
// Sub-components
// ============================================================================

function ChartSection({ data }: { data: ScatterPoint[] }) {
  return (
    <Card>
      <CardHeader className="pb-2">
        <CardTitle className="text-base flex items-center gap-2">
          <TrendingUp className="h-4 w-4 text-slate-500 dark:text-gray-400" />
          Talk Time vs Sentiment
        </CardTitle>
      </CardHeader>
      <CardContent>
        <ResponsiveContainer width="100%" height={250}>
          <ScatterChart margin={{ top: 8, right: 16, bottom: 4, left: 0 }}>
            <CartesianGrid
              strokeDasharray="3 3"
              stroke="currentColor"
              className="text-slate-200 dark:text-gray-700"
            />
            <XAxis
              type="number"
              dataKey="talkTime"
              name="Rep Talk Time %"
              domain={[0, 100]}
              tickLine={false}
              axisLine={false}
              tick={{ fontSize: 11 }}
              label={{
                value: 'Rep Talk Time %',
                position: 'insideBottom',
                offset: -2,
                style: { fontSize: 11, fill: '#94a3b8' },
              }}
            />
            <YAxis
              type="number"
              dataKey="sentiment"
              name="Sentiment"
              domain={[0, 1]}
              tickLine={false}
              axisLine={false}
              tick={{ fontSize: 11 }}
              label={{
                value: 'Sentiment',
                angle: -90,
                position: 'insideLeft',
                offset: 10,
                style: { fontSize: 11, fill: '#94a3b8' },
              }}
            />
            <Tooltip
              content={<ScatterTooltip />}
              cursor={{ strokeDasharray: '3 3' }}
            />
            <Scatter data={data} fill="#8884d8">
              {data.map((point, idx) => (
                <Cell
                  key={`cell-${idx}`}
                  fill={sentimentColor(point.sentiment)}
                  fillOpacity={0.75}
                />
              ))}
            </Scatter>
          </ScatterChart>
        </ResponsiveContainer>
      </CardContent>
    </Card>
  );
}

function SummaryInsightCard({ buckets }: { buckets: TalkTimeBucket[] }) {
  const low = buckets.find((b) => b.label === '<45%');
  const high = buckets.find((b) => b.label === '>55%');

  const lowAvg = low && low.count > 0 ? low.avgSentiment.toFixed(2) : '--';
  const highAvg = high && high.count > 0 ? high.avgSentiment.toFixed(2) : '--';

  return (
    <Card className="bg-slate-50/60 dark:bg-gray-800/30">
      <CardContent className="pt-5 pb-4 space-y-3">
        {/* Headline insight */}
        <p className="text-sm text-slate-700 dark:text-gray-200 leading-relaxed">
          Your avg sentiment is{' '}
          <span className="font-semibold">{lowAvg}</span> when you talk &lt;45%,
          but drops to{' '}
          <span className="font-semibold">{highAvg}</span> when you talk &gt;55%.
        </p>

        {/* Bucket breakdown */}
        <div className="flex flex-wrap gap-3">
          {buckets.map((bucket) => (
            <div
              key={bucket.label}
              className="flex items-center gap-2 rounded-lg border border-slate-200 dark:border-gray-700 bg-white dark:bg-gray-900/60 px-3 py-2"
            >
              <span
                className={`inline-block w-2 h-2 rounded-full ${bucketIndicatorClass(bucket.avgSentiment)}`}
              />
              <span className="text-xs font-medium text-slate-600 dark:text-gray-300">
                {bucket.label}
              </span>
              <span className="text-xs text-slate-400 dark:text-gray-500">
                {bucket.count} meeting{bucket.count !== 1 ? 's' : ''}
              </span>
              <span
                className="text-xs font-semibold"
                style={{ color: sentimentColor(bucket.avgSentiment) }}
              >
                {bucket.count > 0 ? bucket.avgSentiment.toFixed(2) : '--'}
              </span>
            </div>
          ))}
        </div>
      </CardContent>
    </Card>
  );
}

function PatternSection({
  title,
  patterns,
  accentColor,
  icon: Icon,
}: {
  title: string;
  patterns: PatternFrequency[];
  accentColor: 'green' | 'amber';
  icon: React.ElementType;
}) {
  const borderClass =
    accentColor === 'green'
      ? 'border-l-emerald-400 dark:border-l-emerald-500'
      : 'border-l-amber-400 dark:border-l-amber-500';

  const badgeVariant = accentColor === 'green' ? 'success' : 'warning';

  return (
    <div>
      <div className="flex items-center gap-2 mb-3">
        <Icon
          className={`h-4 w-4 ${
            accentColor === 'green'
              ? 'text-emerald-500 dark:text-emerald-400'
              : 'text-amber-500 dark:text-amber-400'
          }`}
        />
        <h3 className="text-sm font-medium text-slate-700 dark:text-gray-200">
          {title}
        </h3>
      </div>

      {patterns.length === 0 ? (
        <p className="text-xs text-slate-400 dark:text-gray-500 pl-6">
          No patterns detected yet
        </p>
      ) : (
        <div className="space-y-2">
          {patterns.map((p) => (
            <Card
              key={p.pattern}
              className={`border-l-[3px] ${borderClass}`}
            >
              <CardContent className="py-3 px-4 flex items-start justify-between gap-3">
                <div className="min-w-0 flex-1">
                  <p className="text-sm text-slate-700 dark:text-gray-200 leading-relaxed">
                    {p.pattern}
                  </p>
                  <p className="text-xs text-slate-400 dark:text-gray-500 mt-0.5">
                    seen in {p.count} meeting{p.count !== 1 ? 's' : ''}
                  </p>
                </div>
                <Badge variant={badgeVariant} className="shrink-0">
                  {p.count}x
                </Badge>
              </CardContent>
            </Card>
          ))}
        </div>
      )}
    </div>
  );
}

function LoadingSkeleton() {
  return (
    <div className="space-y-4">
      <Skeleton className="h-[310px] w-full rounded-xl" />
      <Skeleton className="h-24 w-full rounded-xl" />
      <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
        <div className="space-y-2">
          <Skeleton className="h-5 w-28" />
          <Skeleton className="h-20 w-full rounded-xl" />
          <Skeleton className="h-20 w-full rounded-xl" />
        </div>
        <div className="space-y-2">
          <Skeleton className="h-5 w-36" />
          <Skeleton className="h-20 w-full rounded-xl" />
          <Skeleton className="h-20 w-full rounded-xl" />
        </div>
      </div>
    </div>
  );
}

function EmptyState() {
  return (
    <div className="flex flex-col items-center justify-center py-24">
      <div className="w-14 h-14 rounded-2xl bg-slate-100 dark:bg-gray-800/50 flex items-center justify-center mb-4">
        <Target className="h-7 w-7 text-slate-400 dark:text-gray-500" />
      </div>
      <p className="text-sm font-medium text-slate-600 dark:text-gray-300 mb-1">
        No coaching data yet
      </p>
      <p className="text-xs text-slate-400 dark:text-gray-500 max-w-sm text-center">
        Coaching insights appear after meetings with talk time and sentiment
        data.
      </p>
    </div>
  );
}

// ============================================================================
// Win/Loss Patterns (BA-010b)
// ============================================================================

interface WinLossMemory {
  id: string;
  subject: string;
  content: string;
}

const WIN_LOSS_PATTERNS_KEY = 'win-loss-patterns' as const;

function useWinLossPatterns() {
  const { user } = useAuth();
  const userId = user?.id;

  return useQuery<{ wins: WinLossMemory[]; losses: WinLossMemory[] }>({
    queryKey: [WIN_LOSS_PATTERNS_KEY, userId],
    queryFn: async () => {
      if (!userId) return { wins: [], losses: [] };

      const { data, error } = await supabase
        .from('copilot_memories')
        .select('id, subject, content')
        .eq('user_id', userId)
        .eq('category', 'fact')
        .or('subject.like.Win pattern:%,subject.like.Loss pattern:%')
        .order('created_at', { ascending: false })
        .limit(50);

      if (error) throw error;

      const rows = (data ?? []) as WinLossMemory[];
      const wins: WinLossMemory[] = [];
      const losses: WinLossMemory[] = [];

      for (const row of rows) {
        if (row.subject.startsWith('Win pattern:')) {
          wins.push(row);
        } else if (row.subject.startsWith('Loss pattern:')) {
          losses.push(row);
        }
      }

      return { wins, losses };
    },
    enabled: !!userId,
    staleTime: 5 * 60 * 1000,
  });
}

function WinLossPatternCard({
  patterns,
  type,
}: {
  patterns: WinLossMemory[];
  type: 'win' | 'loss';
}) {
  const isWin = type === 'win';
  const Icon = isWin ? Trophy : AlertTriangle;
  const borderClass = isWin
    ? 'border-l-emerald-400 dark:border-l-emerald-500'
    : 'border-l-red-400 dark:border-l-red-500';
  const iconClass = isWin
    ? 'text-emerald-500 dark:text-emerald-400'
    : 'text-red-500 dark:text-red-400';
  const header = isWin ? 'You win when...' : 'You lose when...';

  return (
    <Card className={`border-l-[3px] ${borderClass}`}>
      <CardHeader className="pb-2">
        <CardTitle className="text-sm flex items-center gap-2">
          <Icon className={`h-4 w-4 ${iconClass}`} />
          {header}
        </CardTitle>
      </CardHeader>
      <CardContent className="pt-0 pb-4">
        {patterns.length === 0 ? (
          <p className="text-xs text-slate-400 dark:text-gray-500">
            No patterns detected yet
          </p>
        ) : (
          <ul className="space-y-3">
            {patterns.map((p) => {
              const patternText = p.subject
                .replace(/^Win pattern:\s*/, '')
                .replace(/^Loss pattern:\s*/, '');
              return (
                <li key={p.id}>
                  <p className="text-sm text-slate-700 dark:text-gray-200 leading-relaxed">
                    &bull; {patternText}
                  </p>
                  {p.content && (
                    <p className="text-xs text-slate-400 dark:text-gray-500 mt-0.5 ml-3">
                      {p.content}
                    </p>
                  )}
                </li>
              );
            })}
          </ul>
        )}
      </CardContent>
    </Card>
  );
}

function WinLossSection() {
  const { user } = useAuth();
  const orgId = useOrgStore((s) => s.activeOrgId);
  const queryClient = useQueryClient();
  const { data, isLoading: isLoadingPatterns } = useWinLossPatterns();
  const [isGenerating, setIsGenerating] = useState(false);

  const wins = data?.wins ?? [];
  const losses = data?.losses ?? [];
  const hasPatterns = wins.length > 0 || losses.length > 0;

  async function handleGenerate() {
    if (!user?.id || !orgId) {
      toast.error('Missing user or organization context');
      return;
    }

    setIsGenerating(true);
    const toastId = toast.loading('Generating win/loss patterns...');

    try {
      const { data: result, error } = await supabase.functions.invoke(
        'generate-win-loss-patterns',
        { body: { org_id: orgId, user_id: user.id } },
      );

      if (error) throw error;

      if (result?.skipped) {
        toast.info('Not enough deal data to generate patterns yet.', { id: toastId });
      } else {
        const stored = result?.stored ?? 0;
        toast.success(`Generated ${stored} pattern${stored !== 1 ? 's' : ''}.`, { id: toastId });
      }

      await queryClient.invalidateQueries({ queryKey: [WIN_LOSS_PATTERNS_KEY] });
    } catch (err) {
      const message = err instanceof Error ? err.message : 'Failed to generate patterns';
      toast.error(message, { id: toastId });
    } finally {
      setIsGenerating(false);
    }
  }

  if (isLoadingPatterns) {
    return (
      <div className="space-y-3">
        <Skeleton className="h-8 w-48" />
        <Skeleton className="h-40 w-full rounded-xl" />
        <Skeleton className="h-40 w-full rounded-xl" />
      </div>
    );
  }

  return (
    <div className="space-y-4">
      {/* Section header + generate button */}
      <div className="flex items-center justify-between">
        <h2 className="text-sm font-semibold text-slate-700 dark:text-gray-200">
          Win/Loss Patterns
        </h2>
        <Button
          size="sm"
          variant="outline"
          onClick={handleGenerate}
          disabled={isGenerating}
          className="gap-1.5"
        >
          {isGenerating ? (
            <Loader2 className="h-3.5 w-3.5 animate-spin" />
          ) : (
            <Sparkles className="h-3.5 w-3.5" />
          )}
          Generate Patterns
        </Button>
      </div>

      {/* Empty state or pattern cards */}
      {!hasPatterns ? (
        <Card className="bg-slate-50/60 dark:bg-gray-800/30">
          <CardContent className="py-8 text-center">
            <p className="text-sm text-slate-400 dark:text-gray-500">
              No patterns generated yet. Click &quot;Generate Patterns&quot; to
              analyze your win/loss history.
            </p>
          </CardContent>
        </Card>
      ) : (
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          <WinLossPatternCard patterns={wins} type="win" />
          <WinLossPatternCard patterns={losses} type="loss" />
        </div>
      )}
    </div>
  );
}

// ============================================================================
// Main component
// ============================================================================

export default function BrainCoaching() {
  const { data, isLoading } = useCoachingPatterns();

  const hasData = useMemo(() => {
    return data && data.totalMeetings > 0;
  }, [data]);

  if (isLoading) return <LoadingSkeleton />;

  if (!hasData || !data) return <EmptyState />;

  return (
    <div className="space-y-6">
      {/* Scatter chart */}
      <ChartSection data={data.scatterData} />

      {/* Summary insight card */}
      <SummaryInsightCard buckets={data.buckets} />

      {/* Patterns: Strengths + Areas to Improve */}
      <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
        <PatternSection
          title="Strengths"
          patterns={data.topStrengths}
          accentColor="green"
          icon={MessageSquare}
        />
        <PatternSection
          title="Areas to Improve"
          patterns={data.topImprovements}
          accentColor="amber"
          icon={Target}
        />
      </div>

      {/* Win/Loss Patterns — BA-010b */}
      <WinLossSection />
    </div>
  );
}
