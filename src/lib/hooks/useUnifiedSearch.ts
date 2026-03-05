/**
 * useUnifiedSearch
 *
 * React Query hook wrapping the entity-search edge function.
 * Supports cross-entity search (contacts, deals, companies, meetings).
 * Debounced, 5-min stale time, abort on new query.
 *
 * Story: SRCH-007
 */

import { useQuery } from '@tanstack/react-query';
import { useState, useEffect } from 'react';
import { supabase } from '@/lib/supabase/clientV2';

// ============================================================================
// Types
// ============================================================================

export type SearchEntityType = 'contact' | 'deal' | 'company' | 'meeting';

export interface UnifiedSearchResult {
  id: string;
  type: SearchEntityType;
  /** Primary display name */
  name: string;
  /** Secondary display text (company, stage, date, etc.) */
  subtitle: string;
  /** Optional avatar / logo URL */
  avatar_url?: string;
  /** Arbitrary metadata for quick actions / navigation */
  metadata: Record<string, unknown>;
  relevance_score: number;
}

interface UseUnifiedSearchOptions {
  types?: SearchEntityType[];
  limit?: number;
  debounceMs?: number;
  enabled?: boolean;
}

// ============================================================================
// Query keys
// ============================================================================

export const UNIFIED_SEARCH_KEYS = {
  results: (query: string, types: SearchEntityType[] | undefined, limit: number) =>
    ['unified-search', query, types, limit] as const,
};

// ============================================================================
// Hook
// ============================================================================

export function useUnifiedSearch(
  query: string,
  options: UseUnifiedSearchOptions = {}
) {
  const { types, limit = 20, debounceMs = 200, enabled = true } = options;
  const [debouncedQuery, setDebouncedQuery] = useState(query);

  // Debounce
  useEffect(() => {
    const timer = setTimeout(() => setDebouncedQuery(query), debounceMs);
    return () => clearTimeout(timer);
  }, [query, debounceMs]);

  const trimmed = debouncedQuery.trim();

  const result = useQuery<UnifiedSearchResult[]>({
    queryKey: UNIFIED_SEARCH_KEYS.results(trimmed, types, limit),
    queryFn: async () => {
      if (!trimmed) return [];

      const { data, error } = await supabase.functions.invoke('entity-search', {
        body: {
          query: trimmed,
          types,
          limit,
        },
      });

      if (error) throw error;

      // Normalise results — edge function returns { results: [...] }
      const raw: Array<{
        id: string;
        type: string;
        name: string;
        subtitle?: string;
        avatar_url?: string;
        metadata?: Record<string, unknown>;
        relevance_score?: number;
      }> = data?.results ?? [];

      return raw.map((r) => ({
        id: r.id,
        type: r.type as SearchEntityType,
        name: r.name,
        subtitle: r.subtitle ?? '',
        avatar_url: r.avatar_url,
        metadata: r.metadata ?? {},
        relevance_score: r.relevance_score ?? 0,
      }));
    },
    enabled: enabled && trimmed.length >= 2,
    staleTime: 5 * 60 * 1000,
    gcTime: 10 * 60 * 1000,
  });

  return {
    results: result.data ?? [],
    isLoading: result.isFetching,
    error: result.error,
    query: trimmed,
  };
}
