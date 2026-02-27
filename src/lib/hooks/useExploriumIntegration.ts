import { useState, useEffect, useCallback } from 'react';
import { supabase } from '@/lib/supabase/clientV2';
import { useAuth } from '@/lib/contexts/AuthContext';
import { useOrgStore } from '@/lib/stores/orgStore';
import { toast } from 'sonner';

export function useExploriumIntegration() {
  const { user, isAuthenticated } = useAuth();
  const activeOrgId = useOrgStore((s) => s.activeOrgId);
  const [isConnected, setIsConnected] = useState(false);
  const [loading, setLoading] = useState(true);

  const refreshStatus = useCallback(async () => {
    if (!isAuthenticated || !user || !activeOrgId) {
      setIsConnected(false);
      setLoading(false);
      return;
    }

    try {
      setLoading(true);
      const { data, error } = await (supabase as any)
        .from('integration_credentials')
        .select('id')
        .eq('organization_id', activeOrgId)
        .eq('provider', 'explorium')
        .maybeSingle();

      if (error) throw error;
      setIsConnected(!!data);
    } catch (e) {
      console.error('[useExploriumIntegration] status error:', e);
      setIsConnected(false);
    } finally {
      setLoading(false);
    }
  }, [activeOrgId, isAuthenticated, user]);

  useEffect(() => {
    refreshStatus();
  }, [refreshStatus]);

  const connectApiKey = useCallback(async (apiKey: string) => {
    if (!activeOrgId) throw new Error('No active organization');
    if (!isAuthenticated) throw new Error('Please sign in');

    const { error } = await (supabase as any)
      .from('integration_credentials')
      .upsert(
        {
          organization_id: activeOrgId,
          provider: 'explorium',
          credentials: { api_key: apiKey },
          updated_at: new Date().toISOString(),
        },
        { onConflict: 'organization_id,provider' }
      );

    if (error) throw new Error(error.message || 'Failed to save Explorium API key');
    toast.success('Explorium connected');
    await refreshStatus();
  }, [activeOrgId, isAuthenticated, refreshStatus]);

  const disconnect = useCallback(async () => {
    if (!activeOrgId) throw new Error('No active organization');

    const { error } = await (supabase as any)
      .from('integration_credentials')
      .delete()
      .eq('organization_id', activeOrgId)
      .eq('provider', 'explorium');

    if (error) throw new Error(error.message || 'Failed to disconnect Explorium');
    toast.success('Explorium disconnected');
    await refreshStatus();
  }, [activeOrgId, refreshStatus]);

  return { isConnected, loading, connectApiKey, disconnect, refreshStatus };
}
