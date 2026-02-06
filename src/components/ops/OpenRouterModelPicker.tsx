import React, { useState, useMemo } from 'react';
import { useQuery } from '@tanstack/react-query';
import { Search, Sparkles, Loader2, AlertCircle, Check, Zap, ChevronDown, Globe } from 'lucide-react';
import { supabase, getSupabaseAuthToken } from '@/lib/supabase/clientV2';
import { useAuthUser } from '@/lib/hooks/useAuthUser';

interface EnrichedModel {
  id: string;
  name: string;
  provider: string;
  providerLabel: string;
  context_length: number;
  pricePerMillionInput: number;
  pricePerMillionOutput: number;
  recommended: boolean;
  enrichmentScore: number;
  hasWebSearch?: boolean;
}

interface ProviderInfo {
  id: string;
  label: string;
  count: number;
}

interface ModelsResponse {
  models: EnrichedModel[];
  providers: ProviderInfo[];
  topPick: string | null;
}

interface OpenRouterModelPickerProps {
  value?: string;
  onChange: (modelId: string) => void;
  className?: string;
}

function formatPrice(price: number): string {
  if (price === 0) return 'Free';
  if (price < 0.01) return `$${price.toFixed(4)}`;
  if (price < 1) return `$${price.toFixed(2)}`;
  return `$${price.toFixed(2)}`;
}

function formatContext(length: number): string {
  if (length >= 1_000_000) return `${(length / 1_000_000).toFixed(0)}M`;
  if (length >= 1000) return `${Math.round(length / 1000)}K`;
  return length.toString();
}

