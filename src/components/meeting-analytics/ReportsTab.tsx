import React, { useState } from 'react';
import { toast } from 'sonner';
import {
  FileText, Send, Clock, CheckCircle, XCircle, Loader2, Bell,
  Video, Target, CheckSquare, Users, Activity, Flame,
  Trophy, AlertTriangle, Lightbulb, TrendingUp, TrendingDown,
} from 'lucide-react';
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
        <div className="rounded-lg border border-gray-200 dark:border-gray-700/50 bg-white dark:bg-gray-900/50 p-6 space-y-6">
          <div className="flex items-center justify-between">
            <h3 className="text-lg font-semibold text-gray-900 dark:text-gray-100">
              {previewData.type === 'daily' ? 'Daily' : 'Weekly'} Report Preview
            </h3>
            <span className="text-xs text-gray-500 dark:text-gray-400">
              {new Date(previewData.generatedAt).toLocaleString()}
            </span>
          </div>

          {/* Section A - Metrics Dashboard */}
          <div className="grid grid-cols-2 lg:grid-cols-3 gap-3">
            {/* Total Meetings */}
            <div className="rounded-lg border border-gray-200 dark:border-gray-700/50 bg-card p-4 relative">
              <Video className="w-4 h-4 text-gray-400 absolute top-4 right-4" />
              <div className="text-2xl font-bold text-gray-900 dark:text-gray-100">
                {previewData.highlights.meetingCount}
              </div>
              <div className="text-xs text-gray-500 dark:text-gray-400 uppercase tracking-wide mt-1">Total Meetings</div>
              {previewData.metrics.trends && previewData.metrics.trends.meetingsTrend !== 0 && (
                <div className={`text-xs mt-1.5 flex items-center gap-0.5 ${previewData.metrics.trends.meetingsTrend > 0 ? 'text-green-600 dark:text-green-400' : 'text-red-600 dark:text-red-400'}`}>
                  {previewData.metrics.trends.meetingsTrend > 0 ? <TrendingUp className="w-3 h-3" /> : <TrendingDown className="w-3 h-3" />}
                  {previewData.metrics.trends.meetingsTrend > 0 ? '+' : ''}{previewData.metrics.trends.meetingsTrend.toFixed(0)}% from last week
                </div>
              )}
            </div>

            {/* Avg Performance Score */}
            <div className="rounded-lg border border-gray-200 dark:border-gray-700/50 bg-card p-4 relative">
              <Target className="w-4 h-4 text-gray-400 absolute top-4 right-4" />
              <div className="text-2xl font-bold text-gray-900 dark:text-gray-100">
                {previewData.metrics.summary.avgPerformanceScore.toFixed(0)}
                <span className="text-sm font-normal text-gray-500 dark:text-gray-400">/100</span>
              </div>
              <div className="text-xs text-gray-500 dark:text-gray-400 uppercase tracking-wide mt-1">Avg Performance Score</div>
              <span className={`inline-block mt-1.5 text-xs font-medium px-1.5 py-0.5 rounded ${
                previewData.metrics.summary.avgPerformanceScore >= 90 ? 'bg-green-100 text-green-700 dark:bg-green-900/30 dark:text-green-400' :
                previewData.metrics.summary.avgPerformanceScore >= 80 ? 'bg-blue-100 text-blue-700 dark:bg-blue-900/30 dark:text-blue-400' :
                previewData.metrics.summary.avgPerformanceScore >= 70 ? 'bg-yellow-100 text-yellow-700 dark:bg-yellow-900/30 dark:text-yellow-400' :
                previewData.metrics.summary.avgPerformanceScore >= 60 ? 'bg-orange-100 text-orange-700 dark:bg-orange-900/30 dark:text-orange-400' :
                'bg-red-100 text-red-700 dark:bg-red-900/30 dark:text-red-400'
              }`}>
                Grade {previewData.metrics.summary.avgPerformanceScore >= 90 ? 'A' : previewData.metrics.summary.avgPerformanceScore >= 80 ? 'B' : previewData.metrics.summary.avgPerformanceScore >= 70 ? 'C' : previewData.metrics.summary.avgPerformanceScore >= 60 ? 'D' : 'F'}
              </span>
            </div>

            {/* Pipeline Health */}
            <div className="rounded-lg border border-gray-200 dark:border-gray-700/50 bg-card p-4 relative">
              <Activity className="w-4 h-4 text-gray-400 absolute top-4 right-4" />
              <div className="text-2xl font-bold text-gray-900 dark:text-gray-100">
                {previewData.metrics.summary.avgConversionScore.toFixed(0)}%
              </div>
              <div className="text-xs text-gray-500 dark:text-gray-400 uppercase tracking-wide mt-1">Pipeline Health</div>
              <div className="mt-2 h-1.5 w-full rounded-full bg-gray-200 dark:bg-gray-700">
                <div
                  className="h-full rounded-full bg-indigo-500"
                  style={{ width: `${Math.min(100, previewData.metrics.summary.avgConversionScore)}%` }}
                />
              </div>
            </div>

            {/* Action Items */}
            <div className="rounded-lg border border-gray-200 dark:border-gray-700/50 bg-card p-4 relative">
              <CheckSquare className="w-4 h-4 text-gray-400 absolute top-4 right-4" />
              <div className="text-2xl font-bold text-gray-900 dark:text-gray-100">
                {previewData.highlights.actionItemsCompleted}
                <span className="text-sm font-normal text-gray-500 dark:text-gray-400">/{previewData.highlights.actionItemsCreated}</span>
              </div>
              <div className="text-xs text-gray-500 dark:text-gray-400 uppercase tracking-wide mt-1">Action Items</div>
              <div className="mt-2 h-1.5 w-full rounded-full bg-gray-200 dark:bg-gray-700">
                <div
                  className="h-full rounded-full bg-emerald-500"
                  style={{ width: `${previewData.highlights.actionItemsCreated > 0 ? (previewData.highlights.actionItemsCompleted / previewData.highlights.actionItemsCreated * 100) : 0}%` }}
                />
              </div>
            </div>

            {/* Talk Time Balance */}
            <div className="rounded-lg border border-gray-200 dark:border-gray-700/50 bg-card p-4 relative">
              <Users className="w-4 h-4 text-gray-400 absolute top-4 right-4" />
              <div className="text-2xl font-bold text-gray-900 dark:text-gray-100">
                {previewData.metrics.summary.avgTalkTimeBalance.toFixed(0)}%
              </div>
              <div className="text-xs text-gray-500 dark:text-gray-400 uppercase tracking-wide mt-1">Talk Time Balance</div>
              <span className={`inline-block mt-1.5 text-xs font-medium px-1.5 py-0.5 rounded ${
                previewData.metrics.summary.avgTalkTimeBalance >= 40 && previewData.metrics.summary.avgTalkTimeBalance <= 60
                  ? 'bg-green-100 text-green-700 dark:bg-green-900/30 dark:text-green-400'
                  : 'bg-amber-100 text-amber-700 dark:bg-amber-900/30 dark:text-amber-400'
              }`}>
                {previewData.metrics.summary.avgTalkTimeBalance >= 40 && previewData.metrics.summary.avgTalkTimeBalance <= 60 ? 'Balanced' : 'Needs improvement'}
              </span>
            </div>

            {/* Avg Conversion Score */}
            <div className="rounded-lg border border-gray-200 dark:border-gray-700/50 bg-card p-4 relative">
              <Flame className="w-4 h-4 text-gray-400 absolute top-4 right-4" />
              <div className="text-2xl font-bold text-gray-900 dark:text-gray-100">
                {previewData.metrics.summary.avgConversionScore.toFixed(0)}
              </div>
              <div className="text-xs text-gray-500 dark:text-gray-400 uppercase tracking-wide mt-1">Avg Conversion Score</div>
              <span className={`inline-block mt-1.5 text-xs font-medium px-1.5 py-0.5 rounded ${
                previewData.metrics.summary.avgConversionScore >= 70 ? 'bg-red-100 text-red-700 dark:bg-red-900/30 dark:text-red-400' :
                previewData.metrics.summary.avgConversionScore >= 40 ? 'bg-amber-100 text-amber-700 dark:bg-amber-900/30 dark:text-amber-400' :
                'bg-blue-100 text-blue-700 dark:bg-blue-900/30 dark:text-blue-400'
              }`}>
                {previewData.metrics.summary.avgConversionScore >= 70 ? 'Hot' : previewData.metrics.summary.avgConversionScore >= 40 ? 'Warm' : 'Cold'}
              </span>
            </div>
          </div>

          {/* Section B - Top Performer Highlight */}
          {previewData.highlights.topPerformer && (
            <div className="rounded-lg border border-emerald-200 dark:border-emerald-800/50 bg-emerald-50/50 dark:bg-emerald-900/10 p-4 flex items-start gap-3">
              <Trophy className="w-5 h-5 text-emerald-600 dark:text-emerald-400 shrink-0 mt-0.5" />
              <div>
                <div className="text-sm font-medium text-gray-900 dark:text-gray-100">Top Performer</div>
                <div className="text-base font-semibold text-emerald-700 dark:text-emerald-300 mt-0.5">
                  {previewData.highlights.topPerformer.title}
                </div>
                <div className="flex items-center gap-2 mt-1">
                  <span className="text-sm text-gray-600 dark:text-gray-400">
                    {previewData.highlights.topPerformer.score}/100
                  </span>
                  <span className="text-xs font-medium px-1.5 py-0.5 rounded bg-emerald-100 text-emerald-700 dark:bg-emerald-900/30 dark:text-emerald-400">
                    Grade {previewData.highlights.topPerformer.grade}
                  </span>
                </div>
              </div>
            </div>
          )}

          {/* Section C - Hottest Deal Highlight */}
          {previewData.highlights.hottestDeal && (
            <div className="rounded-lg border border-orange-200 dark:border-orange-800/50 bg-orange-50/50 dark:bg-orange-900/10 p-4 flex items-start gap-3">
              <Flame className="w-5 h-5 text-orange-600 dark:text-orange-400 shrink-0 mt-0.5" />
              <div>
                <div className="text-sm font-medium text-gray-900 dark:text-gray-100">Hottest Deal</div>
                <div className="text-base font-semibold text-orange-700 dark:text-orange-300 mt-0.5">
                  {previewData.highlights.hottestDeal.title}
                </div>
                <div className="flex items-center gap-2 mt-1">
                  <span className="text-sm text-gray-600 dark:text-gray-400">
                    Conversion: {previewData.highlights.hottestDeal.conversionScore}
                  </span>
                  <span className={`text-xs font-medium px-1.5 py-0.5 rounded ${
                    previewData.highlights.hottestDeal.conversionScore >= 70 ? 'bg-red-100 text-red-700 dark:bg-red-900/30 dark:text-red-400' :
                    previewData.highlights.hottestDeal.conversionScore >= 40 ? 'bg-amber-100 text-amber-700 dark:bg-amber-900/30 dark:text-amber-400' :
                    'bg-blue-100 text-blue-700 dark:bg-blue-900/30 dark:text-blue-400'
                  }`}>
                    {previewData.highlights.hottestDeal.conversionScore >= 70 ? 'Hot' : previewData.highlights.hottestDeal.conversionScore >= 40 ? 'Warm' : 'Cold'}
                  </span>
                </div>
              </div>
            </div>
          )}

          {/* Section D - Needs Attention */}
          {previewData.highlights.needsAttention.length > 0 && (
            <div className="space-y-2">
              <h4 className="text-sm font-medium text-gray-700 dark:text-gray-300">Needs Attention</h4>
              <div className="grid gap-2">
                {previewData.highlights.needsAttention.map((item, i) => (
                  <div key={i} className="rounded-lg border border-amber-200 dark:border-amber-800/50 bg-amber-50/50 dark:bg-amber-900/10 p-3 flex items-start gap-2.5">
                    <AlertTriangle className="w-4 h-4 text-amber-600 dark:text-amber-400 shrink-0 mt-0.5" />
                    <span className="text-sm text-gray-700 dark:text-gray-300">{item}</span>
                  </div>
                ))}
              </div>
            </div>
          )}

          {/* Section E - Recommendations */}
          {previewData.highlights.recommendations.length > 0 && (
            <div className="space-y-2">
              <h4 className="text-sm font-medium text-gray-700 dark:text-gray-300">Recommendations</h4>
              <div className="grid gap-2">
                {previewData.highlights.recommendations.map((item, i) => (
                  <div key={i} className="rounded-lg border border-blue-200 dark:border-blue-800/50 bg-blue-50/50 dark:bg-blue-900/10 p-3 flex items-start gap-2.5">
                    <Lightbulb className="w-4 h-4 text-blue-600 dark:text-blue-400 shrink-0 mt-0.5" />
                    <span className="text-sm text-gray-700 dark:text-gray-300">{item}</span>
                  </div>
                ))}
              </div>
            </div>
          )}

          {/* Section F - Week-over-Week Trends (weekly reports only) */}
          {previewData.type === 'weekly' && previewData.metrics.trends && (
            <div className="rounded-lg border border-gray-200 dark:border-gray-700/50 bg-card p-4">
              <h4 className="text-sm font-medium text-gray-700 dark:text-gray-300 mb-3">Week-over-Week Trends</h4>
              <div className="flex flex-wrap gap-4">
                <div className="flex items-center gap-2">
                  {previewData.metrics.trends.meetingsTrend >= 0 ? (
                    <TrendingUp className="w-4 h-4 text-green-600 dark:text-green-400" />
                  ) : (
                    <TrendingDown className="w-4 h-4 text-red-600 dark:text-red-400" />
                  )}
                  <span className="text-sm text-gray-600 dark:text-gray-400">Meetings:</span>
                  <span className={`text-sm font-medium ${previewData.metrics.trends.meetingsTrend >= 0 ? 'text-green-600 dark:text-green-400' : 'text-red-600 dark:text-red-400'}`}>
                    {previewData.metrics.trends.meetingsTrend >= 0 ? '+' : ''}{previewData.metrics.trends.meetingsTrend.toFixed(0)}%
                  </span>
                </div>
                <div className="flex items-center gap-2">
                  {previewData.metrics.trends.scoreTrend >= 0 ? (
                    <TrendingUp className="w-4 h-4 text-green-600 dark:text-green-400" />
                  ) : (
                    <TrendingDown className="w-4 h-4 text-red-600 dark:text-red-400" />
                  )}
                  <span className="text-sm text-gray-600 dark:text-gray-400">Score:</span>
                  <span className={`text-sm font-medium ${previewData.metrics.trends.scoreTrend >= 0 ? 'text-green-600 dark:text-green-400' : 'text-red-600 dark:text-red-400'}`}>
                    {previewData.metrics.trends.scoreTrend >= 0 ? '+' : ''}{previewData.metrics.trends.scoreTrend.toFixed(0)}%
                  </span>
                </div>
              </div>
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

