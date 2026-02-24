// src/lib/hooks/useResearchProvider.ts
// Hook to manage research provider selection (Gemini vs Exa)

import { useState, useCallback, useEffect } from 'react';
import { supabase } from '@/lib/supabase/clientV2';

export type ResearchProvider = 'gemini' | 'exa' | 'disabled';

const SETTING_KEY = 'research_provider';

/**
 * Hook to read and update the research provider setting
 * @returns Current provider, loading state, and update function
 */
export function useResearchProvider() {
  const [provider, setProvider] = useState<ResearchProvider>('disabled');
  const [loading, setLoading] = useState(true);

  const fetchProvider = useCallback(async () => {
    setLoading(true);
    try {
      const { data, error } = await supabase
        .from('app_settings')
        .select('value')
        .eq('key', SETTING_KEY)
        .maybeSingle();

      if (error) {
        console.error('[useResearchProvider] Error fetching provider:', error);
        setProvider('disabled');
      } else if (data?.value) {
        const parsedValue = JSON.parse(data.value) as string;
        if (parsedValue === 'gemini' || parsedValue === 'exa' || parsedValue === 'disabled') {
          setProvider(parsedValue);
        } else {
          console.warn('[useResearchProvider] Invalid provider value:', parsedValue);
          setProvider('disabled');
        }
      } else {
        // Default to disabled if no setting exists
        setProvider('disabled');
      }
    } catch (error) {
      console.error('[useResearchProvider] Error:', error);
      setProvider('disabled');
    } finally {
      setLoading(false);
    }
  }, []);

  const updateProvider = useCallback(async (newProvider: ResearchProvider) => {
    try {
      const { error } = await supabase
        .from('app_settings')
        .upsert({
          key: SETTING_KEY,
          value: JSON.stringify(newProvider)
        }, { onConflict: 'key' });

      if (error) {
        console.error('[useResearchProvider] Error updating provider:', error);
        return { error };
      }

      setProvider(newProvider);
      return { error: null };
    } catch (error) {
      console.error('[useResearchProvider] Error:', error);
      return { error: error as Error };
    }
  }, []);

  useEffect(() => {
    fetchProvider();
  }, [fetchProvider]);

  return {
    provider,
    loading,
    updateProvider,
    refetch: fetchProvider
  };
}
