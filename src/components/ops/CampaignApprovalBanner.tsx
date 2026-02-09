/**
 * CampaignApprovalBanner
 *
 * Shows a banner when a workflow-created Instantly campaign is in paused state,
 * prompting the user to review email content and approve/launch the campaign.
 *
 * Also includes an inline review modal for previewing email steps before launch.
 */

import { useState } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import {
  Mail,
  Play,
  Eye,
  X,
  Loader2,
  ChevronDown,
  ChevronUp,
  AlertTriangle,
  CheckCircle2,
  Send,
  Upload,
} from 'lucide-react';
import { Button } from '@/components/ui/button';
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogFooter,
} from '@/components/ui/dialog';
import { Badge } from '@/components/ui/badge';
import { toast } from 'sonner';
import { supabase } from '@/lib/supabase/clientV2';
import { validateInstantlyCampaign } from '@/lib/hooks/useInstantlyPush';

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

interface CampaignLink {
  id: string;
  table_id: string;
  campaign_id: string;
  campaign_name: string | null;
  field_mapping: Record<string, string> | null;
  linked_at: string;
  last_push_at: string | null;
}

interface CampaignDetails {
  campaign: {
    id: string;
    name: string;
    status: string;
  };
  sequences: any[];
  custom_variables: string[];
  step_count: number;
}

interface CampaignApprovalBannerProps {
  tableId: string;
  orgId: string;
  onCampaignInvalid?: (campaignId: string) => void;
}

// ---------------------------------------------------------------------------
// Component
// ---------------------------------------------------------------------------

