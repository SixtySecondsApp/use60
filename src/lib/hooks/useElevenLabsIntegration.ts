import { useState, useEffect, useCallback } from 'react';
import { supabase } from '@/lib/supabase/clientV2';
import { useAuth } from '@/lib/contexts/AuthContext';
import { useOrgStore } from '@/lib/stores/orgStore';
import { toast } from 'sonner';

export function useElevenLabsIntegration() {
  const { user, isAuthenticated } = useAuth();
  const activeOrgId = useOrgStore((s) => s.activeOrgId);
  const [isConnected, setIsConnected] = useState(false);
  const [loading, setLoading] = useState(true);
  const [planInfo, setPlanInfo] = useState<{
    plan_tier?: string;
    character_limit?: number;
    character_count?: number;
  } | null>(null);

  const refreshStatus = useCallback(async () => {
    if (!isAuthenticated || !user || !activeOrgId) {
      setIsConnected(false);
      setLoading(false);
      return;
    }

    try {
      setLoading(true);
      const { data, error } = await supabase.functions.invoke('elevenlabs-admin', {
        body: { action: 'test_credentials' },
      });

      if (error) throw error;
      setIsConnected(data?.connected ?? false);
      if (data?.connected) {
        setPlanInfo({
          plan_tier: data.plan_tier,
          character_limit: data.character_limit,
          character_count: data.character_count,
        });
      }
    } catch (e) {
      console.error('[useElevenLabsIntegration] status error:', e);
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

    const { data, error } = await supabase.functions.invoke('elevenlabs-admin', {
      body: { action: 'save_credentials', api_key: apiKey },
    });

    if (error) throw new Error(error.message || 'Failed to save ElevenLabs API key');
    if (data?.error) throw new Error(data.error);

    toast.success('ElevenLabs connected');
    setIsConnected(true);
    setPlanInfo({
      plan_tier: data.plan_tier,
      character_limit: data.character_limit,
      character_count: data.character_count,
    });
  }, [activeOrgId, isAuthenticated]);

  const disconnect = useCallback(async () => {
    if (!activeOrgId) return;

    const { error } = await supabase.functions.invoke('elevenlabs-admin', {
      body: { action: 'delete_credentials' },
    });

    if (error) {
      toast.error('Failed to disconnect');
      return;
    }

    setIsConnected(false);
    setPlanInfo(null);
    toast.success('ElevenLabs disconnected');
  }, [activeOrgId]);

  return {
    isConnected,
    loading,
    planInfo,
    connectApiKey,
    disconnect,
    refreshStatus,
  };
}
