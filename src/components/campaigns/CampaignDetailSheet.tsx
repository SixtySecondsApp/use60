import React from 'react';
import { Sheet, SheetContent, SheetHeader, SheetTitle } from '@/components/ui/sheet';
import { Tabs, TabsList, TabsTrigger, TabsContent } from '@/components/ui/tabs';
import { Badge } from '@/components/ui/badge';
import {
  Send,
  Eye,
  MousePointerClick,
  MessageSquare,
  AlertTriangle,
  Users,
  UserCheck,
  RefreshCw,
  Loader2,
  BarChart3,
} from 'lucide-react';
import { useCampaignAnalytics } from '@/lib/services/campaignService';
import { campaignStatusLabel } from './campaignUtils';
import { CampaignPerformanceChart } from './CampaignPerformanceChart';
import { ReplyClassificationPanel } from './ReplyClassificationPanel';
import { CampaignRecommendationsPanel } from './CampaignRecommendationsPanel';
import { CampaignSyncSection } from './CampaignSyncSection';
import type { Campaign, MonitorData, CampaignStatus } from '@/lib/types/campaign';

interface Props {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  campaign: Campaign | null;
  orgId: string;
  userId: string;
  monitorData?: MonitorData;
  monitorLoading?: boolean;
}

function statusBadgeVariant(status: CampaignStatus): 'success' | 'warning' | 'default' | 'secondary' {
  switch (status) {
    case 1: return 'success';
    case 2: return 'warning';
    case 3: return 'default';
    default: return 'secondary';
  }
}

