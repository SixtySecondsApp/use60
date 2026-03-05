/**
 * usePipelineSavedViews Hook (PIPE-ADV-001)
 *
 * Manages saved filter presets stored in `pipeline_saved_views` table.
 * Supports create, apply, delete, and share with team.
 */

import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { supabase } from '@/lib/supabase/clientV2';
import { useOrgStore } from '@/lib/stores/orgStore';
import { useAuth } from '@/lib/contexts/AuthContext';
import { toast } from 'sonner';
import type { PipelineFilters } from './usePipelineData';

export interface PipelineSavedView {
  id: string;
  org_id: string;
  user_id: string;
  name: string;
  filters: PipelineFilters & { sort_by?: string; sort_dir?: string; view_mode?: string };
  is_shared: boolean;
  created_at: string;
}

export function usePipelineSavedViews() {
  const { user } = useAuth();
  const activeOrgId = useOrgStore((s) => s.activeOrgId);
  const qc = useQueryClient();

  const { data: views = [], isLoading } = useQuery<PipelineSavedView[]>({
    queryKey: ['pipeline-saved-views', activeOrgId],
    queryFn: async () => {
      if (!user?.id || !activeOrgId) return [];

      const { data, error } = await supabase
        .from('pipeline_saved_views')
        .select('id, org_id, user_id, name, filters, is_shared, created_at')
        .eq('org_id', activeOrgId)
        .or(`user_id.eq.${user.id},is_shared.eq.true`)
        .order('created_at', { ascending: false });

      if (error) throw error;
      return (data as PipelineSavedView[]) || [];
    },
    enabled: !!user && !!activeOrgId,
    staleTime: 60000,
  });

  const createView = useMutation({
    mutationFn: async ({
      name,
      filters,
      isShared = false,
    }: {
      name: string;
      filters: PipelineSavedView['filters'];
      isShared?: boolean;
    }) => {
      if (!user?.id || !activeOrgId) throw new Error('Not authenticated');

      const { error } = await supabase.from('pipeline_saved_views').insert({
        org_id: activeOrgId,
        user_id: user.id,
        name,
        filters,
        is_shared: isShared,
      });

      if (error) throw error;
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['pipeline-saved-views', activeOrgId] });
      toast.success('View saved');
    },
    onError: (err: any) => {
      toast.error(`Failed to save view: ${err.message}`);
    },
  });

  const deleteView = useMutation({
    mutationFn: async (viewId: string) => {
      const { error } = await supabase
        .from('pipeline_saved_views')
        .delete()
        .eq('id', viewId)
        .eq('user_id', user?.id || '');

      if (error) throw error;
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['pipeline-saved-views', activeOrgId] });
      toast.success('View deleted');
    },
    onError: (err: any) => {
      toast.error(`Failed to delete view: ${err.message}`);
    },
  });

  const updateSharing = useMutation({
    mutationFn: async ({ viewId, isShared }: { viewId: string; isShared: boolean }) => {
      const { error } = await supabase
        .from('pipeline_saved_views')
        .update({ is_shared: isShared })
        .eq('id', viewId)
        .eq('user_id', user?.id || '');

      if (error) throw error;
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['pipeline-saved-views', activeOrgId] });
    },
    onError: (err: any) => {
      toast.error(`Failed to update sharing: ${err.message}`);
    },
  });

  return {
    views,
    isLoading,
    createView,
    deleteView,
    updateSharing,
  };
}
