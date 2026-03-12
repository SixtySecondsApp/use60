/**
 * LinkedInCampaignBinding
 *
 * Toolbar widget that lets users bind an ops table to a LinkedIn campaign or
 * campaign group. The binding is stored in `dynamic_tables.integration_config`
 * under the `linkedin` key.
 *
 * Shape stored:
 *   { linkedin: { campaign_group_id, campaign_group_name, campaign_id, campaign_name, structure } }
 *
 * The linkedin-campaign-manager edge function does not exist yet — this UI
 * only stores the config. Campaign push is wired in a later story.
 */

import React, { useState, useEffect } from 'react';
import {
  Megaphone,
  Link2,
  Unlink2,
  Loader2,
  AlertCircle,
  CheckCircle2,
  X,
  Columns3,
} from 'lucide-react';
import { toast } from 'sonner';
import { Button } from '@/components/ui/button';
import {
  Sheet,
  SheetContent,
  SheetHeader,
  SheetTitle,
  SheetDescription,
} from '@/components/ui/sheet';
import { Label } from '@/components/ui/label';
import { RadioGroup, RadioGroupItem } from '@/components/ui/radio-group';
import { useLinkedInIntegration } from '@/lib/hooks/useLinkedInIntegration';
import { supabase } from '@/lib/supabase/clientV2';
import { LinkedInCreativeMappingWizard } from './LinkedInCreativeMappingWizard';
import { LinkedInBudgetManager } from './LinkedInBudgetManager';
import { LinkedInCampaignLauncher } from './LinkedInCampaignLauncher';

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export type LinkedInCampaignStructure = 'single_campaign' | 'per_row_campaign';

export interface LinkedInCampaignConfig {
  campaign_group_id: string;
  campaign_group_name: string;
  campaign_id: string;
  campaign_name: string;
  structure: LinkedInCampaignStructure;
}

