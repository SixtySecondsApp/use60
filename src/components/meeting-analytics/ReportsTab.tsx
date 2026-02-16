import React, { useState } from 'react';
import { toast } from 'sonner';
import { FileText, Send, Clock, CheckCircle, XCircle, Loader2, Bell } from 'lucide-react';
import { Button } from '@/components/ui/button';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import {
  useMaReportHistory,
  useMaGenerateReport,
  useMaSendReport,
} from '@/lib/hooks/useMeetingAnalytics';
import type { MaReportHistoryEntry, MaReport } from '@/lib/types/meetingAnalytics';
import { NotificationSettingsDialog } from './NotificationSettingsDialog';

export function ReportsTab() {
  const [reportType, setReportType] = useState<'daily' | 'weekly'>('daily');
  const [previewData, setPreviewData] = useState<MaReport | null>(null);
  const [settingsOpen, setSettingsOpen] = useState(false);

  const { data: history, isLoading: historyLoading } = useMaReportHistory(20);
  const generateMutation = useMaGenerateReport();
  const sendMutation = useMaSendReport();

  const handleGenerate = async () => {
    try {
      const report = await generateMutation.mutateAsync({ type: reportType });
      setPreviewData(report);
      toast.success(`${reportType === 'daily' ? 'Daily' : 'Weekly'} report generated`);
    } catch (err) {
      toast.error(err instanceof Error ? err.message : 'Failed to generate report');
    }
  };

  const handleSend = async () => {
    try {
      const result = await sendMutation.mutateAsync({ type: reportType });
      const { sent, failed } = result.summary;
      if (failed === 0) {
        toast.success(`Report sent to ${sent} channel${sent !== 1 ? 's' : ''}`);
      } else {
        toast.warning(`Sent to ${sent}, failed for ${failed} channel${failed !== 1 ? 's' : ''}`);
      }
    } catch (err) {
      toast.error(err instanceof Error ? err.message : 'Failed to send report');
    }
  };

  return (
    <div className="space-y-6">
      {/* Controls */}
      <div className="flex flex-wrap items-center gap-3">
        <Select value={reportType} onValueChange={(v) => setReportType(v as 'daily' | 'weekly')}>
          <SelectTrigger className="w-[140px] bg-white dark:bg-gray-800/50 border-gray-200 dark:border-gray-700/50">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="daily">Daily</SelectItem>
            <SelectItem value="weekly">Weekly</SelectItem>
          </SelectContent>
        </Select>

        <Button
          onClick={handleGenerate}
          disabled={generateMutation.isPending}
          variant="outline"
          className="gap-1.5"
        >
          {generateMutation.isPending ? <Loader2 className="w-4 h-4 animate-spin" /> : <FileText className="w-4 h-4" />}
          Generate Preview
        </Button>

        <Button
          onClick={handleSend}
          disabled={sendMutation.isPending}
          className="gap-1.5"
        >
          {sendMutation.isPending ? <Loader2 className="w-4 h-4 animate-spin" /> : <Send className="w-4 h-4" />}
          Send to All Channels
        </Button>

        <Button
          variant="outline"
          onClick={() => setSettingsOpen(true)}
          className="gap-1.5 ml-auto"
        >
          <Bell className="w-4 h-4" />
          Notification Settings
        </Button>
      </div>

      {/* Preview */}
      {previewData && (
        <div className="rounded-lg border border-gray-200 dark:border-gray-700/50 bg-white dark:bg-gray-900/50 p-6 space-y-4">
          <div className="flex items-center justify-between">
            <h3 className="text-lg font-semibold text-gray-900 dark:text-gray-100">
              {previewData.type === 'daily' ? 'Daily' : 'Weekly'} Report Preview
            </h3>
            <span className="text-xs text-gray-500 dark:text-gray-400">
              {new Date(previewData.generatedAt).toLocaleString()}
            </span>
          </div>

          {/* Highlights */}
          <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
            <StatCard label="Meetings" value={previewData.highlights.meetingCount} />
            <StatCard label="Action Items Created" value={previewData.highlights.actionItemsCreated} />
            <StatCard label="Action Items Done" value={previewData.highlights.actionItemsCompleted} />
            <StatCard
              label="Top Performer"
              value={previewData.highlights.topPerformer?.title ?? 'N/A'}
              sub={previewData.highlights.topPerformer ? `${previewData.highlights.topPerformer.score}/100 (${previewData.highlights.topPerformer.grade})` : undefined}
            />
          </div>

          {previewData.highlights.needsAttention.length > 0 && (
            <div>
              <h4 className="text-sm font-medium text-gray-700 dark:text-gray-300 mb-2">Needs Attention</h4>
              <ul className="space-y-1">
                {previewData.highlights.needsAttention.map((item, i) => (
                  <li key={i} className="text-sm text-yellow-700 dark:text-yellow-400 flex items-start gap-1.5">
                    <span className="shrink-0 mt-0.5">&#9888;</span>
                    {item}
                  </li>
                ))}
              </ul>
            </div>
          )}

          {previewData.highlights.recommendations.length > 0 && (
            <div>
              <h4 className="text-sm font-medium text-gray-700 dark:text-gray-300 mb-2">Recommendations</h4>
              <ul className="space-y-1">
                {previewData.highlights.recommendations.map((item, i) => (
                  <li key={i} className="text-sm text-blue-700 dark:text-blue-400 flex items-start gap-1.5">
                    <span className="shrink-0 mt-0.5">&#128161;</span>
                    {item}
                  </li>
                ))}
              </ul>
            </div>
          )}
        </div>
      )}

      {/* History table */}
      <div>
        <h3 className="text-lg font-semibold text-gray-900 dark:text-gray-100 mb-3">Report History</h3>
        {historyLoading ? (
          <div className="flex items-center justify-center py-12 text-gray-500">
            <Loader2 className="w-5 h-5 animate-spin mr-2" />
            Loading history...
          </div>
        ) : !history || history.length === 0 ? (
          <div className="text-center py-12 text-gray-500 dark:text-gray-400">
            <Clock className="w-8 h-8 mx-auto mb-2 opacity-50" />
            <p>No reports sent yet</p>
          </div>
        ) : (
          <div className="border border-gray-200 dark:border-gray-700/50 rounded-lg overflow-hidden">
            <table className="w-full text-sm">
              <thead className="bg-gray-50 dark:bg-gray-800/50">
                <tr>
                  <th className="px-4 py-2.5 text-left font-medium text-gray-600 dark:text-gray-400">Type</th>
                  <th className="px-4 py-2.5 text-left font-medium text-gray-600 dark:text-gray-400">Channel</th>
                  <th className="px-4 py-2.5 text-left font-medium text-gray-600 dark:text-gray-400">Target</th>
                  <th className="px-4 py-2.5 text-left font-medium text-gray-600 dark:text-gray-400">Status</th>
                  <th className="px-4 py-2.5 text-left font-medium text-gray-600 dark:text-gray-400">Sent</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-100 dark:divide-gray-800">
                {history.map((entry: MaReportHistoryEntry) => (
                  <tr key={entry.id} className="hover:bg-gray-50/50 dark:hover:bg-gray-800/30">
                    <td className="px-4 py-2.5 capitalize">{entry.reportType}</td>
                    <td className="px-4 py-2.5 capitalize">{entry.channelType}</td>
                    <td className="px-4 py-2.5 text-gray-600 dark:text-gray-400 truncate max-w-[200px]">
                      {entry.channelTarget}
                    </td>
                    <td className="px-4 py-2.5">
                      {entry.status === 'sent' ? (
                        <span className="inline-flex items-center gap-1 text-green-600 dark:text-green-400">
                          <CheckCircle className="w-3.5 h-3.5" /> Sent
                        </span>
                      ) : (
                        <span className="inline-flex items-center gap-1 text-red-600 dark:text-red-400" title={entry.errorMessage || undefined}>
                          <XCircle className="w-3.5 h-3.5" /> Failed
                        </span>
                      )}
                    </td>
                    <td className="px-4 py-2.5 text-gray-500 dark:text-gray-400 text-xs">
                      {new Date(entry.sentAt).toLocaleString()}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>

      <NotificationSettingsDialog open={settingsOpen} onOpenChange={setSettingsOpen} />
    </div>
  );
}

function StatCard({ label, value, sub }: { label: string; value: string | number; sub?: string }) {
  return (
    <div className="rounded-lg bg-gray-50 dark:bg-gray-800/40 p-3 text-center">
      <div className="text-xl font-bold text-indigo-600 dark:text-indigo-400 truncate">{value}</div>
      <div className="text-xs text-gray-500 dark:text-gray-400 uppercase tracking-wide">{label}</div>
      {sub && <div className="text-xs text-gray-500 dark:text-gray-400 mt-0.5">{sub}</div>}
    </div>
  );
}
