import React, { useState, useEffect, useCallback } from 'react';
import { Loader2, Zap, CheckCircle2, ChevronRight, ChevronLeft, Key, Radio, Send, ArrowDownToLine, Plus, Search, AlertCircle } from 'lucide-react';
import { useQueryClient } from '@tanstack/react-query';
import { toast } from 'sonner';
import { supabase } from '@/lib/supabase/clientV2';
import type { InstantlyCampaign, InstantlyFieldMapping, InstantlyColumnConfig, InstantlySequenceMode } from '@/lib/types/instantly';

interface ExistingColumn {
  key: string;
  label: string;
}

interface ColumnConfig {
  key: string;
  label: string;
  columnType: string;
  isEnrichment: boolean;
  integrationType?: string;
  integrationConfig?: Record<string, unknown>;
}

interface InstantlyColumnWizardProps {
  tableId: string;
  orgId: string;
  existingColumns: ExistingColumn[];
  onComplete: (columns: ColumnConfig[]) => void;
  onCancel: () => void;
}

type WizardStep = 'connect' | 'campaign' | 'configure';

export function InstantlyColumnWizard({
  tableId,
  orgId,
  existingColumns,
  onComplete,
  onCancel,
}: InstantlyColumnWizardProps) {
  const queryClient = useQueryClient();
  const [step, setStep] = useState<WizardStep>('connect');
  const [isCheckingConnection, setIsCheckingConnection] = useState(true);
  const [isConnected, setIsConnected] = useState(false);

  // Step 1: Connection
  const [apiKey, setApiKey] = useState('');
  const [isConnecting, setIsConnecting] = useState(false);

  // Step 2: Campaign
  const [campaigns, setCampaigns] = useState<InstantlyCampaign[]>([]);
  const [isLoadingCampaigns, setIsLoadingCampaigns] = useState(false);
  const [campaignSearch, setCampaignSearch] = useState('');
  const [selectedCampaign, setSelectedCampaign] = useState<InstantlyCampaign | null>(null);
  const [isCreatingCampaign, setIsCreatingCampaign] = useState(false);
  const [newCampaignName, setNewCampaignName] = useState('');
  const [showCreateForm, setShowCreateForm] = useState(false);

  // Step 3: Configuration
  const [sequenceMode, setSequenceMode] = useState<InstantlySequenceMode>('use_existing');
  const [fieldMapping, setFieldMapping] = useState<InstantlyFieldMapping>({ email: '' });
  const [stepCount, setStepCount] = useState(3);
  const [variableMapping, setVariableMapping] = useState<Record<string, string>>({});
  const [isLinking, setIsLinking] = useState(false);

  // Check connection on mount
  useEffect(() => {
    checkConnection();
  }, []);

  const checkConnection = async () => {
    setIsCheckingConnection(true);
    try {
      const { data, error } = await supabase.functions.invoke('instantly-admin', {
        body: { action: 'status', org_id: orgId },
      });
      if (!error && data?.connected) {
        setIsConnected(true);
        setStep('campaign');
        loadCampaigns();
      }
    } catch {
      // Not connected — stay on connect step
    } finally {
      setIsCheckingConnection(false);
    }
  };

  const handleConnect = async () => {
    if (!apiKey.trim()) return;
    setIsConnecting(true);
    try {
      const { data, error } = await supabase.functions.invoke('instantly-admin', {
        body: { action: 'connect', org_id: orgId, api_key: apiKey.trim() },
      });
      if (error || !data?.success) {
        toast.error(data?.error || 'Failed to connect to Instantly');
        return;
      }
      setIsConnected(true);
      setStep('campaign');
      toast.success('Connected to Instantly');
      loadCampaigns();
    } catch (err: any) {
      toast.error(err.message || 'Connection failed');
    } finally {
      setIsConnecting(false);
    }
  };

  const loadCampaigns = async () => {
    setIsLoadingCampaigns(true);
    try {
      const { data, error } = await supabase.functions.invoke('instantly-admin', {
        body: { action: 'list_campaigns', org_id: orgId, limit: 100 },
      });
      if (!error && data?.campaigns) {
        setCampaigns(data.campaigns);
      }
    } catch {
      toast.error('Failed to load campaigns');
    } finally {
      setIsLoadingCampaigns(false);
    }
  };

  const handleCreateCampaign = async () => {
    if (!newCampaignName.trim()) return;
    setIsCreatingCampaign(true);
    try {
      const { data, error } = await supabase.functions.invoke('instantly-admin', {
        body: { action: 'create_campaign', org_id: orgId, name: newCampaignName.trim() },
      });
      if (error || !data?.campaign) {
        toast.error(data?.error || 'Failed to create campaign');
        return;
      }
      const created = data.campaign as InstantlyCampaign;
      setCampaigns((prev) => [created, ...prev]);
      setSelectedCampaign(created);
      setShowCreateForm(false);
      setNewCampaignName('');
      toast.success(`Campaign "${created.name}" created`);
    } catch (err: any) {
      toast.error(err.message || 'Failed to create campaign');
    } finally {
      setIsCreatingCampaign(false);
    }
  };

  // Auto-detect field mapping from existing columns
  useEffect(() => {
    if (step !== 'configure') return;
    const mapping: InstantlyFieldMapping = { email: '' };
    for (const col of existingColumns) {
      const k = col.key.toLowerCase();
      const l = col.label.toLowerCase();
      if (!mapping.email && (k.includes('email') || l.includes('email'))) {
        mapping.email = col.key;
      }
      if (!mapping.first_name && (k.includes('first_name') || k === 'first' || l.includes('first name'))) {
        mapping.first_name = col.key;
      }
      if (!mapping.last_name && (k.includes('last_name') || k === 'last' || l.includes('last name'))) {
        mapping.last_name = col.key;
      }
      if (!mapping.company_name && (k.includes('company') || l.includes('company'))) {
        mapping.company_name = col.key;
      }
    }
    setFieldMapping(mapping);
  }, [step, existingColumns]);

  const handleFinish = async () => {
    if (!selectedCampaign || !fieldMapping.email) return;
    setIsLinking(true);
    try {
      // Link campaign to table
      const { error } = await supabase.functions.invoke('instantly-admin', {
        body: {
          action: 'link_campaign',
          org_id: orgId,
          table_id: tableId,
          campaign_id: selectedCampaign.id,
          campaign_name: selectedCampaign.name,
          field_mapping: fieldMapping,
        },
      });
      if (error) {
        toast.error('Failed to link campaign');
        return;
      }

      // Build columns to create
      const columns: ColumnConfig[] = [];

      // 1. Campaign config column (always created)
      const campaignConfig: InstantlyColumnConfig = {
        instantly_subtype: 'campaign_config',
        campaign_id: selectedCampaign.id,
        campaign_name: selectedCampaign.name,
        field_mapping: fieldMapping,
        sequence_mode: sequenceMode,
      };
      columns.push({
        key: 'instantly_campaign',
        label: `Instantly: ${selectedCampaign.name}`,
        columnType: 'instantly',
        isEnrichment: false,
        integrationConfig: campaignConfig as unknown as Record<string, unknown>,
      });

      // 2. Push action column
      columns.push({
        key: 'instantly_push',
        label: 'Push to Instantly',
        columnType: 'instantly',
        isEnrichment: false,
        integrationConfig: {
          instantly_subtype: 'push_action',
          push_config: {
            campaign_id: selectedCampaign.id,
            auto_field_mapping: true,
          },
        },
      });

      // 3. Auto-scaffold sequence step columns if author mode
      if (sequenceMode === 'author_steps') {
        for (let i = 1; i <= stepCount; i++) {
          columns.push({
            key: `instantly_step_${i}_subject`,
            label: `Step ${i} Subject`,
            columnType: 'text',
            isEnrichment: false,
          });
          columns.push({
            key: `instantly_step_${i}_body`,
            label: `Step ${i} Body`,
            columnType: 'text',
            isEnrichment: false,
          });
        }
      }

      queryClient.invalidateQueries({ queryKey: ['instantly-campaign-links', tableId] });
      onComplete(columns);
      toast.success(`Instantly campaign linked with ${columns.length} columns`);
    } catch (err: any) {
      toast.error(err.message || 'Failed to complete setup');
    } finally {
      setIsLinking(false);
    }
  };

  const campaignStatusLabel = (status: number) => {
    switch (status) {
      case 0: return { label: 'Draft', color: 'text-gray-400 bg-gray-400/10' };
      case 1: return { label: 'Active', color: 'text-emerald-400 bg-emerald-400/10' };
      case 2: return { label: 'Paused', color: 'text-amber-400 bg-amber-400/10' };
      case 3: return { label: 'Completed', color: 'text-blue-400 bg-blue-400/10' };
      default: return { label: 'Unknown', color: 'text-gray-400 bg-gray-400/10' };
    }
  };

  const filteredCampaigns = campaigns.filter(
    (c) => !campaignSearch || c.name.toLowerCase().includes(campaignSearch.toLowerCase())
  );

  // Loading state
  if (isCheckingConnection) {
    return (
      <div className="flex items-center justify-center py-12">
        <Loader2 className="h-5 w-5 animate-spin text-violet-400" />
        <span className="ml-2 text-sm text-gray-400">Checking connection...</span>
      </div>
    );
  }

  return (
    <div className="space-y-4">
      {/* Step indicator */}
      <div className="flex items-center gap-2 text-xs">
        {(['connect', 'campaign', 'configure'] as WizardStep[]).map((s, i) => {
          const labels = ['Connect', 'Campaign', 'Configure'];
          const isCurrent = s === step;
          const isPast = (['connect', 'campaign', 'configure'] as WizardStep[]).indexOf(step) > i;
          return (
            <React.Fragment key={s}>
              {i > 0 && <ChevronRight className="h-3 w-3 text-gray-600" />}
              <span className={`flex items-center gap-1 rounded-full px-2 py-0.5 font-medium ${
                isCurrent ? 'bg-violet-500/20 text-violet-300' :
                isPast ? 'text-emerald-400' : 'text-gray-500'
              }`}>
                {isPast && <CheckCircle2 className="h-3 w-3" />}
                {labels[i]}
              </span>
            </React.Fragment>
          );
        })}
      </div>

      {/* Step 1: Connect */}
      {step === 'connect' && (
        <div className="space-y-4">
          <div className="flex items-center gap-2">
            <Key className="h-4 w-4 text-violet-400" />
            <h3 className="text-sm font-medium text-gray-200">Connect Instantly</h3>
          </div>
          <p className="text-xs text-gray-500">
            Enter your Instantly API key to connect. You can find it in your Instantly dashboard under Settings &gt; Integrations.
          </p>
          <div>
            <input
              type="password"
              value={apiKey}
              onChange={(e) => setApiKey(e.target.value)}
              placeholder="Enter your Instantly API key"
              className="w-full rounded-lg border border-gray-700 bg-gray-800 px-3.5 py-2.5 text-sm text-gray-100 placeholder-gray-500 outline-none transition-colors focus:border-violet-500 focus:ring-1 focus:ring-violet-500/30"
              onKeyDown={(e) => e.key === 'Enter' && handleConnect()}
            />
          </div>
          <button
            onClick={handleConnect}
            disabled={!apiKey.trim() || isConnecting}
            className="flex w-full items-center justify-center gap-2 rounded-lg bg-violet-600 px-4 py-2.5 text-sm font-medium text-white transition-colors hover:bg-violet-500 disabled:cursor-not-allowed disabled:opacity-40"
          >
            {isConnecting ? (
              <>
                <Loader2 className="h-4 w-4 animate-spin" />
                Connecting...
              </>
            ) : (
              <>
                <Zap className="h-4 w-4" />
                Connect
              </>
            )}
          </button>
        </div>
      )}

      {/* Step 2: Campaign Selection */}
      {step === 'campaign' && (
        <div className="space-y-4">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-2">
              <Radio className="h-4 w-4 text-violet-400" />
              <h3 className="text-sm font-medium text-gray-200">Select Campaign</h3>
            </div>
            <button
              onClick={() => setShowCreateForm(!showCreateForm)}
              className="flex items-center gap-1 text-xs font-medium text-violet-400 hover:text-violet-300"
            >
              <Plus className="h-3 w-3" />
              Create New
            </button>
          </div>

          {/* Create campaign form */}
          {showCreateForm && (
            <div className="flex gap-2">
              <input
                type="text"
                value={newCampaignName}
                onChange={(e) => setNewCampaignName(e.target.value)}
                placeholder="Campaign name"
                className="min-w-0 flex-1 rounded-lg border border-gray-700 bg-gray-800 px-3 py-2 text-sm text-gray-100 placeholder-gray-500 outline-none focus:border-violet-500"
                onKeyDown={(e) => e.key === 'Enter' && handleCreateCampaign()}
              />
              <button
                onClick={handleCreateCampaign}
                disabled={!newCampaignName.trim() || isCreatingCampaign}
                className="rounded-lg bg-violet-600 px-3 py-2 text-sm font-medium text-white hover:bg-violet-500 disabled:opacity-40"
              >
                {isCreatingCampaign ? <Loader2 className="h-4 w-4 animate-spin" /> : 'Create'}
              </button>
            </div>
          )}

          {/* Search */}
          <div className="relative">
            <Search className="absolute left-3 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-gray-500" />
            <input
              type="text"
              value={campaignSearch}
              onChange={(e) => setCampaignSearch(e.target.value)}
              placeholder="Search campaigns..."
              className="w-full rounded-lg border border-gray-700 bg-gray-800 py-2 pl-9 pr-3 text-sm text-gray-100 placeholder-gray-500 outline-none focus:border-violet-500"
            />
          </div>

          {/* Campaign list */}
          <div className="max-h-48 space-y-1 overflow-y-auto">
            {isLoadingCampaigns ? (
              <div className="flex items-center justify-center py-6">
                <Loader2 className="h-4 w-4 animate-spin text-gray-500" />
              </div>
            ) : filteredCampaigns.length === 0 ? (
              <p className="py-4 text-center text-xs text-gray-500">
                {campaigns.length === 0 ? 'No campaigns found. Create one above.' : 'No matching campaigns.'}
              </p>
            ) : (
              filteredCampaigns.map((campaign) => {
                const status = campaignStatusLabel(campaign.status);
                const isSelected = selectedCampaign?.id === campaign.id;
                return (
                  <button
                    key={campaign.id}
                    onClick={() => setSelectedCampaign(campaign)}
                    className={`flex w-full items-center justify-between rounded-lg border px-3 py-2.5 text-left text-sm transition-colors ${
                      isSelected
                        ? 'border-violet-500 bg-violet-500/10 text-violet-200'
                        : 'border-gray-700 bg-gray-800/50 text-gray-300 hover:border-gray-600'
                    }`}
                  >
                    <span className="truncate font-medium">{campaign.name}</span>
                    <span className={`ml-2 shrink-0 rounded-full px-2 py-0.5 text-xs font-medium ${status.color}`}>
                      {status.label}
                    </span>
                  </button>
                );
              })
            )}
          </div>

          <button
            onClick={() => setStep('configure')}
            disabled={!selectedCampaign}
            className="flex w-full items-center justify-center gap-2 rounded-lg bg-violet-600 px-4 py-2.5 text-sm font-medium text-white transition-colors hover:bg-violet-500 disabled:cursor-not-allowed disabled:opacity-40"
          >
            Continue
            <ChevronRight className="h-4 w-4" />
          </button>
        </div>
      )}

      {/* Step 3: Configure */}
      {step === 'configure' && selectedCampaign && (
        <div className="space-y-4">
          <div className="flex items-center gap-2">
            <Send className="h-4 w-4 text-violet-400" />
            <h3 className="text-sm font-medium text-gray-200">Configure</h3>
          </div>

          {/* Sequence Mode */}
          <div>
            <label className="mb-2 block text-xs font-medium text-gray-400">Sequence Content</label>
            <div className="grid grid-cols-1 gap-2">
              {([
                { value: 'use_existing' as const, label: 'Use Existing Sequence', desc: 'Campaign already has email steps in Instantly' },
                { value: 'map_variables' as const, label: 'Map Variables', desc: 'Send personalized content from table columns' },
                { value: 'author_steps' as const, label: 'Author Steps', desc: 'Create email sequence from table columns' },
              ]).map((mode) => (
                <button
                  key={mode.value}
                  onClick={() => setSequenceMode(mode.value)}
                  className={`rounded-lg border px-3 py-2.5 text-left transition-colors ${
                    sequenceMode === mode.value
                      ? 'border-violet-500 bg-violet-500/10'
                      : 'border-gray-700 bg-gray-800/50 hover:border-gray-600'
                  }`}
                >
                  <p className={`text-sm font-medium ${sequenceMode === mode.value ? 'text-violet-200' : 'text-gray-300'}`}>{mode.label}</p>
                  <p className="text-xs text-gray-500">{mode.desc}</p>
                </button>
              ))}
            </div>
          </div>

          {/* Author Steps: Step count */}
          {sequenceMode === 'author_steps' && (
            <div>
              <label className="mb-1.5 block text-xs font-medium text-gray-400">Number of Steps</label>
              <div className="flex gap-1.5">
                {[1, 2, 3, 4, 5].map((n) => (
                  <button
                    key={n}
                    onClick={() => setStepCount(n)}
                    className={`rounded-lg border px-3 py-1.5 text-xs font-medium transition-colors ${
                      stepCount === n
                        ? 'border-violet-500 bg-violet-500/15 text-violet-300'
                        : 'border-gray-700 bg-gray-800/50 text-gray-400 hover:border-gray-600'
                    }`}
                  >
                    {n}
                  </button>
                ))}
              </div>
              <p className="mt-1 text-xs text-gray-500">
                Creates {stepCount * 2} columns (Subject + Body per step)
              </p>
            </div>
          )}

          {/* Field Mapping */}
          <div>
            <label className="mb-2 block text-xs font-medium text-gray-400">Field Mapping</label>
            <div className="space-y-2">
              {([
                { key: 'email' as const, label: 'Email', required: true },
                { key: 'first_name' as const, label: 'First Name', required: false },
                { key: 'last_name' as const, label: 'Last Name', required: false },
                { key: 'company_name' as const, label: 'Company', required: false },
              ]).map((field) => (
                <div key={field.key} className="flex items-center gap-2">
                  <span className="w-24 shrink-0 text-xs text-gray-400">
                    {field.label}
                    {field.required && <span className="text-red-400"> *</span>}
                  </span>
                  <select
                    value={(fieldMapping as Record<string, string | undefined>)[field.key] || ''}
                    onChange={(e) => setFieldMapping((prev) => ({ ...prev, [field.key]: e.target.value || undefined }))}
                    className="min-w-0 flex-1 rounded-lg border border-gray-700 bg-gray-800 px-2.5 py-1.5 text-sm text-gray-100 outline-none focus:border-violet-500"
                  >
                    <option value="">— Skip —</option>
                    {existingColumns.map((col) => (
                      <option key={col.key} value={col.key}>{col.label}</option>
                    ))}
                  </select>
                </div>
              ))}
            </div>
          </div>

          {/* Validation warning */}
          {!fieldMapping.email && (
            <div className="flex items-center gap-2 rounded-lg border border-amber-500/30 bg-amber-500/10 px-3 py-2">
              <AlertCircle className="h-4 w-4 shrink-0 text-amber-400" />
              <p className="text-xs text-amber-300">Email column mapping is required to push leads</p>
            </div>
          )}

          {/* Action buttons */}
          <div className="flex gap-2">
            <button
              onClick={() => setStep('campaign')}
              className="flex items-center gap-1 rounded-lg border border-gray-700 bg-gray-800 px-3 py-2 text-sm font-medium text-gray-300 hover:bg-gray-700"
            >
              <ChevronLeft className="h-4 w-4" />
              Back
            </button>
            <button
              onClick={handleFinish}
              disabled={!fieldMapping.email || isLinking}
              className="flex flex-1 items-center justify-center gap-2 rounded-lg bg-violet-600 px-4 py-2.5 text-sm font-medium text-white transition-colors hover:bg-violet-500 disabled:cursor-not-allowed disabled:opacity-40"
            >
              {isLinking ? (
                <>
                  <Loader2 className="h-4 w-4 animate-spin" />
                  Setting up...
                </>
              ) : (
                <>
                  <Zap className="h-4 w-4" />
                  Add Instantly Columns
                </>
              )}
            </button>
          </div>
        </div>
      )}
    </div>
  );
}
