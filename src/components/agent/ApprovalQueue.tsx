import { useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { supabase } from '@/lib/supabase/clientV2';
import {
  ShieldCheck,
  CheckCircle2,
  XCircle,
  Clock,
  AlertTriangle,
} from 'lucide-react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import { toast } from 'sonner';

interface SequenceJob {
  id: string;
  event_type: string;
  status: string;
  step_results: Array<{
    name: string;
    status: string;
    error?: string;
    preview?: string;
  }>;
  metadata?: {
    meeting_title?: string;
    contact_name?: string;
    deal_name?: string;
    [key: string]: unknown;
  };
  created_at: string;
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

const getAbilityName = (eventType: string): string => {
  return eventType
    .split('_')
    .map(word => word.charAt(0).toUpperCase() + word.slice(1))
    .join(' ');
};

const getTriggerContext = (job: SequenceJob): string => {
  const { metadata } = job;
  if (!metadata) return 'No context available';

  const parts: string[] = [];
  if (metadata.meeting_title) parts.push(`Meeting: "${metadata.meeting_title}"`);
  if (metadata.contact_name) parts.push(`Contact: ${metadata.contact_name}`);
  if (metadata.deal_name) parts.push(`Deal: ${metadata.deal_name}`);

  return parts.length > 0 ? parts.join(' • ') : 'No context available';
};

const getPendingAction = (job: SequenceJob): { name: string; preview?: string } | null => {
  const pendingStep = job.step_results?.find(step => step.status === 'awaiting_approval');
  if (!pendingStep) return null;

  return {
    name: pendingStep.name,
    preview: pendingStep.preview,
  };
};

export const ApprovalQueue = () => {
  const [rejectDialogOpen, setRejectDialogOpen] = useState(false);
  const [selectedJobId, setSelectedJobId] = useState<string | null>(null);
  const [rejectReason, setRejectReason] = useState('');
  const [activeTab, setActiveTab] = useState<'pending' | 'history'>('pending');

  // Fetch pending approvals
  const { data: pendingJobs, isLoading: pendingLoading } = useQuery({
    queryKey: ['approval-queue-pending'],
    queryFn: async (): Promise<SequenceJob[]> => {
      const { data, error } = await supabase
        .from('sequence_jobs')
        .select('id, event_type, status, step_results, metadata, created_at')
        .eq('status', 'awaiting_approval')
        .order('created_at', { ascending: false });

      if (error) throw error;
      return data || [];
    },
    refetchInterval: 10000, // Auto-refresh every 10s
  });

  // Fetch approval history
  const { data: historyJobs, isLoading: historyLoading } = useQuery({
    queryKey: ['approval-queue-history'],
    queryFn: async (): Promise<SequenceJob[]> => {
      const { data, error } = await supabase
        .from('sequence_jobs')
        .select('id, event_type, status, step_results, metadata, created_at')
        .eq('status', 'completed')
        .order('created_at', { ascending: false })
        .limit(20);

      if (error) throw error;

      // Filter for jobs that have approval-related steps
      const approvalJobs = data?.filter(job =>
        job.step_results?.some(
          step =>
            step.name.toLowerCase().includes('approval') ||
            step.name.toLowerCase().includes('approve')
        )
      ) || [];

      return approvalJobs;
    },
    enabled: activeTab === 'history', // Only fetch when on history tab
  });

  const handleApprove = (jobId: string) => {
    // TODO: Wire to orchestrator resume endpoint
    toast.success('Approval sent', {
      description: 'The ability will resume execution.',
    });
  };

  const handleReject = (jobId: string) => {
    setSelectedJobId(jobId);
    setRejectDialogOpen(true);
  };

  const handleRejectConfirm = () => {
    if (!selectedJobId) return;

    // TODO: Wire to orchestrator reject endpoint
    toast.error('Rejected', {
      description: rejectReason || 'The ability was rejected and will not continue.',
    });

    setRejectDialogOpen(false);
    setSelectedJobId(null);
    setRejectReason('');
  };

  const renderPendingItem = (job: SequenceJob) => {
    const pendingAction = getPendingAction(job);

    return (
      <div
        key={job.id}
        className="p-4 rounded-lg border border-[#E2E8F0] dark:border-gray-700 bg-white dark:bg-gray-900/50 hover:border-blue-300 dark:hover:border-blue-700 transition-colors"
      >
        <div className="space-y-3">
          {/* Header */}
          <div className="flex items-start justify-between gap-3">
            <div className="flex-1 min-w-0">
              <div className="flex items-center gap-2 mb-1">
                <h3 className="text-sm font-semibold text-gray-900 dark:text-gray-100">
                  {getAbilityName(job.event_type)}
                </h3>
                <Badge variant="warning" className="gap-1">
                  <Clock className="h-3 w-3" />
                  Pending
                </Badge>
              </div>
              <p className="text-xs text-gray-600 dark:text-gray-400">
                {getTriggerContext(job)}
              </p>
            </div>
            <span className="text-xs text-gray-500 dark:text-gray-400 whitespace-nowrap">
              {formatRelativeTime(job.created_at)}
            </span>
          </div>

          {/* Pending Action */}
          {pendingAction && (
            <div className="p-3 rounded-md bg-blue-50 dark:bg-blue-900/20 border border-blue-200 dark:border-blue-700/30">
              <div className="flex items-start gap-2">
                <AlertTriangle className="h-4 w-4 text-blue-600 dark:text-blue-400 flex-shrink-0 mt-0.5" />
                <div className="flex-1 min-w-0">
                  <p className="text-xs font-medium text-blue-900 dark:text-blue-100 mb-1">
                    {pendingAction.name}
                  </p>
                  {pendingAction.preview && (
                    <p className="text-xs text-blue-700 dark:text-blue-300 whitespace-pre-wrap">
                      {pendingAction.preview}
                    </p>
                  )}
                </div>
              </div>
            </div>
          )}

          {/* Action Buttons */}
          <div className="flex items-center gap-2">
            <Button
              variant="success"
              size="sm"
              className="flex-1 gap-1.5"
              onClick={() => handleApprove(job.id)}
            >
              <CheckCircle2 className="h-3.5 w-3.5" />
              Approve
            </Button>
            <Button
              variant="outline"
              size="sm"
              className="flex-1 gap-1.5 text-red-600 dark:text-red-400 hover:text-red-700 dark:hover:text-red-300 hover:border-red-300 dark:hover:border-red-600"
              onClick={() => handleReject(job.id)}
            >
              <XCircle className="h-3.5 w-3.5" />
              Reject
            </Button>
          </div>
        </div>
      </div>
    );
  };

  const renderHistoryItem = (job: SequenceJob) => {
    return (
      <div
        key={job.id}
        className="p-4 rounded-lg border border-[#E2E8F0] dark:border-gray-700 bg-white dark:bg-gray-900/50"
      >
        <div className="flex items-start justify-between gap-3">
          <div className="flex-1 min-w-0">
            <div className="flex items-center gap-2 mb-1">
              <h3 className="text-sm font-semibold text-gray-900 dark:text-gray-100">
                {getAbilityName(job.event_type)}
              </h3>
              <Badge variant="success" className="gap-1">
                <CheckCircle2 className="h-3 w-3" />
                Approved
              </Badge>
            </div>
            <p className="text-xs text-gray-600 dark:text-gray-400">
              {getTriggerContext(job)}
            </p>
          </div>
          <span className="text-xs text-gray-500 dark:text-gray-400 whitespace-nowrap">
            {formatRelativeTime(job.created_at)}
          </span>
        </div>
      </div>
    );
  };

  return (
    <>
      <Card>
        <CardHeader>
          <CardTitle>Approval Queue</CardTitle>
        </CardHeader>
        <CardContent>
          <Tabs value={activeTab} onValueChange={(v) => setActiveTab(v as 'pending' | 'history')}>
            <TabsList className="w-full">
              <TabsTrigger value="pending" className="flex-1">
                Pending
                {pendingJobs && pendingJobs.length > 0 && (
                  <Badge variant="warning" className="ml-2">
                    {pendingJobs.length}
                  </Badge>
                )}
              </TabsTrigger>
              <TabsTrigger value="history" className="flex-1">
                History
              </TabsTrigger>
            </TabsList>

            <TabsContent value="pending" className="mt-4">
              {pendingLoading ? (
                <div className="space-y-3">
                  {[...Array(3)].map((_, i) => (
                    <div
                      key={i}
                      className="h-32 bg-slate-100 dark:bg-gray-800/50 rounded-lg animate-pulse"
                    />
                  ))}
                </div>
              ) : !pendingJobs || pendingJobs.length === 0 ? (
                <div className="text-center py-12">
                  <ShieldCheck className="h-12 w-12 text-gray-400 mx-auto mb-3" />
                  <p className="text-sm text-gray-600 dark:text-gray-400 max-w-md mx-auto">
                    No pending approvals. HITL abilities will queue here when they need your sign-off.
                  </p>
                </div>
              ) : (
                <div className="space-y-3">
                  {pendingJobs.map(renderPendingItem)}
                </div>
              )}
            </TabsContent>

            <TabsContent value="history" className="mt-4">
              {historyLoading ? (
                <div className="space-y-3">
                  {[...Array(3)].map((_, i) => (
                    <div
                      key={i}
                      className="h-24 bg-slate-100 dark:bg-gray-800/50 rounded-lg animate-pulse"
                    />
                  ))}
                </div>
              ) : !historyJobs || historyJobs.length === 0 ? (
                <div className="text-center py-12">
                  <Clock className="h-12 w-12 text-gray-400 mx-auto mb-3" />
                  <p className="text-sm text-gray-600 dark:text-gray-400">
                    No approval history yet.
                  </p>
                </div>
              ) : (
                <div className="space-y-3">
                  {historyJobs.map(renderHistoryItem)}
                </div>
              )}
            </TabsContent>
          </Tabs>
        </CardContent>
      </Card>

      {/* Reject Confirmation Dialog */}
      <Dialog open={rejectDialogOpen} onOpenChange={setRejectDialogOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Reject Approval</DialogTitle>
            <DialogDescription>
              Please provide a reason for rejecting this action. This will help the system learn and improve.
            </DialogDescription>
          </DialogHeader>
          <div className="py-4">
            <textarea
              value={rejectReason}
              onChange={(e) => setRejectReason(e.target.value)}
              placeholder="Reason for rejection (optional)"
              className="w-full h-24 px-3 py-2 text-sm border border-[#E2E8F0] dark:border-gray-600 rounded-md bg-white dark:bg-gray-800 text-gray-900 dark:text-gray-100 placeholder:text-gray-500 dark:placeholder:text-gray-400 focus:outline-none focus:ring-2 focus:ring-blue-500 resize-none"
            />
          </div>
          <DialogFooter>
            <Button
              variant="outline"
              onClick={() => {
                setRejectDialogOpen(false);
                setRejectReason('');
              }}
            >
              Cancel
            </Button>
            <Button
              variant="destructive"
              onClick={handleRejectConfirm}
            >
              Confirm Rejection
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </>
  );
};
