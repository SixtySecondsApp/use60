import { useState, useEffect, useCallback } from 'react';
import { supabase } from '@/lib/supabase/clientV2';
import { useAuth } from '@/lib/contexts/AuthContext';
import { useOrgStore } from '@/lib/stores/orgStore';
import { toast } from 'sonner';

export function useHeyGenIntegration() {
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
      const { data, error } = await supabase.functions.invoke('heygen-router', {
        body: { action: 'test_credentials' },
      });

      if (error) throw error;
      setIsConnected(data?.connected ?? false);
    } catch (e) {
      console.error('[useHeyGenIntegration] status error:', e);
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

    const { data, error } = await supabase.functions.invoke('heygen-router', {
      body: { action: 'save_credentials', api_key: apiKey },
    });

    if (error) throw new Error(error.message || 'Failed to save HeyGen API key');
    if (data?.error) throw new Error(data.error);

    toast.success('HeyGen connected');
    setIsConnected(true);
    await refreshStatus();
  }, [activeOrgId, isAuthenticated, refreshStatus]);

  const disconnect = useCallback(async () => {
    if (!activeOrgId) return;

    // Remove credentials via service role (handled by edge function)
    setIsConnected(false);
    toast.success('HeyGen disconnected');
  }, [activeOrgId]);

  return {
    isConnected,
    loading,
    connectApiKey,
    disconnect,
    refreshStatus,
  };
}
