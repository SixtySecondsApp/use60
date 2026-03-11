/**
 * ModelRoutingPanel — Inline LLM model configuration and pricing matrix
 *
 * Embeds model config controls and lets admin set cost per 1M tokens
 * for each model directly from the GoldenEye page.
 */

import { useState } from 'react';
import {
  Cpu,
  DollarSign,
  Loader2,
  Save,
  ExternalLink,
} from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Badge } from '@/components/ui/badge';
import { useNavigate } from 'react-router-dom';
import { supabase } from '@/lib/supabase/clientV2';
import { toast } from 'sonner';
import type { LLMEndpoint } from '@/lib/hooks/useGoldenEyeData';
import { getProviderColor, AI_PROVIDERS } from '@/lib/types/aiModels';

interface ModelRoutingPanelProps {
  llmEndpoints: LLMEndpoint[];
  onConfigChanged: () => Promise<void>;
}

interface PricingEdit {
  id: string;
  input_cost_per_million: string;
  output_cost_per_million: string;
}

export function ModelRoutingPanel({ llmEndpoints, onConfigChanged }: ModelRoutingPanelProps) {
  const navigate = useNavigate();
  const [pricingEdits, setPricingEdits] = useState<Map<string, PricingEdit>>(new Map());
  const [savingId, setSavingId] = useState<string | null>(null);

  // Group endpoints by provider
  const endpointsByProvider = llmEndpoints.reduce<Record<string, LLMEndpoint[]>>((acc, ep) => {
    if (!acc[ep.provider]) acc[ep.provider] = [];
    acc[ep.provider].push(ep);
    return acc;
  }, {});

  const getEdit = (ep: LLMEndpoint): PricingEdit => {
    return pricingEdits.get(ep.id) || {
      id: ep.id,
      input_cost_per_million: String(ep.input_cost_per_million || 0),
      output_cost_per_million: String(ep.output_cost_per_million || 0),
    };
  };

  const updateEdit = (epId: string, field: 'input_cost_per_million' | 'output_cost_per_million', value: string) => {
    const current = pricingEdits.get(epId) || {
      id: epId,
      input_cost_per_million: String(llmEndpoints.find(e => e.id === epId)?.input_cost_per_million || 0),
      output_cost_per_million: String(llmEndpoints.find(e => e.id === epId)?.output_cost_per_million || 0),
    };

    setPricingEdits(prev => {
      const next = new Map(prev);
      next.set(epId, { ...current, [field]: value });
      return next;
    });
  };

  const handleSavePricing = async (epId: string) => {
    const edit = pricingEdits.get(epId);
    if (!edit) return;

    setSavingId(epId);
    const { error } = await supabase
      .from('ai_models')
      .update({
        input_cost_per_million: parseFloat(edit.input_cost_per_million) || 0,
        output_cost_per_million: parseFloat(edit.output_cost_per_million) || 0,
        updated_at: new Date().toISOString(),
      })
      .eq('id', epId);

    setSavingId(null);

    if (error) {
      toast.error('Failed to update pricing');
      return;
    }

    toast.success('Pricing updated');
    pricingEdits.delete(epId);
    setPricingEdits(new Map(pricingEdits));
    await onConfigChanged();
  };

  const hasUnsavedChanges = (ep: LLMEndpoint): boolean => {
    const edit = pricingEdits.get(ep.id);
    if (!edit) return false;
    return (
      parseFloat(edit.input_cost_per_million) !== (ep.input_cost_per_million || 0) ||
      parseFloat(edit.output_cost_per_million) !== (ep.output_cost_per_million || 0)
    );
  };

  // Flatten all endpoints into a single list for grid layout
  const allEndpoints = Object.entries(endpointsByProvider).flatMap(([provider, endpoints]) =>
    endpoints.map(ep => ({ ...ep, providerName: (AI_PROVIDERS as any)[provider]?.name || provider, providerKey: provider }))
  );

  return (
    <div className="flex-1 min-h-0 flex flex-col">
      {/* Header row */}
      <div className="flex items-center justify-between mb-3 shrink-0">
        <h3 className="text-xs font-medium text-slate-400 uppercase tracking-wider flex items-center gap-1.5">
          <DollarSign className="h-3.5 w-3.5" />
          Pricing Matrix (cost per 1M tokens)
        </h3>
        <Button
          variant="ghost"
          size="sm"
          onClick={() => navigate('/platform/ai/models')}
          className="text-slate-400 hover:text-slate-200 hover:bg-slate-800 border border-slate-700 h-7 text-xs gap-1.5"
        >
          <Cpu className="h-3.5 w-3.5" />
          Full Config
          <ExternalLink className="h-3 w-3" />
        </Button>
      </div>

      {/* Models grid — 3 columns */}
      <div className="grid grid-cols-3 gap-3">
        {allEndpoints.map((ep) => {
          const edit = getEdit(ep);
          const unsaved = hasUnsavedChanges(ep);

          return (
            <div
              key={ep.id}
              className={`p-2.5 rounded-lg border ${
                unsaved ? 'border-amber-500/30 bg-amber-900/10' : 'border-slate-700/50 bg-slate-800/30'
              }`}
            >
              <div className="flex items-center justify-between mb-2">
                <div className="flex items-center gap-1.5 min-w-0">
                  <div
                    className="w-2 h-2 rounded-full shrink-0"
                    style={{ backgroundColor: getProviderColor(ep.providerKey as any) }}
                  />
                  <p className="text-xs font-medium text-slate-200 truncate">
                    {ep.display_name}
                  </p>
                </div>
                <div className="flex items-center gap-1.5 shrink-0">
                  {ep.active_request_count > 0 && (
                    <Badge variant="outline" className="text-[10px] border-emerald-500/30 text-emerald-300">
                      {ep.active_request_count} active
                    </Badge>
                  )}
                  {unsaved && (
                    <Button
                      size="sm"
                      onClick={() => handleSavePricing(ep.id)}
                      disabled={savingId === ep.id}
                      className="h-6 px-2 text-[10px] bg-amber-600 hover:bg-amber-700 text-white"
                    >
                      {savingId === ep.id ? (
                        <Loader2 className="h-3 w-3 animate-spin" />
                      ) : (
                        <Save className="h-3 w-3" />
                      )}
                    </Button>
                  )}
                </div>
              </div>

              <div className="grid grid-cols-2 gap-2">
                <div>
                  <Label className="text-[10px] text-slate-500">Input $/1M</Label>
                  <Input
                    type="number"
                    step="0.01"
                    value={edit.input_cost_per_million}
                    onChange={(e) => updateEdit(ep.id, 'input_cost_per_million', e.target.value)}
                    className="bg-slate-900 border-slate-700 text-slate-200 h-7 text-xs font-mono"
                  />
                </div>
                <div>
                  <Label className="text-[10px] text-slate-500">Output $/1M</Label>
                  <Input
                    type="number"
                    step="0.01"
                    value={edit.output_cost_per_million}
                    onChange={(e) => updateEdit(ep.id, 'output_cost_per_million', e.target.value)}
                    className="bg-slate-900 border-slate-700 text-slate-200 h-7 text-xs font-mono"
                  />
                </div>
              </div>
            </div>
          );
        })}
      </div>

      {llmEndpoints.length === 0 && (
        <p className="text-xs text-slate-500 text-center py-4">No active models found</p>
      )}
    </div>
  );
}
