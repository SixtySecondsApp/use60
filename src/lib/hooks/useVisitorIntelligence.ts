import { useState, useEffect, useCallback } from 'react';
import { supabase } from '@/lib/supabase/clientV2';
import { useAuth } from '@/lib/contexts/AuthContext';
import { useOrgStore } from '@/lib/stores/orgStore';
import { toast } from 'sonner';

export interface VisitorSnippetConfig {
  id: string;
  org_id: string;
  snippet_token: string;
  is_active: boolean;
  allowed_domains: string[];
  exclude_paths: string[];
  auto_enrich: boolean;
  auto_create_lead: boolean;
  rb2b_api_key: string | null;
  rb2b_enabled: boolean;
}

export function useVisitorIntelligence() {
  const { user, isAuthenticated } = useAuth();
  const activeOrgId = useOrgStore((s) => s.activeOrgId);
  const [config, setConfig] = useState<VisitorSnippetConfig | null>(null);
  const [loading, setLoading] = useState(true);
  const [visitorCount24h, setVisitorCount24h] = useState(0);

  const refreshConfig = useCallback(async () => {
    if (!isAuthenticated || !user || !activeOrgId) {
      setConfig(null);
      setLoading(false);
      return;
    }

    try {
      setLoading(true);
      const { data, error } = await (supabase as any)
        .from('visitor_snippet_configs')
        .select('id, org_id, snippet_token, is_active, allowed_domains, exclude_paths, auto_enrich, auto_create_lead, rb2b_api_key, rb2b_enabled')
        .eq('org_id', activeOrgId)
        .maybeSingle();

      if (error) throw error;
      setConfig(data);

      // Get 24h visitor count
      if (data) {
        const since = new Date(Date.now() - 24 * 60 * 60 * 1000).toISOString();
        const { count } = await (supabase as any)
          .from('website_visitors')
          .select('id', { count: 'exact', head: true })
          .eq('org_id', activeOrgId)
          .gte('visited_at', since);
        setVisitorCount24h(count || 0);
      }
    } catch (e) {
      console.error('[useVisitorIntelligence] Error:', e);
      setConfig(null);
    } finally {
      setLoading(false);
    }
  }, [activeOrgId, isAuthenticated, user]);

  useEffect(() => {
    refreshConfig();
  }, [refreshConfig]);

  const enableVisitorTracking = useCallback(async () => {
    if (!activeOrgId) throw new Error('No active organization');

    const { data, error } = await (supabase as any)
      .from('visitor_snippet_configs')
      .upsert(
        {
          org_id: activeOrgId,
          is_active: true,
        },
        { onConflict: 'org_id' }
      )
      .select('id, org_id, snippet_token, is_active, allowed_domains, exclude_paths, auto_enrich, auto_create_lead, rb2b_api_key, rb2b_enabled')
      .single();

    if (error) throw new Error(error.message || 'Failed to enable visitor tracking');
    setConfig(data);
    toast.success('Visitor tracking enabled');
  }, [activeOrgId]);

  const updateConfig = useCallback(async (updates: Partial<VisitorSnippetConfig>) => {
    if (!config?.id) throw new Error('No config to update');

    const { data, error } = await (supabase as any)
      .from('visitor_snippet_configs')
      .update(updates)
      .eq('id', config.id)
      .select('id, org_id, snippet_token, is_active, allowed_domains, exclude_paths, auto_enrich, auto_create_lead, rb2b_api_key, rb2b_enabled')
      .single();

    if (error) throw new Error(error.message || 'Failed to update config');
    setConfig(data);
    toast.success('Settings saved');
  }, [config]);

  const disable = useCallback(async () => {
    if (!config?.id) return;

    const { error } = await (supabase as any)
      .from('visitor_snippet_configs')
      .update({ is_active: false })
      .eq('id', config.id);

    if (error) throw new Error(error.message || 'Failed to disable tracking');
    await refreshConfig();
    toast.success('Visitor tracking disabled');
  }, [config, refreshConfig]);

  const isEnabled = config?.is_active ?? false;
  const snippetToken = config?.snippet_token ?? null;

  // Build the snippet install code
  const supabaseUrl = import.meta.env.VITE_SUPABASE_URL || '';
  const snippetCode = snippetToken
    ? `<script async src="${supabaseUrl}/functions/v1/visitor-snippet-serve?t=${snippetToken}"></script>`
    : null;

  // Build RB2B webhook URL
  const rb2bWebhookUrl = snippetToken
    ? `${supabaseUrl}/functions/v1/rb2b-webhook?token=${snippetToken}`
    : null;

  return {
    config,
    loading,
    isEnabled,
    snippetToken,
    snippetCode,
    rb2bWebhookUrl,
    visitorCount24h,
    enableVisitorTracking,
    updateConfig,
    disable,
    refreshConfig,
  };
}
