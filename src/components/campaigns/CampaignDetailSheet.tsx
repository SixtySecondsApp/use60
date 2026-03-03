import React, { useState } from 'react';
import { Sheet, SheetContent, SheetHeader, SheetTitle } from '@/components/ui/sheet';
import {
  Send,
  Eye,
  MousePointerClick,
  MessageSquare,
  AlertTriangle,
  UserX,
  Users,
  UserCheck,
  RefreshCw,
  Loader2,
  BarChart3,
} from 'lucide-react';
import { useCampaignAnalytics } from '@/lib/services/campaignService';
import { campaignStatusLabel, campaignStatusColor } from './campaignUtils';
import { CampaignPerformanceChart } from './CampaignPerformanceChart';
import { ReplyClassificationPanel } from './ReplyClassificationPanel';
import { CampaignRecommendationsPanel } from './CampaignRecommendationsPanel';
import { CampaignSyncSection } from './CampaignSyncSection';
import type { Campaign, MonitorData } from '@/lib/types/campaign';

interface Props {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  campaign: Campaign | null;
  orgId: string;
  userId: string;
  monitorData?: MonitorData;
  monitorLoading?: boolean;
}

type DetailTab = 'overview' | 'replies' | 'recommendations' | 'sync';

const TABS: { id: DetailTab; label: string }[] = [
  { id: 'overview', label: 'Overview' },
  { id: 'replies', label: 'Replies' },
  { id: 'recommendations', label: 'Insights' },
  { id: 'sync', label: 'Sync' },
];

export function CampaignDetailSheet({
  open,
  onOpenChange,
  campaign,
  orgId,
  userId,
  monitorData,
  monitorLoading,
}: Props) {
  const [tab, setTab] = useState<DetailTab>('overview');

  const { data: analytics, isLoading: analyticsLoading, refetch, isFetching } =
    useCampaignAnalytics(orgId, campaign?.id ?? null);

  const safeDiv = (a?: number, b?: number) => {
    if (!a || !b || b === 0) return '—';
    return `${((a / b) * 100).toFixed(1)}%`;
  };

  if (!campaign) return null;

  const statusLabel = campaignStatusLabel(campaign.status);
  const statusColor = campaignStatusColor(campaign.status);

  return (
    <Sheet open={open} onOpenChange={onOpenChange}>
      <SheetContent className="!top-16 !h-[calc(100vh-4rem)] w-[520px] flex flex-col overflow-hidden">
        <SheetHeader className="shrink-0">
          <SheetTitle className="flex items-center justify-between">
            <div className="flex items-center gap-2 min-w-0">
              <BarChart3 className="h-5 w-5 shrink-0 text-indigo-400" />
              <span className="truncate">{campaign.name}</span>
            </div>
            <div className="flex items-center gap-2 shrink-0">
              <span
                className={`inline-flex items-center rounded border px-2 py-0.5 text-xs font-medium ${statusColor}`}
              >
                {statusLabel}
              </span>
              <button
                onClick={() => refetch()}
                disabled={isFetching}
                className="rounded p-1.5 text-gray-400 hover:bg-gray-800 hover:text-white disabled:opacity-50 transition-colors"
              >
                <RefreshCw className={`h-3.5 w-3.5 ${isFetching ? 'animate-spin' : ''}`} />
              </button>
            </div>
          </SheetTitle>
        </SheetHeader>

        {/* Tabs */}
        <div className="flex gap-1 border-b border-gray-800 mt-3 shrink-0">
          {TABS.map((t) => (
            <button
              key={t.id}
              onClick={() => setTab(t.id)}
              className={`px-3 py-2 text-sm font-medium transition-colors border-b-2 -mb-px ${
                tab === t.id
                  ? 'border-indigo-400 text-white'
                  : 'border-transparent text-gray-500 hover:text-gray-300'
              }`}
            >
              {t.label}
            </button>
          ))}
        </div>

        {/* Tab content */}
        <div className="flex-1 overflow-y-auto mt-4">
          {tab === 'overview' && (
            <div className="space-y-4">
              {analyticsLoading ? (
                <div className="flex justify-center py-12">
                  <Loader2 className="h-5 w-5 animate-spin text-gray-400" />
                </div>
              ) : !analytics ? (
                <p className="text-sm text-gray-500 py-8 text-center">No analytics available</p>
              ) : (
                <>
                  {/* Stats grid */}
                  <div className="grid grid-cols-2 gap-2">
                    <StatCard label="Leads" value={analytics.leads_count ?? 0} icon={Users} color="text-blue-400" />
                    <StatCard label="Contacted" value={analytics.contacted_count ?? 0} icon={UserCheck} color="text-emerald-400" percent={safeDiv(analytics.contacted_count, analytics.leads_count)} />
                    <StatCard label="Sent" value={analytics.emails_sent_count ?? 0} icon={Send} color="text-violet-400" />
                    <StatCard label="Opens" value={analytics.open_count_unique ?? 0} icon={Eye} color="text-amber-400" percent={safeDiv(analytics.open_count_unique, analytics.contacted_count)} />
                    <StatCard label="Clicks" value={analytics.link_click_count_unique ?? 0} icon={MousePointerClick} color="text-blue-400" percent={safeDiv(analytics.link_click_count_unique, analytics.emails_sent_count)} />
                    <StatCard label="Replies" value={analytics.reply_count_unique ?? 0} icon={MessageSquare} color="text-emerald-400" percent={safeDiv(analytics.reply_count_unique, analytics.contacted_count)} />
                    <StatCard label="Bounced" value={analytics.bounced_count ?? 0} icon={AlertTriangle} color="text-red-400" percent={safeDiv(analytics.bounced_count, analytics.emails_sent_count)} />
                    <StatCard label="Interested" value={analytics.total_interested ?? 0} icon={UserCheck} color="text-emerald-400" />
                  </div>

                  {/* Performance chart */}
                  <CampaignPerformanceChart
                    orgId={orgId}
                    campaignId={campaign.id}
                  />
                </>
              )}
            </div>
          )}

          {tab === 'replies' && (
            <ReplyClassificationPanel
              replies={monitorData?.classified_replies ?? []}
              isLoading={monitorLoading ?? false}
            />
          )}

          {tab === 'recommendations' && (
            <CampaignRecommendationsPanel
              recommendations={monitorData?.recommendations ?? []}
              campaignId={campaign.id}
              isLoading={monitorLoading ?? false}
            />
          )}

          {tab === 'sync' && (
            <CampaignSyncSection
              orgId={orgId}
              userId={userId}
              campaignId={campaign.id}
              campaignName={campaign.name}
            />
          )}
        </div>
      </SheetContent>
    </Sheet>
  );
}

function StatCard({
  label,
  value,
  icon: Icon,
  color,
  percent,
}: {
  label: string;
  value: number | string;
  icon: React.ElementType;
  color: string;
  percent?: string;
}) {
  return (
    <div className="rounded-lg border border-gray-800 bg-gray-900/50 p-3">
      <div className="flex items-center gap-2 mb-1">
        <Icon className={`h-3.5 w-3.5 ${color}`} />
        <span className="text-xs text-gray-500">{label}</span>
      </div>
      <div className="flex items-baseline gap-1.5">
        <span className="text-lg font-semibold text-white">{value}</span>
        {percent && <span className="text-xs text-gray-500">{percent}</span>}
      </div>
    </div>
  );
}
