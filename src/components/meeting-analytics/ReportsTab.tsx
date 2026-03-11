import React, { useState, useCallback } from 'react';
import { toast } from 'sonner';
import { Send, Clock, CheckCircle, XCircle, Loader2, Bell, Eye, X, Mail, MessageSquare, Radio } from 'lucide-react';
import { Button } from '@/components/ui/button';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import {
  useMaReportHistory,
  useMaSendReport,
  useMaPreviewReportHtml,
} from '@/lib/hooks/useMeetingAnalytics';
import type { MaReportHistoryEntry } from '@/lib/types/meetingAnalytics';
import { NotificationSettingsDialog } from './NotificationSettingsDialog';
import { useAuth } from '@/lib/contexts/AuthContext';

interface DateRange {
  start: Date;
  end: Date;
}

interface ReportsTabProps {
  period?: string;
  dateRange?: DateRange;
}

export function ReportsTab({ period, dateRange }: ReportsTabProps) {
  const [reportType, setReportType] = useState<'daily' | 'weekly'>('daily');
  const [sendChannels, setSendChannels] = useState<'all' | 'slack' | 'email'>('all');
  const [settingsOpen, setSettingsOpen] = useState(false);
  const [previewOpen, setPreviewOpen] = useState(false);
  const [previewHtml, setPreviewHtml] = useState<string | null>(null);

  const { user } = useAuth();

  const startDate = dateRange?.start ? dateRange.start.toISOString() : undefined;
  const endDate = dateRange?.end ? dateRange.end.toISOString() : undefined;

  const userCreatedAt = user?.created_at ?? undefined;
  const historyStartDate = startDate ?? userCreatedAt;

  const { data: history, isLoading: historyLoading } = useMaReportHistory({ limit: 20, startDate: historyStartDate, endDate });
  const sendMutation = useMaSendReport();
  const previewMutation = useMaPreviewReportHtml();

  const handleSend = async () => {
    try {
      const result = await sendMutation.mutateAsync({
        type: reportType,
        channels: sendChannels === 'all' ? undefined : sendChannels,
      });
      const { sent, failed, total } = result.summary;
      if (total === 0) {
        toast.warning('No notification channels configured. Add a Slack webhook or email in Notification Settings.');
      } else if (failed === 0 && sent > 0) {
        toast.success(`Report sent to ${sent} channel${sent !== 1 ? 's' : ''}`);
      } else if (sent === 0) {
        toast.error(`Failed to send report — ${failed} channel${failed !== 1 ? 's' : ''} returned an error. Check Notification Settings.`);
      } else {
        toast.warning(`Sent to ${sent}, failed for ${failed} channel${failed !== 1 ? 's' : ''}`);
      }
    } catch (err) {
      toast.error(err instanceof Error ? err.message : 'Failed to send report');
    }
  };

  const handlePreview = useCallback(async () => {
    try {
      const html = await previewMutation.mutateAsync(reportType);
      setPreviewHtml(html);
      setPreviewOpen(true);
    } catch (err) {
      toast.error(err instanceof Error ? err.message : 'Failed to load preview');
    }
  }, [reportType, previewMutation]);

  return (
    <div className="space-y-6">
      {/* Controls Bar */}
      <div className="bg-white/80 dark:bg-gray-900/40 backdrop-blur-xl rounded-2xl p-4 sm:p-5 border border-gray-200/50 dark:border-gray-700/30 shadow-sm dark:shadow-lg dark:shadow-black/10">
        <div className="flex flex-wrap items-center gap-3">
          <Select value={reportType} onValueChange={(v) => setReportType(v as 'daily' | 'weekly')}>
            <SelectTrigger className="w-[140px] bg-white/60 dark:bg-gray-800/40 border-gray-200/50 dark:border-gray-700/30 rounded-xl">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="daily">Daily</SelectItem>
              <SelectItem value="weekly">Weekly</SelectItem>
            </SelectContent>
          </Select>

          <Select value={sendChannels} onValueChange={(v) => setSendChannels(v as 'all' | 'slack' | 'email')}>
            <SelectTrigger className="w-[160px] bg-white/60 dark:bg-gray-800/40 border-gray-200/50 dark:border-gray-700/30 rounded-xl">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="all">
                <span className="flex items-center gap-1.5"><Radio className="w-3.5 h-3.5" /> All Channels</span>
              </SelectItem>
              <SelectItem value="slack">
                <span className="flex items-center gap-1.5"><MessageSquare className="w-3.5 h-3.5" /> Slack Only</span>
              </SelectItem>
              <SelectItem value="email">
                <span className="flex items-center gap-1.5"><Mail className="w-3.5 h-3.5" /> Email Only</span>
              </SelectItem>
            </SelectContent>
          </Select>

          <Button
            variant="outline"
            onClick={handlePreview}
            disabled={previewMutation.isPending}
            className="gap-1.5 rounded-xl border-gray-200/50 dark:border-gray-700/30 bg-white/60 dark:bg-gray-800/40 hover:bg-white/80 dark:hover:bg-gray-800/60"
          >
            {previewMutation.isPending ? <Loader2 className="w-4 h-4 animate-spin" /> : <Eye className="w-4 h-4" />}
            Preview
          </Button>

          <Button
            onClick={handleSend}
            disabled={sendMutation.isPending}
            className="gap-1.5 rounded-xl bg-emerald-600 hover:bg-emerald-700 dark:bg-emerald-600 dark:hover:bg-emerald-700 text-white"
          >
            {sendMutation.isPending ? <Loader2 className="w-4 h-4 animate-spin" /> : <Send className="w-4 h-4" />}
            Send Report
          </Button>

          <Button
            variant="outline"
            onClick={() => setSettingsOpen(true)}
            className="gap-1.5 ml-auto rounded-xl border-gray-200/50 dark:border-gray-700/30 bg-white/60 dark:bg-gray-800/40 hover:bg-white/80 dark:hover:bg-gray-800/60"
          >
            <Bell className="w-4 h-4" />
            Notification Settings
          </Button>
        </div>
      </div>

      {/* History table */}
      <div className="space-y-3">
        <h3 className="text-sm font-medium uppercase tracking-wider text-gray-500 dark:text-gray-400">Report History</h3>
        {historyLoading ? (
          <div className="bg-white/80 dark:bg-gray-900/40 backdrop-blur-xl rounded-2xl border border-gray-200/50 dark:border-gray-700/30 shadow-sm dark:shadow-lg dark:shadow-black/10 flex items-center justify-center py-12 text-gray-500">
            <Loader2 className="w-5 h-5 animate-spin mr-2" />
            Loading history...
          </div>
        ) : !history || history.length === 0 ? (
          <div className="bg-white/80 dark:bg-gray-900/40 backdrop-blur-xl rounded-2xl border border-gray-200/50 dark:border-gray-700/30 shadow-sm dark:shadow-lg dark:shadow-black/10 text-center py-12">
            <div className="p-3 bg-gray-100/80 dark:bg-gray-800/50 rounded-xl inline-flex mb-3">
              <Clock className="w-6 h-6 text-gray-400" />
            </div>
            <p className="text-sm text-gray-500 dark:text-gray-400">No reports sent yet</p>
            <p className="text-xs text-gray-400 dark:text-gray-500 mt-1">
              Choose daily or weekly, then hit Send Report to deliver to your configured channels.
            </p>
          </div>
        ) : (
          <div className="bg-white/80 dark:bg-gray-900/40 backdrop-blur-xl rounded-2xl border border-gray-200/50 dark:border-gray-700/30 shadow-sm dark:shadow-lg dark:shadow-black/10 overflow-hidden">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-gray-200/50 dark:border-gray-700/30 bg-gray-50/50 dark:bg-gray-800/20">
                  <th className="px-4 py-3 text-left font-medium text-gray-600 dark:text-gray-400 text-xs uppercase tracking-wider">Type</th>
                  <th className="px-4 py-3 text-left font-medium text-gray-600 dark:text-gray-400 text-xs uppercase tracking-wider">Channel</th>
                  <th className="px-4 py-3 text-left font-medium text-gray-600 dark:text-gray-400 text-xs uppercase tracking-wider">Target</th>
                  <th className="px-4 py-3 text-left font-medium text-gray-600 dark:text-gray-400 text-xs uppercase tracking-wider">Status</th>
                  <th className="px-4 py-3 text-left font-medium text-gray-600 dark:text-gray-400 text-xs uppercase tracking-wider">Sent</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-100/60 dark:divide-gray-800/40">
                {history.map((entry: MaReportHistoryEntry) => (
                  <tr key={entry.id} className="hover:bg-gray-50/50 dark:hover:bg-gray-800/30 transition-colors">
                    <td className="px-4 py-3 capitalize text-gray-700 dark:text-gray-300">{entry.reportType}</td>
                    <td className="px-4 py-3 capitalize text-gray-700 dark:text-gray-300">{entry.channelType}</td>
                    <td className="px-4 py-3 text-gray-600 dark:text-gray-400 truncate max-w-[200px]">
                      {entry.channelTarget}
                    </td>
                    <td className="px-4 py-3">
                      {entry.status === 'sent' ? (
                        <span className="inline-flex items-center gap-1.5 text-xs font-medium text-green-700 dark:text-green-400 bg-green-100/80 dark:bg-green-500/10 px-2 py-0.5 rounded-md border border-green-200/50 dark:border-green-500/20">
                          <CheckCircle className="w-3.5 h-3.5" /> Sent
                        </span>
                      ) : (
                        <span className="inline-flex items-center gap-1.5 text-xs font-medium text-red-700 dark:text-red-400 bg-red-100/80 dark:bg-red-500/10 px-2 py-0.5 rounded-md border border-red-200/50 dark:border-red-500/20" title={entry.errorMessage || undefined}>
                          <XCircle className="w-3.5 h-3.5" /> Failed
                        </span>
                      )}
                    </td>
                    <td className="px-4 py-3 text-gray-500 dark:text-gray-400 text-xs">
                      {new Date(entry.sentAt).toLocaleString()}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>

      {/* Preview Modal */}
      <Dialog open={previewOpen} onOpenChange={setPreviewOpen}>
        <DialogContent aria-describedby={undefined} className="sm:max-w-2xl max-h-[85vh] p-0 overflow-hidden bg-[#0f172a] border border-gray-700/50">
          <DialogHeader className="px-5 pt-5 pb-3 border-b border-gray-700/40">
            <DialogTitle className="text-base font-semibold text-gray-100 flex items-center gap-2">
              <Eye className="w-4 h-4 text-emerald-500" />
              {reportType === 'daily' ? 'Daily' : 'Weekly'} Report Preview
            </DialogTitle>
            <p className="text-xs text-gray-400 mt-0.5">
              This is exactly what will be sent to your email channels.
            </p>
          </DialogHeader>
          <div className="overflow-y-auto flex-1 bg-[#0f172a] scrollbar-custom" style={{ maxHeight: 'calc(85vh - 80px)' }}>
            {previewHtml ? (
              <iframe
                srcDoc={previewHtml.replace(
                  '</head>',
                  `<style>
                    html { scrollbar-width: thin; scrollbar-color: rgba(71,85,105,0.7) transparent; }
                    ::-webkit-scrollbar { width: 6px; }
                    ::-webkit-scrollbar-track { background: transparent; }
                    ::-webkit-scrollbar-thumb { background-color: rgba(71,85,105,0.7); border-radius: 9999px; }
                    ::-webkit-scrollbar-thumb:hover { background-color: rgba(100,116,139,0.9); }
                  </style></head>`
                )}
                title="Report Preview"
                className="w-full border-0 bg-[#0f172a]"
                style={{ minHeight: '600px', height: '100%' }}
                sandbox="allow-same-origin"
              />
            ) : (
              <div className="flex items-center justify-center py-20 text-gray-400">
                <Loader2 className="w-5 h-5 animate-spin mr-2" />
                Loading preview...
              </div>
            )}
          </div>
        </DialogContent>
      </Dialog>

      <NotificationSettingsDialog open={settingsOpen} onOpenChange={setSettingsOpen} />
    </div>
  );
}
