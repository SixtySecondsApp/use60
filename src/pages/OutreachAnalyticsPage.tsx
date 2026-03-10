import React, { useState, useMemo } from 'react';
import { Helmet } from 'react-helmet-async';
import { BarChart3, Loader2, RefreshCw, Send } from 'lucide-react';
import { useOrg } from '@/lib/contexts/OrgContext';
import { useUser } from '@/lib/hooks/useUser';
import {
  useOutreachCampaignData,
  useOutreachMonitorData,
  useOutreachRepActivity,
  buildReplyIntentBuckets,
  buildDomainHealthFromSequences,
} from '@/lib/services/outreachAnalyticsService';
import { OutreachMetricsCards } from '@/components/outreach/OutreachMetricsCards';
import { EngagementTimeSeriesChart } from '@/components/outreach/EngagementTimeSeriesChart';
import { SequencePerformanceTable } from '@/components/outreach/SequencePerformanceTable';
import { RepActivityLeaderboard } from '@/components/outreach/RepActivityLeaderboard';
import { ReplyIntentBreakdown } from '@/components/outreach/ReplyIntentBreakdown';
import { DomainHealthPanel } from '@/components/outreach/DomainHealthPanel';
import type { OutreachPeriod } from '@/lib/types/outreachAnalytics';

export default function OutreachAnalyticsPage() {
  const { activeOrgId } = useOrg();
  const { userData } = useUser();
  const orgId = activeOrgId ?? '';
  const userId = userData?.id ?? '';

  const [repPeriod, setRepPeriod] = useState<OutreachPeriod>('30d');
  const [activeReplyCategory, setActiveReplyCategory] = useState<string | null>(null);

  const {
    data: campaignData,
    isLoading: campaignLoading,
    refetch,
    isFetching,
  } = useOutreachCampaignData(orgId);

  const { data: monitorData, isLoading: monitorLoading } = useOutreachMonitorData(orgId, userId);

  const { data: repActivity = [], isLoading: repLoading } = useOutreachRepActivity(orgId, repPeriod);

  const replyBuckets = useMemo(
    () => buildReplyIntentBuckets(monitorData?.classified_replies ?? []),
    [monitorData]
  );

  const domainRows = useMemo(
    () => buildDomainHealthFromSequences(campaignData?.sequences ?? []),
    [campaignData]
  );

  const isLoading = campaignLoading;

  return (
    <>
      <Helmet>
        <title>Outreach Analytics — 60</title>
      </Helmet>
    <div className="flex flex-col h-full overflow-y-auto">
      {/* Header */}
      <div className="flex items-center justify-between px-6 py-4 border-b border-gray-200 dark:border-gray-800 shrink-0">
        <div className="flex items-center gap-3">
          <BarChart3 className="h-5 w-5 text-indigo-600 dark:text-indigo-400" />
          <h1 className="text-lg font-semibold text-gray-900 dark:text-white">Outreach Analytics</h1>
        </div>
        <button
          onClick={() => refetch()}
          disabled={isFetching}
          className="flex items-center gap-1.5 text-xs text-gray-500 dark:text-gray-400 hover:text-gray-900 dark:hover:text-white disabled:opacity-50 transition-colors px-2.5 py-1.5 rounded-lg hover:bg-gray-100 dark:hover:bg-gray-800 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-indigo-500 focus-visible:ring-offset-1"
        >
          <RefreshCw className={`h-3.5 w-3.5 ${isFetching ? 'animate-spin' : ''}`} />
          Refresh
        </button>
      </div>

      {/* Content */}
      <div className="flex-1 px-6 py-5 space-y-6 max-w-7xl w-full mx-auto">
        {isLoading ? (
          <div className="flex justify-center py-20">
            <Loader2 className="h-8 w-8 animate-spin text-gray-400 dark:text-gray-400" />
          </div>
        ) : !campaignData || campaignData.campaigns.length === 0 ? (
          /* Empty state */
          <div className="flex flex-col items-center py-24 gap-4 text-gray-400 dark:text-gray-500">
            <Send className="h-16 w-16 opacity-20" />
            <div className="text-center">
              <p className="text-lg font-medium text-gray-500 dark:text-gray-400">No outreach data</p>
              <p className="text-sm mt-1 text-gray-400 dark:text-gray-500">
                Connect Instantly in Settings and create campaigns to see analytics.
              </p>
            </div>
          </div>
        ) : (
          <>
            {/* OUT-001: Metrics cards */}
            <OutreachMetricsCards metrics={campaignData.metrics} />

            {/* OUT-002: Engagement chart + OUT-006: Domain health */}
            <div className="grid grid-cols-1 xl:grid-cols-3 gap-4">
              <div className="xl:col-span-2">
                <EngagementTimeSeriesChart sequences={campaignData.sequences} />
              </div>
              <div>
                <DomainHealthPanel rows={domainRows} />
              </div>
            </div>

            {/* OUT-003: Sequence table */}
            <SequencePerformanceTable sequences={campaignData.sequences} />

            {/* OUT-004: Rep leaderboard + OUT-005: Reply intent */}
            <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
              <RepActivityLeaderboard
                rows={repActivity}
                isLoading={repLoading}
                period={repPeriod}
                onPeriodChange={setRepPeriod}
              />
              <ReplyIntentBreakdown
                buckets={replyBuckets}
                activeCategory={activeReplyCategory}
                onCategoryClick={setActiveReplyCategory}
              />
            </div>
          </>
        )}
      </div>
    </div>
    </>
  );
}
