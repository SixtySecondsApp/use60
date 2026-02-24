import { useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { supabase } from '@/lib/supabase/clientV2';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { cn } from '@/lib/utils';
import { SKILL_DISPLAY_NAMES } from '@/lib/agent/abilityRegistry';
import {
  Activity,
  ChevronDown,
  ChevronUp,
  CheckCircle2,
  XCircle,
  Clock,
  Loader2,
  Zap,
} from 'lucide-react';

interface SequenceJob {
  id: string;
  initial_input: {
    event_type: string;
    event_source?: string;
    payload?: Record<string, unknown>;
  };
  status: 'pending' | 'running' | 'waiting_approval' | 'completed' | 'failed' | 'cancelled' | 'timeout';
  step_results: Array<{
    step: number;
    skill_key: string;
    output: unknown;
    status: string;
    timestamp: string;
  }>;
  error_message?: string;
  created_at: string;
  updated_at: string;
}

function formatRelativeTime(timestamp: string): string {
  const now = Date.now();
  const then = new Date(timestamp).getTime();
  const diffMs = now - then;
  const diffSec = Math.floor(diffMs / 1000);
  const diffMin = Math.floor(diffSec / 60);
  const diffHour = Math.floor(diffMin / 60);
  const diffDay = Math.floor(diffHour / 24);

  if (diffSec < 60) return 'Just now';
  if (diffMin < 60) return `${diffMin} min ago`;
  if (diffHour < 24) return `${diffHour} hour${diffHour > 1 ? 's' : ''} ago`;
  return `${diffDay} day${diffDay > 1 ? 's' : ''} ago`;
}

function formatDuration(startTime: string, endTime: string): string {
  const start = new Date(startTime).getTime();
  const end = new Date(endTime).getTime();
  const diffMs = end - start;
  const diffSec = diffMs / 1000;

  if (diffSec < 60) return `${diffSec.toFixed(1)}s`;
  const minutes = Math.floor(diffSec / 60);
  const seconds = Math.floor(diffSec % 60);
  return `${minutes}m ${seconds}s`;
}

function getStatusIcon(status: SequenceJob['status']) {
  switch (status) {
    case 'completed':
      return <CheckCircle2 className="h-4 w-4 text-emerald-500" />;
    case 'failed':
      return <XCircle className="h-4 w-4 text-red-500" />;
    case 'running':
      return <Loader2 className="h-4 w-4 text-blue-500 animate-spin" />;
    case 'pending':
    case 'waiting_approval':
      return <Clock className="h-4 w-4 text-gray-400" />;
    default:
      return <Clock className="h-4 w-4 text-gray-400" />;
  }
}

function getStatusColor(status: SequenceJob['status']): string {
  switch (status) {
    case 'completed':
      return 'bg-emerald-500/10 text-emerald-700 dark:text-emerald-400';
    case 'failed':
      return 'bg-red-500/10 text-red-700 dark:text-red-400';
    case 'running':
      return 'bg-blue-500/10 text-blue-700 dark:text-blue-400';
    case 'pending':
    case 'waiting_approval':
      return 'bg-gray-500/10 text-gray-700 dark:text-gray-400';
    default:
      return 'bg-gray-500/10 text-gray-700 dark:text-gray-400';
  }
}

interface ActivityRowProps {
  job: SequenceJob;
}

function ActivityRow({ job }: ActivityRowProps) {
  const [isExpanded, setIsExpanded] = useState(false);
  const stepCount = job.step_results?.length || 0;
  const duration = job.updated_at && job.created_at
    ? formatDuration(job.created_at, job.updated_at)
    : '-';
  const eventType = job.initial_input?.event_type || 'unknown';

  return (
    <div className="border-b border-gray-100 dark:border-gray-800">
      <div
        className="px-4 py-3 hover:bg-gray-50 dark:hover:bg-gray-800/50 cursor-pointer"
        onClick={() => setIsExpanded(!isExpanded)}
      >
        <div className="flex items-center gap-3">
          {/* Status Icon */}
          <div className="flex-shrink-0">
            {getStatusIcon(job.status)}
          </div>

          {/* Event Type Badge */}
          <Badge variant="outline" className="text-xs">
            {eventType.replace(/_/g, ' ')}
          </Badge>

          {/* Relative Time */}
          <span className="text-sm text-gray-500 dark:text-gray-400">
            {formatRelativeTime(job.created_at)}
          </span>

          {/* Step Count */}
          <span className="text-sm text-gray-500 dark:text-gray-400">
            {stepCount} step{stepCount !== 1 ? 's' : ''}
          </span>

          {/* Duration */}
          <span className="text-sm text-gray-500 dark:text-gray-400">
            {duration}
          </span>

          {/* Spacer */}
          <div className="flex-1" />

          {/* Expand Icon */}
          {stepCount > 0 && (
            <div className="flex-shrink-0">
              {isExpanded ? (
                <ChevronUp className="h-4 w-4 text-gray-400" />
              ) : (
                <ChevronDown className="h-4 w-4 text-gray-400" />
              )}
            </div>
          )}
        </div>
      </div>

      {/* Expanded Step Details */}
      {isExpanded && stepCount > 0 && (
        <div className="px-4 pb-3 space-y-2 bg-gray-50/50 dark:bg-gray-800/30">
          {job.step_results.map((stepResult, idx) => {
            const stepDuration = idx > 0 && job.step_results[idx - 1]?.timestamp
              ? formatDuration(job.step_results[idx - 1].timestamp, stepResult.timestamp)
              : '-';
            const displayName = SKILL_DISPLAY_NAMES[stepResult.skill_key] || stepResult.skill_key;

            return (
              <div
                key={idx}
                className="flex items-center gap-3 text-sm py-2 px-3 rounded bg-white dark:bg-gray-900/50"
              >
                {/* Step Number */}
                <span className="text-xs text-gray-400 font-mono w-6">
                  {stepResult.step}
                </span>

                {/* Skill Name */}
                <span className="flex-1 text-gray-700 dark:text-gray-300">
                  {displayName}
                </span>

                {/* Status Badge */}
                <Badge
                  variant="outline"
                  className={cn(
                    'text-xs',
                    getStatusColor(stepResult.status as SequenceJob['status']),
                  )}
                >
                  {stepResult.status}
                </Badge>

                {/* Duration */}
                <span className="text-xs text-gray-500 dark:text-gray-400 font-mono w-16 text-right">
                  {stepDuration}
                </span>
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}

export function ActivityFeed() {
  const [isExpanded, setIsExpanded] = useState(true);

  const { data: jobs = [], isLoading } = useQuery({
    queryKey: ['sequence-jobs', 'recent'],
    queryFn: async () => {
      const { data, error } = await supabase
        .from('sequence_jobs')
        .select('id, initial_input, status, step_results, error_message, created_at, updated_at')
        .order('created_at', { ascending: false })
        .limit(20);

      if (error) throw error;
      return (data || []) as SequenceJob[];
    },
    refetchInterval: 30000, // Auto-refresh every 30 seconds
  });

  return (
    <Card>
      <CardHeader className="pb-3">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-2">
            <Activity className="h-5 w-5 text-gray-500" />
            <CardTitle className="text-lg">Activity Feed</CardTitle>
          </div>
          <Button
            variant="ghost"
            size="sm"
            onClick={() => setIsExpanded(!isExpanded)}
            className="h-8 w-8 p-0"
          >
            {isExpanded ? (
              <ChevronUp className="h-4 w-4" />
            ) : (
              <ChevronDown className="h-4 w-4" />
            )}
          </Button>
        </div>
      </CardHeader>

      {isExpanded && (
        <CardContent className="p-0">
          {isLoading ? (
            <div className="px-4 py-8 space-y-3">
              {[1, 2, 3].map((i) => (
                <div key={i} className="flex items-center gap-3">
                  <div className="h-4 w-4 rounded-full bg-gray-200 dark:bg-gray-700 animate-pulse" />
                  <div className="h-4 w-24 bg-gray-200 dark:bg-gray-700 rounded animate-pulse" />
                  <div className="h-4 w-16 bg-gray-200 dark:bg-gray-700 rounded animate-pulse" />
                  <div className="flex-1" />
                </div>
              ))}
            </div>
          ) : jobs.length === 0 ? (
            <div className="px-4 py-8 text-center text-gray-500 dark:text-gray-400">
              <Zap className="h-8 w-8 mx-auto mb-2 opacity-50" />
              <p className="text-sm">No recent orchestrator activity</p>
            </div>
          ) : (
            <div>
              {jobs.map((job) => (
                <ActivityRow key={job.id} job={job} />
              ))}
            </div>
          )}
        </CardContent>
      )}
    </Card>
  );
}
