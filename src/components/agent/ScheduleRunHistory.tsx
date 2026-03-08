/**
 * ScheduleRunHistory — Execution history for scheduled agent jobs
 *
 * Shows last 50 runs from agent_schedule_runs table with status badges,
 * duration, delivery status, and expandable response summaries.
 */

import { Fragment, useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import {
  CheckCircle2,
  XCircle,
  SkipForward,
  RefreshCw,
  Loader2,
  ChevronDown,
  ChevronRight,
  Clock,
} from 'lucide-react';
import { Badge } from '@/components/ui/badge';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table';
import { getScheduleRuns, type AgentScheduleRun } from '@/lib/services/agentTeamService';
import type { AgentSchedule } from '@/lib/services/agentTeamService';
import { describeCron } from '@/components/agent/FrequencyPicker';

interface ScheduleRunHistoryProps {
  organizationId: string;
  schedules: AgentSchedule[];
}

const STATUS_CONFIG: Record<string, { icon: typeof CheckCircle2; variant: 'default' | 'destructive' | 'secondary' | 'outline'; label: string }> = {
  success: { icon: CheckCircle2, variant: 'default', label: 'Success' },
  failed: { icon: XCircle, variant: 'destructive', label: 'Failed' },
  skipped: { icon: SkipForward, variant: 'secondary', label: 'Skipped' },
  catch_up: { icon: RefreshCw, variant: 'outline', label: 'Catch-up' },
};

function formatDuration(ms: number | null): string {
  if (ms === null || ms === undefined) return '-';
  if (ms < 1000) return `${ms}ms`;
  return `${(ms / 1000).toFixed(1)}s`;
}

function formatRelativeTime(dateStr: string): string {
  const diff = Date.now() - new Date(dateStr).getTime();
  const minutes = Math.floor(diff / 60000);
  if (minutes < 1) return 'Just now';
  if (minutes < 60) return `${minutes}m ago`;
  const hours = Math.floor(minutes / 60);
  if (hours < 24) return `${hours}h ago`;
  const days = Math.floor(hours / 24);
  return `${days}d ago`;
}

export default function ScheduleRunHistory({ organizationId, schedules }: ScheduleRunHistoryProps) {
  const [filterScheduleId, setFilterScheduleId] = useState<string>('all');
  const [expandedId, setExpandedId] = useState<string | null>(null);

  const { data: runs = [], isLoading } = useQuery({
    queryKey: ['schedule-runs', organizationId, filterScheduleId],
    queryFn: () => getScheduleRuns(
      organizationId,
      filterScheduleId === 'all' ? undefined : filterScheduleId
    ),
    refetchInterval: 30000,
  });

  return (
    <Card>
      <CardHeader>
        <div className="flex items-center justify-between">
          <div>
            <CardTitle>Execution History</CardTitle>
            <CardDescription>
              Recent agent schedule executions with status, duration, and delivery outcome.
            </CardDescription>
          </div>
          <div className="w-56">
            <Select value={filterScheduleId} onValueChange={setFilterScheduleId}>
              <SelectTrigger>
                <SelectValue placeholder="Filter by schedule" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">All schedules</SelectItem>
                {schedules.map((s) => (
                  <SelectItem key={s.id} value={s.id}>
                    {s.agent_name} — {describeCron(s.cron_expression)}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
        </div>
      </CardHeader>
      <CardContent>
        {isLoading ? (
          <div className="flex items-center justify-center py-12">
            <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
          </div>
        ) : runs.length === 0 ? (
          <div className="flex flex-col items-center justify-center py-12 text-muted-foreground">
            <Clock className="h-10 w-10 mb-3" />
            <p>No execution history yet</p>
            <p className="text-sm mt-1">Runs will appear here after scheduled agents execute.</p>
          </div>
        ) : (
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead className="w-8"></TableHead>
                <TableHead>Time</TableHead>
                <TableHead>Agent</TableHead>
                <TableHead>Status</TableHead>
                <TableHead>Duration</TableHead>
                <TableHead>Delivery</TableHead>
                <TableHead>Error</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {runs.map((run) => {
                const statusCfg = STATUS_CONFIG[run.status] || STATUS_CONFIG.success;
                const StatusIcon = statusCfg.icon;
                const isExpanded = expandedId === run.id;

                return (
                  <Fragment key={run.id}>
                    <TableRow
                      className={run.response_summary ? 'cursor-pointer hover:bg-muted/50' : ''}
                      onClick={() => run.response_summary && setExpandedId(isExpanded ? null : run.id)}
                      role={run.response_summary ? 'button' : undefined}
                      aria-expanded={run.response_summary ? isExpanded : undefined}
                      tabIndex={run.response_summary ? 0 : undefined}
                      onKeyDown={(e) => {
                        if (run.response_summary && (e.key === 'Enter' || e.key === ' ')) {
                          e.preventDefault();
                          setExpandedId(isExpanded ? null : run.id);
                        }
                      }}
                    >
                      <TableCell className="w-8">
                        {run.response_summary ? (
                          isExpanded ? (
                            <ChevronDown className="h-4 w-4 text-muted-foreground" aria-hidden="true" />
                          ) : (
                            <ChevronRight className="h-4 w-4 text-muted-foreground" aria-hidden="true" />
                          )
                        ) : null}
                      </TableCell>
                      <TableCell>
                        <div>
                          <span className="text-sm">{formatRelativeTime(run.created_at)}</span>
                          <span className="block text-[10px] text-muted-foreground">
                            {new Date(run.created_at).toLocaleString()}
                          </span>
                        </div>
                      </TableCell>
                      <TableCell className="font-medium">{run.agent_name}</TableCell>
                      <TableCell>
                        <Badge variant={statusCfg.variant} className="gap-1">
                          <StatusIcon className="h-3 w-3" />
                          {statusCfg.label}
                        </Badge>
                      </TableCell>
                      <TableCell className="text-muted-foreground text-sm">
                        {formatDuration(run.duration_ms)}
                      </TableCell>
                      <TableCell>
                        <Badge variant={run.delivered ? 'default' : 'secondary'} className="text-xs">
                          {run.delivered ? run.delivery_channel : 'Not delivered'}
                        </Badge>
                      </TableCell>
                      <TableCell className="max-w-[200px]">
                        {run.error_message && (
                          <p className="text-sm text-destructive truncate" title={run.error_message}>
                            {run.error_message}
                          </p>
                        )}
                        {run.skip_reason && !run.error_message && (
                          <p className="text-sm text-muted-foreground truncate" title={run.skip_reason}>
                            {run.skip_reason}
                          </p>
                        )}
                      </TableCell>
                    </TableRow>
                    {isExpanded && run.response_summary && (
                      <TableRow key={`${run.id}-detail`}>
                        <TableCell colSpan={7} className="bg-muted/30 border-b">
                          <div className="p-3 text-sm whitespace-pre-wrap max-h-64 overflow-y-auto">
                            {run.response_summary}
                          </div>
                        </TableCell>
                      </TableRow>
                    )}
                  </Fragment>
                );
              })}
            </TableBody>
          </Table>
        )}
      </CardContent>
    </Card>
  );
}
