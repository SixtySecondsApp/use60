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
  const [previewData, setPreviewData] = useState<MaReport | null>(null);
  const [settingsOpen, setSettingsOpen] = useState(false);

  const startDate = dateRange?.start ? dateRange.start.toISOString() : undefined;
  const endDate = dateRange?.end ? dateRange.end.toISOString() : undefined;

  const { data: history, isLoading: historyLoading } = useMaReportHistory({ limit: 20, startDate, endDate });
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

          <Button
            onClick={handleGenerate}
            disabled={generateMutation.isPending}
            variant="outline"
            className="gap-1.5 rounded-xl border-gray-200/50 dark:border-gray-700/30 bg-white/60 dark:bg-gray-800/40 hover:bg-white/80 dark:hover:bg-gray-800/60"
          >
            {generateMutation.isPending ? <Loader2 className="w-4 h-4 animate-spin" /> : <FileText className="w-4 h-4" />}
            Generate Preview
          </Button>

          <Button
            onClick={handleSend}
            disabled={sendMutation.isPending}
            className="gap-1.5 rounded-xl bg-emerald-600 hover:bg-emerald-700 dark:bg-emerald-600 dark:hover:bg-emerald-700 text-white"
          >
            {sendMutation.isPending ? <Loader2 className="w-4 h-4 animate-spin" /> : <Send className="w-4 h-4" />}
            Send to All Channels
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

      {/* Preview */}
      {previewData && (
        <div className="bg-white/80 dark:bg-gray-900/40 backdrop-blur-xl rounded-2xl border border-gray-200/50 dark:border-gray-700/30 shadow-sm dark:shadow-lg dark:shadow-black/10 overflow-hidden">
          {/* Preview Header */}
          <div className="flex items-center justify-between px-5 py-4 border-b border-gray-200/50 dark:border-gray-700/30">
            <div>
              <h3 className="text-lg font-semibold text-gray-900 dark:text-gray-100">
                {previewData.type === 'daily' ? 'Daily' : 'Weekly'} Report Preview
              </h3>
              <p className="text-xs text-gray-500 dark:text-gray-400 mt-0.5">
                Generated {new Date(previewData.generatedAt).toLocaleString()}
              </p>
            </div>
          </div>

          <div className="p-5 space-y-6">
            {/* Section A - Metrics Dashboard */}
            <div className="grid grid-cols-2 lg:grid-cols-3 gap-3">
              {/* Total Meetings */}
              <div className="bg-white/60 dark:bg-gray-800/40 rounded-xl p-4 border border-gray-200/50 dark:border-gray-700/30">
                <div className="flex items-start justify-between mb-3">
                  <div className="p-1.5 bg-emerald-600/10 dark:bg-emerald-500/20 rounded-lg border border-emerald-600/20">
                    <Video className="w-4 h-4 text-emerald-600 dark:text-emerald-400" />
                  </div>
                </div>
                <div className="text-xl font-bold text-gray-900 dark:text-gray-100">
                  {previewData.highlights.meetingCount}
                </div>
                <div className="text-xs font-medium text-gray-500 dark:text-gray-400 uppercase tracking-wider mt-1">Total Meetings</div>
                {previewData.metrics.trends && previewData.metrics.trends.meetingsTrend !== 0 && (
                  <div className={`text-xs mt-1.5 flex items-center gap-0.5 ${previewData.metrics.trends.meetingsTrend > 0 ? 'text-green-600 dark:text-green-400' : 'text-red-600 dark:text-red-400'}`}>
                    {previewData.metrics.trends.meetingsTrend > 0 ? <TrendingUp className="w-3 h-3" /> : <TrendingDown className="w-3 h-3" />}
                    {previewData.metrics.trends.meetingsTrend > 0 ? '+' : ''}{previewData.metrics.trends.meetingsTrend.toFixed(0)}% from last week
                  </div>
                )}
              </div>

              {/* Avg Performance Score */}
              <div className="bg-white/60 dark:bg-gray-800/40 rounded-xl p-4 border border-gray-200/50 dark:border-gray-700/30">
                <div className="flex items-start justify-between mb-3">
                  <div className="p-1.5 bg-violet-600/10 dark:bg-violet-500/20 rounded-lg border border-violet-600/20">
                    <Target className="w-4 h-4 text-violet-600 dark:text-violet-400" />
                  </div>
                </div>
                <div className="text-xl font-bold text-gray-900 dark:text-gray-100">
                  {previewData.metrics.summary.avgPerformanceScore.toFixed(0)}
                  <span className="text-sm font-normal text-gray-500 dark:text-gray-400">/100</span>
                </div>
                <div className="text-xs font-medium text-gray-500 dark:text-gray-400 uppercase tracking-wider mt-1">Avg Performance</div>
                <span className={`inline-block mt-1.5 text-xs font-medium px-1.5 py-0.5 rounded-md ${
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
              <div className="bg-white/60 dark:bg-gray-800/40 rounded-xl p-4 border border-gray-200/50 dark:border-gray-700/30">
                <div className="flex items-start justify-between mb-3">
                  <div className="p-1.5 bg-blue-600/10 dark:bg-blue-500/20 rounded-lg border border-blue-600/20">
                    <Activity className="w-4 h-4 text-blue-600 dark:text-blue-400" />
                  </div>
                </div>
                <div className="text-xl font-bold text-gray-900 dark:text-gray-100">
                  {previewData.metrics.summary.avgConversionScore.toFixed(0)}%
                </div>
                <div className="text-xs font-medium text-gray-500 dark:text-gray-400 uppercase tracking-wider mt-1">Pipeline Health</div>
                <div className="mt-2 h-1.5 w-full rounded-full bg-gray-200/70 dark:bg-gray-700/50">
                  <div
                    className="h-full rounded-full bg-blue-500"
                    style={{ width: `${Math.min(100, previewData.metrics.summary.avgConversionScore)}%` }}
                  />
                </div>
              </div>

              {/* Action Items */}
              <div className="bg-white/60 dark:bg-gray-800/40 rounded-xl p-4 border border-gray-200/50 dark:border-gray-700/30">
                <div className="flex items-start justify-between mb-3">
                  <div className="p-1.5 bg-amber-600/10 dark:bg-amber-500/20 rounded-lg border border-amber-600/20">
                    <CheckSquare className="w-4 h-4 text-amber-600 dark:text-amber-400" />
                  </div>
                </div>
                <div className="text-xl font-bold text-gray-900 dark:text-gray-100">
                  {previewData.highlights.actionItemsCompleted}
                  <span className="text-sm font-normal text-gray-500 dark:text-gray-400">/{previewData.highlights.actionItemsCreated}</span>
                </div>
                <div className="text-xs font-medium text-gray-500 dark:text-gray-400 uppercase tracking-wider mt-1">Action Items</div>
                <div className="mt-2 h-1.5 w-full rounded-full bg-gray-200/70 dark:bg-gray-700/50">
                  <div
                    className="h-full rounded-full bg-amber-500"
                    style={{ width: `${previewData.highlights.actionItemsCreated > 0 ? (previewData.highlights.actionItemsCompleted / previewData.highlights.actionItemsCreated * 100) : 0}%` }}
                  />
                </div>
              </div>

              {/* Talk Time Balance */}
              <div className="bg-white/60 dark:bg-gray-800/40 rounded-xl p-4 border border-gray-200/50 dark:border-gray-700/30">
                <div className="flex items-start justify-between mb-3">
                  <div className="p-1.5 bg-cyan-600/10 dark:bg-cyan-500/20 rounded-lg border border-cyan-600/20">
                    <Users className="w-4 h-4 text-cyan-600 dark:text-cyan-400" />
                  </div>
                </div>
                <div className="text-xl font-bold text-gray-900 dark:text-gray-100">
                  {previewData.metrics.summary.avgTalkTimeBalance.toFixed(0)}%
                </div>
                <div className="text-xs font-medium text-gray-500 dark:text-gray-400 uppercase tracking-wider mt-1">Talk Time</div>
                <span className={`inline-block mt-1.5 text-xs font-medium px-1.5 py-0.5 rounded-md ${
                  previewData.metrics.summary.avgTalkTimeBalance >= 40 && previewData.metrics.summary.avgTalkTimeBalance <= 60
                    ? 'bg-green-100 text-green-700 dark:bg-green-900/30 dark:text-green-400'
                    : 'bg-amber-100 text-amber-700 dark:bg-amber-900/30 dark:text-amber-400'
                }`}>
                  {previewData.metrics.summary.avgTalkTimeBalance >= 40 && previewData.metrics.summary.avgTalkTimeBalance <= 60 ? 'Balanced' : 'Needs improvement'}
                </span>
              </div>

              {/* Avg Conversion Score */}
              <div className="bg-white/60 dark:bg-gray-800/40 rounded-xl p-4 border border-gray-200/50 dark:border-gray-700/30">
                <div className="flex items-start justify-between mb-3">
                  <div className="p-1.5 bg-orange-600/10 dark:bg-orange-500/20 rounded-lg border border-orange-600/20">
                    <Flame className="w-4 h-4 text-orange-600 dark:text-orange-400" />
                  </div>
                </div>
                <div className="text-xl font-bold text-gray-900 dark:text-gray-100">
                  {previewData.metrics.summary.avgConversionScore.toFixed(0)}
                </div>
                <div className="text-xs font-medium text-gray-500 dark:text-gray-400 uppercase tracking-wider mt-1">Conversion Score</div>
                <span className={`inline-block mt-1.5 text-xs font-medium px-1.5 py-0.5 rounded-md ${
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
              <div className="bg-gradient-to-br from-emerald-500/5 to-emerald-600/5 dark:from-emerald-500/10 dark:to-emerald-600/10 border border-emerald-200/50 dark:border-emerald-500/20 rounded-2xl p-4 sm:p-5 flex items-start gap-3">
                <div className="p-2 bg-emerald-600/10 dark:bg-emerald-500/20 rounded-xl border border-emerald-600/20 shrink-0 mt-0.5">
                  <Trophy className="w-4 h-4 text-emerald-600 dark:text-emerald-400" />
                </div>
                <div>
                  <div className="text-xs font-medium text-gray-500 dark:text-gray-400 uppercase tracking-wider">Top Performer</div>
                  <div className="text-base font-semibold text-emerald-700 dark:text-emerald-300 mt-0.5">
                    {previewData.highlights.topPerformer.title}
                  </div>
                  <div className="flex items-center gap-2 mt-1">
                    <span className="text-sm text-gray-600 dark:text-gray-400">
                      {previewData.highlights.topPerformer.score}/100
                    </span>
                    <span className="text-xs font-medium px-1.5 py-0.5 rounded-md bg-emerald-100 text-emerald-700 dark:bg-emerald-900/30 dark:text-emerald-400">
                      Grade {previewData.highlights.topPerformer.grade}
                    </span>
                  </div>
                </div>
              </div>
            )}

            {/* Section C - Hottest Deal Highlight */}
            {previewData.highlights.hottestDeal && (
              <div className="bg-gradient-to-br from-orange-500/5 to-orange-600/5 dark:from-orange-500/10 dark:to-orange-600/10 border border-orange-200/50 dark:border-orange-500/20 rounded-2xl p-4 sm:p-5 flex items-start gap-3">
                <div className="p-2 bg-orange-600/10 dark:bg-orange-500/20 rounded-xl border border-orange-600/20 shrink-0 mt-0.5">
                  <Flame className="w-4 h-4 text-orange-600 dark:text-orange-400" />
                </div>
                <div>
                  <div className="text-xs font-medium text-gray-500 dark:text-gray-400 uppercase tracking-wider">Hottest Deal</div>
                  <div className="text-base font-semibold text-orange-700 dark:text-orange-300 mt-0.5">
                    {previewData.highlights.hottestDeal.title}
                  </div>
                  <div className="flex items-center gap-2 mt-1">
                    <span className="text-sm text-gray-600 dark:text-gray-400">
                      Conversion: {previewData.highlights.hottestDeal.conversionScore}
                    </span>
                    <span className={`text-xs font-medium px-1.5 py-0.5 rounded-md ${
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
                <h4 className="text-sm font-medium text-gray-600 dark:text-gray-300">Needs Attention</h4>
                <div className="grid gap-2">
                  {previewData.highlights.needsAttention.map((item, i) => (
                    <div key={i} className="bg-gradient-to-br from-amber-500/5 to-amber-600/5 dark:from-amber-500/10 dark:to-amber-600/10 border border-amber-200/50 dark:border-amber-500/20 rounded-2xl p-3 flex items-start gap-2.5">
                      <div className="p-1.5 bg-amber-600/10 dark:bg-amber-500/20 rounded-lg border border-amber-600/20 shrink-0 mt-0.5">
                        <AlertTriangle className="w-3.5 h-3.5 text-amber-600 dark:text-amber-400" />
                      </div>
                      <span className="text-sm text-gray-700 dark:text-gray-300">{item}</span>
                    </div>
                  ))}
                </div>
              </div>
            )}

            {/* Section E - Recommendations */}
            {previewData.highlights.recommendations.length > 0 && (
              <div className="space-y-2">
                <h4 className="text-sm font-medium text-gray-600 dark:text-gray-300">Recommendations</h4>
                <div className="grid gap-2">
                  {previewData.highlights.recommendations.map((item, i) => (
                    <div key={i} className="bg-gradient-to-br from-blue-500/5 to-blue-600/5 dark:from-blue-500/10 dark:to-blue-600/10 border border-blue-200/50 dark:border-blue-500/20 rounded-2xl p-3 flex items-start gap-2.5">
                      <div className="p-1.5 bg-blue-600/10 dark:bg-blue-500/20 rounded-lg border border-blue-600/20 shrink-0 mt-0.5">
                        <Lightbulb className="w-3.5 h-3.5 text-blue-600 dark:text-blue-400" />
                      </div>
                      <span className="text-sm text-gray-700 dark:text-gray-300">{item}</span>
                    </div>
                  ))}
                </div>
              </div>
            )}

            {/* Section F - Week-over-Week Trends (weekly reports only) */}
            {previewData.type === 'weekly' && previewData.metrics.trends && (
              <div className="bg-white/60 dark:bg-gray-800/40 rounded-xl p-4 border border-gray-200/50 dark:border-gray-700/30">
                <h4 className="text-sm font-medium text-gray-600 dark:text-gray-300 mb-3">Week-over-Week Trends</h4>
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
        </div>
      )}

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

      <NotificationSettingsDialog open={settingsOpen} onOpenChange={setSettingsOpen} />
    </div>
  );
}
