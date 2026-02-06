import React, { useState, useMemo } from 'react';
import { useQuery } from '@tanstack/react-query';
import { Search, ChevronDown, ChevronUp, Sparkles, Check, Loader2, AlertCircle } from 'lucide-react';
import { supabase, getSupabaseAuthToken } from '@/lib/supabase/clientV2';
import { useAuthUser } from '@/lib/hooks/useAuthUser';

interface OpenRouterModel {
  id: string;
  name: string;
  description?: string;
  context_length: number;
  pricing: {
    prompt: string;
    completion: string;
  };
  recommended?: boolean;
  pricePerMillionInput?: number;
  pricePerMillionOutput?: number;
}

interface OpenRouterModelPickerProps {
  value?: string;
  onChange: (modelId: string) => void;
  className?: string;
}

/**
 * Format price for display (e.g., $3.00 / 1M tokens)
 */
function formatPrice(pricePerMillion: number | undefined): string {
  if (pricePerMillion === undefined || pricePerMillion === 0) return 'Free';
  if (pricePerMillion < 0.01) return `$${pricePerMillion.toFixed(4)}`;
  if (pricePerMillion < 1) return `$${pricePerMillion.toFixed(2)}`;
  return `$${pricePerMillion.toFixed(2)}`;
}

/**
 * Format context length for display (e.g., 128K)
 */
function formatContextLength(length: number): string {
  if (length >= 1_000_000) return `${(length / 1_000_000).toFixed(1)}M`;
  if (length >= 1000) return `${Math.round(length / 1000)}K`;
  return length.toString();
}

