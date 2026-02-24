/**
 * useICPProfilesCRUD — React Query hooks for ICP Profile CRUD
 *
 * Provides useQuery hooks for listing/fetching ICP profiles and
 * useMutation hooks for create, update, delete, and duplicate operations.
 * All mutations invalidate the profile list cache and show toast feedback.
 */

import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { toast } from 'sonner';
import { icpProfileService } from '@/lib/services/icpProfileService';
import type {
  ICPProfile,
  ICPSearchHistoryEntry,
  CreateICPProfilePayload,
  UpdateICPProfilePayload,
} from '@/lib/types/prospecting';

// ---------------------------------------------------------------------------
// Query Keys
// ---------------------------------------------------------------------------

export const icpProfileKeys = {
  all: ['icp-profiles'] as const,
  list: (orgId: string) => ['icp-profiles', orgId] as const,
  detail: (id: string) => ['icp-profile', id] as const,
  children: (parentId: string) => ['icp-profile-children', parentId] as const,
  searchHistory: (profileId: string) => ['icp-search-history', profileId] as const,
};

// ---------------------------------------------------------------------------
// Query: List all ICP profiles for an org
// ---------------------------------------------------------------------------

export function useICPProfiles(orgId: string | undefined) {
  return useQuery<ICPProfile[], Error>({
    queryKey: icpProfileKeys.list(orgId ?? ''),
    queryFn: () => icpProfileService.listProfiles(orgId!),
    enabled: !!orgId,
  });
}

// ---------------------------------------------------------------------------
// Query: Get a single ICP profile by ID
// ---------------------------------------------------------------------------

export function useICPProfile(id: string | undefined) {
  return useQuery<ICPProfile | null, Error>({
    queryKey: icpProfileKeys.detail(id ?? ''),
    queryFn: () => icpProfileService.getProfile(id!),
    enabled: !!id,
  });
}

// ---------------------------------------------------------------------------
// Query: Get child personas for a parent ICP
// ---------------------------------------------------------------------------

export function useICPProfileChildren(parentId: string | undefined) {
  return useQuery<ICPProfile[], Error>({
    queryKey: icpProfileKeys.children(parentId ?? ''),
    queryFn: async () => {
      if (!parentId) return [];
      const allProfiles = await icpProfileService.listProfiles(
        // We need the org_id - get it from the parent profile
        (await icpProfileService.getProfile(parentId))?.organization_id ?? ''
      );
      return allProfiles.filter(p => p.parent_icp_id === parentId && p.profile_type === 'persona');
    },
    enabled: !!parentId,
  });
}

// ---------------------------------------------------------------------------
// Mutation: Create ICP profile
// ---------------------------------------------------------------------------

export function useCreateICPProfile() {
  const queryClient = useQueryClient();

  return useMutation<ICPProfile, Error, CreateICPProfilePayload>({
    mutationFn: (payload) => icpProfileService.createProfile(payload),
    onSuccess: (profile) => {
      queryClient.invalidateQueries({ queryKey: icpProfileKeys.list(profile.organization_id) });
      // If this is a persona with a parent, invalidate the parent's children cache
      if (profile.parent_icp_id) {
        queryClient.invalidateQueries({ queryKey: icpProfileKeys.children(profile.parent_icp_id) });
      }
      toast.success(`ICP profile "${profile.name}" created`);
    },
    onError: (error) => {
      toast.error(error.message || 'Failed to create ICP profile');
    },
  });
}

// ---------------------------------------------------------------------------
// Mutation: Update ICP profile
// ---------------------------------------------------------------------------

export function useUpdateICPProfile() {
  const queryClient = useQueryClient();

  return useMutation<ICPProfile, Error, { id: string; payload: UpdateICPProfilePayload }>({
    mutationFn: ({ id, payload }) => icpProfileService.updateProfile(id, payload),
    onSuccess: (profile) => {
      queryClient.invalidateQueries({ queryKey: icpProfileKeys.list(profile.organization_id) });
      queryClient.invalidateQueries({ queryKey: icpProfileKeys.detail(profile.id) });
      // If this is a persona with a parent, invalidate the parent's children cache
      if (profile.parent_icp_id) {
        queryClient.invalidateQueries({ queryKey: icpProfileKeys.children(profile.parent_icp_id) });
      }
      toast.success(`ICP profile "${profile.name}" updated`);
    },
    onError: (error) => {
      toast.error(error.message || 'Failed to update ICP profile');
    },
  });
}