export function CampaignApprovalBanner({ tableId, orgId, onCampaignInvalid }: CampaignApprovalBannerProps) {
  const queryClient = useQueryClient();
  const [dismissed, setDismissed] = useState(false);
  const [showReviewModal, setShowReviewModal] = useState(false);
  const [reviewCampaignId, setReviewCampaignId] = useState<string | null>(null);

  // Fetch campaign links for this table
  const { data: links = [] } = useQuery({
    queryKey: ['instantly-campaign-links', tableId],
    queryFn: async () => {
      const { data, error } = await supabase.functions.invoke('instantly-admin', {
        body: { action: 'list_campaign_links', org_id: orgId, table_id: tableId },
      });
      if (error || !data?.success) return [];
      return (data.links ?? []) as CampaignLink[];
    },
    enabled: !!tableId && !!orgId,
  });

  // Check campaign statuses for linked campaigns
  const { data: campaignStatuses = {} } = useQuery({
    queryKey: ['instantly-campaign-statuses', tableId, links.map(l => l.campaign_id).join(',')],
    queryFn: async () => {
      const statuses: Record<string, string> = {};
      for (const link of links) {
        try {
          const { data } = await supabase.functions.invoke('instantly-admin', {
            body: { action: 'get_campaign', org_id: orgId, campaign_id: link.campaign_id },
          });
          if (data?.success && data.campaign) {
            statuses[link.campaign_id] = data.campaign.status ?? 'unknown';
          }
        } catch {
          statuses[link.campaign_id] = 'unknown';
        }
      }
      return statuses;
    },
    enabled: links.length > 0,
    staleTime: 30000,
  });

  // Filter to only paused campaigns
  const pausedCampaigns = links.filter(
    link => {
      const status = campaignStatuses[link.campaign_id];
      return status === 'paused' || status === 'draft' || String(status) === '0';
    }
  );

  // Activate campaign mutation
  const activateMutation = useMutation({
    mutationFn: async (campaignId: string) => {
      const { data, error } = await supabase.functions.invoke('instantly-admin', {
        body: { action: 'activate_campaign', org_id: orgId, campaign_id: campaignId },
      });
      if (error) throw new Error(error.message || 'Failed to activate campaign');
      if (!data?.success) throw new Error(data?.error || 'Activation failed');
      return data;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['instantly-campaign-statuses', tableId] });
      queryClient.invalidateQueries({ queryKey: ['instantly-campaign-links', tableId] });
      toast.success('Campaign activated! Emails will start sending.');
      setShowReviewModal(false);
    },
    onError: (err: Error) => {
      toast.error(err.message);
    },
  });

  // Push all leads mutation
  const pushAllMutation = useMutation({
    mutationFn: async (campaign: CampaignLink) => {
      // Validate campaign still exists before pushing
      const validation = await validateInstantlyCampaign(orgId, campaign.campaign_id);
      if (!validation.valid) {
        const err = new Error('Campaign not found in Instantly. It may have been deleted.');
        (err as any).code = 'CAMPAIGN_NOT_FOUND';
        (err as any).campaignId = campaign.campaign_id;
        throw err;
      }

      // Get all row IDs from the table
      const { data: rows, error: rowErr } = await supabase
        .from('dynamic_table_rows')
        .select('id')
        .eq('table_id', tableId)
        .is('hubspot_removed_at', null);
      if (rowErr) throw new Error(rowErr.message);
      if (!rows || rows.length === 0) throw new Error('No rows to push');

      const rowIds = rows.map(r => r.id);

      const { data, error } = await supabase.functions.invoke('push-to-instantly', {
        body: {
          table_id: tableId,
          row_ids: rowIds,
          campaign_id: campaign.campaign_id,
          field_mapping: campaign.field_mapping || undefined,
        },
      });
      if (error) throw new Error(error.message || 'Push failed');
      if (data?.error) throw new Error(data.error);
      return data;
    },
    onSuccess: (data) => {
      queryClient.invalidateQueries({ queryKey: ['ops-table-data', tableId] });
      queryClient.invalidateQueries({ queryKey: ['instantly-sync-history', tableId] });
      toast.success(`Pushed ${data?.pushed_count ?? 'all'} leads to campaign`);
    },
    onError: (err: any) => {
      if (err.code === 'CAMPAIGN_NOT_FOUND') {
        toast.error('Campaign no longer exists. Please select a new campaign.');
        onCampaignInvalid?.(err.campaignId);
      } else {
        toast.error(err.message);
      }
    },
  });

  // Pause campaign mutation
  const pauseMutation = useMutation({
    mutationFn: async (campaignId: string) => {
      const { data, error } = await supabase.functions.invoke('instantly-admin', {
        body: { action: 'pause_campaign', org_id: orgId, campaign_id: campaignId },
      });
      if (error) throw new Error(error.message || 'Failed to pause campaign');
      if (!data?.success) throw new Error(data?.error || 'Pause failed');
      return data;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['instantly-campaign-statuses', tableId] });
      toast.success('Campaign paused');
    },
    onError: (err: Error) => {
      toast.error(err.message);
    },
  });

  // Show banner for ALL linked campaigns, not just paused
  const visibleCampaigns = links;

  if (dismissed || visibleCampaigns.length === 0) return null;

  // Helper to determine campaign display state
  const getCampaignState = (campaignId: string) => {
    const status = campaignStatuses[campaignId];
    if (status === 'active' || String(status) === '1') return 'active';
    if (status === 'paused' || status === 'draft' || String(status) === '0') return 'paused';
    return 'unknown';
  };

  return (
    <>
      {visibleCampaigns.map(campaign => {
        const state = getCampaignState(campaign.campaign_id);
        const isPaused = state === 'paused';
        const isActive = state === 'active';

        // Color scheme based on state
        const borderColor = isActive ? 'border-green-500/30' : isPaused ? 'border-amber-500/30' : 'border-zinc-600/30';
        const bgColor = isActive ? 'bg-green-500/5' : isPaused ? 'bg-amber-500/5' : 'bg-zinc-800/50';
        const iconBg = isActive ? 'bg-green-500/10' : isPaused ? 'bg-amber-500/10' : 'bg-zinc-700/50';
        const iconColor = isActive ? 'text-green-400' : isPaused ? 'text-amber-400' : 'text-zinc-400';
        const titleColor = isActive ? 'text-green-300' : isPaused ? 'text-amber-300' : 'text-zinc-300';
        const textColor = isActive ? 'text-green-300/70' : isPaused ? 'text-amber-300/70' : 'text-zinc-400';
        const dismissColor = isActive ? 'text-green-400/50 hover:text-green-400' : isPaused ? 'text-amber-400/50 hover:text-amber-400' : 'text-zinc-500 hover:text-zinc-300';

        return (
          <div key={campaign.campaign_id} className={`mx-4 mb-3 rounded-xl border ${borderColor} ${bgColor} px-4 py-3`}>
            <div className="flex items-start gap-3">
              <div className={`mt-0.5 flex h-8 w-8 shrink-0 items-center justify-center rounded-lg ${iconBg}`}>
                <Mail className={`h-4 w-4 ${iconColor}`} />
              </div>
              <div className="min-w-0 flex-1">
                <div className="flex items-center gap-2">
                  <h4 className={`text-sm font-medium ${titleColor}`}>
                    {isActive ? 'Campaign active' : isPaused ? 'Campaign ready for review' : 'Campaign linked'}
                  </h4>
                  <Badge variant="outline" className={`${isActive ? 'border-green-500/30 text-green-400' : isPaused ? 'border-amber-500/30 text-amber-400' : 'border-zinc-600 text-zinc-400'} text-[10px]`}>
                    {isActive ? 'Active' : isPaused ? 'Paused' : 'Unknown'}
                  </Badge>
                </div>
                <p className={`mt-0.5 text-xs ${textColor}`}>
                  {isActive
                    ? `"${campaign.campaign_name || 'Unnamed'}" is actively sending emails.`
                    : isPaused
                      ? `"${campaign.campaign_name || 'Unnamed'}" has been created with personalised emails. Review the content before launching.`
                      : `"${campaign.campaign_name || 'Unnamed'}" is linked to this table.`
                  }
                </p>
                <div className="mt-2 flex items-center gap-2">
                  {isPaused && (
                    <>
                      <Button
                        size="sm"
                        variant="outline"
                        className="h-7 gap-1.5 border-amber-500/30 bg-amber-500/10 text-amber-300 hover:bg-amber-500/20 text-xs"
                        onClick={() => {
                          setReviewCampaignId(campaign.campaign_id);
                          setShowReviewModal(true);
                        }}
                      >
                        <Eye className="h-3 w-3" />
                        Review & Launch
                      </Button>
                      <Button
                        size="sm"
                        variant="outline"
                        className="h-7 gap-1.5 border-blue-500/30 bg-blue-500/10 text-blue-300 hover:bg-blue-500/20 text-xs"
                        onClick={() => pushAllMutation.mutate(campaign)}
                        disabled={pushAllMutation.isPending}
                      >
                        {pushAllMutation.isPending ? (
                          <Loader2 className="h-3 w-3 animate-spin" />
                        ) : (
                          <Upload className="h-3 w-3" />
                        )}
                        {campaign.last_push_at ? 'Repush All' : 'Push All Leads'}
                      </Button>
                    </>
                  )}
                  {isActive && (
                    <Button
                      size="sm"
                      variant="outline"
                      className="h-7 gap-1.5 border-red-500/30 bg-red-500/10 text-red-300 hover:bg-red-500/20 text-xs"
                      onClick={() => pauseMutation.mutate(campaign.campaign_id)}
                      disabled={pauseMutation.isPending}
                    >
                      {pauseMutation.isPending ? (
                        <Loader2 className="h-3 w-3 animate-spin" />
                      ) : (
                        <Play className="h-3 w-3 rotate-180" />
                      )}
                      Pause Campaign
                    </Button>
                  )}
                </div>
              </div>
              <button
                onClick={() => setDismissed(true)}
                className={`shrink-0 ${dismissColor} transition-colors`}
              >
                <X className="h-4 w-4" />
              </button>
            </div>
          </div>
        );
      })}

      {/* Campaign Review Modal */}
      {showReviewModal && reviewCampaignId && (
        <CampaignReviewModal
          isOpen={showReviewModal}
          onClose={() => setShowReviewModal(false)}
          campaignId={reviewCampaignId}
          orgId={orgId}
          onActivate={() => activateMutation.mutate(reviewCampaignId)}
          isActivating={activateMutation.isPending}
        />
      )}
    </>
  );
}

