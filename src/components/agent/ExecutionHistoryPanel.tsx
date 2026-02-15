import { useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { supabase } from '@/lib/supabase/clientV2';
import {
  Clock,
  CheckCircle2,
  XCircle,
  Loader2,
  ChevronDown,
  ChevronRight,
} from 'lucide-react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table';

interface SequenceJob {
  id: string;
  event_type: string;
  status: string;
  step_results: Array<{
    name: string;
    status: string;
    duration_ms?: number;
    error?: string;
  }>;
  created_at: string;
  updated_at: string;
  metadata?: Record<string, unknown>;
}

const formatRelativeTime = (dateString: string): string => {
  const date = new Date(dateString);
  const now = new Date();
  const diffMs = now.getTime() - date.getTime();
  const diffMinutes = Math.floor(diffMs / 60000);
  const diffHours = Math.floor(diffMs / 3600000);
  const diffDays = Math.floor(diffMs / 86400000);

  if (diffMinutes < 1) return 'Just now';
  if (diffMinutes < 60) return `${diffMinutes} min ago`;
  if (diffHours < 24) return `${diffHours} hour${diffHours === 1 ? '' : 's'} ago`;
  return `${diffDays} day${diffDays === 1 ? '' : 's'} ago`;
};

const formatDuration = (createdAt: string, updatedAt: string): string => {
  const start = new Date(createdAt);
  const end = new Date(updatedAt);
  const durationMs = end.getTime() - start.getTime();
  const seconds = Math.floor(durationMs / 1000);
  const minutes = Math.floor(seconds / 60);

  if (minutes > 0) {
    const remainingSeconds = seconds % 60;
    return `${minutes}m ${remainingSeconds}s`;
  }
  return `${seconds}s`;
};

const getStatusBadge = (status: string) => {
  switch (status) {
    case 'completed':
      return (
        <Badge variant="success" className="gap-1">
          <CheckCircle2 className="h-3 w-3" />
          Completed
        </Badge>
      );
    case 'failed':
      return (
        <Badge variant="destructive" className="gap-1">
          <XCircle className="h-3 w-3" />
          Failed
        </Badge>
      );
    case 'running':
      return (
        <Badge variant="default" className="gap-1">
          <Loader2 className="h-3 w-3 animate-spin" />
          Running
        </Badge>
      );
    case 'awaiting_approval':
      return (
        <Badge variant="warning" className="gap-1">
          <Clock className="h-3 w-3" />
          Awaiting Approval
        </Badge>
      );
    default:
      return <Badge variant="secondary">{status}</Badge>;
  }
};

const getEventTypeBadge = (eventType: string) => {
  // Convert event_type to readable format (e.g., "post_meeting_no_show" → "Post Meeting No Show")
  const formatted = eventType
    .split('_')
    .map(word => word.charAt(0).toUpperCase() + word.slice(1))
    .join(' ');

  return <Badge variant="outline">{formatted}</Badge>;
};

export const ExecutionHistoryPanel = () => {
  const [selectedEventType, setSelectedEventType] = useState<string>('all');
  const [selectedStatus, setSelectedStatus] = useState<string>('all');
  const [expandedRows, setExpandedRows] = useState<Set<string>>(new Set());

  const { data: jobs, isLoading } = useQuery({
    queryKey: ['sequence-jobs', selectedEventType, selectedStatus],
    queryFn: async (): Promise<SequenceJob[]> => {
      let query = supabase
        .from('sequence_jobs')
        .select('id, event_type, status, step_results, created_at, updated_at, metadata')
        .order('created_at', { ascending: false })
        .limit(50);

      if (selectedEventType !== 'all') {
        query = query.eq('event_type', selectedEventType);
      }

      if (selectedStatus !== 'all') {
        query = query.eq('status', selectedStatus);
      }

      const { data, error } = await query;

      if (error) throw error;
      return data || [];
    },
    refetchInterval: (query) => {
      // Auto-refresh every 15s if there are running jobs
      const hasRunningJobs = query.state.data?.some((job: SequenceJob) => job.status === 'running');
      return hasRunningJobs ? 15000 : false;
    },
  });

  // Get unique event types for the filter dropdown
  const { data: eventTypes } = useQuery({
    queryKey: ['sequence-jobs-event-types'],
    queryFn: async () => {
      const { data } = await supabase
        .from('sequence_jobs')
        .select('event_type')
        .order('event_type');

      const uniqueTypes = [...new Set(data?.map(job => job.event_type) || [])];
      return uniqueTypes;
    },
  });

  const toggleRowExpansion = (jobId: string) => {
    const newExpanded = new Set(expandedRows);
    if (newExpanded.has(jobId)) {
      newExpanded.delete(jobId);
    } else {
      newExpanded.add(jobId);
    }
    setExpandedRows(newExpanded);
  };

  if (isLoading) {
    return (
      <Card>
        <CardHeader>
          <CardTitle>Execution History</CardTitle>
        </CardHeader>
        <CardContent>
          <div className="space-y-2">
            {[...Array(5)].map((_, i) => (
              <div key={i} className="h-12 bg-slate-100 dark:bg-gray-800/50 rounded animate-pulse" />
            ))}
          </div>
        </CardContent>
      </Card>
    );
  }

  return (
    <Card>
      <CardHeader>
        <div className="flex items-center justify-between">
          <CardTitle>Execution History</CardTitle>
          <div className="flex items-center gap-3">
            {/* Event Type Filter */}
            <select
              value={selectedEventType}
              onChange={(e) => setSelectedEventType(e.target.value)}
              className="h-9 rounded-md border border-[#E2E8F0] dark:border-gray-600 bg-white dark:bg-gray-800 px-3 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
            >
              <option value="all">All Events</option>
              {eventTypes?.map(type => (
                <option key={type} value={type}>
                  {type.split('_').map(word => word.charAt(0).toUpperCase() + word.slice(1)).join(' ')}
                </option>
              ))}
            </select>

            {/* Status Filter */}
            <select
              value={selectedStatus}
              onChange={(e) => setSelectedStatus(e.target.value)}
              className="h-9 rounded-md border border-[#E2E8F0] dark:border-gray-600 bg-white dark:bg-gray-800 px-3 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
            >
              <option value="all">All Status</option>
              <option value="completed">Success</option>
              <option value="failed">Failed</option>
              <option value="running">Running</option>
              <option value="awaiting_approval">Awaiting Approval</option>
            </select>
          </div>
        </div>
      </CardHeader>
      <CardContent>
        {!jobs || jobs.length === 0 ? (
          <div className="text-center py-12">
            <Clock className="h-12 w-12 text-gray-400 mx-auto mb-3" />
            <p className="text-sm text-gray-600 dark:text-gray-400">
              No execution history yet. Run an ability to see results here.
            </p>
          </div>
        ) : (
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead className="w-8"></TableHead>
                <TableHead>Event Type</TableHead>
                <TableHead>Status</TableHead>
                <TableHead>Steps</TableHead>
                <TableHead>Duration</TableHead>
                <TableHead>Time</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {jobs.map(job => {
                const isExpanded = expandedRows.has(job.id);
                const completedSteps = job.step_results?.filter(
                  step => step.status === 'completed'
                ).length || 0;
                const totalSteps = job.step_results?.length || 0;

                return (
                  <>
                    <TableRow
                      key={job.id}
                      className="cursor-pointer"
                      onClick={() => toggleRowExpansion(job.id)}
                    >
                      <TableCell>
                        {isExpanded ? (
                          <ChevronDown className="h-4 w-4 text-gray-500" />
                        ) : (
                          <ChevronRight className="h-4 w-4 text-gray-500" />
                        )}
                      </TableCell>
                      <TableCell>{getEventTypeBadge(job.event_type)}</TableCell>
                      <TableCell>{getStatusBadge(job.status)}</TableCell>
                      <TableCell>
                        <span className="text-sm text-gray-600 dark:text-gray-400">
                          {completedSteps}/{totalSteps}
                        </span>
                      </TableCell>
                      <TableCell>
                        <span className="text-sm text-gray-600 dark:text-gray-400">
                          {formatDuration(job.created_at, job.updated_at)}
                        </span>
                      </TableCell>
                      <TableCell>
                        <span className="text-sm text-gray-600 dark:text-gray-400">
                          {formatRelativeTime(job.created_at)}
                        </span>
                      </TableCell>
                    </TableRow>
                    {isExpanded && (
                      <TableRow>
                        <TableCell colSpan={6} className="bg-slate-50 dark:bg-gray-800/30">
                          <div className="py-3 space-y-2">
                            <h4 className="text-xs font-semibold text-gray-700 dark:text-gray-300 uppercase mb-3">
                              Step Details
                            </h4>
                            {job.step_results?.map((step, index) => (
                              <div
                                key={index}
                                className="flex items-start gap-3 p-3 rounded-lg bg-white dark:bg-gray-900/50 border border-[#E2E8F0] dark:border-gray-700"
                              >
                                <div className="flex-shrink-0 mt-0.5">
                                  {step.status === 'completed' ? (
                                    <CheckCircle2 className="h-4 w-4 text-green-600 dark:text-green-400" />
                                  ) : step.status === 'failed' ? (
                                    <XCircle className="h-4 w-4 text-red-600 dark:text-red-400" />
                                  ) : (
                                    <Loader2 className="h-4 w-4 text-blue-600 dark:text-blue-400 animate-spin" />
                                  )}
                                </div>
                                <div className="flex-1 min-w-0">
                                  <div className="flex items-center justify-between gap-2 mb-1">
                                    <span className="text-sm font-medium text-gray-900 dark:text-gray-100">
                                      {step.name}
                                    </span>
                                    {step.duration_ms && (
                                      <span className="text-xs text-gray-500 dark:text-gray-400">
                                        {step.duration_ms}ms
                                      </span>
                                    )}
                                  </div>
                                  {step.error && (
                                    <p className="text-xs text-red-600 dark:text-red-400 mt-1">
                                      Error: {step.error}
                                    </p>
                                  )}
                                </div>
                              </div>
                            ))}
                          </div>
                        </TableCell>
                      </TableRow>
                    )}
                  </>
                );
              })}
            </TableBody>
          </Table>
        )}
      </CardContent>
    </Card>
  );
};