export function OpenRouterModelPicker({ value, onChange, className = '' }: OpenRouterModelPickerProps) {
  const [showAll, setShowAll] = useState(false);
  const [searchQuery, setSearchQuery] = useState('');
  const { data: authUser } = useAuthUser();

  // Fetch models from edge function (only when authenticated)
  const { data, isLoading, error } = useQuery({
    queryKey: ['openrouter-models'],
    queryFn: async () => {
      // Get auth token and pass in both header AND body (workaround for header forwarding issues)
      const token = await getSupabaseAuthToken();
      if (!token) {
        throw new Error('Not authenticated');
      }

      const { data, error } = await supabase.functions.invoke('fetch-openrouter-models', {
        headers: {
          Authorization: `Bearer ${token}`,
        },
        body: {
          accessToken: token,
        },
      });
      if (error) throw error;
      return data as { models: OpenRouterModel[]; total: number; recommendedCount: number };
    },
    staleTime: 60 * 60 * 1000, // 1 hour
    gcTime: 60 * 60 * 1000,
    enabled: !!authUser, // Only fetch when user is authenticated
  });

  const models = data?.models || [];

  // Filter models based on search and showAll
  const filteredModels = useMemo(() => {
    let result = models;

    // Filter by recommended unless showing all
    if (!showAll) {
      result = result.filter(m => m.recommended);
    }

    // Filter by search query
    if (searchQuery.trim()) {
      const query = searchQuery.toLowerCase();
      result = result.filter(m =>
        m.id.toLowerCase().includes(query) ||
        m.name.toLowerCase().includes(query)
      );
    }

    return result;
  }, [models, showAll, searchQuery]);

  // Get selected model details
  const selectedModel = useMemo(() => {
    return models.find(m => m.id === value);
  }, [models, value]);

  if (isLoading) {
    return (
      <div className={`rounded-lg border border-gray-700 bg-gray-800/50 p-4 ${className}`}>
        <div className="flex items-center justify-center gap-2 text-gray-400">
          <Loader2 className="h-4 w-4 animate-spin" />
          <span className="text-sm">Loading AI models...</span>
        </div>
      </div>
    );
  }

  if (error) {
    return (
      <div className={`rounded-lg border border-red-700/50 bg-red-900/20 p-4 ${className}`}>
        <div className="flex items-center gap-2 text-red-400">
          <AlertCircle className="h-4 w-4" />
          <span className="text-sm">Failed to load models. Using default.</span>
        </div>
      </div>
    );
  }

  return (
    <div className={`space-y-3 ${className}`}>
      {/* Section header */}
      <div className="flex items-center justify-between">
        <label className="flex items-center gap-1.5 text-sm font-medium text-gray-300">
          <Sparkles className="h-4 w-4 text-violet-400" />
          AI Model
        </label>
        {selectedModel && (
          <span className="text-xs text-gray-500">
            {formatPrice(selectedModel.pricePerMillionInput)} / 1M tokens
          </span>
        )}
      </div>

      {/* Search (only when showing all) */}
      {showAll && (
        <div className="relative">
          <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-gray-500" />
          <input
            type="text"
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            placeholder="Search models..."
            className="w-full rounded-lg border border-gray-700 bg-gray-800 py-2 pl-9 pr-3 text-sm text-gray-100 placeholder-gray-500 outline-none transition-colors focus:border-violet-500 focus:ring-1 focus:ring-violet-500/30"
          />
        </div>
      )}

      {/* Model grid */}
      <div className="grid gap-2">
        {filteredModels.map((model) => {
          const isSelected = model.id === value;
          return (
            <button
              key={model.id}
              type="button"
              onClick={() => onChange(model.id)}
              className={`group relative flex items-start gap-3 rounded-lg border p-3 text-left transition-all ${
                isSelected
                  ? 'border-violet-500 bg-violet-500/10 ring-1 ring-violet-500/30'
                  : 'border-gray-700 bg-gray-800/50 hover:border-gray-600 hover:bg-gray-800'
              }`}
            >
              {/* Selection indicator */}
              <div
                className={`mt-0.5 flex h-4 w-4 shrink-0 items-center justify-center rounded-full border transition-colors ${
                  isSelected
                    ? 'border-violet-500 bg-violet-500'
                    : 'border-gray-600 bg-transparent group-hover:border-gray-500'
                }`}
              >
                {isSelected && <Check className="h-2.5 w-2.5 text-white" />}
              </div>

              {/* Model info */}
              <div className="min-w-0 flex-1">
                <div className="flex items-center gap-2">
                  <span className="text-sm font-medium text-gray-100">{model.name}</span>
                  {model.recommended && (
                    <span className="rounded-full bg-violet-500/20 px-1.5 py-0.5 text-[10px] font-medium text-violet-300">
                      Recommended
                    </span>
                  )}
                </div>
                <div className="mt-1 flex items-center gap-3 text-xs text-gray-500">
                  <span>
                    Input: {formatPrice(model.pricePerMillionInput)}
                  </span>
                  <span>
                    Output: {formatPrice(model.pricePerMillionOutput)}
                  </span>
                  <span>
                    Context: {formatContextLength(model.context_length)}
                  </span>
                </div>
              </div>
            </button>
          );
        })}
      </div>

      {/* Toggle to show all models */}
      {!showAll && models.length > filteredModels.length && (
        <button
          type="button"
          onClick={() => setShowAll(true)}
          className="flex w-full items-center justify-center gap-1.5 rounded-lg border border-dashed border-gray-700 py-2 text-xs font-medium text-gray-400 transition-colors hover:border-gray-600 hover:text-gray-300"
        >
          <ChevronDown className="h-3.5 w-3.5" />
          Browse all {models.length} models
        </button>
      )}

      {showAll && (
        <button
          type="button"
          onClick={() => {
            setShowAll(false);
            setSearchQuery('');
          }}
          className="flex w-full items-center justify-center gap-1.5 rounded-lg border border-dashed border-gray-700 py-2 text-xs font-medium text-gray-400 transition-colors hover:border-gray-600 hover:text-gray-300"
        >
          <ChevronUp className="h-3.5 w-3.5" />
          Show recommended only
        </button>
      )}

      {/* No results message */}
      {showAll && searchQuery && filteredModels.length === 0 && (
        <p className="py-4 text-center text-sm text-gray-500">
          No models found for &ldquo;{searchQuery}&rdquo;
        </p>
      )}
    </div>
  );
}

export default OpenRouterModelPicker;