// ---------------------------------------------------------------------------
// Mutation: Delete ICP profile (optimistic update)
// ---------------------------------------------------------------------------

export function useDeleteICPProfile() {
  const queryClient = useQueryClient();

  return useMutation<void, Error, { id: string; orgId: string; name: string; parentIcpId?: string | null }>({
    mutationFn: ({ id }) => icpProfileService.deleteProfile(id),
    onMutate: async ({ id, orgId }) => {
      // Cancel any in-flight refetches so they don't overwrite our optimistic update
      await queryClient.cancelQueries({ queryKey: icpProfileKeys.list(orgId) });

      // Snapshot previous value
      const previousProfiles = queryClient.getQueryData<ICPProfile[]>(icpProfileKeys.list(orgId));

      // Optimistically remove the profile from the cache
      if (previousProfiles) {
        queryClient.setQueryData<ICPProfile[]>(
          icpProfileKeys.list(orgId),
          previousProfiles.filter((p) => p.id !== id)
        );
      }

      return { previousProfiles };
    },
    onSuccess: (_data, { orgId, name, parentIcpId }) => {
      queryClient.invalidateQueries({ queryKey: icpProfileKeys.list(orgId) });
      // If this was a persona with a parent, invalidate the parent's children cache
      if (parentIcpId) {
        queryClient.invalidateQueries({ queryKey: icpProfileKeys.children(parentIcpId) });
      }
      toast.success(`ICP profile "${name}" deleted`);
    },
    onError: (error, { orgId }, context) => {
      // Rollback on error
      if (context?.previousProfiles) {
        queryClient.setQueryData(icpProfileKeys.list(orgId), context.previousProfiles);
      }
      toast.error(error.message || 'Failed to delete ICP profile');
    },
  });
}

// ---------------------------------------------------------------------------
// Mutation: Duplicate ICP profile
// ---------------------------------------------------------------------------

export function useDuplicateICPProfile() {
  const queryClient = useQueryClient();

  return useMutation<ICPProfile, Error, { id: string; newName: string }>({
    mutationFn: ({ id, newName }) => icpProfileService.duplicateProfile(id, newName),
    onSuccess: (profile) => {
      queryClient.invalidateQueries({ queryKey: icpProfileKeys.list(profile.organization_id) });
      // If this is a persona with a parent, invalidate the parent's children cache
      if (profile.parent_icp_id) {
        queryClient.invalidateQueries({ queryKey: icpProfileKeys.children(profile.parent_icp_id) });
      }
      toast.success(`ICP profile duplicated as "${profile.name}"`);
    },
    onError: (error) => {
      toast.error(error.message || 'Failed to duplicate ICP profile');
    },
  });
}

// ---------------------------------------------------------------------------
// Query: Search history for an ICP profile
// ---------------------------------------------------------------------------

export function useICPSearchHistory(profileId: string | undefined) {
  return useQuery<ICPSearchHistoryEntry[], Error>({
    queryKey: icpProfileKeys.searchHistory(profileId ?? ''),
    queryFn: () => icpProfileService.listSearchHistory(profileId!),
    enabled: !!profileId,
  });
}

// ---------------------------------------------------------------------------
// Mutation: Delete search history entry
// ---------------------------------------------------------------------------

export function useDeleteSearchHistory() {
  const queryClient = useQueryClient();

  return useMutation<void, Error, { id: string; profileId: string }>({
    mutationFn: ({ id }) => icpProfileService.deleteSearchHistory(id),
    onSuccess: (_data, { profileId }) => {
      queryClient.invalidateQueries({ queryKey: icpProfileKeys.searchHistory(profileId) });
      toast.success('Search history entry deleted');
    },
    onError: (error) => {
      toast.error(error.message || 'Failed to delete search history entry');
    },
  });
}