export function CampaignDetailSheet({
  open,
  onOpenChange,
  campaign,
  orgId,
  userId,
  monitorData,
  monitorLoading,
}: Props) {
  const { data: analytics, isLoading: analyticsLoading, refetch, isFetching } =
    useCampaignAnalytics(orgId, campaign?.id ?? null);

  const safeDiv = (a?: number, b?: number) => {
    if (!a || !b || b === 0) return '—';
    return `${((a / b) * 100).toFixed(1)}%`;
  };

  if (!campaign) return null;

  const statusLabel = campaignStatusLabel(campaign.status);

  return (
    <Sheet open={open} onOpenChange={onOpenChange}>
      <SheetContent className="!top-16 !h-[calc(100vh-4rem)] w-[520px] flex flex-col overflow-hidden">
        <SheetHeader className="shrink-0">
          <SheetTitle className="flex items-center justify-between">
            <div className="flex items-center gap-2 min-w-0">
              <BarChart3 className="h-5 w-5 shrink-0 text-indigo-500 dark:text-indigo-400" />
              <span className="truncate text-gray-900 dark:text-white">{campaign.name}</span>
            </div>
            <div className="flex items-center gap-2 shrink-0">
              <Badge variant={statusBadgeVariant(campaign.status)}>
                {statusLabel}
              </Badge>
              <button
                onClick={() => refetch()}
                disabled={isFetching}
                className="rounded p-1.5 text-gray-400 hover:bg-gray-100 dark:hover:bg-gray-800 hover:text-gray-700 dark:hover:text-white disabled:opacity-50 transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-blue-500"
                aria-label="Refresh analytics"
              >
                <RefreshCw className={`h-3.5 w-3.5 ${isFetching ? 'animate-spin' : ''}`} />
                <span className="sr-only">Refresh analytics</span>
              </button>
            </div>
          </SheetTitle>
        </SheetHeader>

        {/* Tabs */}
        <Tabs defaultValue="overview" className="flex flex-col flex-1 min-h-0 mt-3">
          <TabsList className="shrink-0 h-auto bg-transparent p-0 border-b border-gray-200 dark:border-gray-800 rounded-none justify-start gap-0 w-full">
            {(['overview', 'replies', 'recommendations', 'sync'] as const).map((id) => {
              const label = id === 'overview' ? 'Overview' : id === 'replies' ? 'Replies' : id === 'recommendations' ? 'Insights' : 'Sync';
              return (
                <TabsTrigger
                  key={id}
                  value={id}
                  className="rounded-none border-b-2 border-transparent data-[state=active]:border-indigo-500 data-[state=active]:bg-transparent data-[state=active]:text-indigo-600 dark:data-[state=active]:text-indigo-400 data-[state=active]:shadow-none px-3 py-2 text-sm font-medium text-gray-500 dark:text-gray-400 hover:text-gray-700 dark:hover:text-gray-300 -mb-px"
                >
                  {label}
                </TabsTrigger>
              );
            })}
          </TabsList>

          <TabsContent value="overview" className="flex-1 overflow-y-auto mt-4 data-[state=inactive]:hidden">
            <div className="space-y-4">
              {analyticsLoading ? (
                <div className="flex justify-center py-12">
                  <Loader2 className="h-5 w-5 animate-spin text-gray-400" />
                </div>
              ) : !analytics ? (
                <p className="text-sm text-gray-400 dark:text-gray-500 py-8 text-center">No analytics available</p>
              ) : (
                <>
                  <div className="grid grid-cols-2 gap-2">
                    <StatCard label="Leads" value={analytics.leads_count ?? 0} icon={Users} color="text-blue-500 dark:text-blue-400" />
                    <StatCard label="Contacted" value={analytics.contacted_count ?? 0} icon={UserCheck} color="text-emerald-500 dark:text-emerald-400" percent={safeDiv(analytics.contacted_count, analytics.leads_count)} />
                    <StatCard label="Sent" value={analytics.emails_sent_count ?? 0} icon={Send} color="text-violet-500 dark:text-violet-400" />
                    <StatCard label="Opens" value={analytics.open_count_unique ?? 0} icon={Eye} color="text-amber-500 dark:text-amber-400" percent={safeDiv(analytics.open_count_unique, analytics.contacted_count)} />
                    <StatCard label="Clicks" value={analytics.link_click_count_unique ?? 0} icon={MousePointerClick} color="text-blue-500 dark:text-blue-400" percent={safeDiv(analytics.link_click_count_unique, analytics.emails_sent_count)} />
                    <StatCard label="Replies" value={analytics.reply_count_unique ?? 0} icon={MessageSquare} color="text-emerald-500 dark:text-emerald-400" percent={safeDiv(analytics.reply_count_unique, analytics.contacted_count)} />
                    <StatCard label="Bounced" value={analytics.bounced_count ?? 0} icon={AlertTriangle} color="text-red-500 dark:text-red-400" percent={safeDiv(analytics.bounced_count, analytics.emails_sent_count)} />
                    <StatCard label="Interested" value={analytics.total_interested ?? 0} icon={UserCheck} color="text-emerald-500 dark:text-emerald-400" />
                  </div>

                  <CampaignPerformanceChart orgId={orgId} campaignId={campaign.id} />
                </>
              )}
            </div>
          </TabsContent>

          <TabsContent value="replies" className="flex-1 overflow-y-auto mt-4 data-[state=inactive]:hidden">
            <ReplyClassificationPanel
              replies={monitorData?.classified_replies ?? []}
              isLoading={monitorLoading ?? false}
            />
          </TabsContent>

          <TabsContent value="recommendations" className="flex-1 overflow-y-auto mt-4 data-[state=inactive]:hidden">
            <CampaignRecommendationsPanel
              recommendations={monitorData?.recommendations ?? []}
              campaignId={campaign.id}
              isLoading={monitorLoading ?? false}
            />
          </TabsContent>

          <TabsContent value="sync" className="flex-1 overflow-y-auto mt-4 data-[state=inactive]:hidden">
            <CampaignSyncSection
              orgId={orgId}
              userId={userId}
              campaignId={campaign.id}
              campaignName={campaign.name}
            />
          </TabsContent>
        </Tabs>
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
    <div className="rounded-lg border border-gray-200 dark:border-gray-800 bg-gray-50 dark:bg-gray-900/50 p-3">
      <div className="flex items-center gap-2 mb-1">
        <Icon className={`h-3.5 w-3.5 ${color}`} />
        <span className="text-xs text-gray-500 dark:text-gray-500">{label}</span>
      </div>
      <div className="flex items-baseline gap-1.5">
        <span className="text-lg font-semibold text-gray-900 dark:text-white">{value}</span>
        {percent && <span className="text-xs text-gray-400 dark:text-gray-500">{percent}</span>}
      </div>
    </div>
  );
}
