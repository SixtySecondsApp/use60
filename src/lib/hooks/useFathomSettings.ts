/**
 * useFathomSettings Hook
 *
 * Manages Fathom user mappings for organizations.
 * Handles CRUD operations for mapping Fathom users (by email) to Sixty users.
 */

import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { supabase } from '@/lib/supabase/clientV2';
import { useOrg } from '@/lib/contexts/OrgContext';

// Types
export interface FathomUserMapping {
  id: string;
  org_id: string;
  fathom_user_email: string;
  fathom_user_name: string | null;
  sixty_user_id: string | null;
  is_auto_matched: boolean;
  last_seen_at: string | null;
  created_at: string;
  updated_at: string;
}

// Query keys
const QUERY_KEYS = {
  userMappings: (orgId: string) => ['fathom', 'user-mappings', orgId],
};

/**
 * Hook to get Fathom user mappings for the org
 */
export function useFathomUserMappings(options?: { enabled?: boolean }) {
  const { activeOrgId } = useOrg();
  const orgId = activeOrgId;

  return useQuery({
    queryKey: QUERY_KEYS.userMappings(orgId || ''),
    queryFn: async () => {
      if (!orgId) return [];

      // Using type assertion since fathom_user_mappings isn't in generated types yet
      const { data, error } = await (supabase
        .from('fathom_user_mappings') as any)
        .select('*')
        .eq('org_id', orgId)
        .order('last_seen_at', { ascending: false });

      if (error) throw error;

      return (data || []) as FathomUserMapping[];
    },
    enabled: options?.enabled ?? !!orgId,
  });
}

/**
 * Hook to update a Fathom user mapping (admin only)
 */
export function useUpdateFathomUserMapping() {
  const { activeOrgId } = useOrg();
  const orgId = activeOrgId;
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async ({
      fathomUserEmail,
      sixtyUserId,
    }: {
      fathomUserEmail: string;
      sixtyUserId: string | null;
    }) => {
      if (!orgId) throw new Error('No org selected');

      const { data, error } = await supabase.functions.invoke('fathom-update-user-mapping', {
        body: { 
          orgId, 
          fathomUserEmail, 
          sixtyUserId 
        },
      });

      if (error) throw error;
      if (!data?.success) throw new Error(data?.error || 'Failed to update Fathom user mapping');
      return data;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: QUERY_KEYS.userMappings(orgId || '') });
    },
  });
}

/**
 * Hook to delete a Fathom user mapping (admin only)
 */
export function useDeleteFathomUserMapping() {
  const { activeOrgId } = useOrg();
  const orgId = activeOrgId;
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async (mappingId: string) => {
      if (!orgId) throw new Error('No org selected');

      const { error } = await (supabase
        .from('fathom_user_mappings') as any)
        .delete()
        .eq('id', mappingId)
        .eq('org_id', orgId); // Security: ensure they can only delete from their org

      if (error) throw error;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: QUERY_KEYS.userMappings(orgId || '') });
    },
  });
}

/**
 * Hook to allow a user to map ONLY themselves to a Fathom email in this org.
 * This is used by the Fathom Settings page "Personal Fathom" section.
 */
export function useFathomSelfMap() {
  const { activeOrgId } = useOrg();
  const orgId = activeOrgId;
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async ({ fathomUserEmail }: { fathomUserEmail?: string }) => {
      if (!orgId) throw new Error('No org selected');

      const { data, error } = await supabase.functions.invoke('fathom-self-map', {
        body: { orgId, fathomUserEmail: fathomUserEmail || undefined },
      });

      if (error) throw error;
      if (!data?.success) throw new Error(data?.error || 'Failed to link Fathom email');
      return data;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: QUERY_KEYS.userMappings(orgId || '') });
    },
  });
}