interface LinkedInCampaignBindingProps {
  tableId: string;
  /** Current integration_config from the dynamic_tables row */
  integrationConfig: Record<string, unknown> | null;
  /** Called after a successful save so the parent can refresh the table record */
  onSaved: () => void;
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function extractLinkedInConfig(
  integrationConfig: Record<string, unknown> | null
): LinkedInCampaignConfig | null {
  if (!integrationConfig) return null;
  const li = integrationConfig.linkedin as Record<string, unknown> | undefined;
  if (!li?.campaign_group_id) return null;
  return {
    campaign_group_id: li.campaign_group_id as string,
    campaign_group_name: (li.campaign_group_name as string) || '',
    campaign_id: (li.campaign_id as string) || '',
    campaign_name: (li.campaign_name as string) || '',
    structure: (li.structure as LinkedInCampaignStructure) || 'single_campaign',
  };
}

// ---------------------------------------------------------------------------
// Component
// ---------------------------------------------------------------------------

export function LinkedInCampaignBinding({
  tableId,
  integrationConfig,
  onSaved,
}: LinkedInCampaignBindingProps) {
  const { isConnected, loading: liLoading, integration } = useLinkedInIntegration();

  const [open, setOpen] = useState(false);
  const [mappingOpen, setMappingOpen] = useState(false);
  const [isSaving, setIsSaving] = useState(false);

  // Form state
  const [groupId, setGroupId] = useState('');
  const [groupName, setGroupName] = useState('');
  const [campaignId, setCampaignId] = useState('');
  const [campaignName, setCampaignName] = useState('');
  const [structure, setStructure] = useState<LinkedInCampaignStructure>('single_campaign');

  // Current binding derived from integrationConfig prop
  const currentBinding = extractLinkedInConfig(integrationConfig);
  const isBound = !!currentBinding;

  // Populate form when sheet opens
  useEffect(() => {
    if (open && currentBinding) {
      setGroupId(currentBinding.campaign_group_id);
      setGroupName(currentBinding.campaign_group_name);
      setCampaignId(currentBinding.campaign_id);
      setCampaignName(currentBinding.campaign_name);
      setStructure(currentBinding.structure);
    } else if (open) {
      setGroupId('');
      setGroupName('');
      setCampaignId('');
      setCampaignName('');
      setStructure('single_campaign');
    }
  }, [open]); // eslint-disable-line react-hooks/exhaustive-deps

  // ---- Save ----

  const handleSave = async () => {
    if (!groupId.trim()) {
      toast.error('Campaign Group ID is required');
      return;
    }

    setIsSaving(true);
    try {
      const newLinkedInConfig: LinkedInCampaignConfig = {
        campaign_group_id: groupId.trim(),
        campaign_group_name: groupName.trim(),
        campaign_id: campaignId.trim(),
        campaign_name: campaignName.trim(),
        structure,
      };

      // Merge with any existing integration_config keys to preserve other integrations
      const merged: Record<string, unknown> = {
        ...(integrationConfig ?? {}),
        linkedin: newLinkedInConfig,
      };

      const { error } = await supabase
        .from('dynamic_tables')
        .update({ integration_config: merged })
        .eq('id', tableId);

      if (error) throw error;

      toast.success('LinkedIn campaign binding saved');
      onSaved();
      setOpen(false);
    } catch (err: unknown) {
      const message = err instanceof Error ? err.message : 'Failed to save binding';
      toast.error(message);
    } finally {
      setIsSaving(false);
    }
  };

  // ---- Unlink ----

  const handleUnlink = async () => {
    setIsSaving(true);
    try {
      // Remove just the linkedin key from integration_config
      const updated: Record<string, unknown> = { ...(integrationConfig ?? {}) };
      delete updated.linkedin;

      const { error } = await supabase
        .from('dynamic_tables')
        .update({ integration_config: Object.keys(updated).length > 0 ? updated : null })
        .eq('id', tableId);

      if (error) throw error;

      toast.success('LinkedIn campaign unlinked');
      onSaved();
      setOpen(false);
    } catch (err: unknown) {
      const message = err instanceof Error ? err.message : 'Failed to unlink';
      toast.error(message);
    } finally {
      setIsSaving(false);
    }
  };

  // ---- Render: toolbar badge/button ----

  if (liLoading) return null;

  return (
    <>
      {/* Toolbar trigger */}
      <button
        onClick={() => setOpen(true)}
        className={`inline-flex items-center gap-1.5 rounded-lg border px-2.5 py-1.5 text-xs font-medium transition-colors ${
          isBound
            ? 'border-blue-700/40 bg-blue-900/20 text-blue-300 hover:bg-blue-900/40 hover:text-blue-200'
            : 'border-gray-700 bg-gray-800 text-gray-400 hover:bg-gray-700 hover:text-gray-200'
        }`}
        title={isBound ? `LinkedIn: ${currentBinding?.campaign_group_name || currentBinding?.campaign_group_id}` : 'Link to LinkedIn Campaign'}
      >
        <Megaphone className="h-3.5 w-3.5" />
        {isBound ? (
          <>
            <CheckCircle2 className="h-3 w-3 text-blue-400" />
            <span className="max-w-[120px] truncate">{currentBinding?.campaign_group_name || 'LinkedIn'}</span>
          </>
        ) : (
          'LinkedIn'
        )}
      </button>

      {/* Map Columns button — only shown when campaign is bound */}
      {isBound && (
        <button
          onClick={() => setMappingOpen(true)}
          className="inline-flex items-center gap-1.5 rounded-lg border border-gray-700 bg-gray-800 px-2.5 py-1.5 text-xs font-medium text-gray-400 hover:bg-gray-700 hover:text-gray-200 transition-colors"
          title="Map ops table columns to LinkedIn creative fields"
        >
          <Columns3 className="h-3.5 w-3.5" />
          Map Columns
        </button>
      )}

      {/* Launch Campaign button — only shown when campaign is bound */}
      {isBound && (
        <LinkedInCampaignLauncher
          tableId={tableId}
          integrationConfig={integrationConfig}
          onLaunched={onSaved}
        />
      )}

      {/* Creative mapping wizard */}
      <LinkedInCreativeMappingWizard
        open={mappingOpen}
        onOpenChange={setMappingOpen}
        tableId={tableId}
        integrationConfig={integrationConfig}
        onSaved={onSaved}
      />

      {/* Config sheet */}
      <Sheet open={open} onOpenChange={setOpen}>
        <SheetContent
          side="right"
          className="!top-16 !h-[calc(100vh-4rem)] w-[400px] sm:w-[440px] overflow-y-auto"
        >
          <SheetHeader className="pb-4 border-b border-white/[0.06]">
            <SheetTitle className="flex items-center gap-2 text-white">
              <Megaphone className="h-4 w-4 text-blue-400" />
              LinkedIn Campaign Binding
            </SheetTitle>
            <SheetDescription className="text-gray-400 text-sm">
              Link this ops table to a LinkedIn campaign group so you can push creative
              variations directly from the table.
            </SheetDescription>
          </SheetHeader>

          <div className="mt-5 space-y-5">
            {/* Not connected warning */}
            {!isConnected && (
              <div className="flex items-start gap-2.5 rounded-lg border border-amber-700/40 bg-amber-900/10 px-3 py-3">
                <AlertCircle className="h-4 w-4 text-amber-400 mt-0.5 shrink-0" />
                <div>
                  <p className="text-xs font-medium text-amber-300">LinkedIn not connected</p>
                  <p className="text-xs text-amber-300/70 mt-0.5">
                    Connect LinkedIn in{' '}
                    <a
                      href="/integrations"
                      className="underline hover:text-amber-200"
                      target="_blank"
                      rel="noopener noreferrer"
                    >
                      Integrations
                    </a>{' '}
                    to push creatives to your ad campaigns.
                  </p>
                </div>
              </div>
            )}

            {/* Ad account info — shown when connected */}
            {isConnected && integration?.linkedin_ad_account_name && (
              <div className="flex items-center gap-2 rounded-lg border border-blue-700/30 bg-blue-900/10 px-3 py-2">
                <CheckCircle2 className="h-3.5 w-3.5 text-blue-400 shrink-0" />
                <span className="text-xs text-blue-300">
                  Ad Account: <span className="font-medium">{integration.linkedin_ad_account_name}</span>
                </span>
              </div>
            )}

            {/* Campaign Group */}
            <div className="space-y-1.5">
              <Label className="text-xs font-medium text-gray-300">
                Campaign Group ID
                <span className="text-red-400 ml-0.5">*</span>
              </Label>
              <input
                type="text"
                value={groupId}
                onChange={(e) => setGroupId(e.target.value)}
                placeholder="e.g. 12345678"
                className="w-full rounded-lg border border-gray-700 bg-gray-800 px-3 py-2 text-sm text-white placeholder-gray-500 outline-none focus:border-blue-500 transition-colors"
              />
              <p className="text-xs text-gray-500">
                Find this in LinkedIn Campaign Manager under the campaign group URL.
              </p>
            </div>

            {/* Campaign Group Name (optional label) */}
            <div className="space-y-1.5">
              <Label className="text-xs font-medium text-gray-300">
                Campaign Group Name
                <span className="text-gray-500 ml-1 font-normal">(optional)</span>
              </Label>
              <input
                type="text"
                value={groupName}
                onChange={(e) => setGroupName(e.target.value)}
                placeholder="e.g. Q2 Product Launch"
                className="w-full rounded-lg border border-gray-700 bg-gray-800 px-3 py-2 text-sm text-white placeholder-gray-500 outline-none focus:border-blue-500 transition-colors"
              />
            </div>

            {/* Campaign ID */}
            <div className="space-y-1.5">
              <Label className="text-xs font-medium text-gray-300">
                Campaign ID
                <span className="text-gray-500 ml-1 font-normal">(optional — leave blank to create new)</span>
              </Label>
              <input
                type="text"
                value={campaignId}
                onChange={(e) => setCampaignId(e.target.value)}
                placeholder="e.g. 987654321"
                className="w-full rounded-lg border border-gray-700 bg-gray-800 px-3 py-2 text-sm text-white placeholder-gray-500 outline-none focus:border-blue-500 transition-colors"
              />
            </div>

            {/* Campaign Name */}
            <div className="space-y-1.5">
              <Label className="text-xs font-medium text-gray-300">
                Campaign Name
                <span className="text-gray-500 ml-1 font-normal">(optional)</span>
              </Label>
              <input
                type="text"
                value={campaignName}
                onChange={(e) => setCampaignName(e.target.value)}
                placeholder="e.g. Creative Testing - May 2026"
                className="w-full rounded-lg border border-gray-700 bg-gray-800 px-3 py-2 text-sm text-white placeholder-gray-500 outline-none focus:border-blue-500 transition-colors"
              />
            </div>

            {/* Structure */}
            <div className="space-y-2">
              <Label className="text-xs font-medium text-gray-300">Campaign Structure</Label>
              <RadioGroup
                value={structure}
                onValueChange={(v) => setStructure(v as LinkedInCampaignStructure)}
                className="space-y-2"
              >
                {/* Single campaign */}
                <label
                  htmlFor="structure-single"
                  className={`flex cursor-pointer items-start gap-3 rounded-lg border p-3 transition-colors ${
                    structure === 'single_campaign'
                      ? 'border-blue-500/50 bg-blue-900/10'
                      : 'border-gray-700 bg-gray-800/50 hover:border-gray-600'
                  }`}
                >
                  <RadioGroupItem
                    value="single_campaign"
                    id="structure-single"
                    className="mt-0.5 shrink-0"
                  />
                  <div>
                    <p className="text-xs font-medium text-white">
                      All rows as creatives in ONE campaign
                    </p>
                    <p className="text-xs text-gray-400 mt-0.5">
                      Rows become ad creatives inside a single campaign — ideal for A/B testing
                      variations at the creative level.
                    </p>
                  </div>
                </label>

                {/* Per-row campaign */}
                <label
                  htmlFor="structure-per-row"
                  className={`flex cursor-pointer items-start gap-3 rounded-lg border p-3 transition-colors ${
                    structure === 'per_row_campaign'
                      ? 'border-blue-500/50 bg-blue-900/10'
                      : 'border-gray-700 bg-gray-800/50 hover:border-gray-600'
                  }`}
                >
                  <RadioGroupItem
                    value="per_row_campaign"
                    id="structure-per-row"
                    className="mt-0.5 shrink-0"
                  />
                  <div>
                    <p className="text-xs font-medium text-white">
                      Each row as a separate campaign
                    </p>
                    <p className="text-xs text-gray-400 mt-0.5">
                      Each row creates its own campaign — ideal when rows represent distinct
                      audience segments or budget allocations.
                    </p>
                  </div>
                </label>
              </RadioGroup>
            </div>

            {/* Actions */}
            <div className="flex items-center justify-between pt-2 border-t border-white/[0.06]">
              {/* Unlink button — only visible when already bound */}
              {isBound ? (
                <button
                  type="button"
                  onClick={handleUnlink}
                  disabled={isSaving}
                  className="inline-flex items-center gap-1.5 rounded-lg border border-red-700/40 bg-red-900/10 px-3 py-1.5 text-xs font-medium text-red-400 hover:bg-red-900/20 hover:text-red-300 transition-colors disabled:opacity-50"
                >
                  <Unlink2 className="h-3.5 w-3.5" />
                  Unlink
                </button>
              ) : (
                <button
                  type="button"
                  onClick={() => setOpen(false)}
                  className="inline-flex items-center gap-1.5 rounded-lg border border-gray-700 bg-gray-800 px-3 py-1.5 text-xs font-medium text-gray-400 hover:bg-gray-700 hover:text-gray-200 transition-colors"
                >
                  <X className="h-3.5 w-3.5" />
                  Cancel
                </button>
              )}

              <Button
                onClick={handleSave}
                disabled={isSaving || !groupId.trim()}
                size="sm"
                className="gap-1.5 bg-blue-600 hover:bg-blue-700 text-white text-xs"
              >
                {isSaving ? (
                  <Loader2 className="h-3.5 w-3.5 animate-spin" />
                ) : (
                  <Link2 className="h-3.5 w-3.5" />
                )}
                {isBound ? 'Update Binding' : 'Link Campaign'}
              </Button>
            </div>

            {/* Budget manager — shown when bound AND budget config is set */}
            {isBound && (
              <div className="pt-2">
                <p className="text-[10px] font-medium text-gray-500 uppercase tracking-wide mb-2">
                  Budget
                </p>
                <LinkedInBudgetManager
                  tableId={tableId}
                  integrationConfig={integrationConfig}
                  onSaved={onSaved}
                />
                {/* Prompt to configure budget if not yet set */}
                {!((integrationConfig?.linkedin as Record<string, unknown> | undefined)?.budget) && (
                  <p className="text-[11px] text-gray-500 mt-2">
                    Configure budget in{' '}
                    <button
                      type="button"
                      onClick={() => { setOpen(false); setMappingOpen(true); }}
                      className="text-blue-400 hover:text-blue-300 underline"
                    >
                      Map Columns
                    </button>
                    {' '}(Step 3).
                  </p>
                )}
              </div>
            )}
          </div>
        </SheetContent>
      </Sheet>
    </>
  );
}
