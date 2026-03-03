import React, { useState } from 'react';
import { Send, Loader2, RefreshCw } from 'lucide-react';
import { useOrg } from '@/lib/contexts/OrgContext';
import { useUser } from '@/lib/hooks/useUser';
import {
  useCampaigns,
  usePauseCampaign,
  useActivateCampaign,
  useDeleteCampaign,
  useCampaignMonitor,
} from '@/lib/services/campaignService';
import { useCampaignFilters } from '@/lib/hooks/useCampaignFilters';
import { CampaignCard } from '@/components/campaigns/CampaignCard';
import { CampaignDetailSheet } from '@/components/campaigns/CampaignDetailSheet';
import type { Campaign, StatusFilter } from '@/lib/types/campaign';

const STATUS_TABS: { value: StatusFilter; label: string }[] = [
  { value: 'all', label: 'All' },
  { value: 0, label: 'Draft' },
  { value: 1, label: 'Active' },
  { value: 2, label: 'Paused' },
  { value: 3, label: 'Completed' },
];

export default function CampaignsPage() {
  const { activeOrgId } = useOrg();
  const { userData } = useUser();
  const orgId = activeOrgId ?? '';
  const userId = userData?.id ?? '';

  const { status, setStatus } = useCampaignFilters();
  const { campaigns, isLoading, refetch, isFetching, data: allCampaigns } = useCampaigns(orgId, status);

  const pauseMutation = usePauseCampaign(orgId);
  const resumeMutation = useActivateCampaign(orgId);
  const deleteMutation = useDeleteCampaign(orgId);

  const [selectedCampaign, setSelectedCampaign] = useState<Campaign | null>(null);
  const [sheetOpen, setSheetOpen] = useState(false);

  // Monitor data for the selected campaign
  const { data: monitorData, isLoading: monitorLoading } = useCampaignMonitor(
    orgId,
    userId,
    selectedCampaign?.id
  );

  function handleSelect(campaign: Campaign) {
    setSelectedCampaign(campaign);
    setSheetOpen(true);
  }

  // Status counts (from all campaigns, not filtered)
  const allList = allCampaigns ?? [];
  const statusCounts: Record<string, number> = { all: allList.length };
  for (const c of allList) {
    statusCounts[c.status] = (statusCounts[c.status] || 0) + 1;
  }

  return (
    <div className="flex flex-col h-full">
      {/* Header */}
      <div className="flex items-center justify-between px-6 py-4 border-b border-gray-800 shrink-0">
        <div className="flex items-center gap-3">
          <Send className="h-5 w-5 text-indigo-400" />
          <h1 className="text-lg font-semibold text-white">Campaigns</h1>
          {!isLoading && (
            <span className="text-xs text-gray-500 bg-gray-800 px-2 py-0.5 rounded-full">
              {allList.length}
            </span>
          )}
        </div>
        <button
          onClick={() => refetch()}
          disabled={isFetching}
          className="flex items-center gap-1.5 text-xs text-gray-400 hover:text-white disabled:opacity-50 transition-colors px-2.5 py-1.5 rounded-lg hover:bg-gray-800"
        >
          <RefreshCw className={`h-3.5 w-3.5 ${isFetching ? 'animate-spin' : ''}`} />
          Refresh
        </button>
      </div>

      {/* Status filter tabs */}
      <div className="flex gap-1 px-6 pt-3 pb-2 border-b border-gray-800/50 shrink-0 overflow-x-auto">
        {STATUS_TABS.map((tab) => {
          const count = statusCounts[tab.value === 'all' ? 'all' : tab.value] || 0;
          const isActive = status === tab.value;
          return (
            <button
              key={String(tab.value)}
              onClick={() => setStatus(tab.value)}
              className={`shrink-0 rounded-md px-3 py-1.5 text-sm font-medium transition-colors ${
                isActive
                  ? 'bg-indigo-500/15 text-indigo-400 border border-indigo-500/30'
                  : 'text-gray-400 hover:text-gray-300 hover:bg-gray-800 border border-transparent'
              }`}
            >
              {tab.label}
              {!isLoading && (
                <span className={`ml-1.5 text-xs ${isActive ? 'text-indigo-400/70' : 'text-gray-600'}`}>
                  {count}
                </span>
              )}
            </button>
          );
        })}
      </div>

      {/* Campaign list */}
      <div className="flex-1 overflow-y-auto px-6 py-4">
        {isLoading ? (
          <div className="flex justify-center py-16">
            <Loader2 className="h-6 w-6 animate-spin text-gray-400" />
          </div>
        ) : campaigns.length === 0 ? (
          <div className="flex flex-col items-center py-20 gap-4 text-gray-500">
            <Send className="h-12 w-12 opacity-20" />
            <div className="text-center">
              <p className="text-base font-medium text-gray-400">No campaigns</p>
              <p className="text-sm mt-1">
                {status === 'all'
                  ? 'No Instantly campaigns found. Connect Instantly in Settings to get started.'
                  : `No ${
                      status === 0 ? 'draft' : status === 1 ? 'active' : status === 2 ? 'paused' : 'completed'
                    } campaigns.`}
              </p>
            </div>
          </div>
        ) : (
          <div className="space-y-1.5 max-w-3xl">
            {campaigns.map((campaign) => (
              <CampaignCard
                key={campaign.id}
                campaign={campaign}
                onSelect={handleSelect}
                onPause={(id) => pauseMutation.mutate(id)}
                onResume={(id) => resumeMutation.mutate(id)}
                onDelete={(id) => deleteMutation.mutate(id)}
                isPausing={pauseMutation.isPending && pauseMutation.variables === campaign.id}
                isResuming={resumeMutation.isPending && resumeMutation.variables === campaign.id}
                isDeleting={deleteMutation.isPending && deleteMutation.variables === campaign.id}
              />
            ))}
          </div>
        )}
      </div>

      {/* Detail sheet */}
      <CampaignDetailSheet
        open={sheetOpen}
        onOpenChange={setSheetOpen}
        campaign={selectedCampaign}
        orgId={orgId}
        userId={userId}
        monitorData={monitorData}
        monitorLoading={monitorLoading}
      />
    </div>
  );
}