// ---------------------------------------------------------------------------
// Campaign Review Modal
// ---------------------------------------------------------------------------

function CampaignReviewModal({
  isOpen,
  onClose,
  campaignId,
  orgId,
  onActivate,
  isActivating,
}: {
  isOpen: boolean;
  onClose: () => void;
  campaignId: string;
  orgId: string;
  onActivate: () => void;
  isActivating: boolean;
}) {
  const [expandedStep, setExpandedStep] = useState<number>(0);
  const [confirmed, setConfirmed] = useState(false);

  // Fetch campaign details
  const { data: details, isLoading } = useQuery({
    queryKey: ['instantly-campaign-details', campaignId],
    queryFn: async () => {
      const { data, error } = await supabase.functions.invoke('instantly-admin', {
        body: { action: 'get_campaign_details', org_id: orgId, campaign_id: campaignId },
      });
      if (error) throw error;
      if (!data?.success) throw new Error(data?.error || 'Failed to load campaign');
      return data as CampaignDetails;
    },
    enabled: isOpen,
  });

  // Fetch analytics/overview
  const { data: analytics } = useQuery({
    queryKey: ['instantly-campaign-analytics', campaignId],
    queryFn: async () => {
      const { data } = await supabase.functions.invoke('instantly-admin', {
        body: { action: 'campaign_analytics', org_id: orgId, campaign_id: campaignId },
      });
      return data?.analytics ?? null;
    },
    enabled: isOpen,
  });

  const campaignName = details?.campaign?.name ?? 'Campaign';
  const sequences = details?.sequences ?? [];
  const allSteps = sequences.flatMap((seq: any) => seq.steps ?? []);

  return (
    <Dialog open={isOpen} onOpenChange={(open) => !open && onClose()}>
      <DialogContent className="max-w-2xl max-h-[85vh] overflow-y-auto bg-zinc-900 border-zinc-700">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2 text-lg">
            <Mail className="h-5 w-5 text-amber-400" />
            Review Campaign: {campaignName}
          </DialogTitle>
        </DialogHeader>

        {isLoading ? (
          <div className="flex items-center justify-center py-12">
            <Loader2 className="h-6 w-6 animate-spin text-zinc-400" />
          </div>
        ) : (
          <div className="space-y-4">
            {/* Campaign Overview */}
            <div className="rounded-lg border border-zinc-700 bg-zinc-800/50 p-4">
              <div className="grid grid-cols-3 gap-4 text-center">
                <div>
                  <p className="text-2xl font-semibold text-white">
                    {analytics?.total_leads ?? '—'}
                  </p>
                  <p className="text-xs text-zinc-400">Leads</p>
                </div>
                <div>
                  <p className="text-2xl font-semibold text-white">
                    {allSteps.length || details?.step_count || '—'}
                  </p>
                  <p className="text-xs text-zinc-400">Email Steps</p>
                </div>
                <div>
                  <p className="text-2xl font-semibold text-white">
                    {details?.custom_variables?.length ?? 0}
                  </p>
                  <p className="text-xs text-zinc-400">Variables</p>
                </div>
              </div>
            </div>

            {/* Email Steps Preview */}
            <div className="space-y-2">
              <h3 className="text-sm font-medium text-zinc-300">Email Sequence</h3>

              {allSteps.length === 0 && (
                <div className="rounded-lg border border-zinc-700 bg-zinc-800/30 p-4 text-center">
                  <p className="text-sm text-zinc-400">
                    Email content uses per-lead custom variables. Each lead will receive
                    personalised emails generated from their profile data.
                  </p>
                </div>
              )}

              {allSteps.map((step: any, idx: number) => (
                <div
                  key={idx}
                  className="rounded-lg border border-zinc-700 bg-zinc-800/30 overflow-hidden"
                >
                  <button
                    onClick={() => setExpandedStep(expandedStep === idx ? -1 : idx)}
                    className="flex w-full items-center justify-between px-4 py-3 text-left hover:bg-zinc-800/50 transition-colors"
                  >
                    <div className="flex items-center gap-2">
                      <Badge
                        variant="outline"
                        className="border-zinc-600 text-zinc-400 text-[10px]"
                      >
                        Step {idx + 1}
                      </Badge>
                      <span className="text-sm text-zinc-200 truncate max-w-[400px]">
                        {step.subject || step.email_subject || `Email step ${idx + 1}`}
                      </span>
                    </div>
                    {expandedStep === idx ? (
                      <ChevronUp className="h-4 w-4 text-zinc-500" />
                    ) : (
                      <ChevronDown className="h-4 w-4 text-zinc-500" />
                    )}
                  </button>

                  {expandedStep === idx && (
                    <div className="border-t border-zinc-700 px-4 py-3 space-y-2">
                      <div>
                        <label className="text-[10px] font-medium uppercase text-zinc-500">
                          Subject
                        </label>
                        <p className="text-sm text-zinc-200">
                          {step.subject || step.email_subject || '(uses custom variable)'}
                        </p>
                      </div>
                      <div>
                        <label className="text-[10px] font-medium uppercase text-zinc-500">
                          Body
                        </label>
                        <pre className="mt-1 whitespace-pre-wrap text-xs text-zinc-300 leading-relaxed font-sans">
                          {step.body || step.email_body || '(uses custom variable)'}
                        </pre>
                      </div>
                      {(step.wait_days || idx > 0) && (
                        <p className="text-[10px] text-zinc-500">
                          Wait: {step.wait_days ?? (idx === 1 ? 2 : 3)} days after previous step
                        </p>
                      )}
                    </div>
                  )}
                </div>
              ))}
            </div>

            {/* Custom Variables */}
            {details?.custom_variables && details.custom_variables.length > 0 && (
              <div className="space-y-2">
                <h3 className="text-sm font-medium text-zinc-300">Custom Variables</h3>
                <div className="flex flex-wrap gap-1.5">
                  {details.custom_variables.map((v: string) => (
                    <Badge
                      key={v}
                      variant="outline"
                      className="border-zinc-600 text-zinc-400 text-[10px]"
                    >
                      {`{{${v}}}`}
                    </Badge>
                  ))}
                </div>
              </div>
            )}

            {/* Warning */}
            <div className="flex items-start gap-2 rounded-lg border border-amber-500/20 bg-amber-500/5 p-3">
              <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0 text-amber-400" />
              <div className="text-xs text-amber-300/80">
                <p className="font-medium text-amber-300">Before launching:</p>
                <ul className="mt-1 list-disc pl-4 space-y-0.5">
                  <li>Review email content in Instantly dashboard for final edits</li>
                  <li>Verify sending accounts are connected and warmed up</li>
                  <li>Campaign will begin sending immediately once activated</li>
                </ul>
              </div>
            </div>

            {/* Confirmation checkbox */}
            <label className="flex items-center gap-2 cursor-pointer">
              <input
                type="checkbox"
                checked={confirmed}
                onChange={(e) => setConfirmed(e.target.checked)}
                className="h-4 w-4 rounded border-zinc-600 bg-zinc-800 text-amber-500 focus:ring-amber-500"
              />
              <span className="text-sm text-zinc-300">
                I've reviewed the content and am ready to launch
              </span>
            </label>
          </div>
        )}

        <DialogFooter className="gap-2">
          <Button
            variant="outline"
            onClick={onClose}
            className="border-zinc-700 text-zinc-400"
          >
            Cancel
          </Button>
          <Button
            onClick={onActivate}
            disabled={!confirmed || isActivating || isLoading}
            className="gap-1.5 bg-gradient-to-r from-green-600 to-emerald-600 text-white hover:from-green-500 hover:to-emerald-500 disabled:opacity-50"
          >
            {isActivating ? (
              <Loader2 className="h-4 w-4 animate-spin" />
            ) : (
              <Send className="h-4 w-4" />
            )}
            Launch Campaign
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
