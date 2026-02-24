/**
 * useEntitySearch Hook
 *
 * Wraps the entity-search edge function with debounce, caching, and abort.
 * Used by the @ mention autocomplete dropdown.
 */

import { useQuery, useQueryClient } from '@tanstack/react-query';
import { useState, useEffect, useRef } from 'react';
import { supabase } from '@/lib/supabase/clientV2';
import type { EntitySearchResult, EntityType } from '@/lib/types/entitySearch';

interface UseEntitySearchOptions {
  types?: EntityType[];
  limit?: number;
  enabled?: boolean;
  debounceMs?: number;
}

export function useEntitySearch(
  query: string,
  options: UseEntitySearchOptions = {},
) {
  const { types, limit = 8, enabled = true, debounceMs = 150 } = options;
  const [debouncedQuery, setDebouncedQuery] = useState(query);
  const abortRef = useRef<AbortController | null>(null);

  // Debounce the search query
  useEffect(() => {
    const timer = setTimeout(() => setDebouncedQuery(query), debounceMs);
    return () => clearTimeout(timer);
  }, [query, debounceMs]);

  const result = useQuery<EntitySearchResult[]>({
    queryKey: ['entity-search', debouncedQuery, types, limit],
    queryFn: async () => {
      if (!debouncedQuery || debouncedQuery.trim().length === 0) return [];

      // Abort previous request
      abortRef.current?.abort();
      abortRef.current = new AbortController();

      const { data, error } = await supabase.functions.invoke('entity-search', {
        body: {
          query: debouncedQuery.trim(),
          types,
          limit,
        },
      });

      if (error) throw error;
      return (data?.results || []) as EntitySearchResult[];
    },
    enabled: enabled && debouncedQuery.trim().length > 0,
    staleTime: 30_000, // 30s cache
    gcTime: 60_000,
  });

  return {
    results: result.data || [],
    isLoading: result.isLoading,
    error: result.error,
  };
}