export function OpenRouterModelPicker({ value, onChange, className = '' }: OpenRouterModelPickerProps) {
  const [isExpanded, setIsExpanded] = useState(false);
  const [searchQuery, setSearchQuery] = useState('');
  const [selectedProvider, setSelectedProvider] = useState<string | null>(null);
  const { data: authUser } = useAuthUser();

  const { data, isLoading, error } = useQuery({
    queryKey: ['openrouter-models'],
    queryFn: async () => {
      const token = await getSupabaseAuthToken();
      if (!token) throw new Error('Not authenticated');
      const { data, error } = await supabase.functions.invoke('fetch-openrouter-models', {
        headers: { Authorization: `Bearer ${token}` },
        body: { accessToken: token },
      });
      if (error) throw error;
      return data as ModelsResponse;
    },
    staleTime: 60 * 60 * 1000,
    gcTime: 60 * 60 * 1000,
    enabled: !!authUser,
  });

  const models = data?.models || [];
  const providers = data?.providers || [];

  // Auto-select top pick if no value set
  const effectiveValue = value || data?.topPick || '';

  const filteredModels = useMemo(() => {
    let result = models;

    if (selectedProvider) {
      result = result.filter(m => m.provider === selectedProvider);
    }

    if (searchQuery.trim()) {
      const q = searchQuery.toLowerCase();
      result = result.filter(m =>
        m.id.toLowerCase().includes(q) ||
        m.name.toLowerCase().includes(q) ||
        m.providerLabel.toLowerCase().includes(q)
      );
    }

    // If no filter active, show only recommended
    if (!selectedProvider && !searchQuery.trim()) {
      result = result.filter(m => m.recommended);
    }

    return result;
  }, [models, selectedProvider, searchQuery]);

  const selectedModel = useMemo(
    () => models.find(m => m.id === effectiveValue),
    [models, effectiveValue]
  );

  // Notify parent of auto-selected top pick
  React.useEffect(() => {
    if (!value && data?.topPick) {
      onChange(data.topPick);
    }
  }, [data?.topPick, value, onChange]);

  if (isLoading) {
    return (
      <div className={`flex items-center gap-2 text-gray-400 py-1 ${className}`}>
        <Loader2 className="h-3.5 w-3.5 animate-spin" />
        <span className="text-xs">Loading models...</span>
      </div>
    );
  }

  if (error) {
    return (
      <div className={`flex items-center gap-1.5 text-red-400 py-1 ${className}`}>
        <AlertCircle className="h-3.5 w-3.5" />
        <span className="text-xs">Failed to load models. Using default.</span>
      </div>
    );
  }

  return (
    <div className={`space-y-0 ${className}`}>
      {/* Compact selector — always visible */}
      <button
        type="button"
        onClick={() => setIsExpanded(!isExpanded)}
        className={`group flex w-full items-center gap-2.5 rounded-lg border px-3 py-2 text-left transition-all ${
          isExpanded
            ? 'border-violet-500/50 bg-violet-500/5'
            : 'border-gray-700 bg-gray-800/50 hover:border-gray-600'
        }`}
      >
        <Sparkles className="h-3.5 w-3.5 shrink-0 text-violet-400" />
        <div className="min-w-0 flex-1">
          <div className="flex items-center gap-1.5">
            <span className="text-[10px] font-medium uppercase tracking-wider text-gray-500">Model</span>
            {selectedModel?.hasWebSearch && (
              <span className="flex shrink-0 items-center gap-0.5 rounded bg-blue-500/15 px-1 py-px text-[9px] font-medium text-blue-300">
                <Globe className="h-2 w-2" />
                Web
              </span>
            )}
          </div>
          <span className="block truncate text-xs font-medium text-gray-200">
            {selectedModel?.name || 'Select model...'}
          </span>
        </div>
        {selectedModel && (
          <span className="shrink-0 text-[10px] text-gray-500">
            {formatPrice(selectedModel.pricePerMillionInput)}/1M · {formatContext(selectedModel.context_length)}
          </span>
        )}
        <ChevronDown className={`h-3.5 w-3.5 shrink-0 text-gray-500 transition-transform ${isExpanded ? 'rotate-180' : ''}`} />
      </button>

      {/* Expanded model browser — inline */}
      {isExpanded && (
        <div className="mt-2 space-y-2 rounded-lg border border-gray-700/60 bg-gray-900/50 p-2.5">
          {/* Provider filter chips */}
          <div className="flex flex-wrap gap-1">
            <button
              type="button"
              onClick={() => { setSelectedProvider(null); setSearchQuery(''); }}
              className={`rounded-full px-2 py-0.5 text-[10px] font-medium transition-colors ${
                !selectedProvider
                  ? 'bg-violet-500/20 text-violet-300 ring-1 ring-violet-500/30'
                  : 'bg-gray-800 text-gray-500 hover:text-gray-300'
              }`}
            >
              Top Picks
            </button>
            {providers.map(p => (
              <button
                key={p.id}
                type="button"
                onClick={() => { setSelectedProvider(selectedProvider === p.id ? null : p.id); setSearchQuery(''); }}
                className={`rounded-full px-2 py-0.5 text-[10px] font-medium transition-colors ${
                  selectedProvider === p.id
                    ? 'bg-violet-500/20 text-violet-300 ring-1 ring-violet-500/30'
                    : 'bg-gray-800 text-gray-500 hover:text-gray-300'
                }`}
              >
                {p.label}
              </button>
            ))}
          </div>

          {/* Search (shown when a provider is selected) */}
          {selectedProvider && (
            <div className="relative">
              <Search className="absolute left-2.5 top-1/2 h-3 w-3 -translate-y-1/2 text-gray-500" />
              <input
                type="text"
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                placeholder={`Search ${PROVIDER_LABELS[selectedProvider] || selectedProvider} models...`}
                className="w-full rounded-md border border-gray-700 bg-gray-800 py-1 pl-7 pr-3 text-xs text-gray-100 placeholder-gray-500 outline-none focus:border-violet-500"
              />
            </div>
          )}

          {/* Model list */}
          <div className="max-h-[180px] space-y-1 overflow-y-auto pr-1">
            {filteredModels.map((model) => {
              const isSelected = model.id === effectiveValue;
              const isTopPick = model.id === data?.topPick;
              return (
                <button
                  key={model.id}
                  type="button"
                  onClick={() => { onChange(model.id); setIsExpanded(false); }}
                  className={`group flex w-full items-center gap-2 rounded-md border px-2.5 py-1.5 text-left transition-all ${
                    isSelected
                      ? 'border-violet-500/50 bg-violet-500/10'
                      : 'border-transparent bg-gray-800/50 hover:bg-gray-800'
                  }`}
                >
                  <div
                    className={`flex h-3.5 w-3.5 shrink-0 items-center justify-center rounded-full border transition-colors ${
                      isSelected
                        ? 'border-violet-500 bg-violet-500'
                        : 'border-gray-600 group-hover:border-gray-500'
                    }`}
                  >
                    {isSelected && <Check className="h-2 w-2 text-white" />}
                  </div>
                  <div className="min-w-0 flex-1">
                    <div className="flex items-center gap-1.5">
                      <span className="truncate text-xs font-medium text-gray-200">{model.name}</span>
                      {isTopPick && (
                        <span className="flex shrink-0 items-center gap-0.5 rounded bg-amber-500/20 px-1 py-px text-[9px] font-medium text-amber-300">
                          <Zap className="h-2 w-2" />
                          Best value
                        </span>
                      )}
                      {model.hasWebSearch && (
                        <span className="flex shrink-0 items-center gap-0.5 rounded bg-blue-500/15 px-1 py-px text-[9px] font-medium text-blue-300">
                          <Globe className="h-2 w-2" />
                          Web
                        </span>
                      )}
                    </div>
                  </div>
                  <span className="shrink-0 text-[10px] text-gray-500">
                    {formatPrice(model.pricePerMillionInput)}
                  </span>
                </button>
              );
            })}
            {filteredModels.length === 0 && (
              <p className="py-2 text-center text-[10px] text-gray-500">No models found</p>
            )}
          </div>
        </div>
      )}
    </div>
  );
}

const PROVIDER_LABELS: Record<string, string> = {
  google: 'Google',
  perplexity: 'Perplexity',
  openai: 'OpenAI',
  anthropic: 'Anthropic',
  'meta-llama': 'Meta',
  mistralai: 'Mistral',
  deepseek: 'DeepSeek',
  qwen: 'Qwen',
};

export default OpenRouterModelPicker;
